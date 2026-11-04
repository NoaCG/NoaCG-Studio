import {
  isAiProviderId,
  type AiGatewayErrorCode,
  type AiGatewayRequestBody,
  type AiProviderId,
  type ModelContentBlock,
  type ModelImage,
  type ModelRequest,
  type ModelResult,
  type ModelRoute,
  type ModelUsage,
} from '../../src/ai/modelTypes.js';

type Fetch = typeof fetch;

/** Vercel AI Gateway's OpenAI-compatible base URL, shared by the request adapter and live
 *  model discovery so the two cannot point at different gateways. */
export const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export interface ProviderAdapter {
  id: AiProviderId;
  endpoint: string;
  createRequest(request: ModelRequest, route: ModelRoute, key: string, policy?: GatewayExecutionPolicy): RequestInit;
  parseResponse(
    data: unknown,
    request: ModelRequest,
    route: ModelRoute,
  ): { output: unknown; usage: ModelUsage; images?: ModelImage[] };
}

/** Adapters whose provider has no image-output API refuse `expect: 'image'` up front -
 *  a text answer to an image request is the wrong modality, not a degraded success. */
function refuseImageOutput(request: ModelRequest, provider: AiProviderId): void {
  if (request.expect === 'image') {
    throw new GatewayError('invalid_request', `The ${provider} route does not support image output.`, 400, false);
  }
}

export class GatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  /** Set on the final error: served attempts plus configured ceilings for bounded client
   *  deadlines (#2092, #2114), summed with each fee once just as on success. The ceiling is
   *  conservative booking, not a claim to know an aborted attempt's exact bill or tokens. */
  servedUsage?: ModelUsage;

  constructor(
    code: AiGatewayErrorCode,
    message: string,
    status: number,
    retryable: boolean,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** A reply that ARRIVED (HTTP 200, so the gateway billed it) but is not usable: a structured
 *  result that does not parse or validate, or an image request answered without an image. It
 *  carries the reply's usage so the executor can charge the attempt when it retries (#2055). */
export class ServedAttemptError extends GatewayError {
  readonly usage: ModelUsage;

  constructor(error: GatewayError, usage: ModelUsage) {
    super(error.code, error.message, error.status, error.retryable);
    this.usage = usage;
  }
}

/** Run `parse` on a reply whose usage is already known; a failure keeps that usage. */
function servedParse<T>(usage: ModelUsage, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof GatewayError && !(error instanceof ServedAttemptError)) throw new ServedAttemptError(error, usage);
    throw error;
  }
}

const safeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function totalUsage(
  inputTokens: unknown,
  outputTokens: unknown,
  estimatedCost?: ModelUsage['estimatedCost'],
  cachedInputTokens?: unknown,
  reasoningTokens?: unknown,
): ModelUsage {
  const input = safeNumber(inputTokens);
  const output = safeNumber(outputTokens);
  const cached = safeNumber(cachedInputTokens);
  const reasoning = safeNumber(reasoningTokens);
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    ...(cached ? { cachedInputTokens: cached } : {}),
    ...(reasoning ? { reasoningTokens: reasoning } : {}),
    ...(estimatedCost ? { estimatedCost } : {}),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayError('malformed_response', 'The AI provider returned an invalid response.', 502, false);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new GatewayError('malformed_response', 'The AI provider returned an invalid response.', 502, false);
  }
  return value;
}

function parseStructured(text: string): unknown {
  try {
    return object(JSON.parse(text));
  } catch (error) {
    // OPT-IN, local only. A structured miss is normally indistinguishable from a bad model:
    // the caller sees one sentence and the body is gone. Seeing where the JSON stopped is what
    // separates "the model wrote nonsense" from "the answer was cut off mid-object", and the
    // second was the whole cause of the 2026-08-08 Pro round's five lost concepts. The head and
    // tail are enough to tell them apart and short enough not to spill a whole answer into a
    // log; nothing is emitted unless someone asks for it.
    if (process.env.NOACG_DEBUG_STRUCTURED === '1') {
      console.log(`[structured-miss] len=${text.length} head=${JSON.stringify(text.slice(0, 160))} tail=${JSON.stringify(text.slice(-160))}`);
    }
    if (error instanceof GatewayError) throw error;
    // Retryable: sampled models produce this stochastically, and providers can error
    // mid-stream (first observed on OpenRouter as finish_reason "error" with a truncated body) -
    // a fresh attempt within the bounded budget usually succeeds.
    throw new GatewayError('malformed_response', 'The AI provider returned an invalid structured result.', 502, true);
  }
}

function schemaAccepts(value: unknown, schemaValue: unknown): boolean {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return false;
  const schema = schemaValue as Record<string, unknown>;
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.filter((candidate) => schemaAccepts(value, candidate)).length === 1;
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((candidate) => schemaAccepts(value, candidate));
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) return false;
  if (Array.isArray(schema.type)) {
    return schema.type.some((type) => schemaAccepts(value, { ...schema, type }));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    if (required.some((key) => !(key in record))) return false;
    if (schema.additionalProperties === false && Object.keys(record).some((key) => !(key in properties))) return false;
    return Object.entries(record).every(([key, item]) => !(key in properties) || schemaAccepts(item, properties[key]));
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
    return schema.items === undefined || value.every((item) => schemaAccepts(item, schema.items));
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  // Integers honour minimum/maximum exactly like numbers do. They used to check only
  // integer-ness, so a schema declaring a range got none: an out-of-range value passed
  // the gateway and failed later in the caller's own check, which spends the call and
  // cannot retry. Here it is a retryable malformed response instead.
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (schema.type === 'integer' && !Number.isInteger(value)) return false;
    if (typeof schema.minimum === 'number' && value < schema.minimum) return false;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return false;
    return true;
  }
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'null') return value === null;
  return schema.type === undefined;
}

/** Content-free diagnostics for a structured miss. Paths and rule names are enough to
 * identify a schema/model boundary failure without logging the generated decision. */
