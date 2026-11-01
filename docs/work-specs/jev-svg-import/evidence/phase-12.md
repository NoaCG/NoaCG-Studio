# Phase 12: Qualify independent score and clock behavior

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-10: "Score changes preserve clock origin; clock changes preserve scores/effects. Existing
  +1/−1/flash semantics, reset scope and lifecycle are tested."
- AC-21: "On unfamiliar imported artwork, +1 awards exactly one point with the correct team's
  flash, including repeated presses during a flash; -1 and direct numeric correction do not award
  or retrigger celebration. An illegal event is refused before payload mutation; a failed send does
  not commit local live values. Report accepted-event/shared-data-write failure distinctly.
  Reconnect agrees with rendered state. No new delivery/exactly-once protocol is promised."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.

## Pinned main

Worktree created from `7030eb18dcceef18243e0dc3e937a2b7ef51918e` (row 11, PR #1899) after a fresh
fetch. That is the previous verified main.

## Rules (observable, as tested)

- **S1** `+1` moves its team's figure by exactly one, counted from what air shows, and lights that
  team's flash. A second `+1` during the flash adds one more point and plays the moment again: one
  pop per point.
- **S2** `-1` takes the point and the flash down. A figure typed up or down (an Update, no event)
  never awards: the flag group does not move and no pop plays.
- **S3** An event with no arrow from the current state (Clear flash with nothing up, Full time at
  full time, an unknown event) is dropped before its payload lands; the surfaces grey the same
  button (`eventLegality`).
- **S4** Clock rows (Start, Pause, a typed correction, Reset) leave the figures and the lit flash
  alone. Score rows, Full time and New game leave the clock running from its origin. New game
  zeroes the figures and takes Full time and the flash down. Out and Take keep the figures; a
  Take starts with no moment up.
- **S5** An output that missed rows and caught up agrees with one that saw them all: figures,
  flash, Full time and the clock's second.
- **S6** At the surface, the recipe's own `+1` through the real `pressSend`: the cue is written
  only after the event went; a failed send writes neither the cue nor the shared value; an event
  that went while its shared value did not move answers "The shared value did not move", distinct
  from a failed send.

## What landed

- `scripts/imported-score-event.test.mjs` (new): S1 to S6 on `score-clock-1.svg` (two teams,
  count-up clock) and `scoreboard-3.svg` (four teams), each with hidden flash groups (and a Full
  time plate on the first) added in memory under generic ids and bound in the draft. Two outputs
  over one command log, applied in `output/main.ts` order with the real clock wire.
- No product source changed. Rows 9 and 11 already prove the clock wire half of AC-10
  (`scripts/imported-clock-wire.test.mjs`, `e2e/configured/scorebug-output.spec.ts`); this row adds
  the score half and the surface. The corpus board's UI walk (`e2e/import-svg-behaviour.spec.ts`)
  already rehearses +1, −1, Full time, New game and the reload of the cue.

## Not met: #1908

The test-first run on `7030eb1` failed in two places, and the reload check in a third. All three
have one cause: which team scored lives in the renderer's memory and repaint timing
(`behaviourRuntime.ts` `noacgRememberNumbers` and the `pop` on every state repaint), not in the
event's data.

1. A figure typed up while another team's flash is up moves the flash to the typed team
   (AC-21 "direct numeric correction does not ... retrigger celebration").
2. An output rebuilt from its report shows `flag/shown` with no team's flash, while the others
   show it (AC-21 "reconnect agrees with rendered state", for a reload; a reconnect that replays
   missed rows agrees).
3. A clock row (Start, Pause, Reset) or Full time replays the scorer's pop (AC-10 "clock changes
   preserve ... effects").

Those clauses stay **open**. The landed test asserts neither 1 nor 3 and says why at each spot.

## Decisions and traps

- **No repair here.** `behaviourRuntime.ts` is outside the row's conditional boundary, and neither
  fix is narrow. Latching a rise only during an event breaks boards whose figures are bound to
  production data: their `+1` carries no payload, and the figure arrives afterwards as a data
  write, which is what a typed correction looks like to the renderer. Knowing which group was just
  entered needs the animation interpreter (`animRuntime.ts`), which every template embeds behind a
  legacy-hash migration list, so changing it is a versioned interpreter change. The coordinator
  was told before any edit; nothing outside the row's files changed.
- **Flash layers added in memory, not to the fixtures.** Row 2 froze the corpus, and none of its
  unfamiliar score files draws a flash. The added groups have generic ids (`object8`), so nothing
  is recognised by name.
- Trap: `controlModel.ts` imports without extensions, so a Node test importing it needs the
  resolve hook `scripts/graphic-verbs-walk.test.mjs` uses.
- Trap: a board can draw numbers that are not team figures (`scoreboard-3.svg`'s year). Take the
  figures from the `+1` buttons' `adjust`, not from every number field.
- **The renderer's report takes an event's payload without asking the graphic**
  (`output/main.ts`, "event payloads merged optimistically"). So a payload riding an event the
  graphic drops would still reach the report and a reboot. The score board cannot reach it: every
  event that carries figures (`+1`, `−1`, New game) has an arrow from every state, and the
  surfaces grey the rest. Recorded, not changed; the test's outputs merge the same way.
- **The test's two-output harness repeats part of `imported-clock-wire.test.mjs`'s** rather than
  sharing it: extracting one would reshape row 9's landed test for no behaviour.
- Mutation checks: moving `noacgApplyPayload` before the legality check fails S3; writing the cue
  before the answer fails S6's failed-send case.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-12-build')"

Test and docs only: the revert changes no product behaviour.
