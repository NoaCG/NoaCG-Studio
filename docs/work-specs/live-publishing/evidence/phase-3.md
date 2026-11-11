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

"Before" is `origin/main` built the same way. "After" is this branch built at 72c1b5b8; the
product changes after it (92bf8cf3, e88a5516, 1bbcc23f) run after the send or only read a list
the Take already holds, so they do not move these numbers. Both are unthrottled, with and
without the stall as each table says. Words, samples and the kept-wait attribution are phase 2's:
"own" is press to the start of sending less the kept ordering waits, "total" includes them.

## Results

Production build, milliseconds, own p50 / p95 (samples, failures). Fast network, unthrottled.

### Without the stall

| Path | Fixture | Before: own p50 / p95 (n, failures) | After: own p50 / p95 (n, failures) | Total p50 / p95 (last column) |
|---|---|---|---|---|
| Graphic cue Take | Typical | 26.2 / 38.2 (50, 0) | 11.7 / 17.2 (50, 0) | 11.7 / 17.2 |
| Picture cue Take | Typical | 25.6 / 35.2 (50, 0) | 11.9 / 17.9 (50, 0) | 11.9 / 17.9 |
| Folder Take (two cues, together) | Typical | 43.4 / 63.6 (50, 0) | 12.3 / 18.0 (50, 0) | 12.3 / 18.0 |
| Server cue Take (fake Bridge) | Typical | 42.0 / 69.5 (50, 0) | 30.9 / 41.9 (50, 0) | 30.9 / 41.9 |
| Quick button (Goal) | Typical | 8.3 / 10.9 (50, 0) | 8.1 / 11.5 (50, 0) | 8.1 / 11.5 |
| Quick button, second of two fast | Typical | 96.0 / 122 (50, 0) | 91.8 / 120 (50, 0) | 106 / 139 |
| +1 | Typical | 7.1 / 9.8 (50, 0) | 8.2 / 12.1 (50, 0) | 8.2 / 12.1 |
| +1, second of two fast | Typical | 98.5 / 141 (50, 0) | 96.8 / 128 (50, 0) | 112 / 156 |
| Next | Typical | 7.7 / 13.0 (50, 0) | 7.5 / 12.1 (50, 0) | 7.5 / 12.1 |
| Next, second of two fast | Typical | 7.3 / 19.6 (50, 0) | 6.5 / 14.0 (50, 0) | 20.5 / 27.8 |
| Hardware panel Take (scripted) | Typical | 21.0 / 30.6 (50, 0) | 2.7 / 6.6 (50, 0) | 10.0 / 16.8 |
| Graphic cue Take | Large | 65.0 / 96.4 (50, 0) | 14.1 / 20.1 (50, 0) | 14.1 / 20.1 |
| Picture cue Take | Large | 62.2 / 91.0 (50, 0) | 13.8 / 18.8 (50, 0) | 13.8 / 18.8 |
| Folder Take (two cues, together) | Large | 114 / 152 (50, 0) | 16.9 / 22.3 (50, 0) | 16.9 / 22.3 |
| Server cue Take (fake Bridge) | Large | 129 / 168 (50, 0) | 96.4 / 118 (50, 0) | 96.4 / 118 |
| Quick button (Goal) | Large | 10.7 / 21.5 (50, 0) | 10.2 / 15.7 (50, 0) | 10.2 / 15.7 |
| Quick button, second of two fast | Large | 320 / 410 (50, 0) | 288 / 337 (50, 0) | 311 / 370 |
| +1 | Large | 10.7 / 16.0 (50, 0) | 9.8 / 13.6 (50, 0) | 9.8 / 13.6 |
| +1, second of two fast | Large | 318 / 432 (50, 0) | 290 / 354 (50, 0) | 312 / 392 |
| Next | Large | 10.4 / 22.3 (50, 0) | 10.5 / 15.6 (50, 0) | 10.5 / 15.6 |
| Next, second of two fast | Large | 12.9 / 24.3 (50, 0) | 13.6 / 30.0 (50, 0) | 34.9 / 59.5 |
| Hardware panel Take (scripted) | Large | 56.6 / 121 (50, 0) | 3.1 / 7.3 (50, 0) | 10.2 / 20.7 |

### With the save and the Bridge health request stalled

