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
  published, driven from the dashboard and two hosted control tabs. The renderer opens late, and
  tab A and then the dashboard reload mid-show.

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
- VERDICTS STILL TO READ ARE LISTED UNDER "What is left".

## What is left, and why

- (filled at the end)

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

(filled at the end)
