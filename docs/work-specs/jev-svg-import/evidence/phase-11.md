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
  keep `67:00`: `matchClockJs(prefix)` without `target` emits the same bytes as before.
- **H1 Painted text says what was shown, never when** (found by review, see below). A host may
  report a clock as the layer's text (`hostedReceiver.ts` `harvest`), with no origin.
  - **H1a A target is immune to every incoming value.** Its runtime (`matchClockJs` with `target`,
    emitted for target-time only) adopts nothing written into its field: it reads its own
    `data-start` and repaints. The wire already answers any other value with the stamped start
    (T7), and the dashboard monitor seeds a target from its stamped start, never from a report.
  - **H1b Durations and count-ups read a report as before.** A hosted host that reboots restarts
    them from the reported time, and the monitor holds them at it: a limit shared with native
    clocks on hosted hosts, recorded here, not changed. The fix belongs where the report is made
    (`harvest` reporting the wire value), not in row 11.
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

- `src/templates/shared/matchClock.ts`: `matchClockJs(prefix, { target })`: the hours formatter, and
  a field write that moves nothing (H1a).
- `src/templates/importedDesign/svg.ts` (outside the row's list; see Decisions): passes `target` for
  a target time only.
- `src/templates/behaviours/clock.ts`: the header says what row 11 adds; the controls were already
  per mode, so no code change there.
- `src/control/matchClockWire.ts` (C5), `src/control/airState.ts` (C6, and the target seed of H1a),
  `src/control/clockTarget.ts` (C7): the pre-approved boundary, each with a test that failed first.
- `src/components/wizard/import/BehaviourSection.tsx` (C8).
- Tests: `scripts/imported-clock-wire.test.mjs` (C5), `scripts/air-state.test.mjs` (C6, H1a seed),
  `scripts/clock-target.test.mjs` (C7, painted text before the Take, taken and past the instant,
  hours on the built graphic, and an output rebooting from painted text an hour old, H1a),
  `e2e/playout-clock.spec.ts` (C1-C3 on the production page, and
  the target edit line in the import step).

## Decisions and traps

- **`svg.ts` was touched for one call site.** The match clock's formatter is emitted by
  `matchClockJs`, which only the imported assembler calls for an imported clock. Asking for a
  target there keeps native bytes and catalog baselines unchanged; a runtime attribute check in the shared
  formatter would have changed every native board's emitted runtime and needed a baseline
  re-record. Raised with the coordinator before the edit; the PR says so.
- **The existing target test's expected text changed from minutes to hours** (`left()` in
  `scripts/clock-target.test.mjs`): phase 10 recorded minutes as the interim form "until row 11".
  The wire assertion (`219:30`) is unchanged, which pins C3's "only the paint".
- **Left open:** the first half of #1890 (a Reset or Pause before the first Take), #1903: see the
  review rounds. #1884 item 1 (the same length typed twice off air) is a product decision: whether
  an off-air Take counts the length or the field's last sent value; rows 9 and 10 and #1891 assume
  the length. #1884 item 2 (re-fit as the clock ticks) lives in `svg.ts` `importedClockJs`, beyond
  this row's one approved call site. The fold-at-Finish half of #1894's comment (an author already
  past the step does not see the fold question) needs `draft.ts` or the Finish step, outside the
  boundary; the step itself now asks. Filed as #1898.
- **Review rounds, in order.** All three found one family: readers of a host's painted text.
  - `/check` review: the hours text a host reads back parsed as minutes; the off-air monitor seed
    must take only a wire value; the "still counts to" line must name the instant in its own zone.
  - First /so (`session_017SdbwM6keZWcg48A7omhot`, B on `380356c`): the monitor seeded a target with
    "3:39:30" (219 s to the wire), and a plain on-air duration read as never taken by C4.
  - Second /so (`session_017SdbwPva4FHMtNDapHBAwc`, B on `3def054`): a hosted output rebooting from
    an old painted report re-anchored the target to that text.
  - Repeated family, so a fresh read-only reassessment of the rules came before any patch
    (`session_017SdbwQZrQCK9A3NqCKAJgo`, accept with changes). It gave H1. It also showed that **C4**
    ("a duration never taken is off air for Reset and Pause", the first half of #1890) misreads a
    plain value from a hosted report in the `/output` renderer's boot too (`src/output/main.ts`),
    outside this row. So C4 is withdrawn, the first half of #1890 stays open (#1903), and the
    hours parse that the `/check` round added is replaced by H1a, which needs no parse at all.
  - Rules found after coding: H1, H1a, H1b. None was stated before the code.
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
