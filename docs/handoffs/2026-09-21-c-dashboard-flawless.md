# C - the playout dashboard, flawless for Friday

Branch `claude/c-dashboard-flawless`, forked from `bde57a83`, with main taken in after PRs 354 and
355 landed. Owner ask, 2026-09-21: "The playout dashboard has to work flawlessly" (docs/GOALS.md
NOW item 3).

## What was done

I built the operator walk as two specs and fixed what they found.

- `e2e/dashboard-operator-walk.spec.ts` (offline, in the gate). One production holds an imported
  quiz board and an imported scoreboard. It walks take, Select, Lock, Reveal, +1 twice, -1, a
  typed name and Update, then a reload. After that come the next question (a duplicated cue with
  a new key, taken over the revealed one), a cold boot in a new tab, and Out on each layer. Any
  console error fails it. A second test in the file pins the ordered command burst (below).
- `e2e/configured/dashboard-hosted-walk.spec.ts` (configured suite). The same production,
  published, driven from two hosted control tabs with the dashboard watching. The renderer opens
  late, after the lock, and tab A reloads mid-lock. It stops before Reveal, on purpose (see
  "What is left").

Fixed, each pinned by one of those specs or an updated neighbour:

1. **The activity log printed machine ids.** Pressing "Reveal correct" logged `Fired "judge"`.
   Both dashboards now log `Pressed "Reveal correct"`, and a shared label carries its section
   (`Pressed "Panelist 2 · +1"`). The rule is `eventLogLabel` in `src/control/eventLog.ts`.
2. **"PROGRAM - ON AIR" wrapped to two lines** at 1280px with two cues live, dropping PROGRAM's
   frame below PREVIEW's. The header is one line now. The names end in an ellipsis and carry a
   title, and the layer badge lists every live layer, not only the top one. This is on both
   pages.
3. **"Edit graphic" on the control page opened the old editor** in the default studio (the
   orchestrator added this to my scope). It now opens `#/editor-foundation` on that graphic and
   keeps the code editor for Advanced mode. `e2e/advanced-mode.spec.ts` pins both.
4. **The hosted page's state chip was empty without a renderer.** It read renderer reports only,
   so before OBS was up the chip never showed and the actions were greyed against nothing. It
   now takes whichever spoke last, a report or its own PROGRAM monitor, as the dashboard does.
   Configured run 35628443262 passed that line with no renderer open.
5. **A late renderer lost the operator's presses.** In the live-control bootstrap
   (`src/preview/composeDocument.ts`), 'play' waited for fonts while every other command ran at
   once. A burst (a renderer's boot catch-up replaying take, Select, Lock) therefore ran the
   events before the entrance. The machine was still off, so both were dropped, and the board
   came up on the question with no lock. Commands now queue behind a waiting play or settle.
   Configured run 35628443262 found it (the renderer's lock never lit). The offline burst test
   pins the document half. The same fix covers an Out sent within the font wait of a Take.

## Verification

- `npm run build`: exit 0 after taking main in.
- Offline gate: production-controls + quiz-show gave 47 passed. After the merge, the walk,
  production-controls, quiz-show, advanced-mode, hosted-control and productions gave 90 passed.
  That was before fix 5.
- CI (`ci.yml`) on 778162b4, run 35631453293, was green. Its plan included the walk, and shard
  2/9 ran both tests, the burst test included.
- Configured suite: fix 4 passed on run 35628443262. Fix 5 passed on the real renderer on runs
  35631461907 and 35633742370: a renderer opened after the lock came up locked, with B picked.
  Both runs then failed at the Reveal leg below. The trimmed walk is the part those runs proved.
  The trimmed file itself has not had a run of its own. The first landing's configured run is
  its first verdict.
- I did not mutation-test the burst test against the old bootstrap. The local job queue sat
  behind another row's integration suite. The real-renderer failure on run 35628443262 is the
  evidence the defect existed.

## What is left, and why

- **FRIDAY-CRITICAL, OPEN: Reveal from a reloaded hosted tab does not reach air.** Tab A
  reloads while the quiz is locked. Its state chip correctly reads "Locked in", and its Reveal
  correct press appears as `Pressed "Reveal correct"` in every page's log. But the renderer's
  `answer.correct/C` layer never lit on run 35633742370, and the dashboard's own PROGRAM monitor
  did not light it on 35631066808 or 35631461907. I ran out of window before finding the cause.
  Start from the retry trace in run 35633742370's `configured-report` artifact. Two things to
  check first: the payload or cue the reloaded page sends with the event, and whether the
  renderer's machine is still in `locked` when the row arrives (tab B's score steps happen in
  between). Operator workaround until then: press Reveal from a tab that has not been reloaded,
  or from the dashboard. Put the walk's remaining legs back with the fix: the Reveal on air, the
  dashboard reload restoring both layers, and Out from both tabs until nothing is on air.
- **The dashboard reload on a PUBLISHED production is unverified by this row.** The walk never
  reached it. Row D's backlog item covers the history of that symptom.
- **Console errors on the hosted road** are printed, not asserted, by the trimmed walk. The
  offline walk asserts none.
- **The rundown says "Imported" as an imported graphic's kind** ("L20 · Imported · Quiz board").
  A student would read "Quiz" better. The type carries no category today, so this needs a model
  field, which is row B's area. Not done.

## Traps that are in no repo file

- **Editing a `.tsx` file while a browser job runs remounts the page mid-test.** The Vite dev
  server is shared, so HMR remounts the page. I chased a "dashboard resets itself a second after
  Update" for twenty minutes before I saw it was my own edit landing. Leave `src/` alone while a
  job is running.
- **PREVIEW trails fast edits by about 150-550ms.** The settle is debounced 150ms, and a play
  waits up to 400ms for fonts. A screenshot taken straight after a burst of presses shows the old
  figures. That is not a defect, but it looks like one in a frame.
- **The hosted page cannot be mounted offline.** Every hosted claim needs
  `gh workflow run configured-suite.yml --ref <branch>`, about 12 minutes each, and the dispatch
  runs queue behind each other.
- **An unpublished production has nothing on air after a reload**, and that is correct: nothing
  ever left the laptop. Do not "fix" the offline walk's reload leg into restoring air.

## For the owner

Nothing needs you. The owner-queue item is
`docs/acceptance/owner-queue/2026-09-21-c-dashboard-flawless.md`.

## Commits

- 4a495170 the walk, log labels, header wrap, Edit graphic door
- 7b1a7e92 hosted machine state from its own monitor, layer badge
- 97cc8e70 ordered live-control commands (the late-renderer fix)
- 039ff1ac and the final commit: the configured walk, trimmed to what is proven
- 39e61c60 owner-queue item
