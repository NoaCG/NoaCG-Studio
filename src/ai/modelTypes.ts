// Provider-neutral model-call contracts shared by the browser gateway client and the
// server adapters. Creative AI's higher-level AIProvider contract remains the product
// seam; these types only normalize the model transport beneath the existing harness.

// `vercel` is the NoaCG-funded TRANSPORT and nothing else: Vercel AI Gateway's
// OpenAI-compatible Chat Completions endpoint, authenticated by an AI Gateway key or the
// deployment's OIDC token (docs/AI_PROVIDER_GATEWAY.md). **It is never offered to a user as a
// choice** - how NoaCG reaches a model on its own money is an implementation detail, and a
// door that names it describes our plumbing instead of the product (owner, 2026-08-14). The
// user-facing list is `AI_PROVIDERS` in settings.ts, which is deliberately a SUBSET of this
// one: the four BRING-YOUR-OWN-KEY providers a user can pay for directly.
export const AI_PROVIDER_IDS = ['anthropic', 'openai', 'google', 'vercel', 'huggingface'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export interface ModelRoute {
  provider: AiProviderId;
  model: string;
}

export interface AiDiscoveredModel {
  provider: AiProviderId;
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  maxOutputTokens: number | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  inputModalities: string[];
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  supportsSeed: boolean;
  free: boolean;
  /** Promotion-time PREFERENCE metadata, never a gate. Vercel AI Gateway does not publish
   *  open-weight status, so a `vercel` row is always false - meaning "not stated", not
   *  "proprietary". The audited catalog's own `openWeights` flag stays the promotion signal
   *  (api/_lib/aiModelCatalog.ts). */
  openWeight: boolean;
  available: boolean;
  createdAt: string | null;
  revision: string | null;
  /** Price in USD for ONE generated image, where the provider publishes one. Additive and
   *  optional: only dedicated image routes carry it, and a missing value means "not
   *  published", never "free". Vercel publishes this per image (`pricing.image`); a
   *  multimodal language model that answers with an image bills through its ordinary output
   *  tokens instead and carries no value here. */
  imagePriceUsd?: number | null;
  /** Where the ROW came from. A direct provider lists its own model ids (the only ids its API
   *  actually accepts); the price beside them is looked up separately, because none of the
   *  three direct APIs publishes one. */
  source:
    | 'vercel-ai-gateway'
    | 'huggingface-router'
    | 'anthropic-api'
    | 'openai-api'
    | 'google-generative-ai';
  /** Which key pays for a call on this row - the honest half of a price. `user` = the key the
   *  visitor stored for this provider, `managed` = a NoaCG-funded server key. Absent where the
   *  listing was read without any key at all. */
  paidBy?: 'user' | 'managed';
}

export interface AiModelCatalogResponse {
  provider: AiProviderId;
  syncedAt: string;
  models: AiDiscoveredModel[];
  warning?: string;
}

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface StructuredOutput {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

/**
 * How much of an output budget a REASONING model can spend before it writes anything.
 *
 * Reasoning tokens are output tokens: they count against `maxTokens` and they come FIRST, so a
 * budget sized for the answer alone truncates mid-answer with `finish_reason: length`. That
 * reads as a bad model rather than a wrong number, which is what made it expensive to find -
 * measured 2026-08-08 at 2,400-3,900 tokens of thinking per call on `google/gemini-2.5-flash`,
 * where a 4,000 budget left about a hundred tokens for a 2,200-token document and destroyed
 * five already-paid concept images (benchmarks/pro/round-2026-08-08/ROUND.md §3).
 *
 * Set to roughly twice the measured worst case: the number is a per-route unknown, and this is
 * the wrong place to be precise.
 *
 * RAISED 8,000 -> 24,000 on 2026-08-17, measured again rather than guessed: `xai/grok-4.3`
 * blew through the whole 25,000 budget (17,000 expected + 8,000 headroom) on 4 of 12 free-form
 * coder briefs - its COMPLETED cells averaged 4,000 reasoning tokens, so the worst case is an
 * outlier several times the average, not a fatter average. The same rule as before: ~2x the
 * observed worst (>13,000 on the truncated cells), because a truncation destroys a paid call
 * while an unused ceiling costs nothing.
 */
export const REASONING_HEADROOM_TOKENS = 24000;

/**
 * The `maxTokens` for a call whose ANSWER is at most `expectedOutputTokens`.
 *
 * Call this rather than writing a literal. The budget is not a price control - only tokens
 * actually produced are billed - it is the ceiling a runaway answer hits, so the honest size is
 * "what the answer needs, plus room to think". Passing the answer size keeps the intent legible:
 * a reader can see what was expected, separately from the allowance no call site should have to
 * reason about.
 *
 * The gateway already defaults an unspecified budget to 16,000, so every value this produces is
 * inside territory the transport was handling anyway.
 */
export function outputBudget(expectedOutputTokens: number): number {
  return expectedOutputTokens + REASONING_HEADROOM_TOKENS;
}

export interface ModelRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: ModelContentBlock[] | string }[];
  /** The output ceiling. Build it with `outputBudget(expectedAnswerTokens)` - a literal here is
   *  how a call comes to have no room left to think in. */
  maxTokens?: number;
  /** Ask the route for a generated IMAGE instead of text. Only adapters whose provider
   *  actually offers image output accept it (the Vercel gateway today); everything else
   *  refuses with a normalized error rather than silently answering in the wrong modality.
   *  Mutually exclusive with structuredOutput. */
  expect?: 'image';
  /** Force a schema-validated object result. */
  structuredOutput?: StructuredOutput;
  /** Override the selected route's model for this call. */
  model?: string;
  /** Select the configured low-cost model for classification/planning stages. */
  modelRole?: 'default' | 'fast';
  /** Anthropic can cache a repeated system prompt; other adapters safely ignore this hint. */
  cacheSystem?: boolean;
  /** Reproducible benchmark settings. Adapters ignore unsupported values. */
  temperature?: number;
  seed?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Input tokens served from a provider cache, when reported. Included in inputTokens. */
  cachedInputTokens?: number;
  /** Reasoning tokens, when separately reported. Included in outputTokens. */
  reasoningTokens?: number;
  /** The gateway's per-request fee for this reply (api/_lib/aiGateway.ts, `gatewayRequestFeeUsd`).
   *  Its presence also says the fee has been applied: whenever `estimatedCost` is set it already
   *  includes this amount, so the fee is never added twice. */
  requestFeeUsd?: number;
  /** An estimate only, derived from explicit operator pricing or provider-reported cost, plus
   *  `requestFeeUsd` when that is set. */
  estimatedCost?: {
    amount: number;
    currency: 'USD';
    source: 'configured' | 'provider';
  };
}

