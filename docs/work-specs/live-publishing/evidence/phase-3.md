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
  standing. This runs after the send, so the timings above are unchanged by it.
- Test races found by CI, not product changes: specs pressed a key that depends on what is on
  air (Out, Delete, undo, redo, a second Space) as soon as the fake Bridge saw the request, before
  the page had its answer. Each now waits for the row to show it
  (`e2e/studio-evening-reliability.spec.ts`, `e2e/rundown-history.spec.ts`). Proven by fault
  injection: with the Bridge's answer delayed 1.5 s the old specs failed with CI's exact messages
  and the new ones passed.

## Not checked here

- Chromium 71 (CasparCG 2.3) and CasparCG 2.5 running the output's own measurement: the code is
  the bundle's es2017 and the measuring frame is the document the output already composes, but
  the hardware check is listed for the owner's final check (phase 9), not counted as passed.
- A real NoaCG Bridge skipping `/health` (the fake Bridge answers here), and a physical panel.
- A hosted backend and the studio network.

## Repair: a Take right after an unsaved edit (#2388)

Owner decision 2026-11-11, answer "B" on #2361: one scoped repair in phase 3 for the stalled tail
above. Review class: Risky (it moves when the draft's save runs, which is reload and recovery).

### Rules

Written after the first build commit (8bdd8f2), before the review; a Rules-first `/so` challenges
them separately from the code.

- R1. A press with a pointer on the button of a W1 Take path (Take for a graphic, picture,
  folder or server cue; Re-take; Next, which also steps a folder; a quick button or one of its
  picks; a live number's step), made while an edit is owed: the press's handler runs, and its
  send starts, before the draft's save rewrites the stored productions. This holds for a mouse,
  a touch and a pen: a tap moves the focus after its pointer is up, so a touch or pen press ends
  at its click (or 1 s after the pointer is up if it makes none). A keyboard press (SPACE,
  R, N) or a hardware panel's command blurs nothing, sends from memory and saves afterwards.
- R1a. A Take of a cue with typed OGraf data still saves before it sends, as before (D2,
  `graphicVerbs.ts` `typedFirst`); R1 is about the save a blur owes, which that press then
  finds already started. AC-1's paths have no typed data.
- R2. What that press sends carries the edited value, read from memory.
- R3. The edit is still saved, by one stored write carrying the latest text: by the Take path's
  own save after its send, or by the save the editor's blur owes, which runs once such presses
  pause: 300 ms (the draft's idle delay) after the last one ends (pointer up, pointer cancelled,
  or the window losing focus), never while one is down, and at most 2 s after it is owed.
  Whichever runs second finds nothing owed and writes nothing.
- R3a. The typing before the press stays one undo step: its history group closes with the held
  save. If a write the press makes through the history lands first, it closes the group before
  it, so the typing is still one step, recorded after the press's. Typing again in the editor
  before the held save has run drops that save: the typing carries on in the same draft, so the
  typing before and after the press is one step, saved on its own idle delay. An edit never
  starts a write itself: a write queued in the same call as a new history group would land after
  the group's snapshot, and the history would then drop the draft.
- R4. Nothing typed is lost if the page hides, closes or reloads at any moment after the press:
  the edit stays owed until saved, and the page going saves what is owed at once. A save that
  fails or is refused leaves the edit owed, as before.
- R4a. An edit to another cue never starts while an earlier cue's edit is owed. Selecting a cue
  or a folder saves and drops the draft first (`selectCue`, `selectFolder`), as before. The editor
  can also follow the cue on air to another cue (`editTarget === 'air'`, a Take from elsewhere);
  after the render that moved it, the save of the draft it left starts (`cueDraft.showing`); that
  draft is kept until the save is confirmed, so a failed save stays owed and the page going
  saves it. Neither starts a write inside an edit. Typing into the new cue before that save is
  confirmed still starts a new draft; if the save then fails, the earlier edit is not owed again
  (as on `main`). Making `edit` save another cue's owed draft first needs the history to open a
  group in queue order, after every write queued before it: `beginGroup` snapshots at once while
  writes land through its queue. That rule is missing on `main` too and is left to #2394.
- R5. An idle save (300 ms after the last keystroke) falling due while such a press is down waits
  for the press to end too.
- R6. A blur not made by such a press (Tab, a click anywhere else, another control) saves at once,
  as before, so a verb that reads the stored record sees the edit. The account's request to save
  everything (a pause, a sign-out) is never held.
- R7. Once the page's session ends (it moves to another production), a held save never runs; what
  was owed was saved at the end.

Revised again after the final `/so` on c0a5aee (grade B): R1 covers touch and pen, R3a typing
again during the hold. Then after the Codex review of dc38070 (R3a: no write inside an edit) and
the delta `/so` on 9956f3f (R4a: the air-follow path). Revised after the Rules-first `/so` (grade B, 2026-11-11): R1 names every W1 path and the
keyboard; R1a, R3a and R4a are new; R3, R4 and R6 say what a second save, a failed save and the
account's request do.

Rules found after coding, apart from those stated before it: R1's touch and pen case (final `/so`
on c0a5aee); R3a's "an edit never starts a write" (Codex on dc38070: running the held save, or an
other-cue save, inside `edit` let the history drop the new typing); R4a's air-follow path (delta
`/so` on 9956f3f: the editor follows the on-air cue with no save, as on `main`; the guard
dc38070 had in `edit` covered it with the flaw above, and 9956f3f had removed it).