function schemaRejectionPaths(value: unknown, schemaValue: unknown, path = '$'): string[] {
  if (schemaAccepts(value, schemaValue)) return [];
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) {
    return [`${path}:schema`];
  }
  const schema = schemaValue as Record<string, unknown>;
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) return [`${path}:union`];
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    return [`${path}:enum`];
  }
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [];
    const missing = required.filter((key) => !(key in record)).map((key) => `${path}.${key}:required`);
    const extra = schema.additionalProperties === false
      ? Object.keys(record).filter((key) => !(key in properties)).map((key) => `${path}.${key}:additional`)
      : [];
    const nested = Object.entries(record).flatMap(([key, item]) =>
      key in properties ? schemaRejectionPaths(item, properties[key], `${path}.${key}`) : [],
    );
    return [...missing, ...extra, ...nested].slice(0, 20);
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return [`${path}:minItems`];
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return [`${path}:maxItems`];
    return schema.items === undefined
      ? [`${path}:array`]
      : value.flatMap((item, index) => schemaRejectionPaths(item, schema.items, `${path}[${index}]`)).slice(0, 20);
  }
  return [`${path}:${typeof schema.type === 'string' ? schema.type : 'shape'}`];
}

/** Decode a structured result that arrived correct but ENCODED, before anything judges its
 *  shape. Two encodings are common enough to cost whole benchmark rounds, both observed from
 *  Anthropic tool use and neither specific to it:
 *
 *    - a nested array or object handed back as a JSON STRING - `{"concepts":"[{…}]"}`;
 *    - the whole tool envelope repeated inside the property it belongs to -
 *      `{"concepts":"{\"concepts\":[{…}]}"}`.
 *
 *  Both carry exactly the answer the schema asked for. Rejecting them spends the call, burns
 *  the retry budget on a deterministic quirk, and reports a model failure that never happened:
 *  seven of eight briefs in the 2026-08-02 frontier round died here with usable design work in
 *  the payload, and every failure looked like the model's fault.
 *
 *  Decoding only ever REPLACES a value with what it encoded - `schemaAccepts` still runs
 *  afterwards and still refuses anything genuinely wrong, so this widens what is understood,
 *  never what is accepted. A string that does not parse is left exactly as it came. */
function decodeEncodedShapes(value: unknown, schemaValue: unknown, key?: string): unknown {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return value;
  const schema = schemaValue as Record<string, unknown>;
  const wants = schema.type;
  if (wants !== 'object' && wants !== 'array') return value;

  let current = value;
  if (typeof current === 'string') {
    try {
      current = JSON.parse(current);
    } catch {
      return value;
    }
  }

  // The repeated envelope: the property's own name wrapping the property's own value.
  // Narrow on purpose - one key, and that key is the one being decoded - so a legitimate
  // single-key object can never be unwrapped into the thing it contains.
  if (wants === 'array' && !Array.isArray(current) && current && typeof current === 'object' && key) {
    const record = current as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1 && keys[0] === key) current = record[key];
  }

  if (wants === 'array' && Array.isArray(current) && schema.items) {
    return current.map((item) => decodeEncodedShapes(item, schema.items));
  }
  if (wants === 'object' && current && typeof current === 'object' && !Array.isArray(current)) {
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : null;
    if (!properties) return current;
    const record = current as Record<string, unknown>;
    const decoded: Record<string, unknown> = { ...record };
    for (const [property, subSchema] of Object.entries(properties)) {
      if (property in record) decoded[property] = decodeEncodedShapes(record[property], subSchema, property);
    }
    return decoded;
  }
  return current;
}

export function decodeStructuredOutput(output: unknown, request: ModelRequest): unknown {
  return request.structuredOutput ? decodeEncodedShapes(output, request.structuredOutput.schema) : output;
}

function validateStructuredOutput(output: unknown, request: ModelRequest): void {
  if (request.structuredOutput && !schemaAccepts(output, request.structuredOutput.schema)) {
    if (process.env.NOACG_DEBUG_STRUCTURED === '1') {
      console.log(`[structured-schema-miss] ${schemaRejectionPaths(output, request.structuredOutput.schema).join(',')}`);
    }
    // Retryable for the same reason as the parse failure above: schema misses under
    // sampling are stochastic, and the bounded attempt budget is exactly for them.
    throw new GatewayError('malformed_response', 'The model returned a result that did not match the required structure.', 502, true);
  }
}

function dataUrl(block: Extract<ModelContentBlock, { type: 'image' }>): string {
  return `data:${block.source.media_type};base64,${block.source.data}`;
}

/** Providers return generated images as data URLs; normalize to base64 + media type.
 *  Anything else (a hosted URL, a truncated payload) is not something the browser can be
 *  handed as a self-contained asset, so it simply does not count as an image. */
function parseImageDataUrl(url: string): ModelImage | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(url);
  return match ? { mediaType: match[1].toLowerCase(), base64: match[2] } : null;
}

function openAiInput(messages: ModelRequest['messages']): unknown[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') return { role: message.role, content: message.content };
    const content = message.content.map((block) =>
      block.type === 'text'
        ? { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: block.text }
        : { type: 'input_image', image_url: dataUrl(block), detail: 'auto' },
    );
    return { role: message.role, content };
  });
}

function chatContent(messages: ModelRequest['messages']): unknown[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') return { role: message.role, content: message.content };
    return {
      role: message.role,
      content: message.content.map((block) =>
        block.type === 'text'
          ? { type: 'text', text: block.text }
          : { type: 'image_url', image_url: { url: dataUrl(block) } },
      ),
    };
  });
}

function providerCost(value: unknown): ModelUsage['estimatedCost'] {
  const amount = safeNumber(value);
  return amount > 0 ? { amount, currency: 'USD', source: 'provider' } : undefined;
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  endpoint: 'https://api.anthropic.com/v1/messages',
  createRequest(request, route, key) {
    refuseImageOutput(request, 'anthropic');
    const body = {
      model: route.model,
      max_tokens: request.maxTokens ?? 16000,
      system: request.cacheSystem
        ? [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
        : request.system,
      messages: request.messages,
      ...(request.structuredOutput
        ? {
            tools: [{
              name: request.structuredOutput.name,
              description: request.structuredOutput.description,
              input_schema: request.structuredOutput.schema,
            }],
            tool_choice: { type: 'tool', name: request.structuredOutput.name },
          }
        : {}),
    };
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    };
  },
  parseResponse(value, request) {
    const data = object(value);
    if (data.stop_reason === 'max_tokens') {
      throw new GatewayError('malformed_response', 'The AI response was cut off. Try a simpler request.', 502, false);
    }
    const content = array(data.content).map(object);
    const usage = object(data.usage ?? {});
    let output: unknown;
    if (request.structuredOutput) {
      const call = content.find((item) => item.type === 'tool_use');
      if (!call || call.name !== request.structuredOutput.name || !('input' in call)) {
        throw new GatewayError('malformed_response', 'The model did not return the expected structured result.', 502, false);
      }
      output = object(call.input);
    } else {
      const text = content
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text as string)
        .join('\n');
      if (!text) throw new GatewayError('malformed_response', 'The AI provider returned an empty response.', 502, false);
      output = text;
    }
    const inputTokens =
      safeNumber(usage.input_tokens)
      + safeNumber(usage.cache_creation_input_tokens)
      + safeNumber(usage.cache_read_input_tokens);
    return {
      output,
      usage: totalUsage(
        inputTokens,
        usage.output_tokens,
        undefined,
        usage.cache_read_input_tokens,
      ),
    };
  },
};

