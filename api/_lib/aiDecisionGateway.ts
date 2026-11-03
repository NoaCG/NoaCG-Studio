// The narrow DECISION adapter (docs/work-specs/jev-svg-import/spec.md, "AI route and data policy",
// row 31, AC-6). A decision model answers typed questions about a piece of state with
// probabilities; Vercel AI Gateway serves it from `POST /v1/evaluate` and NOT from Chat
// Completions, so it gets this adapter rather than a model name swapped into the chat one.
//
// Two layers:
//
//   - `executeDecisionRequest`: one logical request to `/v1/evaluate`. At most `maxAttempts`
//     provider attempts (two for the SVG task), a timeout per attempt, cancellation by the
//     caller's signal, retry only on a transient failure, and a STRICT check of the answers
//     against the questions asked. It never throws for a provider outcome: it reports what was
//     spent, including a conservative charge for an attempt whose bill is unknown.
//   - `runSvgInterpretation`: the SVG task's ladder before and after that call, the server half
//     of /api/ai/tasks/import-analysis's ladder - flag, registry gate, durable ledger, kill switch,
//     entitlement, consent, evidence policy, size and priced worst case, then the existing ledger
//     reservation, the call, and settlement. The HTTP half (sign-in, per-IP burst limit, body
//     shape) belongs to the route that will call this, row 35. Every refusal and failure, an
//     unexpected error included, answers `fallback: 'deterministic'`: the caller keeps the
//     deterministic import's proposal, which is the useful result without a model.
//
// The credential is a server-side managed key passed to the fetch and nowhere else: no outcome,
// ledger patch or error carries it, and no provider body is ever copied into one.

import {
  AI_GATEWAY_BASE_URL,
  providerFailure,
  type GatewayError,
  type GatewayRoutingPolicy,
  type ModelPrice,
} from './aiGateway.js';
import { managedAiKey } from './aiCredentials.js';
import { decisionModelEntry, modelRouteKey } from './aiModelCatalog.js';
import { routeDisabled, systemSettings, type SystemSettings } from './systemSettings.js';
import {
  getLiteGenerationStore,
  liteLedgerConfigured,
  type LiteGenerationRecord,
  type LiteGenerationStore,
} from './aiLiteStore.js';
import { hasCurrentAiConsent } from './aiConsentStore.js';
import { resolveUserEntitlement } from './entitlements.js';
import { allows } from '../../src/entitlements/contract.js';
import { svgInterpretationTaskProfile, taskConfigured } from './aiTaskRegistry.js';
import {
  SVG_DECISION_LIMITS,
  isRecord,
  plain,
  svgEvidenceRefusal,
  svgInterpretationPolicy,
  svgInterpretationProfile,
  type SvgDecisionEvidence,
  type SvgEvidenceConsent,
  type SvgInterpretationProfile,
} from './aiSvgInterpretationProfile.js';
import { AI_NOTICE_VERSION } from '../../src/ai/consentNotice.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

type Fetch = typeof fetch;

export const DECISION_ENDPOINT = `${AI_GATEWAY_BASE_URL}/evaluate`;

// ---- Questions and answers ----

export type DecisionQuestion =
  | { type: 'boolean'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type DecisionAnswer =
  | { type: 'boolean'; probability: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number> }
  | { type: 'score'; score: number; probabilities: Record<string, number> };

export type DecisionQuestions = Record<string, DecisionQuestion>;
export type DecisionAnswers = Record<string, DecisionAnswer>;

const QUESTION_KEY = new RegExp(`^[a-z][A-Za-z0-9_-]{0,${SVG_DECISION_LIMITS.questionKeyChars - 1}}$`);
const OPTION_KEY = new RegExp(`^[a-z0-9][A-Za-z0-9_-]{0,${SVG_DECISION_LIMITS.optionKeyChars - 1}}$`);
const probability = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key));

/** Are these questions within the adapter's bounds? Names only the rule broken. The questions
 *  are the server's own words; the bound is what keeps a later caller honest about it. */
