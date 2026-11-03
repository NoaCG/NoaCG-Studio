// The APPROVED-ROUTE model catalog (docs/AI_PLATFORM_PLAN.md §7) - server-only, never
// serialized to the browser. Free-tier task profiles (api/_lib/aiTaskRegistry.ts) may
// only reference routes listed here and FAIL CLOSED otherwise, exactly the
// liteProfileConfigured() posture: a misconfigured route refuses to run rather than
// falling back to an unapproved one.
//
// `openWeights` is promotion-time PREFERENCE metadata (the ratified §15 decision 1):
// when the NoaCG benchmarks show parity, the open-weight candidate wins the route, but
// a superior proprietary model is never excluded for closed weights alone. Nothing in
// the request path gates on this flag.
//
// Entries are audited by hand at promotion time (docs/AI_LITE_PROMOTION.md). Live
// listings - current prices, context windows, availability - come from the discovery
// module (aiModelDiscovery.ts); the numbers here are the audited snapshot the policy
// layer prices against, refreshed when a route is (re)promoted.
//
// RE-POINTED TO VERCEL AI GATEWAY (2026-08-07). Every slug, price, context window and
// capability below was re-read from the live gateway listing, not translated by hand. Where
// the SAME model is served the entry kept its promotion and only its slug and audited numbers
// moved; where no equivalent slug exists the entry was REMOVED rather than re-pointed at a
// lookalike, because a promotion is a bench result about one model and cannot be transferred
// to another by name similarity. What that removed is recorded at the bottom of the list.

import type { ModelPrice } from './aiGateway.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

export interface ApprovedModelCapabilities {
  vision: boolean;
  coding: boolean;
  structuredOutput: boolean;
  contextWindow: number;
}

export interface ApprovedModelEntry {
  route: ModelRoute;
  /**
   * What the route PRODUCES, and unlike `openWeights` this one IS a gate.
   *
   * The catalog began as the free tier's menu, so every entry was a text model and the
   * invariants could assume it: a registered task's route must decode structured output, and
   * an approved route missing from the text listing is an outage. Cataloguing the Pro concept
   * route (an image model) breaks both assumptions - it will never decode structured output
   * and will never appear in the text listing - so the kind is declared rather than inferred.
   * `approvedTextRoute()` is what keeps an image route from being pointed at a Lite task.
   */
  outputs: 'text' | 'image';
  /** Promotion-time preference metadata - never a per-request gate (plan §15.1). */
  openWeights: boolean;
  capabilities: ApprovedModelCapabilities;
  price: ModelPrice;
  /**
   * Whether a ZDR-served path for this route has been VERIFIED by a real call.
   *
   * It is a recorded audit result, never an inference, because a wrong "yes" here becomes a
   * privacy claim on the /admin Models page that production does not honour. Under OpenRouter
   * the audit was "which endpoint of this model is ZDR-servable"; under Vercel AI Gateway the
   * gateway itself filters a `zeroDataRetention: true` request down to providers with a
   * verified ZDR agreement and refuses when none qualifies - so the only thing left to audit
   * is whether the route actually serves under it, which takes one real call on a
   * ZDR-entitled plan.
   *
   * Every entry below was verified on 2026-08-07 by one real ZDR-requesting call per route,
   * recorded in docs/MODEL_ROUTE_AUDITS.md. Nothing degrades quietly if that ever stops being
   * true: a task whose profile requires ZDR fails closed on `zdr_unavailable` (the plan lost
   * the feature) or `retention_unsatisfiable` (no provider of that model qualifies), never by
   * silently routing to a provider that retains.
   */
  zdrAvailable: boolean;
  notes: string;
}