export interface ModelAttempt {
  route: ModelRoute;
  attempts: number;
}

/** One generated image, normalized out of whatever shape the provider returned it in. */
export interface ModelImage {
  base64: string;
  mediaType: string;
}

export interface ModelResult {
  output: unknown;
  usage: ModelUsage;
  provider: AiProviderId;
  model: string;
  attempts: ModelAttempt[];
  /** Present only for `expect: 'image'` requests. */
  images?: ModelImage[];
}

export type AiGatewayErrorCode =
  | 'invalid_request'
  | 'missing_key'
  | 'authentication_required'
  | 'provider_rejected'
  | 'rate_limited'
  | 'timeout'
  | 'malformed_response'
  /** The route asked for zero-data-retention routing and the gateway plan does not offer it
   *  (Vercel AI Gateway makes ZDR a Pro/Enterprise feature). Distinct from
   *  `provider_rejected` because the fix is a plan or an audited policy decision, not a key. */
  | 'zdr_unavailable'
  /** The route asked for a data-retention policy (no-training, or zero retention) that no
   *  provider of this model offers, so the gateway refused rather than serving from a
   *  non-compliant one. Distinct from `zdr_unavailable`: a better plan will not fix it,
   *  a different model might. */
  | 'retention_unsatisfiable'
  /** The server's provider allowlist (`AI_LITE_GATEWAY_PROVIDERS` and friends) names no
   *  provider that serves the requested model, so the gateway refused before calling one.
   *  A configuration fault - the route is fine, the allowlist is wrong. */
  | 'route_not_permitted'
  | 'unavailable';