export function decisionQuestionsRefusal(questions: unknown): string | null {
  if (!isRecord(questions)) return 'questions-shape';
  const keys = Object.keys(questions);
  if (keys.length === 0 || keys.length > SVG_DECISION_LIMITS.questions) return 'questions-count';
  for (const key of keys) {
    const q = questions[key];
    if (!QUESTION_KEY.test(key) || !isRecord(q)) return 'question-key';
    if (!plain(q.instructions, SVG_DECISION_LIMITS.instructionChars)) return 'question-instructions';
    const criterion = (v: unknown) => plain(v, SVG_DECISION_LIMITS.criterionChars);
    if (q.type === 'boolean') {
      if (Object.keys(q).some((k) => !['type', 'instructions', 'criteria'].includes(k))) return 'question-key';
      if (q.criteria !== undefined && !(isRecord(q.criteria) && sameKeys(Object.keys(q.criteria), ['true', 'false'])
        && criterion(q.criteria.true) && criterion(q.criteria.false))) return 'question-criteria';
    } else if (q.type === 'choice' || q.type === 'score') {
      if (Object.keys(q).some((k) => !['type', 'instructions', 'criteria'].includes(k))) return 'question-key';
      const options = q.type === 'choice'
        ? (isRecord(q.criteria) ? Object.entries(q.criteria) : null)
        : (Array.isArray(q.criteria) ? q.criteria.map((v, i) => [String(i), v] as const) : null);
      if (!options || options.length < 2 || options.length > SVG_DECISION_LIMITS.options) return 'question-criteria';
      if (!options.every(([k, v]) => OPTION_KEY.test(k) && criterion(v))) return 'question-criteria';
    } else {
      return 'question-type';
    }
  }
  return null;
}

/**
 * The decision payload, held to the questions that were asked: every question answered exactly
 * once, with its own type, a listed choice, a score on the scale, probabilities in [0, 1] keyed
 * by exactly the question's options, and nothing else. Returns the answers rebuilt from the
 * checked fields only, or null when anything is off, so nothing unexpected travels further.
 */
export function checkDecisionAnswers(questions: DecisionQuestions, answers: unknown): DecisionAnswers | null {
  if (!isRecord(answers) || !sameKeys(Object.keys(answers), Object.keys(questions))) return null;
  const out: DecisionAnswers = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = answers[key];
    if (!isRecord(a) || a.type !== q.type) return null;
    // A confidence value is admitted and dropped: it is not comparable across models (spec).
    const allowed = q.type === 'boolean' ? ['type', 'probability', 'confidence'] : ['type', q.type, 'probabilities', 'confidence'];
    if (Object.keys(a).some((k) => !allowed.includes(k))) return null;
    if (a.confidence !== undefined && !probability(a.confidence)) return null;
    if (q.type === 'boolean') {
      if (!probability(a.probability)) return null;
      out[key] = { type: 'boolean', probability: a.probability };
      continue;
    }
    const options = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    const probs = a.probabilities;
    if (!isRecord(probs) || !sameKeys(Object.keys(probs), options) || !Object.values(probs).every(probability)) return null;
    const probabilities = Object.fromEntries(options.map((o) => [o, probs[o] as number]));
    if (q.type === 'choice') {
      if (typeof a.choice !== 'string' || !options.includes(a.choice)) return null;
      out[key] = { type: 'choice', choice: a.choice, probabilities };
    } else {
      const top = options.length - 1;
      if (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > top) return null;
      out[key] = { type: 'score', score: a.score, probabilities };
    }
  }
  return out;
}

// ---- One logical request ----

export interface DecisionRequest {
  route: ModelRoute;
  state: unknown;
  questions: DecisionQuestions;
}

export interface DecisionPolicy {
  price: ModelPrice;
  /** Total provider attempts for this logical request, retries included. */
  maxAttempts: number;
  timeoutMs: number;
  gateway: GatewayRoutingPolicy;
}

