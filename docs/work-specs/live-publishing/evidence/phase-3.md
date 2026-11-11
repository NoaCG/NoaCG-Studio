# Phase 3 evidence: a Take never waits on the page's own work

Acceptance (verbatim): "AC-1".

AC-1 (spec): "The page's own time, press to the start of sending (excluding the kept ordering
waits), is under 50 ms p95 for every W1 path, with the save and the Bridge health request
deliberately stalled. Total press to sent is reported beside it. Two fast Nexts and two fast +1s
both count. D2's refusals still refuse. A preset cue taken right after its text grows is first
seen at the preset's place on a new output and at the sent position on an older one."

Owner decision (2026-11-11, run issue #2361, answer "a"): 50 ms p95 for the page's own time,
judged on a production build; if the production build still misses it, the number goes to the
coordinator with no further product change for it.

Base: `origin/main` fb04bbd9658857318e4b954611b6dd08a4815e9d. Hardware checks: listed under
"Not checked here", none counted as passed.

## What changed

- Every W1 Take path reads values and adjustments from memory, sends, and saves afterwards
  (`src/control/graphicVerbs.ts` `saveAfter`, `src/control/folderPlayout.ts` `savedAfter`,
  `src/control/serverVerbs.ts` `runAndRecord`). Removed before the send: the draft's save and the
  history group's close, the server cue's 250 ms save head start, the wait for an Adjust write and
  for a box measurement (`src/control/adjustGeometry.ts` `takeAppearance`), and the Bridge's
  `/health` before `/act` once this page load has heard a current Bridge
  (`src/control/playoutLink.ts` `through`).
- A Take no longer parses the whole stored production to learn that a cue has no typed data
  (`ProductionPage.tsx` `typedFor`).
- A Take whose box is for other values carries the preset as a place hint
  (`src/control/cueAdjust.ts` `PlaceHint`); a new output measures the values itself and applies the
  update and everything behind it once measured (`src/output/placeOnOutput.ts`, 2 s cap); an older
  output applies the place sent. The measuring frame is shared with the page's background measurer
  (`src/preview/measureDocument.ts`).
- Kept, as ordering: road discovery, one send in flight per graphic, a quick button or +1 waiting
  for its previous press, a folder's Outs before its next Take.

## How it was measured

The phase 2 harness (`e2e/configured/measure/`), with two additions, on one Claude cloud worker
(4 CPUs, 13.4 GiB) against the configured suite's local Supabase stack:

- `MEASURE_BUILD=prod`: the fixture is built through the development server's modules, as in
  phase 2; then `buildSwitch.mjs`, standing on the harness's port, sends the origin's requests to
  `vite preview` of a production build (`vite build` with the stack's `VITE_` variables) and the
  production page and the output are reloaded under it. Same origin, same storage, bundled code.
- `MEASURE_STALL=1`: before each measured press the cue's note is edited (a save is owed at the
  press); every IndexedDB write is held open 3 s after it is made (the hold
  `e2e/playout-air-contract.spec.ts` uses), and the fake Bridge's `/health` answers 3 s late.

"Before" is `origin/main` built the same way, unthrottled, without the stall unless a row says so.
"After" is this branch's build with the stall on. Words, samples and the kept-wait attribution are
phase 2's.

## Results

RESULTS_PENDING

## D2 and the order

- D2's refusals still refuse: `scripts/graphic-verbs.test.mjs` (typed data refused, a stale press
  refused, a press refused when another cue took the layer while it waited behind the press before
  it) and `e2e/configured/command-sequence.spec.ts` (the stale press).
- The order: `e2e/configured/command-sequence.spec.ts` "W1: a Take sends before its own save"
  (the numbered send leaves with the typed value and air plays it while every save is held);
  `e2e/playout-air-contract.spec.ts` "S2, W1" (a Take from a checkbox's SPACE airs with the save
  held); `scripts/server-verbs.test.mjs`, `scripts/folder-playout.test.mjs` and
  `scripts/vmix-setup.test.mjs` pin the send before the save and `/act` without `/health`.
- Two fast Nexts and two fast +1s both count: every "second of two fast" sample found two sends,
  one per press (the harness fails a sample that does not), and
  `scripts/graphic-verbs.test.mjs` "a second bound press on a graphic waits for the first".
- The preset: `e2e/playout-adjust.spec.ts` "W1: a Take carrying a place hint" (lt01, a name grown
  after the page's box: the frame shows nothing until the stage's own measurement, then the preset
  as the page itself would have resolved it; without the hint the place sent, at once), and
  `scripts/cue-adjust.test.mjs` and `scripts/place-on-output.test.mjs` (the page's own resolution
  as the oracle, order and cancellation on the output).

## Not checked here

- Chromium 71 (CasparCG 2.3) and CasparCG 2.5 running the output's own measurement: the code is
  the bundle's es2017 and the measuring frame is the document the output already composes, but
  the hardware check is listed for the owner's final check (phase 9), not counted as passed.
- A real NoaCG Bridge skipping `/health` (the fake Bridge answers here), and a physical panel.
- A hosted backend and the studio network.
