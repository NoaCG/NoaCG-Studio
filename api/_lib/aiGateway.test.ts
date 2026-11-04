import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  decodeStructuredOutput,
  executeGatewayRequest,
  GATEWAY_TAG_WRITE_USD,
  gatewayRequestFeeUsd,
  GatewayError,
  usageCostUsd,
  validateGatewayBody,
  withRequestFee,
  withTokenCost,
  worstAttemptCostUsd,
  type GatewayExecutionPolicy,
  type GatewayRoutingPolicy,
} from './aiGateway.js';
import { gatewayLedgerEntry } from './aiGatewayLedger.js';
import { modelResultPatch } from './aiLiteStore.js';
import { readUserAiKeys, userAiKeysCookie } from './aiCredentials.js';
import { surfaceRoutePolicy } from './aiSurfacePolicy.js';
import { APPROVED_MODEL_CATALOG } from './aiModelCatalog.js';
import type { AiGatewayRequestBody, AiProviderId } from '../../src/ai/modelTypes.js';

const CONTROLLED_ENV = [
  'AI_KEY_ENCRYPTION_SECRET',
  'AI_MODEL_PRICING_JSON',
  'AI_RETRY_LIMIT',
  'AI_GATEWAY_TAG_WRITE_USD',
] as const;
const originalEnv = new Map(CONTROLLED_ENV.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of CONTROLLED_ENV) delete process.env[name];
  process.env.AI_RETRY_LIMIT = '0';
});

afterEach(() => {
  for (const name of CONTROLLED_ENV) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function body(provider: AiProviderId = 'anthropic', model = 'test-model'): AiGatewayRequestBody {
  return {
    route: { provider, model },
    request: {
      system: 'Return a concise answer.',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 100,
    },
  };
}

const keyFor = async () => 'server-side-test-key';

test('selects OpenAI Responses and normalizes usage and configured cost', async () => {
  process.env.AI_MODEL_PRICING_JSON = JSON.stringify({
    'openai:test-model': { inputPerMillion: 2, outputPerMillion: 8 },
  });
  let calledUrl = '';
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(body('openai'), {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 100, output_tokens: 25 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://api.openai.com/v1/responses');
  assert.equal(sent.model, 'test-model');
  assert.equal(sent.instructions, 'Return a concise answer.');
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    outputTokens: 25,
    totalTokens: 125,
    estimatedCost: { amount: 0.0004, currency: 'USD', source: 'configured' },
  });
  assert.equal(result.provider, 'openai');
});

test('selects Vercel AI Gateway through its OpenAI-compatible endpoint', async () => {
  let calledUrl = '';
  let sentHeaders = new Headers();
  const result = await executeGatewayRequest(body('vercel', 'vendor/model'), {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sentHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 8, completion_tokens: 3, cost: 0.002 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(sentHeaders.get('authorization'), 'Bearer server-side-test-key');
  // The OpenRouter attribution headers are gone and nothing replaced them at the header
  // level: per-surface attribution moved into `providerOptions.gateway.tags`, which is
  // queryable in the spend report where a header never was.
  assert.equal(sentHeaders.get('http-referer'), null);
  assert.equal(sentHeaders.get('x-title'), null);
  assert.equal(result.model, 'vendor/model');
  // `usage.cost` survived the transport swap - verified against the live gateway, which
  // returns it in the same place with the same meaning.
  assert.deepEqual(result.usage.estimatedCost, { amount: 0.002, currency: 'USD', source: 'provider' });
});

test('selects Hugging Face through its OpenAI-compatible inference router', async () => {
  const routed = body('huggingface', 'openai/gpt-oss-120b');
  routed.request.temperature = 0.2;
  routed.request.seed = 41723;
  let calledUrl = '';
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(routed, {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 7, completion_tokens: 2 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(sent.model, 'openai/gpt-oss-120b');
  assert.equal(sent.temperature, 0.2);
  assert.equal(sent.seed, 41723);
  assert.equal(result.provider, 'huggingface');
  assert.deepEqual(result.usage, { inputTokens: 7, outputTokens: 2, totalTokens: 9 });
});

test('selects Google through its OpenAI-compatible surface, and never forwards a seed', async () => {
  const routed = body('google', 'gemini-2.5-flash');
  routed.request.temperature = 0.3;
  // A bench preference must not be able to fail a user's generation: Google's compatibility
  // layer rejects parameters it does not implement.
  routed.request.seed = 41723;
  let calledUrl = '';
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(routed, {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(sent.model, 'gemini-2.5-flash');
  assert.equal(sent.temperature, 0.3);
  assert.equal(sent.seed, undefined);
  assert.equal(result.provider, 'google');
  assert.deepEqual(result.usage, { inputTokens: 5, outputTokens: 3, totalTokens: 8 });
});

test('a model the account cannot call is reported as that, not as a bare rejection', async () => {
  // Google's own listings advertise retired models to keys that cannot call them (measured
  // 2026-08-14 on gemini-2.5-flash-lite), so the picker cannot filter them out and the error is
  // the only place left to be honest. Without this, the answer is "the provider rejected the
  // request" and the user goes looking for a fault in their key.
  const failed = await executeGatewayRequest(body('google', 'gemini-2.5-flash-lite'), {
    keyFor,
    fetchImpl: async () => new Response(
      JSON.stringify({ error: { code: 404, message: 'This model models/gemini-2.5-flash-lite is no longer available to new users.', status: 'NOT_FOUND' } }),
      { status: 404 },
    ),
  }).then(() => null, (error: unknown) => error as { code: string; message: string; retryable: boolean });

  assert.ok(failed);
  assert.equal(failed.code, 'provider_rejected');
  assert.match(failed.message, /not available on this account/);
  // Not retryable: a second attempt on the same id fails identically and only spends time.
  assert.equal(failed.retryable, false);
});

test('sends the managed gateway routing policy and normalizes the answer', async () => {
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(body('vercel', 'vendor/model'), {
    keyFor,
    fetchImpl: async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 8,
          prompt_tokens_details: { cached_tokens: 12 },
          completion_tokens_details: { reasoning_tokens: 3 },
          cost: 0.0004,
        },
      }));
    },
  }, {
    maxAttempts: 1,
    retryLimit: 0,
    timeoutMs: 5000,
    gateway: {
      zeroDataRetention: true,
      disallowPromptTraining: true,
      only: ['google'],
      sort: 'cost',
      tags: ['surface:lite'],
    },
  });

  const providerOptions = sent.providerOptions as Record<string, unknown>;
  assert.deepEqual(providerOptions.gateway, {
    zeroDataRetention: true,
    disallowPromptTraining: true,
    only: ['google'],
    sort: 'cost',
    tags: ['surface:lite'],
  });
  // Nothing OpenRouter-shaped is left on the wire. A stray `provider` block would be
  // silently ignored by the gateway, which is exactly how a dead privacy directive survives
  // a migration while still looking enforced from the source.
  assert.equal(sent.provider, undefined);
  assert.equal(result.usage.cachedInputTokens, 12);
  assert.equal(result.usage.reasoningTokens, 3);
});

test('an empty provider allowlist is omitted rather than sent as "no provider is permitted"', async () => {
  let sent: Record<string, unknown> = {};
  await executeGatewayRequest(body('vercel', 'vendor/model'), {
    keyFor,
    fetchImpl: async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));
    },
  }, { gateway: { zeroDataRetention: true, disallowPromptTraining: true, only: [] } });

  assert.deepEqual(
    (sent.providerOptions as Record<string, unknown>).gateway,
    { zeroDataRetention: true, disallowPromptTraining: true },
  );
});