export interface AiGatewayErrorBody {
  error: {
    code: AiGatewayErrorCode;
    message: string;
    retryable: boolean;
  };
}

/**
 * The gateway refusal as the BROWSER sees it, with nothing dropped. The client used to throw a
 * bare `Error(message)` here, which discarded `code` and `retryable` - so no caller could tell
 * "the provider blipped, ask again" from "the quota is gone, stop", and the one place that
 * wanted to retry had only prose to branch on.
 */
export class ModelGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly retryable: boolean;
  readonly status: number;

  constructor(code: AiGatewayErrorCode, message: string, retryable: boolean, status: number) {
    super(message);
    this.name = 'ModelGatewayError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

/**
 * May this failed model call be retried IN-SESSION, once?
 *
 * Deliberately narrow: only a provider-side outage (`unavailable`, and the server said
 * retryable) qualifies - the one failure class where asking again is the fix. Everything else
 * is a durable answer (quota, auth, a bad request), and re-asking spends the room's request
 * budget re-hearing it. The retry is safe because it stays INSIDE the reservation: an
 * unsettled call consumed no call budget, no start and no money
 * (api/_lib/pro/reservationAccounting.test.ts pins all three), and `attempt` bounds it to one.
 */
export function shouldRetryModelCall(error: unknown, attempt: number): boolean {
  return attempt === 0
    && error instanceof ModelGatewayError
    && error.retryable
    && error.code === 'unavailable';
}

/** How long to wait before the one in-session retry. Sits above the server's own internal
 *  250-500 ms backoff (aiGateway.ts) so the pair does not land inside the same provider blip. */
export const MODEL_CALL_RETRY_DELAY_MS = 1500;

/** Which PRODUCT SURFACE issued a gateway call, when the answer changes what the server is
 *  allowed to do. The gateway is otherwise surface-agnostic on purpose - the SPX harness, the
 *  brainstorm call and a bare prompt all look alike to it - so this stays a small, closed set
 *  that only grows when a surface has its own entitlement.
 *
 *  Today that is video (`ai.video`) and NoaCG Pro (`ai.pro`): each is a feature a plan, a
 *  grant or an instance-wide kill switch can withdraw, and without a discriminator those
 *  harnesses are indistinguishable from every other call on the same endpoint
 *  (docs/ADMIN.md, the enforcement table). */
export type AiGatewaySurface = 'video' | 'pro' | 'spike';

export interface AiGatewayRequestBody {
  request: ModelRequest;
  route: ModelRoute;
  /** Fallback is opt-in and ordered. An empty list means never change provider/model. */
  fallbacks?: ModelRoute[];
  /** Absent means the general harness, which no feature key gates. */
  surface?: AiGatewaySurface;
  /**
   * The hosted NoaCG Pro reservation this call is paid for by (`POST /api/ai/pro-generations`).
   *
   * REQUIRED for `surface: 'pro'` on NoaCG's own key, and meaningless otherwise. It is what
   * makes hosted Pro an allowance rather than a label: without it the surface tag is
   * client-supplied and gates nothing but an entitlement, so a caller could spend the managed
   * key without ever passing a quota. A bring-your-own-key caller needs none - they are
   * spending their own money on their own chosen model.
   */
  proGenerationId?: string;
}

export type AiGatewayResponseBody = ModelResult;
