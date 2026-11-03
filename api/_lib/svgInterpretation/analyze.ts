// POST /api/ai/tasks/svg-interpretation - the HTTP half of the SVG interpretation task
// (docs/work-specs/jev-svg-import/spec.md, row 35, AC-5 and AC-6). The server half, from the flag
// to settlement, is `runSvgInterpretation` in api/_lib/aiDecisionGateway.ts (row 31).
//
// NOT QUALIFIED, SO OFF. Row 34's holdout gave NO GO (PR #2029, run 41643649692): the primary
// candidate's consequential errors rose in quiz and credits. `MODEL_ROUTE_QUALIFIED` is therefore
// false and `ADMITTED_FAMILIES` empty, and this route answers `profile_disabled` before it reads
// anything, whatever AI_TASK_SVG_INTERPRETATION_ENABLED says. Turning it on is a code change made
// only after a new independent holdout qualifies it (spec, "Corpus and evaluation gate"); the
// phase-35 notes list what else that change owes. The env flag and the route kill switch stay as
// the second and third stops.
//
// What the browser sends: an idempotency key, the bounded evidence (aiSvgInterpretationProfile.ts
// says what it may hold) and the explicit include-text choice. Never a question, a model, a route
// or a prompt: the QUESTIONS ARE BUILT HERE, from the frozen evaluation templates and reader-made
// layer ids only (phase-31 rule 9), so nothing the artwork says reaches an instruction.
//
// What it answers: the source revision it read, and per asked text layer whether it is an
// operator field. That is a reading, not a proposal: the browser maps it onto the draft's own
// proposal and applies it through the draft's validating door, which refuses a stale revision
// and never overrides a correction. Behaviour families are answered only when admitted, and none
// is. Every refusal says `fallback: 'deterministic'`: the import keeps the deterministic result.
//
// This file must not import src/ai/svgInterpretation/*: the api build refuses their `.ts` import
// extension (TS5097) and the DOM types they reach (phase-31 traps). The template text and the
// question builder are restated here, and e2e/jev-svg-preparation.spec.ts holds them equal to
// prompts.json and to questions.ts, so they cannot drift.

import { bearerToken, ipHash, json, methodGuard, readJson } from '../http.js';
import { verifyUser, type AuthedUser } from '../auth.js';
import { admitTaskIp } from '../aiLiteRateLimit.js';
import { SVG_INTERPRETATION_TASK_ID } from '../aiTaskRegistry.js';
import {
  decisionRequestBytes,
  prepareDecision,
  runSvgInterpretation,
  type DecisionQuestion,
  type DecisionQuestions,
  type SvgInterpretationDependencies,
  type SvgInterpretationOutcome,
} from '../aiDecisionGateway.js';
import { decisionModelEntry, modelRouteKey } from '../aiModelCatalog.js';
import {
  isRecord,
  SVG_DECISION_LIMITS,
  svgInterpretationPolicy,
  svgInterpretationProfile,
  type SvgDecisionEvidence,
  type SvgInterpretationProfile,
} from '../aiSvgInterpretationProfile.js';

/** Row 34's verdict was no go: no family, no route. */
export const MODEL_ROUTE_QUALIFIED = false;

export const SVG_BEHAVIOUR_FAMILIES = ['scoreboard', 'clock', 'quiz', 'credits'] as const;
export type SvgBehaviourFamily = (typeof SVG_BEHAVIOUR_FAMILIES)[number];

/** The families a limited go would name. No go names none. */
export const ADMITTED_FAMILIES: readonly SvgBehaviourFamily[] = [];

/** The frozen evaluation configuration's questions and threshold
 *  (docs/work-specs/jev-svg-import/evaluation/prompts.json, frozen at row 33). */
export const SVG_QUESTION_TEMPLATES = {
  behaviour: {
    scoreboard: 'Does the artwork described in state draw a scoreboard: two or more competitors, each a name layer paired with its own short score layer of one to three characters, that an operator changes during a match? One person\'s name and title, even beside a layer called score, is a lower third, not a scoreboard.',
    clock: 'Does the artwork described in state draw a clock or timer readout: a short text layer of about four to eight characters holding minutes and seconds, which an operator starts, stops or counts down during the broadcast? A layer may be named clock, time or timer in any language, or have no useful name.',
    quiz: 'Does the artwork described in state draw a quiz: one question layer plus two to six answer option layers of similar size, often lettered, that an operator reveals one by one?',
    credits: 'Does the artwork described in state draw end credits: a list of at least three roles, each with the names of people under or beside it, usually stacked in columns? One name with one job title is a lower third, not credits.',
  } as Record<SvgBehaviourFamily, string>,
  field: 'Is text layer {layer} in state.layers a value an operator would edit before or during air, rather than fixed artwork such as a decorative number, label or brand mark?',
  fieldCriteria: {
    true: 'An operator changes this text: a name, title, score, time, question, answer or credit line.',
    false: 'This text is part of the design and stays as drawn.',
  },
} as const;
export const SVG_ANSWER_THRESHOLD = 0.5;