test('thinking: off rides as chat_template_kwargs and is OMITTED unless asked for', async () => {
  // The switch is model-family specific (Ling/Qwen hybrid inference), so the default body must
  // stay byte-identical for routes that never heard of it - measured on the incumbent, asserted
  // here. Measured 2026-08-12 on inclusionai/ling-3.0-tiny-free: thinking mode spent the whole
  // Lite output budget reasoning; the template kwarg answered in 18 tokens.
  let sent: Record<string, unknown> = {};
  const reply = async (_input: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
  };

  await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: reply }, {
    gateway: { zeroDataRetention: true, disallowPromptTraining: true, thinking: 'off' },
  });
  assert.deepEqual(sent.chat_template_kwargs, { enable_thinking: false });

  await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: reply }, {
    gateway: { zeroDataRetention: true, disallowPromptTraining: true },
  });
  assert.equal('chat_template_kwargs' in sent, false);
});

test('a ZDR refusal is reported as its own code, not as a bad credential', async () => {
  await assert.rejects(
    executeGatewayRequest(body('vercel', 'vendor/model'), {
      keyFor,
      fetchImpl: async () => new Response(
        JSON.stringify({
          error: {
            message: 'Zero Data Retention (ZDR) is only available for Pro and Enterprise plans.',
            type: 'permission_denied',
            param: { name: 'ZdrUnauthorizedError' },
          },
        }),
        { status: 403 },
      ),
    }, { gateway: { zeroDataRetention: true, disallowPromptTraining: true } }),
    (error: unknown) => {
      const failure = error as { code: string; retryable: boolean; message: string };
      assert.equal(failure.code, 'zdr_unavailable');
      assert.equal(failure.retryable, false);
      // NoaCG's own wording - the provider body is read to classify and never copied.
      assert.ok(!failure.message.includes('Pro and Enterprise'));
      return true;
    },
  );
});

test('a filter no provider satisfies is its own code - a plan will not fix it', async () => {
  // 400 no_providers_available, which is what the gateway answers when the retention filters
  // narrow the routing set to nothing. Distinct from the plan refusal above on purpose: that
  // one is fixed by upgrading, this one by choosing a different model.
  await assert.rejects(
    executeGatewayRequest(body('vercel', 'vendor/model'), {
      keyFor,
      fetchImpl: async () => new Response(
        JSON.stringify({
          error: 'No providers available that disallow prompt training for model: vendor/model',
          type: 'no_providers_available',
          statusCode: 400,
        }),
        { status: 400 },
      ),
    }, { gateway: { zeroDataRetention: false, disallowPromptTraining: true } }),
    (error: unknown) => {
      const failure = error as { code: string; retryable: boolean };
      assert.equal(failure.code, 'retention_unsatisfiable');
      // Not retryable: the routing set will not change on a second identical attempt, and
      // spending the budget to discover that twice is the mistake this flag prevents.
      assert.equal(failure.retryable, false);
      return true;
    },
  );
});

test('an ordinary 403 still reads as a rejected credential', async () => {
  await assert.rejects(
    executeGatewayRequest(body('vercel', 'vendor/model'), {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Forbidden' } }), { status: 403 }),
    }),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'provider_rejected');
      return true;
    },
  );
});

test('supports forced-tool structured output through OpenRouter', async () => {
  const structured = body('vercel', 'vendor/tool-model');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A required title.',
    schema: {
      type: 'object',
      required: ['title'],
      additionalProperties: false,
      properties: { title: { type: 'string' } },
    },
  };
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(structured, {
    keyFor,
    fetchImpl: async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              type: 'function',
              function: {
                name: 'result',
                arguments: JSON.stringify({ title: 'Lower third' }),
              },
            }],
          },
        }],
        usage: { prompt_tokens: 8, completion_tokens: 3, cost: 0.0001 },
      }));
    },
  }, {
    maxAttempts: 1,
    retryLimit: 0,
    timeoutMs: 5000,
    gateway: {
      zeroDataRetention: false,
      disallowPromptTraining: true,
      only: ['google'],
      structuredOutputMode: 'tool',
    },
  });

  assert.equal('response_format' in sent, false);
  assert.equal(Array.isArray(sent.tools), true);
  assert.deepEqual(result.output, { title: 'Lower third' });
  const gateway = (sent.providerOptions as Record<string, unknown>).gateway as Record<string, unknown>;
  assert.equal(gateway.zeroDataRetention, false);
  // structuredOutputMode is OURS, not the gateway's: it picks how the schema is forced and
  // must never be forwarded as a routing directive the gateway would reject.
  assert.equal('structuredOutputMode' in gateway, false);
});

test('reports a missing key before making a provider request', async () => {
  let called = false;
  await assert.rejects(
    executeGatewayRequest(body(), {
      keyFor: async () => '',
      fetchImpl: async () => {
        called = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'missing_key',
  );
  assert.equal(called, false);
});

test('rejects malformed provider responses', async () => {
  await assert.rejects(
    executeGatewayRequest(body('openai'), {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({ output: [] })),
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response',
  );
});

test('validates structured output after the provider parses it', async () => {
  const structured = body('anthropic');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A required title.',
    schema: {
      type: 'object',
      required: ['title'],
      additionalProperties: false,
      properties: { title: { type: 'string' } },
    },
  };
  await assert.rejects(
    executeGatewayRequest(structured, {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({
        content: [{ type: 'tool_use', name: 'result', input: { wrong: true } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 4 },
      })),
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response',
  );
});

test('enforces structured string and numeric constraints at the gateway boundary', async () => {
  const structured = body('anthropic');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A bounded color and scale.',
    schema: {
      type: 'object',
      required: ['color', 'scale'],
      additionalProperties: false,
      properties: {
        color: {
          type: 'string',
          maxLength: 9,
          pattern: '^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$',
        },
        scale: { type: 'number', minimum: 0.7, maximum: 1.4 },
      },
    },
  };
  await assert.rejects(
    executeGatewayRequest(structured, {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({
        content: [{
          type: 'tool_use',
          name: 'result',
          input: { color: 'red; background: url(https://example.test)', scale: 99 },
        }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 4 },
      })),
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response',
  );
});

test('enforces an integer range, and the rejection is retryable', async () => {
  // Integers used to check only integer-ness, so a declared range bound nothing and the
  // caller discovered the violation after paying for the call. The score below is a whole
  // number and still out of range; malformed_response is retryable, so the bounded attempt
  // budget gets to try again rather than burning the generation.
  const structured = body('anthropic');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A 1-5 score.',
    schema: {
      type: 'object',
      required: ['score'],
      additionalProperties: false,
      properties: { score: { type: 'integer', minimum: 1, maximum: 5 } },
    },
  };
  const reply = (score: unknown) => async () => new Response(JSON.stringify({
    content: [{ type: 'tool_use', name: 'result', input: { score } }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 4 },
  }));
  const isRetryableMalformed = (error: unknown) =>
    error instanceof GatewayError && error.code === 'malformed_response' && error.retryable;
  await assert.rejects(executeGatewayRequest(structured, { keyFor, fetchImpl: reply(7) }), isRetryableMalformed);
  await assert.rejects(executeGatewayRequest(structured, { keyFor, fetchImpl: reply(0) }), isRetryableMalformed);
  await assert.rejects(executeGatewayRequest(structured, { keyFor, fetchImpl: reply(3.5) }), isRetryableMalformed);
  const accepted = await executeGatewayRequest(structured, { keyFor, fetchImpl: reply(3) });
  assert.deepEqual(accepted.output, { score: 3 });
});

test('uses an explicitly ordered fallback but never invents one', async () => {
  const routed = body('anthropic', 'primary');
  routed.fallbacks = [{ provider: 'openai', model: 'fallback' }];
  const calls: string[] = [];
  const result = await executeGatewayRequest(routed, {
    keyFor,
    fetchImpl: async (input) => {
      calls.push(String(input));
      if (String(input).includes('anthropic.com')) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: 'output_text', text: 'fallback ok' }] }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }));
    },
  });
  assert.equal(result.provider, 'openai');
  assert.deepEqual(calls, [
    'https://api.anthropic.com/v1/messages',
    'https://api.openai.com/v1/responses',
  ]);

  const primaryOnlyCalls: string[] = [];
  await assert.rejects(executeGatewayRequest(body('anthropic'), {
    keyFor,
    fetchImpl: async (input) => {
      primaryOnlyCalls.push(String(input));
      return new Response('{}', { status: 503 });
    },
  }));
  assert.deepEqual(primaryOnlyCalls, ['https://api.anthropic.com/v1/messages']);
});