export const openAiAdapter: ProviderAdapter = {
  id: 'openai',
  endpoint: 'https://api.openai.com/v1/responses',
  createRequest(request, route, key) {
    refuseImageOutput(request, 'openai');
    const body = {
      model: route.model,
      instructions: request.system,
      input: openAiInput(request.messages),
      max_output_tokens: request.maxTokens ?? 16000,
      ...(request.structuredOutput
        ? {
            text: {
              format: {
                type: 'json_schema',
                name: request.structuredOutput.name,
                description: request.structuredOutput.description,
                // Existing NoaCG schemas contain optional fields. The server validates
                // every parsed result against the same schema before it reaches the harness.
                strict: false,
                schema: request.structuredOutput.schema,
              },
            },
          }
        : {}),
    };
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    };
  },
  parseResponse(value, request) {
    const data = object(value);
    const incomplete = data.status === 'incomplete' ? object(data.incomplete_details ?? {}) : null;
    if (incomplete?.reason === 'max_output_tokens') {
      throw new GatewayError('malformed_response', 'The AI response was cut off. Try a simpler request.', 502, false);
    }
    const text = typeof data.output_text === 'string'
      ? data.output_text
      : array(data.output)
          .map(object)
          .flatMap((item) => Array.isArray(item.content) ? item.content.map(object) : [])
          .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
          .map((item) => item.text as string)
          .join('\n');
    if (!text) throw new GatewayError('malformed_response', 'The AI provider returned an empty response.', 502, false);
    const usage = object(data.usage ?? {});
    const inputDetails = data.usage && typeof data.usage === 'object'
      ? object(usage.input_tokens_details ?? {})
      : {};
    const outputDetails = data.usage && typeof data.usage === 'object'
      ? object(usage.output_tokens_details ?? {})
      : {};
    const served = totalUsage(
      usage.input_tokens,
      usage.output_tokens,
      undefined,
      inputDetails.cached_tokens,
      outputDetails.reasoning_tokens,
    );
    return {
      output: request.structuredOutput ? servedParse(served, () => parseStructured(text)) : text,
      usage: served,
    };
  },
};

/** Vercel AI Gateway, through its OpenAI-compatible Chat Completions API. The wire shape is
 *  the one this adapter already spoke (messages, response_format, tools, `modalities`, and a
 *  `usage` block carrying `cost`), so the transport swap from OpenRouter changed the endpoint,
 *  the credential and the ROUTING VOCABULARY - not the parsing. `parseResponse` is shared with
 *  the Hugging Face adapter for the same reason it always was. */
export const vercelGatewayAdapter: ProviderAdapter = {
  id: 'vercel',
  endpoint: `${AI_GATEWAY_BASE_URL}/chat/completions`,
  createRequest(request, route, key, policy) {
    const structuredMode = policy?.gateway?.structuredOutputMode ?? 'json-schema';
    const body = {
      model: route.model,
      messages: [{ role: 'system', content: request.system }, ...chatContent(request.messages)],
      max_tokens: request.maxTokens ?? 16000,
      // Image generation rides the same chat-completions API: the modalities field asks
      // an image-capable model to answer with an image (returned in message.images).
      ...(request.expect === 'image' ? { modalities: ['image', 'text'] } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      ...(policy?.gateway?.thinking === 'off' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      ...(request.structuredOutput
        ? structuredMode === 'tool'
          ? {
              tools: [{
                type: 'function',
                function: {
                  name: request.structuredOutput.name,
                  description: request.structuredOutput.description,
                  parameters: request.structuredOutput.schema,
                },
              }],
              tool_choice: {
                type: 'function',
                function: { name: request.structuredOutput.name },
              },
            }
          : {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: request.structuredOutput.name,
                description: request.structuredOutput.description,
                strict: false,
                schema: request.structuredOutput.schema,
              },
            },
          }
        : {}),
      ...(policy?.gateway
        ? {
            providerOptions: {
              gateway: {
                zeroDataRetention: policy.gateway.zeroDataRetention,
                disallowPromptTraining: policy.gateway.disallowPromptTraining,
                // Omitted, not sent empty: `only: []` would read as "no provider is
                // permitted" and refuse every route, where a surface with no allowlist means
                // "any provider the other directives already narrowed to".
                ...(policy.gateway.only?.length ? { only: policy.gateway.only } : {}),
                ...(policy.gateway.sort ? { sort: policy.gateway.sort } : {}),
                ...(policy.gateway.tags?.length ? { tags: policy.gateway.tags } : {}),
              },
            },
          }
        : {}),
    };
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    };
  },
  parseResponse(value, request) {
    const data = object(value);
    const choice = object(array(data.choices)[0]);
    const message = object(choice.message);
    // Opt-in, local only, and FIRST - before the truncation check and the image branch, so it
    // still reports on the answers that are about to throw. `finish_reason` and the usage
    // block's `reasoning_tokens` are what identify a budget eaten by thinking, and neither
    // survives into the normalized result a caller sees.
    if (process.env.NOACG_DEBUG_STRUCTURED === '1') {
      console.log(`[gateway] finish=${String(choice.finish_reason)} usage=${JSON.stringify(data.usage ?? {})}`);
    }
    if (request.expect === 'image') {
      const images = Array.isArray(message.images)
        ? message.images.map(object).flatMap((item) => {
            const url = item.image_url && typeof item.image_url === 'object'
              ? object(item.image_url).url
              : undefined;
            const parsed = typeof url === 'string' ? parseImageDataUrl(url) : null;
            return parsed ? [parsed] : [];
          })
        : [];
      const imageUsage = (usage: Record<string, unknown>) =>
        totalUsage(usage.prompt_tokens, usage.completion_tokens, providerCost(usage.cost));
      if (images.length === 0) {
        // Retryable like other structured misses: image models occasionally answer with
        // text only, and a fresh attempt within the bounded budget usually delivers. The
        // answer was still served, so it carries its usage (#2055).
        throw new ServedAttemptError(
          new GatewayError('malformed_response', 'The model did not return an image.', 502, true),
          imageUsage(data.usage && typeof data.usage === 'object' && !Array.isArray(data.usage)
            ? data.usage as Record<string, unknown>
            : {}),
        );
      }
      return { output: '', images, usage: imageUsage(object(data.usage ?? {})) };
    }
    // SAY WHEN THE ANSWER WAS CUT OFF. The Anthropic and OpenAI adapters have always checked
    // their own truncation signal and reported it in these words; this one - the MANAGED
    // transport, the route most traffic takes - did not, so a budget exhausted by reasoning
    // tokens surfaced as "invalid structured result" further down, where the body is already
    // gone. That cost an hour of instrumented diagnosis and five paid concept images on
    // 2026-08-08 (benchmarks/pro/round-2026-08-08/ROUND.md §3). Not retryable, matching the
    // other two: a second attempt on the same budget truncates in the same place.
    if (choice.finish_reason === 'length') {
      throw new GatewayError(
        'malformed_response',
        'The AI response was cut off by the output token limit. Raise the call\'s budget '
          + '(outputBudget in src/ai/modelTypes.ts) or ask for less.',
        502,
        false,
      );
    }
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.map(object) : [];
    const expectedTool = request.structuredOutput
      ? toolCalls.find((item) => {
          if (item.type !== 'function') return false;
          const fn = item.function && typeof item.function === 'object' ? object(item.function) : null;
          return fn?.name === request.structuredOutput?.name;
        })
      : undefined;
    const toolFunction = expectedTool?.function && typeof expectedTool.function === 'object'
      ? object(expectedTool.function)
      : null;
    const text = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map(object)
            .filter((part) => typeof part.text === 'string')
            .map((part) => part.text as string)
            .join('\n')
        : '';
    const toolArguments = typeof toolFunction?.arguments === 'string' ? toolFunction.arguments : '';
    if (!text && !toolArguments) {
      throw new GatewayError('malformed_response', 'The AI provider returned an empty response.', 502, false);
    }
    const usage = object(data.usage ?? {});
    const promptDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
      ? object(usage.prompt_tokens_details)
      : {};
    const completionDetails = usage.completion_tokens_details && typeof usage.completion_tokens_details === 'object'
      ? object(usage.completion_tokens_details)
      : {};
    const served = totalUsage(
      usage.prompt_tokens,
      usage.completion_tokens,
      providerCost(usage.cost),
      promptDetails.cached_tokens,
      completionDetails.reasoning_tokens,
    );
    return {
      output: request.structuredOutput ? servedParse(served, () => parseStructured(toolArguments || text)) : text,
      usage: served,
    };
  },
};

