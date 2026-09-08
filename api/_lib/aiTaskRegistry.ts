// The AI TASK REGISTRY (docs/AI_PLATFORM_PLAN.md §4): a typed map taskId -> TaskProfile.
// TaskProfile is LiteProfile generalized LITERALLY - schema ref + version, allowed
// tiers, token/image/resolution limits, timeout/retry, route policy, ledger kind - and
// deliberately nothing more: no capability negotiation until a third harness needs it
// (plan §13). Server-only; the browser mirror of a task stays whatever its own status
// endpoint exposes today (availability, limits, allowance - never routes).

import { liteProfile, type LiteProfile } from './aiLiteProfile.js';
import { importAnalysisProfile, type ImportAnalysisProfile } from './aiImportAnalysisProfile.js';
import { proProfile, type ProProfile } from './aiProProfile.js';
// fundedModelRoute subsumes approvedModelRoute: it looks the entry up in the catalog AND
// applies the funded-route rule, so the gate below needs only the one predicate.
import { approvedModelRoute, approvedTextRoute, fundedModelRoute, modelRouteKey } from './aiModelCatalog.js';
import type { ModelPrice } from './aiGateway.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';
import { IMPORT_ANALYSIS_LIMITS } from '../../src/ai/importAnalysis/contract.js';

export type AiTaskId = 'lite-design-spec' | 'imported-graphic-analysis' | 'pro-generate';
export const LITE_TASK_ID: AiTaskId = 'lite-design-spec';
export const IMPORT_ANALYSIS_TASK_ID: AiTaskId = 'imported-graphic-analysis';
export const PRO_TASK_ID: AiTaskId = 'pro-generate';

export type AiTaskTier = 'anonymous' | 'free' | 'byo' | 'paid';

/** A structured-contract reference: identity + version, never the schema itself -
 *  the schema stays owned by the task's harness (src/ai/AGENTS.md doctrine). */
export interface TaskSchemaRef {
  id: string;
  version: string;
}

export interface TaskLimits {
  outputTokens: number;
  repairOutputTokens: number;
  estimatedInputTokens: number;
  maxImages: number;
  /** Client-side downscale ceiling for vision tasks; null for text-only tasks. */
  maxImageResolution: { width: number; height: number } | null;
}

export interface TaskRoutePolicy {
  primary: ModelRoute;
  fallbacks: ModelRoute[];
  prices: Record<string, ModelPrice>;
  gatewayProviders: string[];
  requireZdr: boolean;
  structuredMode: 'json-schema' | 'tool';
  maxProviderCostUsd: number;
  /**
   * Which of this task's routes are called for IMAGE output, and are therefore exempt from
   * the two rules built around reading a structured text answer at a per-token price.
   *
   * It exists because an image route is a catalogued, audited, ZDR-verified route that both
   * rules refuse on purpose: `approvedTextRoute` is false for it, and `fundedModelRoute`
   * answers no for every image entry because the funded PRICE CEILING measures input/output
   * text tokens and no ceiling for image work has been decided (docs/ADMIN.md §9,
   * aiModelCatalog.ts). Declaring a route here does not waive the bound - it names which bound
   * applies. An image route's spend is held by `maxProviderCostUsd`, BOOKED per generation
   * before the call and settled after it, which is a bound on the whole bill rather than on
   * the half the token ceiling can see.
   *
   * **NO TASK DECLARES ONE TODAY.** Pro's concept route (`google/gemini-3.1-flash-image`) was
   * the only one, and Phase A retired the engine that called it (docs/NOACG_PRO_PLAN.md §16).
   * The FIELD stays because the half of this that matters is `routeConfigured`'s refusal of an
   * UNDECLARED image route - the check that stops an env edit pointing Lite at an image model
   * and discovering it on the first call - and that check needs a declaration to be the thing
   * a task can be missing. It is pinned by a test with no task behind it.
   *
   * Absent (the default, and now every task) means the task sends only text requests, and both
   * rules apply unchanged.
   */
  imageRoutes?: ModelRoute[];
}

export type TaskLedgerKind = 'ai_generations' | 'ai_gateway_requests';

export interface TaskProfile {
  taskId: AiTaskId;
  enabled: boolean;
  schema: TaskSchemaRef;
  tiers: readonly AiTaskTier[];
  limits: TaskLimits;
  timeoutMs: number;
  maxAttempts: number;
  retryLimit: number;
  routePolicy: TaskRoutePolicy;
  /** Which ledger the task writes and the row discriminator it writes there. The
   *  ai_generations `profile` column pins its allowed values with a CHECK constraint
   *  (migration 0010), so a task introducing a new value ships that migration in the
   *  same commit (`root/version-every-persisted-format-ship-breaking`). */
  ledger: { kind: TaskLedgerKind; profile: string };
}