test('retries a transient failure only within the configured bound', async () => {
  process.env.AI_RETRY_LIMIT = '1';
  let calls = 0;
  const result = await executeGatewayRequest(body('openai'), {
    keyFor,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 2, output_tokens: 1 },
      }));
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.attempts, [{
    route: { provider: 'openai', model: 'test-model' },
    attempts: 2,
  }]);
});

test('shares a hard attempt ceiling across retries and fallback routes', async () => {
  const routed = body('anthropic', 'primary');
  routed.fallbacks = [{ provider: 'openai', model: 'fallback' }];
  const calls: string[] = [];
  await assert.rejects(executeGatewayRequest(routed, {
    keyFor,
    sleep: async () => {},
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response('{}', { status: 503 });
    },
  }, { maxAttempts: 2, retryLimit: 2 }));
  assert.equal(calls.length, 2);
  assert.equal(calls.every((url) => url.includes('anthropic.com')), true);
});

test('never includes provider secrets or upstream error text in errors', async () => {
  const secret = 'sk-secret-must-not-leak';
  let caught = '';
  try {
    await executeGatewayRequest(body('openai'), {
      keyFor: async () => secret,
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: `bad credential ${secret}` } }),
        { status: 401 },
      ),
    });
  } catch (error) {
    caught = error instanceof Error ? error.message : String(error);
  }
  assert.equal(caught, 'The AI provider rejected its server-side credential.');
  assert.equal(caught.includes(secret), false);
});

test('rejects invalid provider selection and malformed request bodies', () => {
  assert.throws(
    () => validateGatewayBody({
      route: { provider: 'unknown', model: 'x' },
      request: { system: 'x', messages: [{ role: 'user', content: 'x' }] },
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'invalid_request',
  );
});

test('the surface discriminator is allowlisted, preserved, and optional', () => {
  const base = {
    route: { provider: 'anthropic', model: 'claude-sonnet-5' },
    request: { system: 'x', messages: [{ role: 'user', content: 'x' }] },
  };

  // Absent = the general harness, which no feature key gates.
  assert.equal(validateGatewayBody(base).surface, undefined);
  assert.equal(validateGatewayBody({ ...base, surface: 'video' }).surface, 'video');
  assert.equal(validateGatewayBody({ ...base, surface: 'pro' }).surface, 'pro');

  // An unknown surface is REFUSED, never dropped: dropping it would turn a call that meant
  // to name a gated surface into an ungated one (docs/ADMIN.md, "Gating a surface on a
  // shared endpoint").
  for (const surface of ['spx', '', 'VIDEO', 1, null]) {
    assert.throws(
      () => validateGatewayBody({ ...base, surface }),
      (error: unknown) => error instanceof GatewayError && error.code === 'invalid_request',
      `surface ${JSON.stringify(surface)} should be refused`,
    );
  }
});

test('an OpenRouter image request asks for the image modality and normalizes the answer', async () => {
  let sent: Record<string, unknown> = {};
  const imageBody: AiGatewayRequestBody = {
    route: { provider: 'vercel', model: 'vendor/image-model' },
    request: {
      system: 'Render a broadcast lower third concept.',
      messages: [{ role: 'user', content: 'A calm news strap' }],
      expect: 'image',
    },
  };
  const result = await executeGatewayRequest(imageBody, {
    keyFor,
    fetchImpl: async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: '',
            images: [
              { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
              // A hosted URL is not a self-contained asset; it must not count as an image.
              { type: 'image_url', image_url: { url: 'https://cdn.example/image.png' } },
            ],
          },
        }],
        usage: { prompt_tokens: 40, completion_tokens: 1200, cost: 0.03 },
      }));
    },
  });

  assert.deepEqual(sent.modalities, ['image', 'text']);
  assert.deepEqual(result.images, [{ mediaType: 'image/png', base64: 'aGVsbG8=' }]);
  assert.equal(result.usage.estimatedCost?.amount, 0.03);
});

test('an image request answered without an image is a retryable malformed response', async () => {
  const imageBody: AiGatewayRequestBody = {
    route: { provider: 'vercel', model: 'vendor/image-model' },
    request: {
      system: 'Render.',
      messages: [{ role: 'user', content: 'brief' }],
      expect: 'image',
    },
  };
  await assert.rejects(
    executeGatewayRequest(imageBody, {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'Sorry, here is a description instead.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      })),
    }),
    (error: unknown) => error instanceof GatewayError
      && error.code === 'malformed_response'
      && error.retryable === true,
  );
});

