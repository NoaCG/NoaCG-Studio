# Delete 22 exported symbols nothing references

**Filed:** 2026-08-28. **Source:** weekly quality review (measurement)

## Why

**They read as public seams, and they are not.**

22 of 814 exports (2.7%) in the non-catalog domains are defined once and referenced nowhere across
`src/`, `api/`, `cli/`, `scripts/` and `e2e/`. The rate is low, which is why this is a cheap sweep
rather than an urgent one.

What makes them worth deleting rather than ignoring is WHERE they sit. `myControlShows`,
`hasHostedReceiver` and `localReceiverScript` are exported from `control/`, whose public seam is
listed in `docs/ARCHITECTURE.md` §2 - so someone extending the control domain reads them as part
of the contract and reasons about compatibility they do not owe. A false seam costs more than dead
weight does.

## What it would take

Half a session. Mechanical.

Full list, by domain:

- **`control/`** - `hasHostedReceiver` (`hostedReceiver.ts:32`), `localReceiverScript`
  (`localReceiver.ts:278`), `hostedReceiverConfig`, `hasLocalReceiver`, `myControlShows`
  (`hostedControl.ts:449`), `CONTROL_POLL_MS`, `CONTROL_TAIL_PAGE`
- **`blocks/`** - `timerTransition` (`animMachine.ts:247`), `stepOffsets` (`animEval.ts:40`),
  `lastInsertedSelector`, `BLOCK_CATEGORIES`
- **`model/`** - `threadIsEmpty` (`aiThread.ts:30`), `clearLiveData` (`productionState.ts:63`),
  `clearCurrentVideoProject`, `displayedLimit`
- **Other** - `OFL_TEXT`, `OGRAF_SPEC_VERSION`, `PLACEMENT_LABELS`, `SHAPE_VARS`, `hasCssLength`,
  `sameFilterShape`, `plateLegibilityMessage`, `isDurableStoreActive`,
  `PROTECTION_REQUIRED_OVER_UNKNOWABLE`

**Risk: dynamic string imports.** The static graph cannot see them, and this repo uses them
heavily - `scripts/*.mjs` and the e2e specs drive `src/` modules through
`await import('/src/...')`. **Grep each bare name across `scripts/` and `e2e/` before deleting
it**, not just the TypeScript graph. Seven of the 22 were spot-checked this way and are genuinely
dead; the remaining 15 were not individually confirmed.

Some may also be deliberate API surface for a seam not yet consumed (`OGRAF_SPEC_VERSION` is a
plausible case). Where the export is clearly intentional, leave it and note why - the point is to
remove accidents, not to win an argument with the linter.

**Proof it did not break:** `npm run build` plus `depcruise`. A dynamic-import consumer fails only
at e2e time, so run the affected plan too.

## Evidence

- Method: collected 814 `export function|const|class` symbols across `model/`, `blocks/`,
  `control/`, `export/`, `validation/`, `render/`, `entitlements/`, `packs/`, `audience/`,
  `preview/`, `format/`, `editor/`; counted whole-word occurrences across a concatenation of every
  `.ts`/`.tsx`/`.mjs` in `src/ api/ cli/ scripts/ e2e/` (18.5 MB, node_modules excluded).
  22 symbols occur exactly once - their own definition.
- Spot-checked by hand and confirmed dead: `hasHostedReceiver`, `localReceiverScript`,
  `myControlShows`, `threadIsEmpty`, `timerTransition`, `stepOffsets`, `clearLiveData`.

## Trend

- 2026-08-28: 22 dead of 814 exports (2.7%)
- 2026-09-08: 20 of the 24 named symbols still dead; `CONTROL_POLL_MS` (13 references), `CONTROL_TAIL_PAGE` (6), `timerTransition` (2) and `stepOffsets` (2) have since acquired callers and should come off the list when the sweep runs
