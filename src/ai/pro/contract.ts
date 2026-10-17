// The NoaCG Pro contract that reaches outside `pro/` - the curated route, the per-generation
// cost ceiling, and the brief the wizard maps onto.
//
// Dependency-light like importAnalysis/contract.ts: the browser pipeline, the server profile and
// the admin layer all import it, and neither catalog nor DOM-bearing modules may ride along.
//
// IT USED TO BE THE INTERPRETATION'S SCHEMA TOO - a vision contract describing regions,
// treatments, panel geometry and canvas placement for the concept-and-reconstruct engine. Phase A
// replaced that engine with one design-language call and a platform composer
// (docs/NOACG_PRO_PLAN.md §15, §16), and the engine was deleted on 2026-08-15. What a Pro graphic
// is made of now lives in `pro/language/contract.ts`.

import type { ModelRoute } from '../modelTypes';

/**
 * The STANDARD Pro route - the curated model choice behind the tier, so a normal Pro user never
 * picks models. ONE route, because Phase A makes one call: `gemini-2.5-flash` for the design
 * language, ~$0.0039 a finished graphic measured over the first real hosted generations
 * (docs/NOACG_PRO_PLAN.md §16).
 *
 * It is the same model the retired interpretation stage used, and that is deliberate rather than
 * inherited: the §15.8 round that produced the 26/30 blind read ran on exactly this model, so
 * naming another one would ship an engine nobody has read the output of.
 *
 * The shared route lives in this dependency-light contract so server funding policy can
 * inspect it without importing the browser pipeline, gateway, telemetry or composer.
 *
 * It stays an OBJECT with a named stage rather than a bare route: `api/_lib/aiProProfile.ts`
 * funds routes as a set and the gate ANDs over it, so a second stage is an entry here plus an
 * entry there - and a bare constant would have to be widened back into this shape to add one.
 */
export const PRO_STANDARD_ROUTES: { language: ModelRoute } = {
  language: { provider: 'vercel', model: 'google/gemini-2.5-flash' },
};

/**
 * What ONE Pro generation may cost, every model call together, in USD.
 *
 * WHERE IT BINDS. The browser no longer refuses anything - that ceiling existed to stop the
 * SECOND call once the first had overspent, and with one call the money is gone before a browser
 * could refuse (docs/NOACG_PRO_PLAN.md §16). What remains is the server's: the `pro-generate`
 * reservation books against this number and the ledger stops the run when it is reached.
 *
 * WHY IT IS STILL 0.15, WHICH IS NOW LOOSE - stated rather than quietly retuned. It was set at a
 * shade under twice the RETIRED engine's measured $0.0777 a generation, 86% of which was one
 * flat charge for a concept image. Phase A measures **$0.0039**, so this is now roughly 38x a
 * normal generation rather than 2x, and it catches only a true runaway. Tightening it is a money
 * decision to take against a fresh measurement of the live engine, not a tidy-up to fold into an
 * engine deletion: too low a ceiling destroys a finished graphic somebody was already billed
 * for, which is the 2026-08-08 lesson. `maxCallsPerGeneration` is the bound doing the
 * day-to-day work.
 *
 * It is not the funded-route ceiling (`FUNDED_ROUTE_PRICE_CEILING`, api/_lib/aiModelCatalog.ts):
 * that one measures TEXT tokens per million, and this bounds a whole generation's bill.
 */
export const PRO_MAX_GENERATION_COST_USD = 0.15;

/** The user's brief, capped where it enters a prompt. `maxRegions`, `maxPixels` and `maxEdge`
 *  went with the retired engine: they bounded a vision call reading a concept image, and Phase A
 *  sends no image. `fieldChars` is the per-line cap the wizard's own field setup already
 *  enforces, kept here because the brief mapper is the last place a line is trimmed before it
 *  reaches a model. */
export const PRO_LIMITS = {
  briefChars: 2000,
  fieldChars: 120,
} as const;