test('providers without an image API refuse expect:image instead of answering in text', async () => {
  const imageBody: AiGatewayRequestBody = {
    route: { provider: 'anthropic', model: 'claude-sonnet-5' },
    request: {
      system: 'Render.',
      messages: [{ role: 'user', content: 'brief' }],
      expect: 'image',
    },
  };
  await assert.rejects(
    executeGatewayRequest(imageBody, {
      keyFor,
      fetchImpl: async () => {
        throw new Error('the provider must never be reached');
      },
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'invalid_request',
  );
});

test('the body validator holds the image-request contract', () => {
  const base = {
    route: { provider: 'vercel', model: 'vendor/image-model' },
    request: { system: 's', messages: [{ role: 'user', content: 'hi' }] },
  };
  const withExpect = {
    ...base,
    request: { ...base.request, expect: 'image' },
  };
  assert.equal(validateGatewayBody(withExpect).request.expect, 'image');

  // Only 'image' is a valid expectation - anything else is refused, not dropped.
  assert.throws(
    () => validateGatewayBody({ ...base, request: { ...base.request, expect: 'audio' } }),
    (error: unknown) => error instanceof GatewayError && error.code === 'invalid_request',
  );
  // Image output and forced structured output are mutually exclusive by contract.
  assert.throws(
    () => validateGatewayBody({
      ...base,
      request: {
        ...base.request,
        expect: 'image',
        structuredOutput: { name: 'emit', description: 'd', schema: { type: 'object' } },
      },
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'invalid_request',
  );
});

test('seals user keys in a tamper-evident HttpOnly cookie', () => {
  const secret = 'sk-user-secret-never-browser-readable';
  process.env.AI_KEY_ENCRYPTION_SECRET = 'test-only-encryption-secret-with-more-than-32-characters';
  const request = new Request('http://localhost/api/ai/credentials', {
    headers: { origin: 'http://localhost' },
  });
  const cookie = userAiKeysCookie(request, { openai: secret }, 'account-a');

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(cookie.includes(secret), false);

  const value = cookie.split(';')[0];
  const withCookie = (header: string) => new Request('http://localhost/api/ai/config', { headers: { cookie: header } });
  assert.deepEqual(readUserAiKeys(withCookie(value), 'account-a'), { openai: secret });

  // Flip one bit of the SEALED BYTES, not one character of the text: the last base64url
  // character can carry padding bits the decoder ignores, so editing it tampers with nothing on
  // some payload lengths and the check then passes or fails by chance.
  const [name, sealed] = value.split('=');
  const bytes = Buffer.from(sealed, 'base64url');
  bytes[bytes.length - 1] ^= 0x01;
  const tampered = `${name}=${bytes.toString('base64url')}`;
  assert.deepEqual(readUserAiKeys(withCookie(tampered), 'account-a'), {});
});

test('a sealed key is honoured only for the account that saved it', () => {
  // The cookie belongs to the BROWSER. Without an owner, the next person to sign in on the same
  // computer spent the previous account's key.
  process.env.AI_KEY_ENCRYPTION_SECRET = 'test-only-encryption-secret-with-more-than-32-characters';
  const save = new Request('http://localhost/api/ai/credentials', { headers: { origin: 'http://localhost' } });
  const withCookie = (header: string) => new Request('http://localhost/api/ai/config', { headers: { cookie: header } });

  const accountA = withCookie(userAiKeysCookie(save, { openai: 'sk-account-a' }, 'account-a').split(';')[0]);
  assert.deepEqual(readUserAiKeys(accountA, 'account-b'), {}, 'another account must not use it');
  assert.deepEqual(readUserAiKeys(accountA, null), {}, 'a signed-out caller must not use it');
  assert.deepEqual(readUserAiKeys(accountA, undefined), {}, 'a session that did not verify must not use it');

  const signedOut = withCookie(userAiKeysCookie(save, { openai: 'sk-signed-out' }, null).split(';')[0]);
  assert.deepEqual(readUserAiKeys(signedOut, null), { openai: 'sk-signed-out' });
  assert.deepEqual(readUserAiKeys(signedOut, 'account-a'), {}, 'an account must not use a signed-out key');
  assert.deepEqual(readUserAiKeys(signedOut, undefined), {}, 'an unverified session must not fall back to it');
});

// ── the tagged-surface routing policy (api/_lib/aiSurfacePolicy.ts) ─────────────────────

test('a policied surface asks the gateway for zero-data-retention routing', () => {
  const policy = surfaceRoutePolicy('pro', { provider: 'vercel', model: 'google/gemini-3.1-flash-image' });
  assert.ok(policy);
  assert.equal(policy.zeroDataRetention, true);
  // The three OpenRouter directives this replaced are gone, and their absence is the point:
  // the gateway serves a ZDR request only from providers under a verified ZDR agreement, so
  // "deny collection" and "no silent fallback" are properties of the route it picks rather
  // than flags we have to remember to set.
  assert.equal(policy.only, undefined);
  // Cheapest eligible provider - the nearest thing to the per-request price cap that died
  // with max_price, and a preference rather than a bound.
  assert.equal(policy.sort, 'cost');
  // Spend is attributable per surface, which the old attribution headers never were.
  assert.deepEqual(policy.tags, ['surface:pro']);
});

test('an unpoliced or untagged surface is left exactly as it was', () => {
  assert.equal(surfaceRoutePolicy(undefined, { provider: 'vercel', model: 'any/model' }), undefined);
  // Video routes are user-selectable and unaudited: a ZDR pin would refuse whichever of them
  // no ZDR provider serves, turning a privacy improvement into an outage.
  assert.equal(surfaceRoutePolicy('video', { provider: 'vercel', model: 'any/model' }), undefined);
  // The directives are the gateway's vocabulary; a DIRECT provider route (a user's own key
  // straight to Anthropic) gets no policy rather than a translated one.
  assert.equal(surfaceRoutePolicy('pro', { provider: 'anthropic', model: 'any-model' }), undefined);
});

test('no per-request price cap is sent, because the gateway has no field for one', () => {
  const policy = surfaceRoutePolicy('pro', { provider: 'vercel', model: 'google/gemini-3.1-flash-image' });
  assert.ok(policy);
  // Pinned deliberately rather than left to drift back: FUNDED_ROUTE_PRICE_CEILING used to
  // ride on every managed call as OpenRouter's `max_price`. It now gates which routes may be
  // CATALOGUED (fundedRoutePrice) and nothing refuses a call at request time, so a reviewer
  // reading only the policy does not conclude the cap is still enforced on the wire.
  assert.equal('maxInputPerMillion' in policy, false);
  assert.equal('maxOutputPerMillion' in policy, false);
});

test('a ZDR-verified claim in the catalog is backed by a written audit', () => {
  // A zdrAvailable:true entry is a privacy claim on the /admin Models page. It is a VERIFIED
  // fact (docs/ADMIN.md §9), so the entry has to say where the verification is - otherwise the
  // badge is an assertion with nothing behind it.
  for (const entry of APPROVED_MODEL_CATALOG) {
    if (!entry.zdrAvailable) continue;
    assert.ok(entry.notes.length > 0, `${entry.route.model} claims ZDR with no audit note`);
  }
  const concept = APPROVED_MODEL_CATALOG.find((entry) => entry.route.model === 'google/gemini-3.1-flash-image');
  // No task calls this route since Phase A retired the concept-and-reconstruct engine, and it
  // is off the hosted profile's funded list. The ENTRY stays because it is an audit record: a
  // real image generation was served under ZDR, and deleting the row would delete the evidence.
  assert.ok(concept, 'the audited image route must stay catalogued - the entry IS the audit');
  // TRUE, and specifically because a real image generation was made under ZDR on 2026-08-07 -
  // not because the route looks like it ought to qualify. This assertion is what keeps the flag
  // a record of a call somebody made: the note beside it has to name the audit, and the audit
  // has to exist.
  assert.equal(concept.zdrAvailable, true);
  assert.match(concept.notes, /ZDR verified/);
  assert.equal(concept.capabilities.structuredOutput, false);
});

// A structured result that arrived CORRECT but ENCODED (decodeStructuredOutput). Both shapes
// below were returned by claude-sonnet-5 through forced tool use and cost seven of eight
// briefs in a paid round: the design work was in the payload and the gateway called it a
// malformed model response. Every positive case has a mutation twin, because a decoder that
// starts accepting genuinely wrong shapes is worse than the rejection it replaced.
const CONCEPTS_SCHEMA = {
  type: 'object',
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const structuredRequest = (schema: unknown) => ({
  system: 's',
  messages: [],
  structuredOutput: { name: 'emit_concept_directions', description: 'd', schema },
}) as never;

test('a nested array handed back as a JSON string is decoded, not refused', () => {
  const decoded = decodeStructuredOutput(
    { concepts: '[{"name":"Ledger"}]' },
    structuredRequest(CONCEPTS_SCHEMA),
  );
  assert.deepEqual(decoded, { concepts: [{ name: 'Ledger' }] });
});

test('the tool envelope repeated inside its own property is unwrapped', () => {
  const decoded = decodeStructuredOutput(
    { concepts: '{"concepts":[{"name":"Ledger"},{"name":"Baseline"}]}' },
    structuredRequest(CONCEPTS_SCHEMA),
  );
  assert.deepEqual(decoded, { concepts: [{ name: 'Ledger' }, { name: 'Baseline' }] });
});

test('decoding recurses, so an encoded array INSIDE an encoded array still arrives', () => {
  const decoded = decodeStructuredOutput(
    { concepts: '[{"name":"Ledger","tags":"[\\"strap\\"]"}]' },
    structuredRequest(CONCEPTS_SCHEMA),
  );
  assert.deepEqual(decoded, { concepts: [{ name: 'Ledger', tags: ['strap'] }] });
});

test('a single-key object that is NOT the property name is left alone - only the envelope unwraps', () => {
  const decoded = decodeStructuredOutput(
    { concepts: '{"directions":[{"name":"Ledger"}]}' },
    structuredRequest(CONCEPTS_SCHEMA),
  );
  assert.deepEqual(decoded, { concepts: { directions: [{ name: 'Ledger' }] } });
});

test('a string that is not JSON at all survives untouched, so the refusal still happens', () => {
  const decoded = decodeStructuredOutput(
    { concepts: 'three directions, described in prose' },
    structuredRequest(CONCEPTS_SCHEMA),
  );
  assert.deepEqual(decoded, { concepts: 'three directions, described in prose' });
});

test('decoding widens what is UNDERSTOOD, never what is accepted', async () => {
  // The encoded payload is decoded and then still fails the schema on its own merits: the
  // concept object carries a property `additionalProperties: false` forbids.
  const body = validateGatewayBody({
    route: { provider: 'anthropic', model: 'claude-sonnet-5' },
    request: {
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
      structuredOutput: { name: 'emit_concept_directions', description: 'd', schema: CONCEPTS_SCHEMA },
    },
  });
  const fetchImpl = async () => new Response(JSON.stringify({
    content: [{
      type: 'tool_use',
      name: 'emit_concept_directions',
      input: { concepts: '[{"name":"Ledger","unexpected":1}]' },
    }],
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await assert.rejects(
    () => executeGatewayRequest(body, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      keyFor: async () => 'test-key',
    }),
    (error: unknown) => error instanceof GatewayError && /did not match the required structure/.test(error.message),
  );
});

test('a gateway answer cut off by the token limit says so instead of reading as a bad model', async () => {
  // The failure this exists for: reasoning tokens are output tokens and come first, so a budget
  // sized for the answer alone truncates mid-JSON. The Anthropic and OpenAI adapters have always
  // reported their own truncation signal; the MANAGED transport did not, and the same response
  // surfaced as "invalid structured result" with the body already discarded - an hour of
  // instrumented diagnosis and five paid concept images (benchmarks/pro/round-2026-08-08).
  const truncated: AiGatewayRequestBody = {
    route: { provider: 'vercel', model: 'vendor/model' },
    request: {
      system: 'Interpret this design.',
      messages: [{ role: 'user', content: 'brief' }],
      structuredOutput: { name: 'emit', description: 'emit', schema: { type: 'object' } },
    },
  };
  await assert.rejects(
    executeGatewayRequest(truncated, {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({
        // Valid JSON as far as it goes, and half an object - exactly what a cut-off answer
        // looks like. Without the finish_reason check this parses into a JSON error.
        choices: [{ finish_reason: 'length', message: { content: '{"version": 1, "regions": [{"kind": "pane' } }],
        usage: { prompt_tokens: 2651, completion_tokens: 3986, completion_tokens_details: { reasoning_tokens: 3841 } },
      })),
    }),
    (error: unknown) => error instanceof GatewayError
      && error.code === 'malformed_response'
      // NOT retryable: a second attempt on the same budget truncates in the same place.
      && error.retryable === false
      && /cut off by the output token limit/.test(error.message),
  );
});

test('a normal finish_reason still parses - the truncation guard is not swallowing good answers', async () => {
  const ok: AiGatewayRequestBody = {
    route: { provider: 'vercel', model: 'vendor/model' },
    request: {
      system: 'Interpret this design.',
      messages: [{ role: 'user', content: 'brief' }],
      structuredOutput: { name: 'emit', description: 'emit', schema: { type: 'object' } },
    },
  };
  const result = await executeGatewayRequest(ok, {
    keyFor,
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '{"version":1}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    })),
  });
  assert.deepEqual(result.output, { version: 1 });
});

// ---- The gateway's per-request fee (#2015) ----
//
// Vercel AI Gateway bills $0.075 per 1,000 Custom Reporting writes, one per unique tag on a
// request, on top of the tokens the reply reports. The eval ledgers measured exactly $0.000075
// per served request carrying one tag, on chat completions and on /v1/evaluate, and $0 on a
// request refused before inference.

const TAGGED: GatewayRoutingPolicy = { zeroDataRetention: true, disallowPromptTraining: true, tags: ['surface:lite'] };
const GATEWAY = { provider: 'vercel', model: 'vendor/model' } as const;

const servedChat = (cost?: number) => async () => new Response(JSON.stringify({
  choices: [{ message: { content: 'ok' } }],
  usage: { prompt_tokens: 1000, completion_tokens: 100, ...(cost === undefined ? {} : { cost }) },
}));

test('the fee is one tag write per unique tag, only on a gateway route that sends tags', () => {
  assert.equal(GATEWAY_TAG_WRITE_USD, 0.000075, 'the measured fee: $0.075 per 1,000 writes');
  assert.equal(gatewayRequestFeeUsd(GATEWAY, TAGGED), 0.000075);
  assert.equal(gatewayRequestFeeUsd(GATEWAY, { ...TAGGED, tags: ['surface:lite', 'surface:lite'] }), 0.000075, 'a repeated tag is one write');
  assert.equal(gatewayRequestFeeUsd(GATEWAY, { ...TAGGED, tags: ['a', 'b'] }), 0.00015);
  assert.equal(gatewayRequestFeeUsd(GATEWAY, { ...TAGGED, tags: [] }), 0, 'no tags, no writes');
  assert.equal(gatewayRequestFeeUsd(GATEWAY, undefined), 0, 'no routing policy sends no tags');
  assert.equal(gatewayRequestFeeUsd({ provider: 'anthropic', model: 'x' }, TAGGED), 0, 'a direct provider key never reaches the gateway');
});

test('the fee price is configurable, and an unreadable value keeps the measured one', () => {
  process.env.AI_GATEWAY_TAG_WRITE_USD = '0';
  assert.equal(gatewayRequestFeeUsd(GATEWAY, TAGGED), 0, 'set to 0 when the reported cost starts including it');
  process.env.AI_GATEWAY_TAG_WRITE_USD = '0.0001';
  assert.equal(gatewayRequestFeeUsd(GATEWAY, TAGGED), 0.0001);
  for (const bad of ['-1', 'abc', 'NaN']) {
    process.env.AI_GATEWAY_TAG_WRITE_USD = bad;
    assert.equal(gatewayRequestFeeUsd(GATEWAY, TAGGED), GATEWAY_TAG_WRITE_USD, bad);
  }
});

test('a served reply settles at its reported cost plus the fee', async () => {
  const result = await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: servedChat(0.0004) }, {
    maxAttempts: 1, retryLimit: 0, gateway: TAGGED,
  });
  assert.equal(result.usage.requestFeeUsd, 0.000075);
  assert.equal(result.usage.estimatedCost?.amount, 0.0004 + 0.000075);
  assert.equal(result.usage.estimatedCost?.source, 'provider');
  // The content-free ledger books the same figure.
  const entry = gatewayLedgerEntry({ userId: null, ipHash: 'h', body: body('vercel', 'vendor/model'), userKeys: {}, result });
  assert.equal(entry.providerCostUsd, 0.0004 + 0.000075);
});

test('a reply priced from its tokens gets the fee once, and re-pricing it never adds it again', async () => {
  process.env.AI_MODEL_PRICING_JSON = JSON.stringify({ 'vercel:vendor/model': { inputPerMillion: 1, outputPerMillion: 2 } });
  const result = await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: servedChat() }, {
    maxAttempts: 1, retryLimit: 0, gateway: TAGGED,
  });
  const tokens = (1000 * 1 + 100 * 2) / 1_000_000;
  assert.equal(result.usage.estimatedCost?.amount, tokens + 0.000075);
  // A caller that prices the reply again (Lite, the judge, import analysis) or applies the fee
  // again sees `requestFeeUsd` and leaves the amount alone: no double charge.
  const again = withTokenCost(withRequestFee(result.usage, 0.000075), GATEWAY, { inputPerMillion: 1, outputPerMillion: 2 });
  assert.equal(again.estimatedCost?.amount, tokens + 0.000075);
  assert.equal(usageCostUsd(again), tokens + 0.000075);
});

test('a reply the server cannot price still carries its fee, and the caller adds tokens to it once', async () => {
  const result = await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: servedChat() }, {
    maxAttempts: 1, retryLimit: 0, gateway: TAGGED,
  });
  assert.equal(result.usage.estimatedCost, undefined, 'no reported cost and no configured price');
  assert.equal(usageCostUsd(result.usage), 0.000075, 'the fee is still counted');
  const priced = withTokenCost(result.usage, GATEWAY, { inputPerMillion: 1, outputPerMillion: 2 });
  assert.equal(priced.estimatedCost?.amount, (1000 + 200) / 1_000_000 + 0.000075);
});