export const huggingFaceAdapter: ProviderAdapter = {
  id: 'huggingface',
  endpoint: 'https://router.huggingface.co/v1/chat/completions',
  createRequest(request, route, key) {
    refuseImageOutput(request, 'huggingface');
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: route.model,
        messages: [{ role: 'system', content: request.system }, ...chatContent(request.messages)],
        max_tokens: request.maxTokens ?? 16000,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
        ...(request.structuredOutput
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: request.structuredOutput.name,
                  description: request.structuredOutput.description,
                  strict: false,
                  schema: request.structuredOutput.schema,
                },
              },
            }
          : {}),
      }),
    };
  },
  parseResponse(value, request, route) {
    return vercelGatewayAdapter.parseResponse(value, request, route);
  },
};

/** Google's Gemini models on the user's own key.
 *
 *  Modelled on the Hugging Face adapter above rather than on Gemini's native
 *  `generateContent` API: Google publishes an OpenAI-compatible surface at
 *  `/v1beta/openai`, which speaks the same chat-completions request and response shape the
 *  gateway adapter already parses. One request shape means one place to fix a parsing bug,
 *  and no second structured-output dialect to keep in step with the harness.
 *
 *  `seed` is deliberately not forwarded: the compatibility layer rejects parameters it does
 *  not implement, and a benchmark preference must never be able to fail a user's generation. */
export const googleAdapter: ProviderAdapter = {
  id: 'google',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  createRequest(request, route, key) {
    refuseImageOutput(request, 'google');
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: route.model,
        messages: [{ role: 'system', content: request.system }, ...chatContent(request.messages)],
        max_tokens: request.maxTokens ?? 16000,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.structuredOutput
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: request.structuredOutput.name,
                  description: request.structuredOutput.description,
                  strict: false,
                  schema: request.structuredOutput.schema,
                },
              },
            }
          : {}),
      }),
    };
  },
  parseResponse(value, request, route) {
    return vercelGatewayAdapter.parseResponse(value, request, route);
  },
};

export const AI_ADAPTERS: Record<AiProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openAiAdapter,
  google: googleAdapter,
  vercel: vercelGatewayAdapter,
  huggingface: huggingFaceAdapter,
};

function validateRoute(value: unknown): ModelRoute {
  const route = object(value);
  if (!isAiProviderId(route.provider) || typeof route.model !== 'string' || !route.model.trim() || route.model.length > 160) {
    throw new GatewayError('invalid_request', 'Select a valid AI provider and model.', 400, false);
  }
  return { provider: route.provider, model: route.model.trim() };
}

function validContent(content: unknown): boolean {
  if (typeof content === 'string') return content.length <= 2_000_000;
  if (!Array.isArray(content)) return false;
  return content.every((block) => {
    if (!block || typeof block !== 'object') return false;
    const item = block as Record<string, unknown>;
    if (item.type === 'text') return typeof item.text === 'string' && item.text.length <= 2_000_000;
    if (item.type !== 'image' || !item.source || typeof item.source !== 'object') return false;
    const source = item.source as Record<string, unknown>;
    return source.type === 'base64'
      && typeof source.media_type === 'string'
      && typeof source.data === 'string'
      && source.data.length <= 8_000_000;
  });
}