export const APPROVED_MODEL_CATALOG: readonly ApprovedModelEntry[] = [
  {
    route: { provider: 'vercel', model: 'google/gemini-2.5-flash-lite' },
    outputs: 'text',
    openWeights: false,
    capabilities: { vision: true, coding: false, structuredOutput: true, contextWindow: 1_048_576 },
    price: { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    zdrAvailable: true,
    notes: 'Lite design-spec primary. Proprietary incumbent; stands until the discovery funnel '
      + 'benches an open-weight equal (plan §7). Same model and same price on the gateway as on '
      + 'OpenRouter, so the 2026-07-29 promotion transfers intact. ZDR verified 2026-08-07: '
      + 'served by vertex (docs/MODEL_ROUTE_AUDITS.md).',
  },
  {
    route: { provider: 'vercel', model: 'google/gemini-2.5-flash' },
    outputs: 'text',
    openWeights: false,
    capabilities: { vision: true, coding: false, structuredOutput: true, contextWindow: 1_000_000 },
    price: { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    zdrAvailable: true,
    notes: 'Lite skin vision judge route (docs/AI_LITE_BENCHMARK.md §6b), and the ONE route '
      + 'hosted NoaCG Pro spends on (PRO_STANDARD_ROUTES.language - Phase A\'s design-language '
      + 'call; the retired interpret stage used the same model). Same model and price on the gateway; '
      + 'the context window is the listing\'s 1,000,000 rather than the 1,048,576 the OpenRouter '
      + 'entry recorded. The endpoint-level ZDR reasoning the old note carried no longer applies: '
      + 'the gateway decides which provider serves a ZDR request, not us. ZDR verified '
      + '2026-08-07: served by vertex (docs/MODEL_ROUTE_AUDITS.md).',
  },
  {
    route: { provider: 'vercel', model: 'alibaba/qwen3-coder-next' },
    outputs: 'text',
    openWeights: true,
    capabilities: { vision: false, coding: true, structuredOutput: true, contextWindow: 256_000 },
    // DEARER THAN THE OPENROUTER ENTRY IT REPLACES (0.11/0.80 there, 0.50/1.20 here) - the same
    // model, billed by a different serving. Still inside the funded ceiling, and stated rather
    // than carried over, because Lite's cost-per-generation arithmetic reads this table.
    price: { inputPerMillion: 0.50, outputPerMillion: 1.20 },
    zdrAvailable: true,
    notes: 'Lite design-spec fallback; open-weight coding candidate for the code benches. Slug '
      + 'moved from qwen/ to alibaba/ on the gateway. ZDR verified 2026-08-07: served by '
      + 'bedrock (docs/MODEL_ROUTE_AUDITS.md).',
  },
  {
    route: { provider: 'vercel', model: 'google/gemini-3.1-flash-image' },
    outputs: 'image',
    openWeights: false,
    // The gateway serves image output from a `type: 'language'` model through the ordinary
    // chat-completions `modalities` field, and the retired concept call asked for no structured
    // output, so nothing here depends on this flag.
    capabilities: { vision: true, coding: false, structuredOutput: false, contextWindow: 131_072 },
    price: { inputPerMillion: 0.50, outputPerMillion: 3.00 },
    zdrAvailable: true,
    notes: 'NO TASK CALLS THIS ROUTE. It was NoaCG Pro\'s concept route '
      + '(PRO_STANDARD_ROUTES.concept) until Phase A retired the concept-and-reconstruct engine '
      + '(docs/NOACG_PRO_PLAN.md §16), and it is no longer on the hosted profile\'s funded list. '
      + 'The entry stays because it is an AUDIT RECORD - deleting it would delete a verified ZDR '
      + 'result and the only priced image row the admin page can show. Same slug and same token '
      + 'prices on the gateway. Its generated images bill through ordinary OUTPUT TOKENS here '
      + 'rather than a separate image-token meter, and are measured against NO ceiling - none '
      + 'has been decided for image work (docs/ADMIN.md §9). ZDR verified 2026-08-07 on a real '
      + 'image generation: served by vertex, $0.067 (docs/MODEL_ROUTE_AUDITS.md).',
  },

  // ── Removed in the OpenRouter → Vercel AI Gateway move (2026-08-07) ──────────
  // Four entries left the catalog because the gateway carries no equivalent slug, and a
  // promotion cannot be transferred to a different model by name similarity:
  //
  //   mistralai/mistral-small-2603, mistralai/mistral-small-24b-instruct-2501,
  //   google/gemma-3-12b-it, qwen/qwen3-30b-a3b-instruct-2507
  //
  // MEASURED AND REJECTED 2026-08-08: `alibaba/qwen3.7-flash`. Cheapest text route on the
  // gateway (0.03/0.13) with a 991k context, and it cannot serve Lite at all - its endpoint
  // downgrades `response_format: json_schema` to `json_object` and then refuses the call
  // ("'messages' must contain the word 'json'"). 0 of 6 briefs reached a model. Price and
  // context are not capability: a fallback has to produce the CONTRACT.
  //
  // All four were BENCHMARK CANDIDATES rather than promoted routes - listed only so
  // `bench:qualify` could reach them, since taskConfigured() refuses an uncatalogued route.
  // The last was the leader of the 2026-07-29 Lite round and never promoted. Re-add
  // replacements in the SAME change as the qualification run that justifies them (the gateway
  // carries near neighbours - alibaba/qwen-3-30b, mistral/mistral-small, google/gemma-4-31b-it
  // - but "near" is not what a bench result is about).
  //
  // `openai/gpt-oss-20b` survived the move at the same slug and the same price, and is kept
  // here as the one open-weight funnel candidate that needs no re-qualification.
  {
    route: { provider: 'vercel', model: 'openai/gpt-oss-20b' },
    outputs: 'text',
    openWeights: true,
    capabilities: { vision: false, coding: false, structuredOutput: true, contextWindow: 131_072 },
    price: { inputPerMillion: 0.05, outputPerMillion: 0.20 },
    zdrAvailable: true,
    notes: 'Lite discovery-funnel candidate. Same slug on the gateway; the audited price is the '
      + 'gateway listing\'s 0.05/0.20 rather than the pinned-DeepInfra 0.03/0.14 recorded before. '
      + 'ZDR verified 2026-08-07: six qualifying providers, served by togetherai '
      + '(docs/MODEL_ROUTE_AUDITS.md).',
  },
  // No vision-suite candidates are listed. `meta-llama/llama-4-scout` and `qwen/qwen3.5-9b`
  // were approved for the 2026-07-29 import-analysis run and REMOVED again after it, because
  // the run did not support them: it was not a valid comparison (a per-axis size cap rejected
  // every portrait case, and two candidates failed all 35 images for reasons never isolated),
  // no candidate came close to usable (best region precision 23% against a gold ceiling of
  // 100% and a floor of 0%), and llama-4-scout invented regions on artwork with no editable
  // text - the failure that puts nonsense fields in front of a user.
  //
  // A vision route has to be listed here before it can be benched at all, so re-add the
  // candidates in the SAME change as the run that justifies them, rather than leaving
  // approvals standing on a result nobody trusts.
];

export function modelRouteKey(route: ModelRoute): string {
  return `${route.provider}:${route.model}`;
}

const byRouteKey = new Map(APPROVED_MODEL_CATALOG.map((entry) => [modelRouteKey(entry.route), entry]));

export function approvedModelEntry(route: ModelRoute): ApprovedModelEntry | null {
  return byRouteKey.get(modelRouteKey(route)) ?? null;
}

export function approvedModelRoute(route: ModelRoute): boolean {
  return byRouteKey.has(modelRouteKey(route));
}

/** Approved AND a text model. Every registered task in the registry sends a text request and
 *  reads a structured answer, so pointing one at the Pro concept route would fail on the first
 *  call - approval alone stopped being a sufficient check the moment the catalog held an image
 *  entry. The registry's fail-closed gate uses this rather than `approvedModelRoute`. */
export function approvedTextRoute(route: ModelRoute): boolean {
  return byRouteKey.get(modelRouteKey(route))?.outputs === 'text';
}

/** The audited catalog restricted to text routes - what the funded-route checklist and the
 *  "approved but no longer listed" outage check are about. Both read the TEXT listing, so an
 *  image entry measured against either would report a permanent false alarm. */
export function approvedTextCatalog(): readonly ApprovedModelEntry[] {
  return APPROVED_MODEL_CATALOG.filter((entry) => entry.outputs === 'text');
}

// Decision 5 (plan §15): WHO PAYS DECIDES THE ROUTE. Free hosted surfaces are funded by
// the project, not the user, so a route NoaCG pays for must be cheap and reachable through
// the Vercel AI Gateway adapter - which is why no entry above names OpenAI or Anthropic as
// its provider: those are the DIRECT provider APIs, reachable only through a user's own
// sealed key. (The same model served through the gateway is a `vercel` route and perfectly
// fundable; the distinction is who holds the credential, not who made the model.)
// Unlike `openWeights` this IS a gate: the registry refuses a free-tier route that breaks
// it, and the catalog test refuses an entry that could never serve one.
export const FUNDED_ROUTE_PROVIDER = 'vercel';

/** The per-million ceiling a NoaCG-funded route may cost. Sits above every catalog entry
 *  (the dearest today is the vision judge at 0.30/2.50) with room for a better model, and
 *  below the proprietary flagships a no-revenue project cannot subsidize. Raise it
 *  deliberately, not to admit one model that just missed. */
export const FUNDED_ROUTE_PRICE_CEILING: ModelPrice = {
  inputPerMillion: 1.0,
  outputPerMillion: 5.0,
};

export function fundedRoutePrice(price: ModelPrice): boolean {
  return (
    price.inputPerMillion <= FUNDED_ROUTE_PRICE_CEILING.inputPerMillion &&
    price.outputPerMillion <= FUNDED_ROUTE_PRICE_CEILING.outputPerMillion
  );
}

/** Whether a route may carry spend NoaCG funds. `price` is the caller's EFFECTIVE price
 *  when it has one (a task's price table can be overridden by env), so an operator cannot
 *  point the free tier at an approved model at a price the project would not fund; it
 *  falls back to the audited catalog snapshot. */
export function fundedModelRoute(route: ModelRoute, price?: ModelPrice | null): boolean {
  const entry = approvedModelEntry(route);
  if (!entry) return false;
  // An image route's cost is dominated by `image_output`, which this ceiling does not measure
  // and for which no ceiling has been decided (docs/ADMIN.md §9). Answering "yes, funded" off
  // the text sides alone would clear a route on a rule that misses most of its bill.
  if (entry.outputs !== 'text') return false;
  if (entry.route.provider !== FUNDED_ROUTE_PROVIDER) return false;
  return fundedRoutePrice(price ?? entry.price);
}

/** The audited price snapshot, keyed `provider:model` - the base of Lite's price table,
 *  so the catalog and the policy layer cannot drift apart. */
export function approvedModelPrices(): Record<string, ModelPrice> {
  return pricesOf(APPROVED_MODEL_CATALOG);
}

function pricesOf(entries: readonly { route: ModelRoute; price: ModelPrice }[]): Record<string, ModelPrice> {
  const prices: Record<string, ModelPrice> = {};
  for (const entry of entries) prices[modelRouteKey(entry.route)] = { ...entry.price };
  return prices;
}

// ── Decision-model candidates (docs/work-specs/jev-svg-import/spec.md, row 31) ─────────────
//
// A DECISION model answers typed questions (boolean, choice, score) about a piece of state with
// probabilities instead of text. The gateway serves it from `POST /v1/evaluate`, never from Chat
// Completions, so it cannot be an entry above: every entry there is reached by the chat adapter,
// and every entry there records a ZDR verification made by a real call. These are CANDIDATES for
// the SVG interpretation evaluation. No paid call has been made to any of them, so nothing here
// is a promotion: the evaluation (rows 33 and 34) decides whether one is qualified, and until
// that verdict the task that may use one stays off.
//
// The numbers are the live gateway listing (`GET /v1/models`, free and unauthenticated), read on
// 2026-11-03. Both models bill input tokens only.

export interface DecisionModelEntry {
  route: ModelRoute;
  price: ModelPrice;
  contextWindow: number;
  /** What the listing CLAIMS about zero data retention across its providers. A claim, not a
   *  verification: a task still sends `zeroDataRetention: true` and the gateway refuses the call
   *  when no provider qualifies. */
  listedZdr: 'all' | 'some' | 'none';
  /** The listing accepts image input. This row admits structured state only, so the decision
   *  adapter refuses images whatever this says; it is recorded for the comparison in row 32. */
  listedImageInput: boolean;
  auditedOn: string;
  notes: string;
}

export const DECISION_MODEL_CANDIDATES: readonly DecisionModelEntry[] = [
  {
    route: { provider: 'vercel', model: 'typesafe-ai/jev-1.14.0' },
    price: { inputPerMillion: 0.042, outputPerMillion: 0 },
    contextWindow: 32_000,
    listedZdr: 'all',
    listedImageInput: true,
    auditedOn: '2026-11-03',
    notes: 'The pre-registered primary SVG interpretation candidate (decisions.md, decision 6). '
      + 'Pinned version, never the floating `typesafe-ai/jev` alias, so a provider release cannot '
      + 'change the model under a frozen evaluation. One provider (typesafe-ai), listed ZDR and '
      + 'no-training, us region.',
  },
  {
    route: { provider: 'vercel', model: 'baseten/elephant-1' },
    price: { inputPerMillion: 0.035, outputPerMillion: 0 },
    contextWindow: 16_384,
    listedZdr: 'all',
    listedImageInput: false,
    auditedOn: '2026-11-03',
    notes: 'Reporting-only comparison (spec, AI route and data policy: "Elephant text"). Text '
      + 'input only. One provider (baseten), listed ZDR and no-training, us region.',
  },
];

const decisionByRouteKey = new Map(DECISION_MODEL_CANDIDATES.map((entry) => [modelRouteKey(entry.route), entry]));

export function decisionModelEntry(route: ModelRoute): DecisionModelEntry | null {
  return decisionByRouteKey.get(modelRouteKey(route)) ?? null;
}

/** May NoaCG fund a call to this decision route? Listed here, on the funded transport, and
 *  inside the same per-million ceiling as a text route. Decision models bill per token like a
 *  text route, so the ceiling sees the whole bill, unlike an image route. */
export function fundedDecisionRoute(route: ModelRoute, price?: ModelPrice | null): boolean {
  const entry = decisionModelEntry(route);
  if (!entry || entry.route.provider !== FUNDED_ROUTE_PROVIDER) return false;
  return fundedRoutePrice(price ?? entry.price);
}

/** The decision candidates' audited prices, keyed `provider:model`. */
export function decisionModelPrices(): Record<string, ModelPrice> {
  return pricesOf(DECISION_MODEL_CANDIDATES);
}