test('a request without tags, or on a user key, pays no fee', async () => {
  const untagged = await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: servedChat(0.0004) }, {
    maxAttempts: 1, retryLimit: 0, gateway: { ...TAGGED, tags: undefined },
  });
  assert.equal(untagged.usage.estimatedCost?.amount, 0.0004);
  assert.equal(untagged.usage.requestFeeUsd, undefined);
  const byo = await executeGatewayRequest(body('vercel', 'vendor/model'), { keyFor, fetchImpl: servedChat(0.0004) });
  assert.equal(byo.usage.estimatedCost?.amount, 0.0004, 'BYO traffic carries no routing policy and so no tags');
});

test('a request refused before inference is booked at nothing, fee included', async () => {
  const request = body('vercel', 'vendor/model');
  await assert.rejects(executeGatewayRequest(request, {
    keyFor,
    fetchImpl: async () => new Response('{"error":{"message":"bad request"}}', { status: 400 }),
  }, { maxAttempts: 1, retryLimit: 0, gateway: TAGGED }), GatewayError);
  const entry = gatewayLedgerEntry({ userId: null, ipHash: 'h', body: request, userKeys: {}, errorCode: 'invalid_request' });
  assert.equal(entry.providerCostUsd, 0);
});

test('the priced worst case of an attempt includes the fee', () => {
  const price = { inputPerMillion: 0.1, outputPerMillion: 0.4 };
  assert.equal(worstAttemptCostUsd(GATEWAY, 2000, 500, price, TAGGED), (2000 * 0.1 + 500 * 0.4) / 1_000_000 + 0.000075);
  assert.equal(worstAttemptCostUsd(GATEWAY, 2000, 500, price, undefined), (2000 * 0.1 + 500 * 0.4) / 1_000_000);
  assert.equal(worstAttemptCostUsd(GATEWAY, 2000, 500, undefined, TAGGED), null, 'an unpriced route stays unpriced');
});

