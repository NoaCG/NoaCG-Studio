# Phase 11: Expose only the selected clock controls

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-8: "One instanced imported clock coexists with a score full recipe, with one new-import Clock
  choice and unchanged saved countdowns; it reuses match-clock runtime/wire;
  up/down/start/pause/reset/correction, field identity and recovery work without native
  regressions. Duration starts on Take."
- AC-9: "A fixed target instant resolves input/date/zone, handles midnight/DST/past targets and
  survives updates/replay/recovery. Correct hours display and minimal mode-specific controls."
- Row 11: "Test count-up manual start, duration start-on-Take and target-time display/edits.
  Preserve native defaults; hours formatting must not break minute/second wire parsing. No live
  mode selector, or Pause/Reset for an absolute target."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.

## Pinned main

Worktree created from `2518b42919123eefd876259f6ba009999ed2b2b4` (row 10, PR #1893) after a fresh
fetch. That is the previous verified main.

## Rules

Ordinary scenario for the controls and the paint; the three carried wire, monitor and resolver
fixes each narrow one existing rule, stated here as observable lines.

- **C1 Controls per mode, as declared (`clock.ts` `controls`).** Counting up and a duration show
  Start, Pause and Reset (Pause greyed while held, by the machine); a target time shows none. No
  surface offers a mode switch on air: the mode is the author's, chosen in the import step.
- **C2 Counting up waits for Start; a duration starts on the Take** (its entrance calls).
- **C3 A target paints hours from an hour** (`3:39:30`); under an hour it reads as every match
  clock does (`59:59`). Only the paint: the field, `data-start` and the wire keep
  `<minutes>:<ss>`, which every parser reads (`clockValueAt` still answers `219:30`). Native boards
  keep `67:00`: `matchClockJs(prefix)` without `hours` emits the same bytes as before.
- **C4 (#1890) A duration never taken is off air.** Before its first Take a Reset or a Pause writes
  the off-air slot, so a time typed after it is the length the Take counts.
- **C5 (#1890) "An edit equal to the time shown" holds only for a held clock.** While a clock runs,
  its value's time is the time it started from; typing that time sets the clock back to it, from
  the update row's server time.
- **C6 (#1891) The program monitor remembers an off-air imported clock across a dashboard reload**
  from the renderer's report, unless it already holds a newer value. Native clocks are still
  forgotten on Out.
- **C7 (#1894) A bare time in a DST gap already behind the zone's clock is tomorrow's.** One still
  ahead today is today's gap; a dated gap stays a gap.
- **C8 (#1894) The import step's line says what the clock still counts to** while the input does
  not resolve (a skipped time, an invalid time or date, an unpicked fold), and an undated proposal
  whose next occurrence the clocks repeat offers the fold choice instead of keeping its past
  instant silently.

## What landed

- `src/templates/shared/matchClock.ts`: `matchClockJs(prefix, { hours })`, the hours formatter.
- `src/templates/importedDesign/svg.ts` (outside the row's list; see Decisions): passes `hours` for
  a target time only.
- `src/templates/behaviours/clock.ts`: the header says what row 11 adds; the controls were already
  per mode, so no code change there.
- `src/control/matchClockWire.ts` (C4, C5), `src/control/airState.ts` (C6),
  `src/control/clockTarget.ts` (C7): the pre-approved boundary, each with a test that failed first.
- `src/components/wizard/import/BehaviourSection.tsx` (C8).
- Tests: `scripts/imported-clock-wire.test.mjs` (C4, C5), `scripts/air-state.test.mjs` (C6),
  `scripts/clock-target.test.mjs` (C7, painted text before the Take, taken and past the instant,
  and hours on the built graphic), `e2e/playout-clock.spec.ts` (C1-C3 on the production page, and
  the target edit line in the import step).

## Decisions and traps

- **`svg.ts` was touched for one call site.** The match clock's formatter is emitted by
  `matchClockJs`, which only the imported assembler calls for an imported clock. Asking for hours
  there keeps native bytes and catalog baselines unchanged; a runtime attribute check in the shared
  formatter would have changed every native board's emitted runtime and needed a baseline
  re-record. Raised with the coordinator before the edit; the PR says so.
- **The existing target test's expected text changed from minutes to hours** (`left()` in
  `scripts/clock-target.test.mjs`): phase 10 recorded minutes as the interim form "until row 11".
  The wire assertion (`219:30`) is unchanged, which pins C3's "only the paint".
- **Left open:** #1884 item 1 (the same length typed twice off air) is a product decision: whether
  an off-air Take counts the length or the field's last sent value; rows 9 and 10 and #1891 assume
  the length. #1884 item 2 (re-fit as the clock ticks) lives in `svg.ts` `importedClockJs`, beyond
  this row's one approved call site. The fold-at-Finish half of #1894's comment (an author already
  past the step does not see the fold question) needs `draft.ts` or the Finish step, outside the
  boundary; the step itself now asks. Filed as #1898.
- **Review round (`/check`):** the hours text a host reads back from the layer
  (`hostedReceiver.ts` `harvest`) parsed as minutes, so the hours runtime now parses "3:39:30" as
  hours (native clocks unchanged); the off-air monitor seed takes only a wire value; the never-taken
  rule applies to Reset and Pause only, so an Out still banks a plain value; the "still counts to"
  line names the instant in its own zone. Each has a test.
- **First /so (`session_017SdbwM6keZWcg48A7omhot`, grade B on `380356c`):** a host that reports
  painted text seeded the dashboard's monitor with "3:39:30" for a target (read as 219 s) and with a
  plain duration that the never-taken rule (C4) then read as off air on a Pause. Same family as the
  review round's hosted-text finding. Fixed at the one place both enter, the on-air seed
  (`airState.ts` `importedClockSeed`): a target seeds its own stamped start, a plain duration seeds
  as held on air, as it read before C4. Test first in `scripts/air-state.test.mjs`.
- A local fail-then-pass in four `import-svg-behaviour` export tests (the export window not open
  within 7 s under load; no code in reach changed) is filed as #1897.
- Trap: commit messages carry no co-author trailer, and the command guard scans a whole command,
  heredocs included, for chat or tool names: write a file and commit in separate commands.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-11-build')"

The revert paints a target's hours as minutes again and restores rows 9 and 10's wire, monitor and
resolver behaviour. No stored format changes, so nothing published needs republishing.
