# Phase 7: Persist the clock instance and profile

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset AC-8, verbatim:

- AC-8: "One instanced imported clock coexists with a score full recipe, with one new-import Clock
  choice and unchanged saved countdowns; it reuses match-clock runtime/wire;
  up/down/start/pause/reset/correction, field identity and recovery work without native
  regressions. Duration starts on Take."
- Row 7: "Persist the new clock as an instanced, namespaced recipe: one score full recipe plus one
  clock must compile under the unchanged one-full-recipe guard. Reject duplicate clocks and
  namespace collisions. New-import picker shows one Clock choice with selected modes. Existing
  saved countdown graphics retain countdownRecipe, their engine, field identity, warning/expiry
  paints and start-on-Take/hold-at-zero behavior; reopening or reimport does not auto-migrate or
  run two engines."

This row owns the persisted instance, its compile and the picker. The readout's runtime binding
is row 8, the namespaced wire and recovery row 9, the target instant row 10 and the per-mode
control polish row 11; until row 8 lands, a new Clock's buttons compile and find no runtime.

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.

## Pinned main

Worktree created from `874c589b4df4449ba8819c784c6d1da983d33166` (PR #1870) after a fresh fetch.
Previous verified main: `874c589b`: merge-group CI (41237608460), push CI (41238346168),
configured-suite (41238346240), Post-landing (41238346154), Quarantine (41238346163), Push on
main (41238345988) and deploy-verify (41238548569) all succeeded.

## Rules

- **C1 One full recipe, one clock part.** The clock is an INSTANCED recipe (`clock`), persisted as
  `DesignSvg.extras` `{ kind: 'clock', name: 'Clock', field: <candidate id>, mode }`. It composes
  beside a score tracker (or any one full recipe) through `composeParts`; the one-full-recipe
  guard is the same code as before. Its group (`clock_clock`), events (`clock_start`,
  `clock_pause`, `clock_reset`), field (`clock.clock.clock`) and option (`clock.clock.mode`) are
  namespaced. Its group is the scorebug's own match-clock group (armed, running, stopped) read from
  the catalog type, so its calls are `startMatchClock`, `stopMatchClock` and `resetMatchClock`.
  Field identity: the clock role binds the ticked time layer's own field; the clock owns no hidden
  field.
- **C2 The mode is the author's and is persisted.** Count-up rests armed and waits for Start. A
  duration rests running and its entrance resets and starts it (start on Take). A target time has
  one running state and no Pause or Reset. An unknown mode reads as count-up.
- **C3 Refusals.** A second clock part, or a clock beside the countdown recipe, is refused (one
  clock runtime per graphic, never two engines). Any two parts that would share a group, event,
  field key, row set or option name are refused, whatever their recipes. A clock whose time layer
  is no longer a field binds nothing.
- **C4 Saved countdowns are untouched.** A `timer` behaviour compiles to the same bytes as on
  `874c589b` (table, runtime, fields, holders, type, steps). Nothing converts a timer into a clock,
  and the draft never emits a clock beside the old engine: a timer behaviour, a file whose names
  propose the countdown, or any ticked row bound as a countdown (`svgClockRows`).
- **C5 One clock choice per import.** The behaviour section offers a Clock select (No clock and
  the three modes) on the ticked rows whose sample reads as a time, plus a Time layer select when
  there is more than one. The old Countdown is offered only where the file's names propose it (it
  drew the moments only the countdown paints) or the draft already holds one; then the Clock is
  not offered. The graphic carries a clock only on a row the step offers, so a clock the step no
  longer shows is never built. The clock is chosen, never proposed from a name.
- **C6 A clock belongs to its artwork.** Row ids are positions in one markup, so a stored clock
  binds only on the revision it was chosen on; any other drop reads as no clock.

## What landed

- `src/templates/behaviours/clock.ts` (new): the instanced recipe, `CLOCK_MODES` and `CLOCK_NAME`.
- `registry.ts`: `recipeById` finds the clock. It is NOT in `BEHAVIOUR_RECIPES` yet (decision
  below), so the name proposal, the proposal contract's role table and the example gate do not see
  it.
- `designTypes.ts`: `DesignSvgClock` in the `DesignSvgExtra` union.
- `behaviour.ts`: the clock binding, instanced options under their namespace, and
  `refuseCollisions`.
- `draft.ts` (reconciled with the coordinator at 20:46Z, outside the row's list): the optional
  `svgClock`, `svgClockRows`, `svgCountdownDrawn` and `svgClockOption`, the clock in
  `svgExtrasOptions` and one summary part. The stored clock carries the artwork revision it was
  chosen on, the rule row 5's `svgApplied` already uses: on other artwork it reads as no clock, and
  the same file dropped again keeps it (row 6 rule S3). So no drop, clear or keep path changed, and
  no pinned draft record either.
- `BehaviourSection.tsx`: the Clock and Time layer selects; the Countdown option only per C5.
  Choosing a row for the clock sets that row's kind back to text.
- `scripts/jev-svg-contract.test.mjs`: five tests, C1 to C5, through the real compiler, the
  machine compiler and the machine validator.
- `e2e/import-svg-behaviour.spec.ts` (reconciled, outside the row's list): one new test, the
  Clock walk on `score-clock-1.svg`, then the countdown file keeping its one choice. No existing
  test or assertion changed.

## Decisions and traps

- **Example gate.** `scripts/check-svg-example-coverage.mjs` requires every id in
  `BEHAVIOUR_RECIPES` to have an Illustrator source set, which a cloud worker cannot author. The
  clock is registered through `recipeById` only; moving it into the list is one line once the
  owner's Illustrator clock example exists: #1875.
- **The countdown is kept where the file drew for it.** The new clock paints no drawn moments yet,
  so a file drawn with a drain bar, last-stretch and time-up plate keeps the countdown, which paints
  them. Every other new import gets only the Clock.
- **The field row's own Countdown kind** (MapSvgFieldsStep, a clock-shaped row's Text or Countdown
  choice) is outside this row's files and still offers the old engine on a single layer: #1876. The draft never emits a clock on such a row (C4).
- **Target time is offered now**, as the contract's third mode; its instant is row 10. Count-up
  and duration need row 8's runtime too.
- Trap: commit messages in this repo carry no co-author trailer; the command guard refuses one.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-7-build')"

Saved graphics keep their compiled html, which nothing rebuilds from options; a wizard draft
holding a clock simply loses it. Revert row 8 first if it has landed. No saved countdown depends
on this row.