// ---- Every served attempt is paid for (#2055) ----
//
// A reply that arrives (HTTP 200) is billed by the gateway, tokens plus the request fee, even
// when the executor then throws it away and retries. The result must carry every such bill so
// Lite settlement, the judge, import analysis, Pro settlement and the ledger all see it.

const structuredBody = (): AiGatewayRequestBody => {
  const request = body('vercel', 'vendor/model');
  request.request.structuredOutput = {
    name: 'result',
    description: 'A required title.',
    schema: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: { type: 'string' } } },
  };
  return request;
};

/** One served chat reply whose structured answer is `args` (a string, sent as given). */
const reply = (args: string, cost?: number, tokens: [number, number] = [1000, 100]) => new Response(JSON.stringify({
  choices: [{ message: { content: null, tool_calls: [{ type: 'function', function: { name: 'result', arguments: args } }] } }],
  usage: { prompt_tokens: tokens[0], completion_tokens: tokens[1], ...(cost === undefined ? {} : { cost }) },
}));

const sequence = (...responses: Array<() => Response>) => {
  let call = 0;
  return async () => responses[Math.min(call++, responses.length - 1)]();
};

const VALID = JSON.stringify({ title: 'Lower third' });
const near = (actual: number | undefined, expected: number, message?: string) =>
  assert.ok(Math.abs((actual ?? NaN) - expected) < 1e-12, `${message ?? ''} expected ${expected}, got ${actual}`);