### What changed

- `src/control/cueDraft.ts` `blurred`: the save the cue editor's blur owes runs at once, unless a
  pointer is down on a control marked `data-sends-first`. Then it is held until such presses
  pause for 300 ms (never during one), with a 2 s cap. An idle save falling due during such a
  press is held the same way. Typing again during the hold drops the held save (R3a); `edit`
  starts no write. `showing` starts the save of a draft of a cue the editor no longer shows (R4a).
- `ProductionPage.tsx` gives the draft the window's pointer events (`onSendsFirstPress`; a touch
  or pen press ends at its click, since a tap moves the focus after its pointer is up), and after
  each render tells it which cue the editor shows (`showing`, which acts only when it changes);
  `CueEditor.tsx` routes its blur through `blurred`; Take, Re-take, Next, the quick buttons and
  their picks and the live number steps carry `data-sends-first`.

### AC-1 measured again

Same harness, cases and machine as above (`MEASURE_BUILD=prod`, `MEASURE_STALL=1`, unthrottled),
against the local Supabase stack. Before: `origin/main` c0bc989 (this phase's build). After: this
branch at f3b21e5 (the later commits change a touch press's end and what an edit does first,
neither on a mouse press's path to its send). Milliseconds, own p50 / p95 (samples, failures); "total" includes the kept
ordering waits. Multi-part paths are merged from the raw samples.

| Path | Fixture | Before, stalled | After, stalled | After, total |
|---|---|---|---|---|
| Graphic cue Take | Typical | 16.3 / 216 (50, 0) | 10.8 / 18.8 (50, 0) | 10.8 / 18.8 |
| Picture cue Take | Typical | 14.9 / 251 (50, 0) | 9.1 / 12.7 (50, 0) | 9.1 / 12.7 |
| Folder Take (two cues, together) | Typical | not run (12.2 / 17.4 above) | 12.9 / 20.3 (50, 0) | 12.9 / 20.3 |
| Server cue Take (fake Bridge) | Typical | not run (32.8 to 37.9 / 40 to 48 above) | 37.2 / 48.2 (50, 0) | 37.2 / 48.2 |
| Quick button (Goal) | Typical | 15.7 / 223 (50, 0) | 8.6 / 13.8 (50, 0) | 8.6 / 13.8 |
| +1 | Typical | 13.8 / 221 (50, 0) | 8.2 / 12.8 (50, 0) | 8.2 / 12.8 |
| Next | Typical | 11.1 / 192 (50, 0) | 8.2 / 11.2 (50, 0) | 8.2 / 11.2 |
| Next, second of two fast | Typical | not run (5.7 / 13.6 above) | 5.9 / 10.7 (50, 0) | 23.5 / 38.7 |
| Hardware panel Take (scripted) | Typical | not run (2.7 / 6.1 above) | 2.7 / 5.3 (50, 0) | 9.3 / 15.4 |
| Graphic cue Take | Large | 21.3 / 736 (50, 0) | 15.5 / 26.1 (50, 0) | 15.5 / 26.1 |

Against AC-1 (50 ms p95, own time, save and Bridge health stalled): every path measured meets it
after this repair. The server Take is the closest (48.2), as it was before it (40 to 48); this
repair does not change that path, whose editor has no blur save. The "before" column reproduces
the misses #2388 names (192 to 251 ms typical, 736 ms large).

Not run here, as before and out of #2388's scope: the second of two fast quick buttons or +1s,
and the other paths on the large fixture with the stall (the 5 minute job cap).

A first version (87ea071) ran the held save on the next task after the press. It met AC-1 on
every single press but moved the save onto a second fast press: Next, second of two fast, went
to 13.6 / 78.4 (50, 0). f3b21e5 holds the save until presses pause, which gave the numbers
above.

### How it was run

The configured suite's stack (`scripts/configured-stack.mjs up`) on this worker, with Docker
started by hand and the Supabase CLI 2.111.0 from its npm package. Docker Hub refused the image
pulls with 429 (rate limit) and the default registry's blob host is refused by the proxy, so the
images came from `mirror.gcr.io` (`SUPABASE_INTERNAL_IMAGE_REGISTRY=mirror.gcr.io`). With that
registry the CLI asks for every image under `supabase/`, so the four images published under
other names (`timberio/vector`, `kong`, `axllent/mailpit`, `postgrest/postgrest`) were pulled from
the mirror and tagged locally. Each case is one queued job under 5 minutes; the settings go in
the queued command itself, since the queue runner keeps the environment of the shell that started
it.

### Tests

- `scripts/cue-draft.test.mjs`: eight new cases (R1, R3 to R7, R3a, R4a's `showing`, a second
  fast press during the wait). Mutations: `blurred` saving at once again turns four red; the held
  save running during a press turns one red; running the held save inside an edit (dc38070's
  version) turns the R3a case red; `showing` doing nothing turns the R4a case red.
- `e2e/playout-air-contract.spec.ts`: "typed then taken at once" reads, in the click's capture
  phase, that the stored productions do not yet hold the typed text (with `blurred` saving at once
  it fails: "the Take ran before the save"); "typed then taken, then the page reloads at once"
  finds the edit kept (R4); "on a touch screen" taps Take and checks the same capture-phase read
  (with a touch press ending at its pointer's release it fails: "the Take ran before the save").
  The whole file passes 10 of 10 on 71aada1.
- `e2e/publish-output-setup.spec.ts:384` failed once in CI on 87ea071 (#2392). It races its own
  save on `main` too: with the save after a server Take's answer delayed 1 s, it fails 3 of 3
  with CI's message at `407:268` on c0bc989 and on this branch alike. A server cue's editor has no
  blur save, so this repair does not reach it. The spec is left as it is.

### For the owner's final check (phase 9)

On a real show, with a mouse and on a touch screen, type into a cue's field and press Take (also Next, a quick button, a live number)
at once: the graphic goes on air with the typed text, without the pause the save used to cause,
and the text is still there after a reload made straight after the press.

## Repair 2: an edit lost when the page reloads before its save lands (check on 92e581a7)

The phase 3 check on merge 92e581a7 ([#2389 comment](https://github.com/NoaCG/NoaCG-Studio/pull/2389#issuecomment-6806518108))
failed it: an edit typed and then Taken was lost when the page reloaded while the send was
unanswered. Review class: Risky (reload and recovery).

### Cause, reproduced on 92e581a7

Offline, signed out (temporary specs): an edit typed into a cue and then a reload at once, with
no press, was lost 3 of 3; with the pointer still down on Take (the blur's save held, R3) lost
3 of 3. On the local stack, the checker's case (send answered after 200 ms, Take, reload 50 ms
later) lost 4 of 4. So the hold of #2389 only widened a window that was already there: R4's "the
page going saves what is owed at once" was not true, for two reasons.

- The page-hide save (`cueDraft` `retain`) does reach the durable store, but IndexedDB here takes
  50 to 90 ms to commit a write, and a reload aborts every write still committing. Asking the
  transaction to commit at once (`IDBTransaction.commit()`) kept the mouse and no-press cases, but
  a touch Take then reload was still lost 5 of 6: the Take path's own save had been handed to the
  database 60 ms before the reload and was aborted with the page-hide write queued behind it
  (logged with a record that survives the reload). No IndexedDB write made near a reload is safe.
- A save already handed to the rundown history is written from its queue a moment later, and
  `retain` counted it as no longer owed, so the page going wrote nothing for it.

### Rules

Written before the code; a Rules-first `/so` challenges them. A first version (commit the
page-hide write at once) was graded B and withdrawn after the touch measurement above. A second
(a record compared by time) was graded B; its findings are answered below.

- P1. When the page may be going (`onPageHide`: hidden, closing or reloading, or the account
  pausing), an owed edit is saved to the store as before and, first and synchronously, recorded
  in localStorage for its production: the cue, the text the cue held when the typing started, and
  the typed text. Owed means typed and not yet saved, or saved through the history and not yet
  confirmed by the store. One record per production, in one key per account
  (`spx-gfx-owed-cue-edits`, moved with the account's other small records when an account adopts
  the signed-out workspace). A refused localStorage write changes nothing else.
- P2. When the production page first has that production's cues on a visit, before anything on
  it is typed or sent, the record is taken once. If the cue still holds exactly the text the
  typing started from, the typed text is written to it at once, as the page-hide save writes it
  (no undo step). Otherwise (the cue holds the typed text already, was changed since by another
  tab, a teammate or an undo, or is gone) nothing is written. The record is removed either way,
  and a write the store refuses (a live candidate's field, editing paused at the store) is not
  retried. While the account may not write, the record stays for a later visit. Nothing is
  shown to the operator.
- P3. A save of the draft that the store confirms removes the record, and so does the page being
  shown again after it hid (it stayed, so the store's write lands).
  A record of a production deleted before its next visit stays, a few hundred bytes.
- P4. Therefore R4 holds: an edit typed and not yet saved is in the stored production after a
  reload at any moment after the press (pointer still down, mouse or touch; the send unanswered or
  answered) and with no press at all. Not covered: a crash or a killed tab (no event fires); a
  second cue's owed save when the editor followed the cue on air to another cue and the operator
  typed there before the first save was confirmed (R4a, the history rule left to #2394); a cue
  changed by someone else since the typing started (their text stands, P2).
- P5. The session's end and the listening's stop save at once as before, with no record: the page
  stays, so the store's write lands. When the Take sends, when the blur's save runs and what it
  writes do not change (R1 to R7 above), and AC-1 is measured again on the production build.

Revised after the second Rules-first `/so` (grade B, 2026-11-11): the comparison is the cue's
own text, not the production's `updatedAt`, which answers its findings 1 (timestamp order),
4 (other writes on the next visit), 5 (teammates' clocks; a teammate's later edit to the cue
stands) and 6 (a later save to another cue no longer drops the edit). Finding 2: P3 says when a
record goes, and that a deleted production's record stays. Finding 3: listed in P4. Smaller
points: the key moves with the account (P1), a refused write and the silence (P2).

Rules found after coding, apart from those stated before it: the record is removed when the
page is shown again after it hid. Without that, an undo after a hide the page came back from
would put the cue back to the text the typing started from, and the next visit would bring the
undone edit back (inline review of 063798e). A first version also removed it when a draft was
dropped (`cancel`); the page drops a draft while it starts, before `recover`, so that lost the
record (the held-press reload test failed 2 of 6 on 310f222) and was taken out.

### What changed

- `src/model/owedCueEdit.ts` (new): the record, one localStorage key per account
  (`spx-gfx-owed-cue-edits`, versioned), a map by production; added to the account's small keys
  in `accountScope.ts`.
- `src/control/cueDraft.ts`: `retain` on page hide also covers a save out through the history,
  and records the owed edit first with the text the draft started from; `recover` applies a
  record once; a confirmed save and the page shown again after it hid remove it.
- `src/components/home/ProductionPage.tsx`: the record's storage calls for this production, the
  "shown again" moment (visible again, or restored from the back-forward cache; never a fresh
  load's own `pageshow`), and `recover` once the production's cues are there.
- No Take path, no draft timing and no server change. The withdrawn first fix
  (`durableStore.ts`, commit at once) is reverted on the branch (97f0bdd).

### The checker's case on the local stack

A temporary configured spec (not committed): sign in, publish the scorebug, select its first
cue, delay `control_send_seq` by N ms with `page.route`, `fill` a text field, click Take, wait
50 ms, reload, select the cue again and read the field.

| Send answer delay | Without the fix (92e581a7) | With the fix |
|---|---|---|
| 200 ms | lost 4 of 4 (the field reads the old "HOME") | kept 4 of 4 |
| 800 ms | not run here (the checker: lost 6 of 6) | kept 4 of 4 |

### AC-1 measured again

Production build with the stack's variables, `MEASURE_BUILD=prod MEASURE_STALL=1`, typical
fixture, local Supabase stack, takes-a narrowed to the graphic cue Take (50 samples each):

| Build | Own time p50 / p95 (ms) | Failures | Max |
|---|---|---|---|
| 063798e (the fix) | 11.8 / 24.7 | 0 | 28.2 |
| FINAL_ROW |

The checker's sample on 92e581a7 was 12.0 / 21.4. The fix runs only when the page hides, is
shown again, or a draft save is confirmed, so no Take path's work changed; the other paths
were not measured again.

### Tests

- `e2e/playout-air-contract.spec.ts`: "an unsaved edit is kept when the page reloads inside its
  save window, pressed or not" (mouse pointer held down on Take, then no press) and, on a touch
  screen, "typed, Take tapped, then the page reloads at once". Mutation: with the record never
  written (`if (false && hiding) io.owed.keep(...)`) both fail 3 of 3 (the field reads the old
  "Alexandra Riva"); the earlier "typed then taken, then the page reloads at once" stays green,
  as the check said. With the fix the whole file passes 36 of 36 (`--repeat-each 3`, 063798e).
- `scripts/cue-draft.test.mjs`: P1 to P3 and P5 cases, and the history's out save. Mutations:
  no record on hide turns three red; no removal on a confirmed save one; `recover` never writing
  two; the page hide not covering an out save one.
- `scripts/owed-cue-edit.test.mjs` (new): records per production and per account, a store of
  another version never read, written over or cleared, an unreadable record read as none.
- Specs that hold writes or reload (`save-transaction-holds`, `rundown-history-storage`,
  `cross-tab`, `network-resilience`, `production-data`, `account-library`) passed 79 of 80 on
  the withdrawn first fix; the one failure, `rundown-history-storage.spec.ts:89`, was its home
  page not appearing at the first `goto`, and the file then passed 21 of 21. Not rerun on the
  final code, which does not touch the durable store; CI runs them.

### For the owner's final check (phase 9)

- In the studio: type into a cue, press Take, and reload at once with the output on a slow link;
  the typed text is still there. Not counted as passed here.