/** Reader-made layer ids only (src/ai/svgInterpretation/evidence.ts EVIDENCE_LAYER_ID). */
const READER_LAYER_ID = /^[a-z][0-9]{1,4}$/;

export interface SvgQuestionPlan {
  questions: DecisionQuestions;
  families: { key: string; family: SvgBehaviourFamily }[];
  fields: { key: string; layer: string }[];
  /** Text layers given no question (past the question or size bound, or not a reader id): they
   *  keep the deterministic decision. */
  notAsked: string[];
}

/** The server's own questions for this evidence: one per family, then one per text layer, as
 *  many as the question bound and `fits` (the request's size bound) allow, in document order. */
export function svgQuestionPlan(evidence: SvgDecisionEvidence, fits: (questions: DecisionQuestions) => boolean = () => true): SvgQuestionPlan {
  const questions: DecisionQuestions = {};
  const families = SVG_BEHAVIOUR_FAMILIES.map((family) => {
    const key = `behaviour_${family}`;
    questions[key] = { type: 'boolean', instructions: SVG_QUESTION_TEMPLATES.behaviour[family] };
    return { key, family };
  });
  const room = SVG_DECISION_LIMITS.questions - families.length;
  // Built before the adapter checks the evidence, so it reads defensively: a malformed layer is
  // skipped here and refused there. A text layer whose id the reader did not make is never named
  // in a question; it is listed as not asked.
  const texts = (evidence.layers as unknown[])
    .filter((l): l is { id: string } => isRecord(l) && l.kind === 'text' && typeof l.id === 'string')
    .map((l) => l.id);
  const askable = texts.filter((id) => READER_LAYER_ID.test(id));
  const fields = askable.slice(0, room).map((layer) => {
    const key = `field_${layer}`;
    const question: DecisionQuestion = {
      type: 'boolean',
      instructions: SVG_QUESTION_TEMPLATES.field.split('{layer}').join(layer),
      criteria: { ...SVG_QUESTION_TEMPLATES.fieldCriteria },
    };
    questions[key] = question;
    return { key, layer };
  });
  // Too large for the route: the last field questions give way, so a crowded artwork is asked
  // about fewer layers rather than refused.
  while (fields.length > 0 && !fits(questions)) delete questions[(fields.pop() as { key: string }).key];
  const asked = new Set(fields.map((f) => f.layer));
  return { questions, families, fields, notAsked: texts.filter((id) => !asked.has(id)) };
}

/** Does a request with these questions fit the route's size bound? True when the route is not
 *  configured: the adapter refuses that case itself. */
function fitsRoute(profile: SvgInterpretationProfile, evidence: SvgDecisionEvidence) {
  const gateway = svgInterpretationPolicy(profile);
  const entry = decisionModelEntry(profile.route);
  const price = profile.prices[modelRouteKey(profile.route)];
  return (questions: DecisionQuestions) => !gateway || !entry || !price
    || prepareDecision({ route: profile.route, state: evidence, questions }, gateway, price).bytes <= decisionRequestBytes(entry.contextWindow);
}

/** The 200 answer. Ids, booleans and family words only. */
export interface SvgInterpretationResponse {
  generationId: string;
  sourceRevision: string;
  /** Per asked text layer: is it an operator field? */
  fields: Record<string, boolean>;
  /** Admitted families the answers found. Empty while none is admitted. */
  families: SvgBehaviourFamily[];
  notAsked: string[];
}

export interface SvgInterpretationRouteDependencies {
  /** Test seams only; nothing a request carries can set them. */
  qualified?: boolean;
  admittedFamilies?: readonly SvgBehaviourFamily[];
  verifyUser?: (token: string | null) => Promise<Pick<AuthedUser, 'userId'> | null>;
  admitIp?: (ipHash: string) => { allowed: true } | { allowed: false; retryAfterSeconds: number };
  interpretation?: SvgInterpretationDependencies;
}

/** Room for the largest evidence the adapter would accept, plus the key and the choice. */
const MAX_BODY_BYTES = SVG_DECISION_LIMITS.requestBytes + 2_000;
const BODY_KEYS = ['idempotencyKey', 'evidence', 'includeText'];

/** Every refusal: a stable code, plain words, and the deterministic import to keep. */
function refusal(code: string, message: string, status: number, retryable = false, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message, retryable }, fallback: 'deterministic' }, status, headers);
}