test('an invalid served reply and then a valid one settle at both costs plus two fees', async () => {
  const result = await executeGatewayRequest(structuredBody(), {
    keyFor,
    sleep: async () => {},
    // The first answer parses but misses the schema (validation), the second is fine.
    fetchImpl: sequence(() => reply(JSON.stringify({ heading: 'wrong' }), 0.0003), () => reply(VALID, 0.0004)),
  }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
  assert.deepEqual(result.output, { title: 'Lower third' });
  near(result.usage.estimatedCost?.amount, 0.0003 + 0.0004 + 2 * 0.000075);
  near(result.usage.requestFeeUsd, 2 * 0.000075);
  assert.equal(result.usage.inputTokens, 2000);
  assert.equal(result.usage.outputTokens, 200);
  assert.equal(result.usage.estimatedCost?.source, 'provider');
});

test('an undecodable served reply and then a valid one settle at both costs plus two fees', async () => {
  const result = await executeGatewayRequest(structuredBody(), {
    keyFor,
    sleep: async () => {},
    // The first answer is not JSON at all: the adapter's parse fails, yet it was served.
    fetchImpl: sequence(() => reply('{"title": "cut', 0.0002), () => reply(VALID, 0.0004)),
  }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
  near(result.usage.estimatedCost?.amount, 0.0002 + 0.0004 + 2 * 0.000075);
  near(usageCostUsd(result.usage), 0.0002 + 0.0004 + 2 * 0.000075);
});

test('an image answer without an image is still paid for when the retry delivers', async () => {
  const imageBody: AiGatewayRequestBody = {
    route: { provider: 'vercel', model: 'vendor/image-model' },
    request: { system: 'Render.', messages: [{ role: 'user', content: 'brief' }], expect: 'image' },
  };
  const result = await executeGatewayRequest(imageBody, {
    keyFor,
    sleep: async () => {},
    fetchImpl: sequence(
      () => new Response(JSON.stringify({ choices: [{ message: { content: 'text only' } }], usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.01 } })),
      () => new Response(JSON.stringify({
        choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,AAAA' } }] } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.02 },
      })),
    ),
  }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
  near(result.usage.estimatedCost?.amount, 0.01 + 0.02 + 2 * 0.000075);
});

test('an unserved attempt before a success adds nothing: no reply, no usage, no fee', async () => {
  for (const unserved of [
    () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }),
    () => new Response('{"error":{"message":"rate limited"}}', { status: 429 }),
    () => { throw new TypeError('network down'); },
  ]) {
    const result = await executeGatewayRequest(structuredBody(), {
      keyFor,
      sleep: async () => {},
      fetchImpl: sequence(unserved, () => reply(VALID, 0.0004)),
    }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
    near(result.usage.estimatedCost?.amount, 0.0004 + 0.000075);
    near(result.usage.requestFeeUsd, 0.000075, 'one served attempt, one fee');
  }
});

test('the fee of each served attempt is counted once, and re-pricing the sum adds nothing', async () => {
  process.env.AI_MODEL_PRICING_JSON = JSON.stringify({ 'vercel:vendor/model': { inputPerMillion: 1, outputPerMillion: 2 } });
  const result = await executeGatewayRequest(structuredBody(), {
    keyFor,
    sleep: async () => {},
    // No reported cost: each attempt is priced from its tokens, with its own fee.
    fetchImpl: sequence(() => reply('not json'), () => reply(VALID)),
  }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
  const tokens = (1000 * 1 + 100 * 2) / 1_000_000;
  near(result.usage.estimatedCost?.amount, 2 * (tokens + 0.000075));
  const again = withTokenCost(withRequestFee(result.usage, 0.000075), GATEWAY, { inputPerMillion: 1, outputPerMillion: 2 });
  near(again.estimatedCost?.amount, 2 * (tokens + 0.000075), 'neither the fee nor the tokens are added twice');
});

test('with no reported cost and no server price, the caller prices every served attempt once', async () => {
  const result = await executeGatewayRequest(structuredBody(), {
    keyFor,
    sleep: async () => {},
    fetchImpl: sequence(() => reply('not json'), () => reply(VALID)),
  }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
  assert.equal(result.usage.estimatedCost, undefined);
  near(usageCostUsd(result.usage), 2 * 0.000075, 'both fees are known even unpriced');
  // Lite, the judge and import analysis price an unpriced reply with their own route price.
  const priced = withTokenCost(result.usage, GATEWAY, { inputPerMillion: 1, outputPerMillion: 2 });
  near(priced.estimatedCost?.amount, 2 * ((1000 + 200) / 1_000_000) + 2 * 0.000075);
});

test('Lite settlement, Pro settlement and the ledger all receive the summed amount', async () => {
  const request = structuredBody();
  const result = await executeGatewayRequest(request, {
    keyFor,
    sleep: async () => {},
    fetchImpl: sequence(() => reply(JSON.stringify({ heading: 'wrong' }), 0.0003), () => reply(VALID, 0.0004)),
  }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
  const expected = 0.0003 + 0.0004 + 2 * 0.000075;
  near(modelResultPatch(result).providerCostUsd, expected, 'Lite and import analysis settle through modelResultPatch');
  near(usageCostUsd(result.usage), expected, 'Lite\'s ceiling, the judge and Pro settlement read usageCostUsd');
  near(gatewayLedgerEntry({ userId: null, ipHash: 'h', body: request, userKeys: {}, result }).providerCostUsd, expected);
});

test('a mix of priced and unpriced served attempts: the caller prices only the unpriced tokens, once', async () => {
  const price = { inputPerMillion: 1, outputPerMillion: 2 };
  const tokens = (1000 * 1 + 100 * 2) / 1_000_000;
  for (const [first, second] of [[reply('not json', 0.0001), reply(VALID)], [reply('not json'), reply(VALID, 0.0001)]]) {
    const result = await executeGatewayRequest(structuredBody(), {
      keyFor,
      sleep: async () => {},
      fetchImpl: sequence(() => first, () => second),
    }, { maxAttempts: 2, retryLimit: 1, gateway: TAGGED });
    // Without a caller price, the known cost and both fees: never the fee alone.
    near(usageCostUsd(result.usage), 0.0001 + 2 * 0.000075);
    assert.deepEqual(result.usage.unpricedTokens, { input: 1000, output: 100 });
    // Lite, the judge and import analysis price the rest at their route price, once.
    const priced = withTokenCost(result.usage, GATEWAY, price);
    near(priced.estimatedCost?.amount, 0.0001 + tokens + 2 * 0.000075);
    assert.equal(priced.unpricedTokens, undefined);
    near(withTokenCost(priced, GATEWAY, price).estimatedCost?.amount, 0.0001 + tokens + 2 * 0.000075, 're-pricing adds nothing');
  }
});

// ---- A request that fails after served attempts still paid for them (#2092) ----
//
// The executor throws when no attempt was usable. The replies it was served were billed all the
// same, so the error carries their summed usage, each fee once, and the ledger books it.

const failing = async (fetchImpl: typeof fetch, policy: GatewayExecutionPolicy = {}) => {
  try {
    await executeGatewayRequest(structuredBody(), { keyFor, sleep: async () => {}, fetchImpl }, {
      maxAttempts: 2, retryLimit: 1, gateway: TAGGED, ...policy,
    });
  } catch (error) {
    assert.ok(error instanceof GatewayError, String(error));
    return error;
  }
  throw new assert.AssertionError({ message: 'the request should have failed' });
};

test('two served replies that both miss the schema: the error carries both costs plus two fees', async () => {
  const request = structuredBody();
  const error = await failing(sequence(
    () => reply(JSON.stringify({ heading: 'wrong' }), 0.0003),
    () => reply(JSON.stringify({ heading: 'still wrong' }), 0.0004),
  ));
  const expected = 0.0003 + 0.0004 + 2 * 0.000075;
  near(usageCostUsd(error.servedUsage), expected, 'Pro settlement reads usageCostUsd');
  near(error.servedUsage?.requestFeeUsd, 2 * 0.000075, 'one fee per served attempt');
  assert.equal(error.servedUsage?.inputTokens, 2000);
  const entry = gatewayLedgerEntry({
    userId: null, ipHash: 'h', body: request, userKeys: {}, errorCode: error.code, servedUsage: error.servedUsage,
  });
  near(entry.providerCostUsd, expected, 'the ledger books the served cost of a failed request');
  assert.equal(entry.outcome, error.code);
  assert.equal(entry.inputTokens, 2000);
  // A caller pricing it again adds neither the fee nor the tokens a second time.
  const again = withTokenCost(withRequestFee(error.servedUsage!, 0.000075), GATEWAY, { inputPerMillion: 1, outputPerMillion: 2 });
  near(usageCostUsd(again), expected, 'no double fee');
});

test('a failure that was never served carries nothing, and the ledger books $0', async () => {
  for (const unserved of [
    () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }),
    () => { throw new TypeError('network down'); },
  ]) {
    const error = await failing(sequence(unserved));
    assert.equal(error.servedUsage, undefined);
    assert.equal(gatewayLedgerEntry({
      userId: null, ipHash: 'h', body: structuredBody(), userKeys: {}, errorCode: error.code, servedUsage: error.servedUsage,
    }).providerCostUsd, 0);
  }
});

test('a served reply and then a server error: only the served one is booked, its fee once', async () => {
  // Pins the remaining limit of #2114: genuine HTTP 5xx remains unmeasured, distinct
  // from a client deadline (the decision adapter conservatively reserves its worst case).
  const error = await failing(sequence(
    () => reply('not json', 0.0003),
    () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }),
  ));
  near(usageCostUsd(error.servedUsage), 0.0003 + 0.000075);
  near(error.servedUsage?.requestFeeUsd, 0.000075);
});

test('a refusal on the fallback after served attempts on the primary still carries their cost', async () => {
  const request = structuredBody();
  request.fallbacks = [{ provider: 'anthropic', model: 'fallback' }];
  const refusal = new GatewayError('authentication_required', 'no', 403, false);
  await assert.rejects(executeGatewayRequest(request, {
    keyFor: async (provider) => { if (provider === 'anthropic') throw refusal; return 'key'; },
    sleep: async () => {},
    fetchImpl: sequence(() => reply('not json', 0.0003)),
  }, { maxAttempts: 3, retryLimit: 0, gateway: TAGGED }), (error) => error === refusal);
  near(usageCostUsd(refusal.servedUsage), 0.0003 + 0.000075);
});