export interface DecisionDependencies {
  /** The server-side managed key. Never logged, returned or stored. */
  key: string;
  fetchImpl?: Fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

export type DecisionFailure =
  | GatewayError['code']
  | 'cancelled'
  | 'answers_invalid'
  | 'route_changed';

export type DecisionOutcome =
  | {
      ok: true;
      answers: DecisionAnswers;
      model: string;
      inputTokens: number;
      outputTokens: number;
      /** What this logical request cost, every attempt included. */
      costUsd: number;
      attempts: number;
    }
  | { ok: false; reason: DecisionFailure; costUsd: number; attempts: number };

/** The request body exactly as sent. `providerOptions.gateway` carries the privacy and routing
 *  directives and never a `models` list: a decision fallback would rerun the request on another
 *  model, an automatic cascade the spec forbids. */
export function decisionBody(request: DecisionRequest, gateway: GatewayRoutingPolicy): string {
  return JSON.stringify({
    model: request.route.model,
    state: request.state,
    questions: request.questions,
    providerOptions: {
      gateway: {
        zeroDataRetention: gateway.zeroDataRetention,
        disallowPromptTraining: gateway.disallowPromptTraining,
        ...(gateway.only?.length ? { only: gateway.only } : {}),
        ...(gateway.tags?.length ? { tags: gateway.tags } : {}),
      },
    },
  });
}

/** The most one attempt can cost. Input tokens are bounded by the body's UTF-8 bytes (a token is
 *  at least one byte) plus the model's own framing; output is a few tokens per question. */
const FRAMING_TOKENS = 512;
const OUTPUT_TOKENS_PER_QUESTION = 32;
export function decisionAttemptCeilingUsd(bodyBytes: number, questionCount: number, price: ModelPrice): number {
  return ((bodyBytes + FRAMING_TOKENS) * price.inputPerMillion
    + questionCount * OUTPUT_TOKENS_PER_QUESTION * price.outputPerMillion) / 1_000_000;
}

/** The largest request a route takes: the task's bound, or less when the model's context is
 *  smaller (a token is at least one byte, after the framing). */
export function decisionRequestBytes(contextWindow: number): number {
  return Math.min(SVG_DECISION_LIMITS.requestBytes, contextWindow - FRAMING_TOKENS);
}

const sleepFor = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (signal?.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() {
    clearTimeout(timer);
    signal?.removeEventListener('abort', done);
    resolve();
  }
  signal?.addEventListener('abort', done, { once: true });
});

const usd = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const tokens = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