/** NoaCG Lite re-expressed as the first task profile: a VIEW over liteProfile(), so the
 *  AI_LITE_* env configuration stays single-sourced and /api/ai/lite/* behavior is
 *  unchanged. Callers that already built the request's LiteProfile pass it in rather
 *  than re-reading the environment. */
export function liteTaskProfile(profile: LiteProfile = liteProfile()): TaskProfile {
  return {
    taskId: LITE_TASK_ID,
    enabled: profile.enabled,
    schema: {
      // The skin experiment widens the structured contract, so the ref names which
      // shape the managed model is actually held to (lite/contract.LITE_READY_OUTPUT*).
      id: profile.skinEnabled ? 'lite-ready-decision-skin' : 'lite-ready-decision',
      version: profile.promptVersion,
    },
    tiers: ['free'],
    limits: {
      outputTokens: profile.outputTokens,
      repairOutputTokens: profile.repairOutputTokens,
      estimatedInputTokens: profile.estimatedInputTokens,
      // Lite sends no images to the model; logo uploads ride the deterministic
      // browser pipeline and never reach a provider.
      maxImages: 0,
      maxImageResolution: null,
    },
    timeoutMs: profile.timeoutMs,
    maxAttempts: profile.maxAttempts,
    retryLimit: 0,
    routePolicy: {
      primary: profile.primary,
      fallbacks: [profile.fallback],
      prices: profile.prices,
      gatewayProviders: profile.gatewayProviders,
      requireZdr: profile.requireZdr,
      structuredMode: profile.structuredMode,
      maxProviderCostUsd: profile.maxProviderCostUsd,
    },
    ledger: { kind: 'ai_generations', profile: profile.id },
  };
}

/** The imported-graphic-analysis task (plan §6): one vision call, proposal-only output,
 *  free tier, quotas per the ratified decision 3. Derived from its own env profile the
 *  same way the Lite view derives from liteProfile(). */
export function importAnalysisTaskProfile(profile: ImportAnalysisProfile = importAnalysisProfile()): TaskProfile {
  return {
    taskId: IMPORT_ANALYSIS_TASK_ID,
    enabled: profile.enabled,
    schema: { id: 'import-analysis', version: profile.promptVersion },
    tiers: ['free'],
    limits: {
      outputTokens: profile.outputTokens,
      repairOutputTokens: profile.outputTokens,
      estimatedInputTokens: profile.estimatedInputTokens,
      maxImages: IMPORT_ANALYSIS_LIMITS.maxImages,
      maxImageResolution: {
        width: IMPORT_ANALYSIS_LIMITS.maxWidth,
        height: IMPORT_ANALYSIS_LIMITS.maxHeight,
      },
    },
    timeoutMs: profile.timeoutMs,
    maxAttempts: profile.maxAttempts,
    retryLimit: 1,
    routePolicy: {
      primary: profile.route,
      // Deliberately no fallback: the vision benchmark picks ONE launch route (plan §8);
      // a second route enters as explicit configuration when it earns its place.
      fallbacks: [],
      prices: profile.prices,
      gatewayProviders: profile.gatewayProviders,
      requireZdr: profile.requireZdr,
      structuredMode: 'json-schema',
      maxProviderCostUsd: profile.maxProviderCostUsd,
    },
    ledger: { kind: 'ai_generations', profile: profile.id },
  };
}

/**
 * The HOSTED NoaCG Pro task: a paid-shaped generation NoaCG's own key serves, admitted and
 * accounted through the same ai_generations ledger (migration 0044).
 *
 * It is registered although its spend flows through the GENERIC gateway proxy rather than a
 * task-owned endpoint, because registration is what makes the allowance real: the admin models
 * page walks AI_TASK_IDS, and `taskConfigured` is the fail-closed gate that stops an env
 * repoint at an unpriced or unapproved route from being billed.
 *
 * TIERS SAY `free`, AND THAT IS ABOUT WHO PAYS RATHER THAN WHAT IT COSTS THE USER. Hosted Pro
 * is the surface the product will eventually charge for, but there is nothing to buy today: a
 * signed-in account with no plan reaches it and NoaCG's key settles the bill. `noacgFunded`
 * reads this label to decide whether the funded-route rule binds (decision 5: who pays decides
 * the route), so labelling it `paid` before billing exists would switch that gate off on the
 * one surface whose per-generation cost is 250x Lite's. It moves to `paid` the day a user's
 * money is what pays. Until then the ALLOWANCE stands in for the price - a small daily quota
 * rather than an open tap.
 *
 * THE ENGINE IS NOT DESCRIBED HERE. The route list is what the profile funds, not a pipeline.
 * §15 replaced the concept-and-reconstruct engine and this entry did not have to be rewritten,
 * which is the property that rule was for: the only thing that moved is how many routes the
 * profile funds, and this reads that rather than naming stages.
 */