test('a caller price prices each unpriced served attempt on its own route, success or failure', async () => {
  const prices: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
    'vercel:vendor/model': { inputPerMillion: 1, outputPerMillion: 2 },
    'vercel:vendor/fallback': { inputPerMillion: 10, outputPerMillion: 20 },
  };
  const priceFor = (route: { provider: string; model: string }) => prices[`${route.provider}:${route.model}`] ?? null;
  const cheap = (1000 * 1 + 100 * 2) / 1_000_000;
  const dear = (1000 * 10 + 100 * 20) / 1_000_000;

  const request = structuredBody();
  request.fallbacks = [{ provider: 'vercel', model: 'vendor/fallback' }];
  const result = await executeGatewayRequest(request, {
    keyFor, sleep: async () => {}, fetchImpl: sequence(() => reply('not json'), () => reply(VALID)),
  }, { maxAttempts: 2, retryLimit: 0, gateway: TAGGED, priceFor });
  near(usageCostUsd(result.usage), cheap + dear + 2 * 0.000075, 'the fallback attempt at the fallback price');
  assert.equal(result.usage.unpricedTokens, undefined, 'nothing is left for the caller to guess');

  const error = await failing(sequence(() => reply('not json'), () => reply('not json')), { priceFor });
  near(usageCostUsd(error.servedUsage), 2 * (cheap + 0.000075), 'never the fee alone');
});

test('a raw error after served attempts becomes a gateway error that keeps their cost', async () => {
  const request = structuredBody();
  request.fallbacks = [{ provider: 'anthropic', model: 'fallback' }];
  const rejected = executeGatewayRequest(request, {
    keyFor: async (provider) => { if (provider === 'anthropic') throw new TypeError('settings read failed'); return 'key'; },
    sleep: async () => {},
    fetchImpl: sequence(() => reply('not json', 0.0003)),
  }, { maxAttempts: 3, retryLimit: 0, gateway: TAGGED });
  await assert.rejects(rejected, (error) => error instanceof GatewayError
    && Math.abs(usageCostUsd(error.servedUsage) - (0.0003 + 0.000075)) < 1e-12);
  // With nothing served, the raw error passes through untouched, as before.
  const raw = new TypeError('settings read failed');
  await assert.rejects(executeGatewayRequest(body('vercel', 'vendor/model'), {
    keyFor: async () => { throw raw; },
  }), (error) => error === raw);
});

test('an error object a caller reuses never carries an earlier request\'s served cost', async () => {
  const refusal = new GatewayError('authentication_required', 'no', 403, false);
  const request = structuredBody();
  request.fallbacks = [{ provider: 'anthropic', model: 'fallback' }];
  await assert.rejects(executeGatewayRequest(request, {
    keyFor: async (provider) => { if (provider === 'anthropic') throw refusal; return 'key'; },
    sleep: async () => {},
    fetchImpl: sequence(() => reply('not json', 0.0003)),
  }, { maxAttempts: 3, retryLimit: 0, gateway: TAGGED }));
  assert.ok(refusal.servedUsage, 'the first request served a reply');
  await assert.rejects(executeGatewayRequest(body('anthropic', 'fallback'), { keyFor: async () => { throw refusal; } }));
  assert.equal(refusal.servedUsage, undefined, 'the second request served nothing');
});

const hangUntilDeadline: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
});

test('a client deadline carries the supplied attempt ceiling to settlement and ledger, fee once', async () => {
  const error = await failing(hangUntilDeadline, {
    timeoutMs: 5, maxAttempts: 1, timeoutCostFor: () => 0.001,
  });
  assert.equal(error.code, 'timeout');
  near(usageCostUsd(error.servedUsage), 0.001);
  near(error.servedUsage?.requestFeeUsd, GATEWAY_TAG_WRITE_USD);
  assert.equal(error.servedUsage?.estimatedCost?.source, 'configured');
  assert.equal(error.servedUsage?.totalTokens, 0, 'no token counts are invented');
  near(gatewayLedgerEntry({
    userId: null, ipHash: 'h', body: structuredBody(), userKeys: {}, errorCode: error.code, servedUsage: error.servedUsage,
  }).providerCostUsd, 0.001);
  near(usageCostUsd(withTokenCost(withRequestFee(error.servedUsage!, GATEWAY_TAG_WRITE_USD), GATEWAY,
    { inputPerMillion: 10, outputPerMillion: 20 })), 0.001, 'downstream pricing adds nothing');
});

test('deadline during a successful response body is a timeout and keeps earlier served cost', async () => {
  const blockedBody: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
    },
  }));
  let calls = 0;
  const error = await failing(async (url, init) => ++calls === 1 ? reply('not json', 0.0003) : blockedBody(url, init), {
    timeoutMs: 5, timeoutCostFor: () => 0.001,
  });
  assert.equal(calls, 2);
  assert.equal(error.code, 'timeout');
  near(usageCostUsd(error.servedUsage), 0.0003 + GATEWAY_TAG_WRITE_USD + 0.001);
  near(error.servedUsage?.requestFeeUsd, 2 * GATEWAY_TAG_WRITE_USD);
});

test('timeout then fallback success prices the deadline on its own route and stays within attempts', async () => {
  const request = structuredBody();
  request.fallbacks = [{ provider: 'vercel', model: 'vendor/fallback' }];
  const pricedRoutes: string[] = [];
  let calls = 0;
  const result = await executeGatewayRequest(request, {
    keyFor, sleep: async () => {},
    fetchImpl: async (url, init) => ++calls === 1 ? hangUntilDeadline(url, init) : reply(VALID, 0.0004),
  }, {
    timeoutMs: 5, maxAttempts: 2, retryLimit: 0, gateway: TAGGED,
    timeoutCostFor: (route) => { pricedRoutes.push(route.model); return route.model === GATEWAY.model ? 0.001 : 0.002; },
  });
  assert.equal(calls, 2);
  assert.deepEqual(pricedRoutes, [GATEWAY.model]);
  assert.equal(result.attempts.reduce((sum, attempt) => sum + attempt.attempts, 0), 2);
  near(usageCostUsd(result.usage), 0.001 + 0.0004 + GATEWAY_TAG_WRITE_USD);
  near(result.usage.requestFeeUsd, 2 * GATEWAY_TAG_WRITE_USD);
});

test('HTTP 408, 5xx and immediate network failure remain distinct from the measured client deadline', async () => {
  for (const fetchImpl of [
    async () => new Response('', { status: 408 }),
    async () => new Response('', { status: 503 }),
    async () => { throw new DOMException('External abort', 'AbortError'); },
  ]) {
    let priced = false;
    const error = await failing(fetchImpl, {
      maxAttempts: 1, timeoutCostFor: () => { priced = true; return 0.001; },
    });
    assert.equal(error.servedUsage, undefined);
    assert.equal(priced, false);
  }
});

test('an unbounded deadline or non-gateway deadline does not receive a guessed charge', async () => {
  for (const ceiling of [undefined, null, NaN, Infinity, -1, GATEWAY_TAG_WRITE_USD / 2]) {
    const error = await failing(hangUntilDeadline, {
      timeoutMs: 5, maxAttempts: 1, timeoutCostFor: () => ceiling as number | null,
    });
    assert.equal(error.servedUsage, undefined);
  }
  await assert.rejects(executeGatewayRequest(body(), { keyFor, fetchImpl: hangUntilDeadline }, {
    timeoutMs: 5, maxAttempts: 1, timeoutCostFor: () => 0.001,
  }), (error) => error instanceof GatewayError && error.code === 'timeout' && !error.servedUsage);
});