export async function executeDecisionRequest(
  request: DecisionRequest,
  policy: DecisionPolicy,
  deps: DecisionDependencies,
): Promise<DecisionOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? sleepFor;
  const body = decisionBody(request, policy.gateway);
  const worstAttempt = decisionAttemptCeilingUsd(Buffer.byteLength(body, 'utf8'), Object.keys(request.questions).length, policy.price);
  let costUsd = 0;
  let attempts = 0;
  let reason: DecisionFailure = 'unavailable';

  while (attempts < policy.maxAttempts) {
    if (deps.signal?.aborted) return { ok: false, reason: 'cancelled', costUsd, attempts };
    attempts += 1;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    deps.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, policy.timeoutMs);
    let retryable: boolean;
    try {
      const response = await fetchImpl(DECISION_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.key}` },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        // Read to classify, never copied: the outcome carries a code, not the provider's words.
        const detail = await response.text().then((t) => t.slice(0, 2000)).catch(() => '');
        const error = providerFailure(response.status, detail);
        // A refusal before inference (4xx) is not billed; a server failure or a timeout may
        // have been, so it is charged at its worst case.
        if (response.status >= 500 || response.status === 408) costUsd += worstAttempt;
        reason = error.code;
        retryable = error.retryable;
      } else {
        // A body that cannot be read (cut off, or the timer fired mid-read) throws to the catch
        // below: billed but unknown, and transient.
        const data: unknown = await response.json();
        if (!isRecord(data)) {
          costUsd += worstAttempt;
          return { ok: false, reason: 'malformed_response', costUsd, attempts };
        }
        const gateway = isRecord(data.providerMetadata) && isRecord(data.providerMetadata.gateway)
          ? data.providerMetadata.gateway
          : {};
        const usage = isRecord(data.usage) ? data.usage : {};
        const input = tokens(usage.inputTokens);
        const output = tokens(usage.outputTokens);
        // The bill: the gateway's own cost when it reports one, else the usage at the audited
        // price, else the attempt's worst case. Never zero for want of a number.
        const billed = usd(gateway.cost)
          ?? (input !== null && output !== null
            ? (input * policy.price.inputPerMillion + output * policy.price.outputPerMillion) / 1_000_000
            : worstAttempt);
        costUsd += billed;
        const routing = isRecord(gateway.routing) ? gateway.routing : {};
        const finalProvider = typeof routing.finalProvider === 'string' ? routing.finalProvider : null;
        if (data.model !== request.route.model
          || (finalProvider !== null && policy.gateway.only?.length && !policy.gateway.only.includes(finalProvider))) {
          // Served by something other than what was asked: refused, and not retried.
          return { ok: false, reason: 'route_changed', costUsd, attempts };
        }
        const answers = checkDecisionAnswers(request.questions, data.answers);
        if (!answers) return { ok: false, reason: 'answers_invalid', costUsd, attempts };
        return { ok: true, answers, model: request.route.model, inputTokens: input ?? 0, outputTokens: output ?? 0, costUsd, attempts };
      }
    } catch {
      // Sent and unanswered, or answered unreadably: the bill is unknown, so it is charged at its
      // worst case.
      costUsd += worstAttempt;
      reason = controller.signal.aborted ? 'timeout' : 'unavailable';
      retryable = true;
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', cancel);
    }
    if (!retryable || attempts >= policy.maxAttempts) break;
    await sleep(250, deps.signal);
  }
  if (deps.signal?.aborted) return { ok: false, reason: 'cancelled', costUsd, attempts };
  return { ok: false, reason, costUsd, attempts };
}

// ---- The SVG interpretation task ----

const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;

export interface SvgInterpretationInput {
  userId: string;
  ipHash: string;
  idempotencyKey: string;
  evidence: SvgDecisionEvidence;
  questions: DecisionQuestions;
  consent: SvgEvidenceConsent;
  signal?: AbortSignal;
}

export interface SvgInterpretationDependencies {
  profile?: SvgInterpretationProfile;
  settings?: () => Promise<SystemSettings>;
  hasConsent?: (userId: string) => Promise<boolean>;
  entitled?: (userId: string) => Promise<boolean>;
  store?: () => Promise<LiteGenerationStore>;
  key?: () => string;
  fetchImpl?: Fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export type SvgInterpretationRefusal =
  | 'disabled'
  | 'not_configured'
  | 'route_disabled'
  | 'not_entitled'
  | 'consent_required'
  | 'evidence_refused'
  | 'questions_refused'
  | 'too_large'
  | 'cost_ceiling'
  | 'invalid_request'
  | 'allowance';

export type SvgInterpretationOutcome =
  | { ok: true; answers: DecisionAnswers; generationId: string; costUsd: number; attempts: number }
  | {
      ok: false;
      /** The caller keeps the deterministic import's proposal. Always present on a refusal. */
      fallback: 'deterministic';
      reason: SvgInterpretationRefusal | DecisionFailure;
      /** The rule an input broke, or the reservation's status. Codes only. */
      detail?: string;
      generationId?: string;
    };

const refuse = (reason: SvgInterpretationRefusal | DecisionFailure, detail?: string): SvgInterpretationOutcome =>
  ({ ok: false, fallback: 'deterministic', reason, ...(detail ? { detail } : {}) });

/** Settle a reservation that hit an unexpected error after it was booked. Best effort: the cost
 *  stays at the booked ceiling, the conservative answer when nobody knows what was spent, and
 *  the row leaves the active statuses so the slot is released. */
async function abandon(store: LiteGenerationStore, id: string): Promise<void> {
  await store.update(id, { status: 'failed', rejectionReason: 'internal' }).catch(() => null);
}

export async function runSvgInterpretation(
  input: SvgInterpretationInput,
  deps: SvgInterpretationDependencies = {},
): Promise<SvgInterpretationOutcome> {
  try {
    return await interpret(input, deps);
  } catch {
    // A settings, consent, entitlement or ledger lookup that throws is a refusal, never a call.
    return refuse('unavailable');
  }
}

async function interpret(input: SvgInterpretationInput, deps: SvgInterpretationDependencies): Promise<SvgInterpretationOutcome> {
  const profile = deps.profile ?? svgInterpretationProfile();
  // The flag first: an off task builds nothing, reads nothing and books nothing.
  if (!profile.enabled) return refuse('disabled');
  const gateway = svgInterpretationPolicy(profile);
  const entry = decisionModelEntry(profile.route);
  const price = profile.prices[modelRouteKey(profile.route)];
  if (!taskConfigured(svgInterpretationTaskProfile(profile)) || !gateway || !entry || !price) return refuse('not_configured');
  // Quotas need the durable ledger; an ephemeral per-instance store would not hold them.
  if (!deps.store && !liteLedgerConfigured()) return refuse('not_configured');
  // The admin kill switch on the route (system_settings.disabled_routes).
  if (routeDisabled(await (deps.settings ?? systemSettings)(), profile.route)) return refuse('route_disabled');
  // The account's entitlement to graphic analysis, the feature this task is part of.
  const entitled = deps.entitled
    ?? (async (userId: string) => allows(await resolveUserEntitlement(userId), 'ai.import-analysis'));
  if (!(await entitled(input.userId))) return refuse('not_entitled');
  // Consent before anything about the content is looked at.
  const consented = await (deps.hasConsent ?? ((userId) => hasCurrentAiConsent(userId, AI_NOTICE_VERSION)))(input.userId);
  if (!consented) return refuse('consent_required');
  if (!IDEMPOTENCY.test(input.idempotencyKey)) return refuse('invalid_request', 'idempotency');
  const evidence = svgEvidenceRefusal(input.evidence, input.consent);
  if (evidence) return refuse('evidence_refused', evidence);
  const questions = decisionQuestionsRefusal(input.questions);
  if (questions) return refuse('questions_refused', questions);

  const request: DecisionRequest = { route: profile.route, state: input.evidence, questions: input.questions };
  const bytes = Buffer.byteLength(decisionBody(request, gateway), 'utf8');
  if (bytes > decisionRequestBytes(entry.contextWindow)) return refuse('too_large');
  const worstCase = profile.maxAttempts * decisionAttemptCeilingUsd(bytes, Object.keys(input.questions).length, price);
  if (worstCase > profile.maxProviderCostUsd) return refuse('cost_ceiling');
  const key = (deps.key ?? (() => managedAiKey(profile.route.provider)))();
  if (!key) return refuse('not_configured');
  if (input.signal?.aborted) return refuse('cancelled');

  // The existing ledger reservation: per-user and fleet concurrency, the shared allowance and
  // the fleet's daily spend, with this task's ceiling booked before the call.
  const store = await (deps.store ?? getLiteGenerationStore)();
  const reservation = await store.reserve({
    userId: input.userId,
    ipHash: input.ipHash,
    idempotencyKey: input.idempotencyKey,
    requestedCategory: null,
    now: (deps.now ?? Date.now)(),
    profile,
  });
  if (reservation.status !== 'created') return refuse('allowance', reservation.status);
  const id = reservation.record.id;
  try {
    await store.update(id, { status: 'model_running' });
    const outcome = await executeDecisionRequest(
      request,
      { price, maxAttempts: profile.maxAttempts, timeoutMs: profile.timeoutMs, gateway },
      { key, fetchImpl: deps.fetchImpl, sleep: deps.sleep, signal: input.signal },
    );
    // Settle the booking to what was spent, in every case: a failed or cancelled call that may
    // have been billed still counts (spec, "Ceiling"). Leaving the active statuses releases the slot.
    const settled: Partial<LiteGenerationRecord> = {
      provider: profile.route.provider,
      model: profile.route.model,
      attemptCount: outcome.attempts,
      providerCostUsd: outcome.costUsd,
    };
    if (!outcome.ok) {
      await store.update(id, { ...settled, status: 'failed', rejectionReason: outcome.reason });
      return { ok: false, fallback: 'deterministic', reason: outcome.reason, generationId: id };
    }
    settled.inputTokens = outcome.inputTokens;
    settled.outputTokens = outcome.outputTokens;
    if (outcome.costUsd > profile.maxProviderCostUsd) {
      await store.update(id, { ...settled, status: 'failed', rejectionReason: 'cost_ceiling' });
      return { ok: false, fallback: 'deterministic', reason: 'cost_ceiling', generationId: id };
    }
    await store.update(id, { ...settled, status: 'usable' });
    return { ok: true, answers: outcome.answers, generationId: id, costUsd: outcome.costUsd, attempts: outcome.attempts };
  } catch {
    await abandon(store, id);
    return { ok: false, fallback: 'deterministic', reason: 'unavailable', generationId: id };
  }
}