| Path | Fixture | Before, stalled: own p50 / p95 (n, failures) | After, stalled: own p50 / p95 (n, failures) | Total p50 / p95 (last column) |
|---|---|---|---|---|
| Graphic cue Take | Typical | not run | 17.7 / 225 (50, 0) | 17.7 / 225 |
| Picture cue Take | Typical | not run | 13.1 / 230 (50, 0) | 13.1 / 230 |
| Folder Take (two cues, together) | Typical | not run | 12.2 / 17.4 (50, 0) | 12.2 / 17.4 |
| Server cue Take (fake Bridge) | Typical | not run | 37.9 / 47.6 (25, 0) and 32.8 / 40.2 (25, 0), two runs | 32.8 / 40.2 |
| Quick button (Goal) | Typical | 17.0 / 264 (10, 0) | 14.1 / 192 (50, 0) | 14.1 / 192 |
| +1 | Typical | 12.9 / 199 (10, 0) | 12.9 / 189 (50, 0) | 12.9 / 189 |
| Next | Typical | not run | 11.1 / 287 (50, 0) | 11.1 / 287 |
| Next, second of two fast | Typical | not run | 5.7 / 13.6 (50, 0) | 22.7 / 36.8 |
| Hardware panel Take (scripted) | Typical | not run | 2.7 / 6.1 (50, 0) | 8.9 / 18.7 |

"Not run" before the stall: the before build waits for the stalled `/health` (3 s by
construction) before each server Take and saves before each graphic Take, so those runs were cut
to the quick button and +1 pair. Large with the stall: see "Large, stalled" below.

### Against AC-1 (50 ms p95, own time)

Meets it without the stall, on both fixtures: graphic, picture, folder, panel, quick, +1, Next
and Next second of two, and the server Take on the typical fixture. With the stall: the folder
Take, the server Take (40 to 48 ms) and Next second of two.

Misses it (the numbers the owner decision sends to the coordinator):

- With the stall, typical: graphic 225, picture 230, quick 192, +1 189, Next 287 ms p95; p50 stays
  11 to 18 ms. The tail is the press that follows an owed edit: the edit's blur starts the
  draft's save, and that save rewrites the stored productions synchronously before the press's
  handler runs. It is the page's own work, not a wait, and it is the same with the old build
  (quick 264, +1 199). Inferred from where the stall bites (only presses after an owed edit, p50
  unchanged); no profile is recorded.
- Second of two fast quick buttons or +1s: typical 92 / 120 and 97 / 128, large 288 / 337 and
  290 / 354 (before: 96 / 122, 99 / 141, 320 / 410, 318 / 432). The wait for the first press's
  answer is kept and excluded; the cause of the remainder was not traced. It was there before; it is
  lower now on the large fixture and the same within noise on the typical one.
- Server Take, large, without the stall: 96 / 118 (before 129 / 168). The `/health` wait and the
  250 ms head start are gone; the cause of the remainder was not traced.

No product change was made for these, as the owner decision says.

### Large, stalled

- Graphic cue Take, large, after: own 27.5 / 734 ms p95 (50, 0); max 807. A miss, from the same
  source as the typical stalled tail: the owed edit's save rewrites the larger stored production
  before the press's handler runs.
- The other paths were not run with the stall on the large fixture: a run needs the large
  fixture's build plus 50 samples that each wait out a 3 s stall, which does not fit the worker's
  5 minute job cap (the server Take run reached 24 of 25 presses in 290 s). Not counted as passed.

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

## Review answered (/check, inline review of the diff)

- Fixed: the output's measuring frame starts no media of the design (`allow="autoplay 'none'"`),
  so nothing it settles can reach program audio; an Out pressed while a hinted Take is being
  placed no longer waits for the measurement (what waits goes at once at the place sent, then the
  Out); one cue lookup shared by the Take and Update reads.
- Kept, with the reason: after a hinted Take the page holds the place its own measurement
  resolves, the place a new output shows. An older output, or one whose measurement ran past its
  2 s cap, shows the place sent, and the page cannot tell which until outputs report what they
  ran, which is W3 (phase 5, the honest light). A later look sent to on-air graphics then moves an
  older output to the resolved place, which is where it belongs.
- Kept: a Take saves the draft after its send is answered, but the draft's own 300 ms idle save
  still runs and a closing page still saves at once (`control/cueDraft.ts`), so typed text is not
  held unsaved for the send's round trip. A Bridge's features are refreshed by every status
  poll, which still asks `/health`.
- Fixed after the PR review and the final delta /so: a later send can carry the same stale look
  as a hinted Take (a second hinted Take, an unhinted Take, an Update, a look send), so the look
  alone cannot tell which measurement the outputs show. Every send that sets a graphic's look or
  takes it off is now counted as it leaves, and a hinted Take's measurement applies only while
  none followed it (`placeTaken`'s `latest`); a send that sets no look (a figure, a +1) leaves it
  standing. This runs after the send, so the timings below are unchanged by it.

## Not checked here

- Chromium 71 (CasparCG 2.3) and CasparCG 2.5 running the output's own measurement: the code is
  the bundle's es2017 and the measuring frame is the document the output already composes, but
  the hardware check is listed for the owner's final check (phase 9), not counted as passed.
- A real NoaCG Bridge skipping `/health` (the fake Bridge answers here), and a physical panel.
- A hosted backend and the studio network.