export function proTaskProfile(profile: ProProfile = proProfile()): TaskProfile {
  // Positional, not named: whatever the profile funds first is the primary and the rest are
  // spares. Phase A funds one route, so there is nothing behind it.
  const [primary, ...fallbacks] = profile.routes;
  return {
    taskId: PRO_TASK_ID,
    enabled: profile.enabled,
    schema: { id: 'pro-hosted', version: profile.promptVersion },
    tiers: ['free'],
    limits: {
      // Pro's model calls are made by the browser pipeline through the generic proxy, which
      // carries its own body and token bounds; this task's bound is money, not tokens. The
      // numbers are stated rather than zeroed so the registry's shape stays readable.
      outputTokens: 7000,
      repairOutputTokens: 7000,
      estimatedInputTokens: 12_000,
      maxImages: 1,
      maxImageResolution: { width: 1920, height: 1080 },
    },
    timeoutMs: profile.timeoutMs,
    maxAttempts: profile.maxCallsPerGeneration,
    retryLimit: 1,
    routePolicy: {
      primary,
      fallbacks,
      prices: profile.prices,
      gatewayProviders: profile.gatewayProviders,
      requireZdr: profile.requireZdr,
      structuredMode: 'json-schema',
      maxProviderCostUsd: profile.maxProviderCostUsd,
      // No `imageRoutes`: Phase A asks a text model for a design language and composes the
      // graphic itself, so every route here is a text route and the ordinary rules apply.
    },
    ledger: { kind: 'ai_generations', profile: profile.id },
  };
}

const TASKS: Record<AiTaskId, () => TaskProfile> = {
  'lite-design-spec': () => liteTaskProfile(),
  'imported-graphic-analysis': () => importAnalysisTaskProfile(),
  'pro-generate': () => proTaskProfile(),
};

export function taskProfile(taskId: AiTaskId): TaskProfile {
  return TASKS[taskId]();
}

/** Every registered task, for callers that must walk all of them rather than name one - the
 *  admin models section marks which listed routes are actually in use. Derived from TASKS, so
 *  a task added there is included without a second list to keep in step. */
export const AI_TASK_IDS = Object.keys(TASKS) as AiTaskId[];

function declaredImageRoute(policy: TaskRoutePolicy, route: ModelRoute): boolean {
  return (policy.imageRoutes ?? []).some(
    (declared) => declared.provider === route.provider && declared.model === route.model,
  );
}

function routeConfigured(policy: TaskRoutePolicy, route: ModelRoute): boolean {
  if (route.provider !== 'vercel') return true;
  // A catalogued route that produces IMAGES cannot serve a task that did not ASK for one -
  // every text task here sends a text request and reads a structured answer. This is the
  // check that stops an env edit from pointing Lite at an image model and discovering it on
  // the first call, and the declaration is what tells the two cases apart: Pro's concept
  // route is an image route on purpose, Lite pointed at one is a misconfiguration.
  if (approvedModelRoute(route) && !approvedTextRoute(route) && !declaredImageRoute(policy, route)) {
    return false;
  }
  return Boolean(policy.prices[modelRouteKey(route)]) && policy.gatewayProviders.length > 0;
}

/** True when the task's spend is NoaCG's own: those routes must be catalog-approved AND
 *  funded-eligible. BYO/paid-only tasks spend the caller's own money on explicitly chosen
 *  routes, so neither constraint applies to them. */
function noacgFunded(task: TaskProfile): boolean {
  return task.tiers.includes('free') || task.tiers.includes('anonymous');
}

/** A funded route priced against the task's OWN table, so an env pricing override cannot
 *  smuggle the free tier onto a route the project would not pay for.
 *
 *  A DECLARED IMAGE ROUTE is held to catalog approval instead of to the per-token price
 *  ceiling, for the reason `TaskRoutePolicy.imageRoutes` states: the ceiling measures text
 *  tokens and would clear or refuse an image route on a rule that misses most of its bill.
 *  What bounds it is `maxProviderCostUsd`, booked per generation. Approval is NOT waived -
 *  an unaudited image model is refused exactly as before. */
function fundedRoute(policy: TaskRoutePolicy, route: ModelRoute): boolean {
  if (declaredImageRoute(policy, route)) return approvedModelRoute(route);
  return fundedModelRoute(route, policy.prices[modelRouteKey(route)] ?? null);
}

/** The registry's fail-closed gate, generalizing liteProfileConfigured(): every managed
 *  gateway route needs a current price and a provider allowlist, and every route NoaCG funds
 *  must be a catalog-approved entry that satisfies decision 5 (the Vercel AI Gateway
 *  transport, under the funded-route price ceiling). Approval never keys off openWeights -
 *  that flag is promotion-time preference metadata (plan §15.1). */
export function taskConfigured(task: TaskProfile): boolean {
  const routes = [task.routePolicy.primary, ...task.routePolicy.fallbacks];
  if (!routes.every((route) => routeConfigured(task.routePolicy, route))) return false;
  return !noacgFunded(task) || routes.every((route) => fundedRoute(task.routePolicy, route));
}
