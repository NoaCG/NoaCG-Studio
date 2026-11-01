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

- **S1** `+1` moves its team's figure by exactly one, counted from air, and lights that team's
  flash. A second `+1` during the flash adds one more point and plays one more pop. A `+1` whose
  figure is bound to shared production data (no figure rides the press) lights its team at the
  press; the figure arriving later as data moves nothing.
- **S2** `-1` takes the point and the flash down. A figure typed up or down (an Update, no event)
  never awards: the flag does not move, the flash stays on the team that scored, no pop plays.
- **S3** An event with no arrow from the current state (Clear flash with nothing up, Full time at
  full time, an unknown event) is dropped before its payload lands; the surfaces grey the same
  button (`eventLegality`).
- **S4** Clock rows (Start, Pause, a typed correction, Reset) and Full time leave the figures and
  the lit flash alone and replay nothing. Score rows, Full time and New game leave the clock
  running from its origin. New game zeroes the figures and clears Full time and the flash. Out and
  Take keep the figures; a Take starts with no moment up.
- **S5** An output that missed rows and caught up agrees with one that saw them all: figures,
  flash, Full time and the clock's second. A snap recovers the moment without replaying it.
- **S6** At the surface, the recipe's own `+1` through the real `pressSend`: the cue is written
  only after the event went; a failed send writes neither the cue nor the shared value; an event
  that went while its shared value did not move answers "The shared value did not move", distinct
  from a failed send.

## The defects, and the repair

Test first on `7030eb1` (commit `d87a238`), four failures with one cause: which team scored was
guessed by the renderer from the figure that rose last, on every repaint, and a pop played on
every state repaint.

1. A figure typed up during another team's flash moved the flash to the typed team.
2. Clock Start, Pause, Reset and Full time replayed the scorer's pop; so did a snap.
3. A `+1` bound to shared data lit no flash at the press (its figure was not there yet).
4. (D2, not repaired) An output rebooted from its report shows `flag/shown` with no team's flash.

Repair (`eed5b89`), approved by the coordinator as a departure from the row's list:
`src/templates/importedDesign/behaviourRuntime.ts` and its one call site in
`src/templates/importedDesign/behaviour.ts`.

- **The press says who scored.** The machine's own controls name the figure each event adds to
  (`adjust`, the `+1`s). The runtime reads that once and latches the scoring row when that event's
  transition fires. A figure that rose is no longer a reason to latch.
- **A moment pops on its own entry.** The runtime wraps the interpreter's global `noacgFire` from
  the design-owned JS (as `svg.ts` wraps `startMatchClock` for a duration), notes each group
  entered, and a pop rule that names states pops only when one of its groups was entered since the
  last state repaint. The flag's self-transition is an entry, so a second `+1` still replays.
- **Emitted only for a board with a number figure** (`withAwards`, the score recipe), like
  `withClock`. Every other graphic's runtime is byte-identical.

## Limit: #1908 item 2

A reconnect that replays missed rows agrees with the live outputs (S5). A reboot from a report
does not: the report carries the data and the machine's groups, and which team scored lives in
the page. A rebooted output shows the flag up with no team lit until the next `+1`. Carrying it
means a new key in the report that every receiver passes back to the snap (`output/main.ts`,
`hostedReceiver.ts`, `receiverScript.ts`, `localReceiver.ts`, `realtimeControl.ts`) and that every
surface reading `groups` would see. That belongs with the owner of the report shape, not this row.

## Blast radius

- **Native templates:** unchanged. `node scripts/check-catalog-emit.mjs`: PASS, 528 designs equal
  to their baseline.
- **jev-svg baseline:** unchanged (`scripts/jev-svg-baseline.test.mjs`, 19 pass). The development
  fixtures propose no score recipe.
- **Corpus records:** exactly two `emit.js` hashes move, both score boards, in
  `scripts/fixtures/svg-corpus-passes.json`; the `.expect.json` sidecars do not change. Proven by
  running the harness on this machine with main's two source files restored and with the fix: the
  machine's own differences (its browser's parser messages and markup hashes) are identical in both
  runs, and the fix adds only those two.
- **Saved graphics:** a saved graphic stores its `html`, `css` and `js` as text, and the only path
  that assembles an imported SVG is the import wizard's draft (`draft/core.ts`,
  `svgDesignOptions`). A saved score board keeps the runtime it was saved with until its author
  builds it again in the import step. No stored format changes, no migration.
- **The interpreter** (`animRuntime.ts`) is untouched, so no interpreter version or legacy hash.

## Decisions and traps

- **The wrap preserves `this`, both arguments and the return value** (`apply(this, arguments)`),
  pinned by a test that calls it with a probe `this`. Mutation-checked: each of the five new rules
  (no typed latch, pop on entry, award latch, entries noted, entries spent) fails a test when
  removed, and dropping `this` or the return value fails the wrap test.
- **Flash layers are added in memory, not to the fixtures.** Row 2 froze the corpus, and none of
  its unfamiliar score files draws a flash. The added groups have generic ids (`object8`).
- **The renderer's report takes an event's payload without asking the graphic**
  (`output/main.ts`, "event payloads merged optimistically"), so a payload riding an event the
  graphic drops would still reach the report. The score board cannot reach it: every event that
  carries figures has an arrow from every state, and the surfaces grey the rest. Recorded, not
  changed; the test's outputs merge the same way.
- **The test's two-output harness repeats part of `imported-clock-wire.test.mjs`'s** rather than
  sharing it: extracting one would reshape row 9's landed test for no behaviour.
- Trap: `controlModel.ts` imports without extensions, so a Node test importing it needs the
  resolve hook `scripts/graphic-verbs-walk.test.mjs` uses.
- Trap: a board can draw numbers that are not team figures (`scoreboard-3.svg`'s year). Take the
  figures from the `+1` buttons' `adjust`, not from every number field.
- Trap: `svg-import-passes` must not be re-recorded with `UPDATE_SVG_CORPUS_PASSES=1` on a machine
  whose browser differs from CI's: it would rewrite every file's inventory and bind records. Edit
  only the records the change moves.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-12-build')"

The revert brings back the guessed latch and the pop on every state repaint for newly built score
boards; saved boards keep the runtime they were saved with either way. No stored format changes.
