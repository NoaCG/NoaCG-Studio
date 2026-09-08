# A validator that measured nothing returns the same answer as one that found nothing wrong

**Filed:** 2026-09-08. **Source:** the validator audit in `docs/metrics/2026-09-08-gates-that-measure-nothing.md`

## Why

Fifteen of the seventeen modules under `src/validation` return an empty finding list when their
subject fails to resolve, and an empty finding list is what a clean graphic returns. No caller can
tell the two apart. Most of them argue the choice in their own comments - "unknown is a legitimate
answer", "this instrument stays silent" - and per validator that is defensible. In aggregate it
means the publish gate, the readiness panel and the export dialog can all report a graphic clean
because the measurement never happened.

The five that would cost most, worst first:

- **`src/model/designRules.ts`**: `PROFILE_MULTIPLIER[target.profile]` reads a PERSISTED optional
  field. An unknown profile id makes the multiplier undefined, `hardPx` NaN, and `fontPx < NaN`
  false for every text on every graphic - every size check passes. This is `px < undefined`, the
  original 2026-09-08 defect, one layer below where it was fixed.
- **`src/validation/validateTemplate.ts`**: the literal `'var NOACG_ANIM'` gates roughly 120 lines
  of animation rules, and that literal exists in four independent places - the emitter
  (`src/templates/shared/animRuntime.ts`), this gate, `runtimeBench.ts`, and `src/blocks/animData.ts`.
  Change the emitter to `const NOACG_ANIM` and two gates disarm at once, reporting zero findings.
- **`src/validation/engineSupport.ts`** and **`src/validation/templateBench.ts`**: both iterate a
  registry (`ENGINE_FEATURES`, `UNSAFE_JS`). A row dropped from either stops being enforced
  everywhere it is read, and an empty `ENGINE_FEATURES` certifies every template for CasparCG 2.3
  while printing "Renders on every supported playout engine."
- **`src/validation/plateLegibility.ts`**: a rule written down and enforced nowhere. Nothing under
  `src/` imports it; its only consumer is `scripts/plate-legibility-sweep.mjs`, which no workflow
  and no `package.json` script runs. `src/ai/pro/language/paint.ts` mentions it in comments while
  keeping its own copy of the three plates.

Two near-misses worth fixing with them: `readabilityCheck`'s `mark-outside-safe-area` rule cannot
fire from any product surface, because `designRulesWarnings` never passes `markFieldId`; and
`tickerCheck` reaches the product only through `hasCrawlBand`, which returns false whenever
`parseAnimData` returns null.

## What it would take

The `measured()` contract from `scripts/measured.mjs` does not fit as written - a validator returns
findings to a caller rather than an exit code, and exiting the process is not available to it. The
shape that does fit is `readiness.ts`, which is already the counter-example in the tree: it reports
`untested` rather than `pass` when the bench did not run, cross-checked against the bench's own
`bench-skipped` warning rather than the caller's optimism, and `unclaimedFindings` surfaces any
finding no row claims.

So: give the validator result a "what did you measure" field beside `findings`, make the composing
gates (`publishGate`, `productionGate`, `designRulesWarnings`) refuse a zero where a zero is not
honest, and assert the registries are intact where a registry decides what gets checked at all.
Three cheap pieces can land first and separately: a finite-number assertion on
`PROFILE_MULTIPLIER[target.profile]`, one exported constant for `'var NOACG_ANIM'` instead of four
literals, and non-emptiness assertions on `ENGINE_FEATURES` and `UNSAFE_JS`.

## Evidence

`docs/metrics/2026-09-08-gates-that-measure-nothing.md`, sections "The validators" and the driver
table showing which gate runs each one.