export function validateGatewayBody(value: unknown): AiGatewayRequestBody {
  const body = object(value);
  const request = object(body.request);
  if (typeof request.system !== 'string' || request.system.length > 2_000_000 || !Array.isArray(request.messages)) {
    throw new GatewayError('invalid_request', 'The AI request is invalid.', 400, false);
  }
  const messages = request.messages as unknown[];
  if (messages.length === 0 || messages.length > 40 || !messages.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const message = value as Record<string, unknown>;
    return (message.role === 'user' || message.role === 'assistant') && validContent(message.content);
  })) {
    throw new GatewayError('invalid_request', 'The AI request messages are invalid.', 400, false);
  }
  const maxTokens = request.maxTokens;
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || (maxTokens as number) < 1 || (maxTokens as number) > 100_000)) {
    throw new GatewayError('invalid_request', 'The AI token limit is invalid.', 400, false);
  }
  if (
    request.temperature !== undefined
    && (typeof request.temperature !== 'number'
      || !Number.isFinite(request.temperature)
      || request.temperature < 0
      || request.temperature > 2)
  ) {
    throw new GatewayError('invalid_request', 'The AI temperature is invalid.', 400, false);
  }
  if (
    request.seed !== undefined
    && (!Number.isSafeInteger(request.seed) || Math.abs(request.seed as number) > 2_147_483_647)
  ) {
    throw new GatewayError('invalid_request', 'The AI seed is invalid.', 400, false);
  }
  if (request.structuredOutput !== undefined) {
    const structured = object(request.structuredOutput);
    if (
      typeof structured.name !== 'string'
      || !/^[A-Za-z0-9_-]{1,64}$/.test(structured.name)
      || typeof structured.description !== 'string'
      || !structured.schema
      || typeof structured.schema !== 'object'
    ) {
      throw new GatewayError('invalid_request', 'The structured-output schema is invalid.', 400, false);
    }
  }
  if (request.expect !== undefined && request.expect !== 'image') {
    throw new GatewayError('invalid_request', 'The AI request output modality is invalid.', 400, false);
  }
  if (request.expect === 'image' && request.structuredOutput !== undefined) {
    throw new GatewayError('invalid_request', 'An image request cannot also force structured output.', 400, false);
  }
  const fallbacks = body.fallbacks === undefined ? [] : array(body.fallbacks).map(validateRoute);
  if (fallbacks.length > 3) throw new GatewayError('invalid_request', 'Too many AI fallback routes.', 400, false);
  // The surface discriminator is an ALLOWLIST, not a passthrough: an unknown value is refused
  // rather than dropped, so a client that means to name a gated surface can never have its
  // label silently discarded into "the general harness, which nothing gates".
  if (body.surface !== undefined && body.surface !== 'video' && body.surface !== 'pro'
    && body.surface !== 'spike') {
    throw new GatewayError('invalid_request', 'The AI request surface is invalid.', 400, false);
  }
  // A hosted Pro reservation id. Shape-checked here and MEANING-checked by the ledger, which
  // is the only place that can answer whether it is live, owned and still inside its ceiling.
  if (
    body.proGenerationId !== undefined
    && (typeof body.proGenerationId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(body.proGenerationId))
  ) {
    throw new GatewayError('invalid_request', 'The AI request reservation is invalid.', 400, false);
  }
  return {
    request: request as unknown as ModelRequest,
    route: validateRoute(body.route),
    ...(fallbacks.length ? { fallbacks } : {}),
    ...(body.surface ? { surface: body.surface } : {}),
    ...(body.proGenerationId ? { proGenerationId: body.proGenerationId as string } : {}),
  };
}