function outcomeRefusal(outcome: Extract<SvgInterpretationOutcome, { ok: false }>): Response {
  switch (outcome.reason) {
    case 'disabled':
      return refusal('profile_disabled', 'AI preparation is not available.', 503);
    case 'not_configured':
    case 'route_disabled':
      return refusal('profile_not_configured', 'AI preparation has no available model route.', 503);
    case 'not_entitled':
      return refusal('profile_disabled', 'AI preparation is not available for this account.', 403);
    case 'consent_required':
      return refusal('consent_required', 'Accept the AI notice before using AI preparation.', 403);
    case 'evidence_refused':
    case 'questions_refused':
    case 'too_large':
    case 'invalid_request':
      return refusal('invalid_request', 'The preparation request exceeds its supported size or shape.', 400);
    case 'cost_ceiling':
      return refusal('cost_ceiling', 'The preparation request exceeds its cost ceiling.', 503);
    case 'allowance':
      if (outcome.detail === 'duplicate') return refusal('duplicate_request', 'This preparation request was already processed.', 409);
      if (outcome.detail === 'user-concurrency') return refusal('already_running', 'Finish the current analysis before starting another.', 409, true);
      if (outcome.detail === 'fleet-concurrency' || outcome.detail === 'fleet-spend') {
        return refusal('fleet_capacity', 'Graphic analysis has reached its current shared capacity. Try again later.', 503, true);
      }
      return refusal('allowance_exhausted', 'Your current analysis allowance has been used.', 429);
    case 'cancelled':
      return refusal('cancelled', 'The preparation was cancelled.', 503);
    case 'timeout':
    case 'rate_limited':
      return refusal('provider_unavailable', 'AI preparation did not answer in time.', 503, true);
    case 'unavailable':
      // A provider that could not be reached, or a lookup on this side that failed.
      return refusal('unavailable', 'AI preparation is unavailable right now.', 503, true);
    default:
      return refusal('generation_failed', 'AI preparation gave no usable answer.', 502);
  }
}

export function createSvgInterpretationRoute(deps: SvgInterpretationRouteDependencies = {}) {
  return {
    async fetch(req: Request): Promise<Response> {
      const guard = methodGuard(req, 'POST');
      if (guard) return guard;
      // The verdict, then the flag: an unqualified or switched-off route reads nothing.
      const profile = deps.interpretation?.profile ?? svgInterpretationProfile();
      if (!(deps.qualified ?? MODEL_ROUTE_QUALIFIED) || !profile.enabled) {
        return refusal('profile_disabled', 'AI preparation is not available.', 503);
      }
      const callerIpHash = ipHash(req);
      const admission = (deps.admitIp ?? ((hash: string) => admitTaskIp(SVG_INTERPRETATION_TASK_ID, hash)))(callerIpHash);
      if (!admission.allowed) {
        return refusal('rate_limited', 'Too many preparation requests from this network. Try again shortly.', 429, true, {
          'retry-after': String(admission.retryAfterSeconds),
        });
      }
      const user = await (deps.verifyUser ?? verifyUser)(bearerToken(req));
      if (!user) return refusal('authentication_required', 'Sign in to prepare a graphic with AI.', 401);

      let body: Record<string, unknown>;
      try {
        const value = await readJson<unknown>(req, MAX_BODY_BYTES);
        if (!isRecord(value) || Object.keys(value).some((key) => !BODY_KEYS.includes(key))) throw new Error('shape');
        if (!isRecord(value.evidence) || !Array.isArray(value.evidence.layers)) throw new Error('evidence');
        if (value.includeText !== undefined && typeof value.includeText !== 'boolean') throw new Error('choice');
        body = value;
      } catch {
        return refusal('invalid_request', 'The preparation request exceeds its supported size or shape.', 400);
      }
      // The adapter checks the evidence against the policy before anything is booked; the plan
      // reads only its text layers' reader-made ids.
      const evidence = body.evidence as unknown as SvgDecisionEvidence;
      const plan = svgQuestionPlan(evidence, fitsRoute(profile, evidence));
      const outcome = await runSvgInterpretation(
        {
          userId: user.userId,
          ipHash: callerIpHash,
          idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
          evidence,
          questions: plan.questions,
          // Only an explicit `true` is the choice.
          consent: { includeText: body.includeText === true },
          signal: req.signal,
        },
        { ...deps.interpretation, profile },
      );
      if (!outcome.ok) return outcomeRefusal(outcome);
      const yes = (key: string) => {
        const answer = outcome.answers[key];
        return answer?.type === 'boolean' && answer.probability >= SVG_ANSWER_THRESHOLD;
      };
      const admitted = deps.admittedFamilies ?? ADMITTED_FAMILIES;
      const response: SvgInterpretationResponse = {
        generationId: outcome.generationId,
        sourceRevision: evidence.sourceRevision,
        fields: Object.fromEntries(plan.fields.map((f) => [f.layer, yes(f.key)])),
        families: plan.families.filter((f) => admitted.includes(f.family) && yes(f.key)).map((f) => f.family),
        notAsked: plan.notAsked,
      };
      return json(response);
    },
  };
}

export default createSvgInterpretationRoute();