function configuredTimeoutMs(): number {
  const value = Number(process.env.AI_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(value) ? Math.min(300_000, Math.max(5_000, Math.round(value))) : 120_000;
}

function configuredRetryLimit(): number {
  const value = Number(process.env.AI_RETRY_LIMIT ?? 1);
  return Number.isFinite(value) ? Math.min(2, Math.max(0, Math.round(value))) : 1;
}

/** A 403 on a ZDR request is a PLAN refusal, not a bad credential, and telling the two apart
 *  matters: the first is fixed by upgrading the Vercel team (or by an explicit, audited
 *  decision to stop requiring ZDR for that task), the second by rotating a key. The failure
 *  body is READ to make the distinction and never copied - the message below is NoaCG's own,
 *  so no provider body or credential can reach a log or a user (docs/AI_PROVIDER_GATEWAY.md). */
function zdrRefusal(body: string): boolean {
  return /ZdrUnauthorizedError|Zero Data Retention/i.test(body);
}

/** No provider of this model satisfies the retention filters the request asked for. The
 *  gateway refuses rather than serving from a non-compliant one, which is the whole point -
 *  but it is a DIFFERENT problem from the plan gate above (a better plan will not fix it;
 *  a different model might), so it gets its own code rather than being folded in. */
function retentionUnsatisfiable(body: string): boolean {
  return /no_providers_available/i.test(body);
}

/** The provider ALLOWLIST excluded every provider that serves the model. A configuration
 *  fault, not a provider one: the route is fine and the operator's `only` list is wrong (or
 *  the model moved providers). It reported as a generic `provider_rejected` once and cost a
 *  real investigation - "the AI provider rejected the request" reads as the model refusing,
 *  when nothing was ever asked. */
function allowlistExcludesModel(body: string): boolean {
  return /No available providers match the '?only'? filter/i.test(body);
}

/**
 * The model does not exist FOR THIS CREDENTIAL - which is not the same as not existing.
 *
 * Measured against Google AI on 2026-08-14: `gemini-2.5-flash` and `gemini-2.5-flash-lite` are
 * listed by BOTH of Google's own model listings, with no field of any kind marking them apart,
 * and then answer 404 "no longer available to new users" for a key created after they were
 * retired. So a picker cannot filter them out - the listing is what it has to trust - and the
 * only honest place left to help is the error. A bare "the provider rejected the request"
 * sends someone hunting a fault in their key or in NoaCG; naming the cause costs one regex.
 */
function modelUnavailableForKey(body: string): boolean {
  return /no longer available|not found for api version|is not supported for|models\/[^"']+ is not found/i.test(body);
}

export function providerFailure(status: number, body = ''): GatewayError {
  if (status === 408) return new GatewayError('timeout', 'The AI provider timed out.', 504, true);
  if (status === 404 || (status === 400 && modelUnavailableForKey(body))) {
    if (modelUnavailableForKey(body)) {
      return new GatewayError(
        'provider_rejected',
        'That model is not available on this account - the provider lists it but will not serve it. '
          + 'Pick a newer model from the list.',
        502,
        false,
      );
    }
    return new GatewayError('provider_rejected', 'The AI provider does not know that model id.', 502, false);
  }
  if (status === 429) return new GatewayError('rate_limited', 'The AI provider is busy. Try again shortly.', 429, true);
  if (status === 400 && allowlistExcludesModel(body)) {
    return new GatewayError(
      'route_not_permitted',
      'The configured provider allowlist does not include any provider that serves this model.',
      502,
      false,
    );
  }
  if (status === 400 && retentionUnsatisfiable(body)) {
    return new GatewayError(
      'retention_unsatisfiable',
      'No provider of this model meets the required data-retention policy.',
      502,
      false,
    );
  }
  if (status === 403 && zdrRefusal(body)) {
    return new GatewayError(
      'zdr_unavailable',
      'This route requires zero-data-retention routing, which the gateway plan does not include.',
      502,
      false,
    );
  }
  if (status === 401 || status === 403) {
    return new GatewayError('provider_rejected', 'The AI provider rejected its server-side credential.', 502, false);
  }
  if (status >= 500) return new GatewayError('unavailable', 'The AI provider is temporarily unavailable.', 503, true);
  return new GatewayError('provider_rejected', 'The AI provider rejected the request.', 502, false);
}

/** Only our own elapsed deadline, distinct from an HTTP 408 or a caller cancelling. */
class ClientDeadlineError extends GatewayError {
  constructor() { super('timeout', 'The AI provider timed out.', 504, true); }
}

async function oneAttempt(
  adapter: ProviderAdapter,
  request: ModelRequest,
  route: ModelRoute,
  key: string,
  fetchImpl: Fetch,
  policy?: GatewayExecutionPolicy,
): Promise<{ output: unknown; usage: ModelUsage; images?: ModelImage[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy?.timeoutMs ?? configuredTimeoutMs());
  try {
    const response = await fetchImpl(adapter.endpoint, {
      ...adapter.createRequest(request, route, key, policy),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Bounded read: enough to classify the refusal, never enough to be worth logging.
      const detail = await response.text().then((text) => text.slice(0, 2000)).catch(() => '');
      throw providerFailure(response.status, detail);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new GatewayError('malformed_response', 'The AI provider returned an invalid response.', 502, false);
    }
    return adapter.parseResponse(data, request, route);
  } catch (error) {
    // Also catches an abort while reading a successful response body. A provider's HTTP
    // error remains its own outcome even if reading its detail reached our deadline.
    if (controller.signal.aborted && !(error instanceof GatewayError && error.code !== 'malformed_response')) {
      throw new ClientDeadlineError();
    }
    if (error instanceof GatewayError) throw error;
    throw new GatewayError('unavailable', 'The AI provider could not be reached.', 503, true);
  } finally {
    clearTimeout(timer);
  }
}

export interface GatewayDependencies {
  fetchImpl?: Fetch;
  keyFor(provider: AiProviderId): Promise<string>;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The routing directives a MANAGED call sends to Vercel AI Gateway
 * (`providerOptions.gateway` on the Chat Completions body).
 *
 * TWO retention directives, and they are deliberately not the same one:
 *
 *   - `disallowPromptTraining` is the direct successor to OpenRouter's
 *     `data_collection: 'deny'` - route only to providers that do not train on the prompt.
 *     It is FREE ON EVERY PLAN, so it is pinned on for every managed call and never made
 *     configurable, exactly as `dataCollection: 'deny'` was pinned before it.
 *   - `zeroDataRetention` is the strict superset: no retention at all. **It is a Vercel
 *     Pro/Enterprise feature.** On a Hobby team the gateway answers 403
 *     `ZdrUnauthorizedError`, which `providerFailure` reports as `zdr_unavailable` - so a
 *     task whose profile requires ZDR fails closed instead of quietly sending prompts to a
 *     retaining provider (docs/AI_PROVIDER_GATEWAY.md, "Retention").
 *
 * The gateway ANDs them, so a plan without ZDR still gets the no-training floor rather than
 * nothing. Keeping them separate is what makes that true: folding both into one flag would
 * have meant a Hobby deployment either failing every call or sending prompts to a provider
 * free to train on them.
 *
 * A filter that no provider of the requested model satisfies fails with 400
 * `no_providers_available` rather than falling back to one that does not - reported as
 * `retention_unsatisfiable`, because a silent fallback is precisely what these ask to prevent.
 *
 * `only` is a PROVIDER-SLUG allowlist (`google`, `vertex`, `bedrock`, …), not OpenRouter's
 * endpoint list; absent, the gateway picks within whatever ZDR already narrowed it to. It
 * still carries the audited-serving requirement Lite depends on - which provider answers
 * decides quantization and precision, which no privacy directive covers.
 *
 * TWO OPENROUTER DIRECTIVES HAVE NO EQUIVALENT, and dropping them is a real behaviour
 * change, not a rename:
 *
 *   - `max_price` (a per-request price ceiling the provider enforced). The gateway has no
 *     such field. `sort: 'cost'` asks for the cheapest eligible provider first, which is a
 *     preference rather than a cap, so the ceiling now lives entirely server-side: the
 *     approved-route catalog's audited price snapshot, `fundedRoutePrice`, and each task's
 *     `maxProviderCostUsd` booking. Those already existed; they are now the ONLY cap.
 *   - `require_parameters` (serve only from endpoints advertising every request parameter).
 *     No equivalent. It mattered on OpenRouter because endpoints of one model differed; a
 *     gateway model slug resolves to providers serving the same contract.
 *
 * `allow_fallbacks: false` is subsumed: a retention filter narrows the routing set BEFORE
 * any fallback is chosen, so there is no non-compliant provider left to fall back onto.
 */
export interface GatewayRoutingPolicy {
  zeroDataRetention: boolean;
  /** Route only to providers that do not train on the prompt - OpenRouter's
   *  `data_collection: 'deny'`, one field over, and free on every plan. */
  disallowPromptTraining: boolean;
  /** Provider slugs permitted to serve the request. */
  only?: string[];
  /** Cheapest eligible provider first - the nearest thing to a price ceiling the gateway
   *  offers, and a preference rather than a cap. */
  sort?: 'cost';
  /** Cost-attribution labels for the AI Gateway spend report (`group_by=tag`). This is what
   *  replaced OpenRouter's `x-title`/`http-referer` attribution headers, and unlike them it
   *  is queryable per surface. */
  tags?: string[];
  structuredOutputMode?: 'json-schema' | 'tool';
  /** Switch a hybrid-inference model (Ling/Qwen family) to its non-thinking mode via the
   *  chat template. Off by default and OMITTED unless set: the field is model-family
   *  specific, and a route that never heard of it must receive a byte-identical body.
   *  Measured 2026-08-12 on `inclusionai/ling-3.0-tiny-free`: thinking mode spent the whole
   *  1,500-token Lite budget reasoning (finish_reason `length`, then a 90s timeout at 32k),
   *  while `chat_template_kwargs: { enable_thinking: false }` answered in 18 tokens. */
  thinking?: 'off';
}

export interface GatewayExecutionPolicy {
  /** Total provider attempts across all routes, including retries. */
  maxAttempts?: number;
  retryLimit?: number;
  timeoutMs?: number;
  gateway?: GatewayRoutingPolicy;
  /** Prices a served reply that reported no cost, per attempt and on that attempt's own route.
   *  Defaults to `configuredPrice`; a caller with an audited price table (Pro's catalog) passes
   *  it so no served attempt settles at its fee alone (#2092). */
  priceFor?: (route: ModelRoute) => ModelPrice | null;
  /** A conservative per-route attempt ceiling INCLUDING its fee, supplied by the funded
   *  caller. A client deadline can still bill (#2114); no tokens or exact cost are invented.
   *  Applies only to Vercel deadlines, not HTTP 408/5xx, network failure or BYO providers. */
  timeoutCostFor?: (route: ModelRoute) => number | null;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export function configuredPrice(route: ModelRoute): ModelPrice | null {
  const raw = process.env.AI_MODEL_PRICING_JSON;
  if (!raw) return null;
  try {
    const prices = JSON.parse(raw) as Record<string, unknown>;
    const entry = object(prices[`${route.provider}:${route.model}`]);
    const inputPerMillion = safeNumber(entry.inputPerMillion);
    const outputPerMillion = safeNumber(entry.outputPerMillion);
    return inputPerMillion || outputPerMillion ? { inputPerMillion, outputPerMillion } : null;
  } catch {
    return null;
  }
}

export function estimateModelCost(
  route: ModelRoute,
  inputTokens: number,
  outputTokens: number,
  override?: ModelPrice,
): number | null {
  const price = override ?? configuredPrice(route);
  if (!price) return null;
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000;
}

// ---- The gateway's per-request fee (#2015) ----
//
// Vercel AI Gateway bills "Custom Reporting" writes on top of tokens: $0.075 per 1,000 writes,
// where each unique tag (or user id, or quota entity id) on a request is one write
// (vercel.com/docs/ai-gateway/pricing, "Add-on surcharges"). Every managed call carries one
// `surface:*` tag, so every served request costs $0.000075 more than the cost the reply reports.
//
// Measured, not inferred: the eval ledgers of runs 41620061986 and 41621970771 show the balance
// debit minus the reported cost is exactly $0.000075 per request on `/v1/evaluate` (Jev, Elephant)
// and on chat completions (Claude Haiku 5.5), 50 requests in one batch included. The reported cost
// (`usage.cost`, `providerMetadata.gateway.cost`) is tokens at the listed price and nothing else.
// A request the gateway refuses before inference (a 4xx) was charged nothing.
//
// So the fee follows the TAGS, not the model: a request without tags, or sent past the gateway
// (a user's own provider key), carries none. If Vercel changes the price, or turns Custom
// Reporting off, or starts including the fee in the reported cost, set
// AI_GATEWAY_TAG_WRITE_USD (0 removes it) rather than editing callers.

/** The price of one Custom Reporting write, in USD. */
export const GATEWAY_TAG_WRITE_USD = 0.000075;

export function gatewayTagWriteUsd(): number {
  const raw = process.env.AI_GATEWAY_TAG_WRITE_USD?.trim();
  if (!raw) return GATEWAY_TAG_WRITE_USD;
  const value = Number(raw);
  // A typo must not silently drop the fee: anything unreadable keeps the measured price.
  return Number.isFinite(value) && value >= 0 ? value : GATEWAY_TAG_WRITE_USD;
}

/** The fee one served request to `route` pays under this routing policy: one write per unique
 *  tag, and nothing for a route the gateway does not carry or a request with no tags. */
export function gatewayRequestFeeUsd(route: ModelRoute, gateway?: GatewayRoutingPolicy | null): number {
  if (route.provider !== 'vercel' || !gateway?.tags?.length) return 0;
  return new Set(gateway.tags).size * gatewayTagWriteUsd();
}

/** Add the request fee to a reply's usage, exactly once. `requestFeeUsd` marks it applied, so a
 *  second call (or a caller re-pricing the reply) never charges it again. */
export function withRequestFee(usage: ModelUsage, feeUsd: number): ModelUsage {
  if (usage.requestFeeUsd !== undefined || feeUsd <= 0) return usage;
  return {
    ...usage,
    requestFeeUsd: feeUsd,
    ...(usage.estimatedCost
      ? { estimatedCost: { ...usage.estimatedCost, amount: usage.estimatedCost.amount + feeUsd } }
      : {}),
  };
}

/** Price a reply that reported no cost: its tokens at `price`, plus the request fee it already
 *  carries. A reply that has a cost (which includes the fee) is returned unchanged, except for
 *  the tokens of summed attempts that had none (`unpricedTokens`), which are priced once. */
export function withTokenCost(usage: ModelUsage, route: ModelRoute, price?: ModelPrice | null): ModelUsage {
  if (usage.estimatedCost && usage.unpricedTokens) {
    const tokens = estimateModelCost(route, usage.unpricedTokens.input, usage.unpricedTokens.output, price ?? undefined);
    if (tokens === null) return usage;
    const { unpricedTokens: _priced, ...rest } = usage;
    return { ...rest, estimatedCost: { ...usage.estimatedCost, amount: usage.estimatedCost.amount + tokens } };
  }
  if (usage.estimatedCost) return usage;
  const tokens = estimateModelCost(route, usage.inputTokens, usage.outputTokens, price ?? undefined);
  if (tokens === null) return usage;
  return { ...usage, estimatedCost: { amount: tokens + (usage.requestFeeUsd ?? 0), currency: 'USD', source: 'configured' } };
}

/** What a reply cost as far as is known: its estimate (fee included), else at least its fee. */
export function usageCostUsd(usage: ModelUsage | undefined): number {
  return usage?.estimatedCost?.amount ?? usage?.requestFeeUsd ?? 0;
}

/** Several served replies as one usage: tokens and request fees add up, and so does the cost.
 *  The sum has a cost estimate when any part has one, amounting to every part's
 *  `usageCostUsd` (an unpriced part counts its fee); the unpriced parts' tokens stay in
 *  `unpricedTokens` for the caller to price. With no estimate at all, the caller prices the
 *  summed tokens. Either way `withTokenCost` adds each token and each fee once. */
export function sumUsage(parts: readonly ModelUsage[]): ModelUsage {
  if (parts.length === 1) return parts[0];
  const total = (read: (usage: ModelUsage) => number | undefined) =>
    parts.reduce((sum, usage) => sum + (read(usage) ?? 0), 0);
  const cachedInputTokens = total((usage) => usage.cachedInputTokens);
  const reasoningTokens = total((usage) => usage.reasoningTokens);
  const fees = parts.filter((usage) => usage.requestFeeUsd !== undefined);
  const priced = parts.filter((usage) => usage.estimatedCost);
  const unpriced = (read: (tokens: { input: number; output: number }) => number) => total((usage) =>
    usage.estimatedCost
      ? usage.unpricedTokens && read(usage.unpricedTokens)
      : read({ input: usage.inputTokens, output: usage.outputTokens }));
  const unpricedTokens = { input: unpriced((tokens) => tokens.input), output: unpriced((tokens) => tokens.output) };
  return {
    inputTokens: total((usage) => usage.inputTokens),
    outputTokens: total((usage) => usage.outputTokens),
    totalTokens: total((usage) => usage.totalTokens),
    ...(cachedInputTokens ? { cachedInputTokens } : {}),
    ...(reasoningTokens ? { reasoningTokens } : {}),
    ...(fees.length ? { requestFeeUsd: total((usage) => usage.requestFeeUsd) } : {}),
    ...(priced.length
      ? {
          estimatedCost: {
            amount: total(usageCostUsd),
            currency: 'USD' as const,
            source: priced.some((usage) => usage.estimatedCost?.source === 'provider') ? 'provider' as const : 'configured' as const,
          },
          ...(unpricedTokens.input || unpricedTokens.output ? { unpricedTokens } : {}),
        }
      : {}),
  };
}

/** The most one attempt can cost: tokens at the priced worst case plus the request fee. Null
 *  when the route has no price, exactly like `estimateModelCost`. */
export function worstAttemptCostUsd(
  route: ModelRoute,
  inputTokens: number,
  outputTokens: number,
  price: ModelPrice | undefined,
  gateway?: GatewayRoutingPolicy | null,
): number | null {
  const tokens = estimateModelCost(route, inputTokens, outputTokens, price);
  return tokens === null ? null : tokens + gatewayRequestFeeUsd(route, gateway);
}

/** Execute a normalized request. Provider changes occur only along the explicit route list. */
export async function executeGatewayRequest(
  body: AiGatewayRequestBody,
  dependencies: GatewayDependencies,
  policy?: GatewayExecutionPolicy,
): Promise<ModelResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const routes = [body.route, ...(body.fallbacks ?? [])];
  const attempts: ModelResult['attempts'] = [];
  // Served replies, plus explicitly bounded client deadlines: a measured client timeout
  // still debited gateway credits (#2114). HTTP 408/5xx and network failures remain unmeasured.
  // A retry pays for the earlier attempt too; each attempt's fee is included exactly once.
  const served: ModelUsage[] = [];
  const priceFor = policy?.priceFor ?? configuredPrice;
  const charge = (usage: ModelUsage, route: ModelRoute) => served.push(withTokenCost(
    withRequestFee(usage, gatewayRequestFeeUsd(route, policy?.gateway)),
    route,
    priceFor(route),
  ));
  // A request that fails after served attempts still paid for them: the error carries the sum.
  // A non-gateway error (a caller's key lookup that throws) becomes one so the sum survives, and
  // the field is always overwritten, so an error object a caller reuses never keeps another
  // request's usage.
  const failed = (error: unknown): unknown => {
    if (!(error instanceof GatewayError) && !served.length) return error;
    const gatewayError = error instanceof GatewayError
      ? error
      : new GatewayError('unavailable', 'The AI request could not be completed.', 503, true);
    gatewayError.servedUsage = served.length ? sumUsage(served) : undefined;
    return gatewayError;
  };
  let lastError: GatewayError | null = null;
  let totalAttempts = 0;
  const retries = policy?.retryLimit ?? configuredRetryLimit();
  const maxAttempts = policy?.maxAttempts ?? Number.POSITIVE_INFINITY;

  try {
    for (const route of routes) {
      if (totalAttempts >= maxAttempts) break;
      const key = await dependencies.keyFor(route.provider);
      if (!key) {
        lastError = new GatewayError('missing_key', `No ${route.provider} API key is configured.`, 412, false);
        attempts.push({ route, attempts: 0 });
        continue;
      }
      const adapter = AI_ADAPTERS[route.provider];
      let routeAttempts = 0;
      for (let retry = 0; retry <= retries && totalAttempts < maxAttempts; retry++) {
        routeAttempts += 1;
        totalAttempts += 1;
        try {
          const result = await oneAttempt(adapter, body.request, route, key, fetchImpl, policy);
          const output = servedParse(result.usage, () => {
            const decoded = decodeStructuredOutput(result.output, body.request);
            validateStructuredOutput(decoded, body.request);
            return decoded;
          });
          charge(result.usage, route);
          attempts.push({ route, attempts: routeAttempts });
          return {
            output,
            usage: sumUsage(served),
            provider: route.provider,
            model: route.model,
            attempts,
            ...(result.images ? { images: result.images } : {}),
          };
        } catch (error) {
          if (error instanceof ServedAttemptError) charge(error.usage, route);
          if (error instanceof ClientDeadlineError && route.provider === 'vercel') {
            const ceiling = policy?.timeoutCostFor?.(route);
            const fee = gatewayRequestFeeUsd(route, policy?.gateway);
            if (typeof ceiling === 'number' && Number.isFinite(ceiling) && ceiling >= fee && ceiling >= 0) {
              served.push({
                inputTokens: 0, outputTokens: 0, totalTokens: 0,
                requestFeeUsd: fee,
                estimatedCost: { amount: ceiling, currency: 'USD', source: 'configured' },
              });
            }
          }
          lastError = error instanceof GatewayError
            ? error
            : new GatewayError('unavailable', 'The AI provider could not be reached.', 503, true);
          if (!lastError.retryable || retry === retries || totalAttempts >= maxAttempts) break;
          await sleep(250 * (retry + 1));
        }
      }
      attempts.push({ route, attempts: routeAttempts });
      if (lastError && !lastError.retryable) break;
    }

    throw lastError ?? new GatewayError('unavailable', 'No AI route was available.', 503, false);
  } catch (error) {
    throw failed(error);
  }
}

