# Phase 8: Bind the existing match clock to SVG artwork

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset AC-8, verbatim:

- AC-8: "One instanced imported clock coexists with a score full recipe, with one new-import Clock
  choice and unchanged saved countdowns; it reuses match-clock runtime/wire;
  up/down/start/pause/reset/correction, field identity and recovery work without native
  regressions. Duration starts on Take."
- Row 8: "Drive existing count-up/down runtime through the imported field; preserve the
  artwork/font/transform and avoid also emitting the old countdown engine for that field."

This row binds the runtime and turns the picker on. The namespaced wire and two-output recovery
are row 9, the target instant row 10, the per-mode control polish row 11.

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.

## Pinned main

Worktree created from `d06974d30c42f504073fc810f2d1316168eb1f8d` (PR #1879) after a fresh fetch.
Previous verified main: `c469fac` (row 7, PR #1878), followed by quarantine PR #1879.

## Rules

- **M1 The readout is the time layer itself.** The clock's field is the layer's own text field
  (`fN`, a text field holding the drawn time), as row 7's C1 bound it. The bind pass adds three
  attributes to that node and nothing else: the class the match clock finds
  (`imported-design-clock`), `data-count` (`up` for count-up, `down` otherwise) and `data-start`
  (the drawn time). Its font, position, anchor and transform are the designer's; the rest of the
  markup equals the build without a clock.
- **M2 One engine.** A design carrying the clock emits the match-clock runtime
  (`shared/matchClock.ts`, unchanged) and never the countdown engine: `countdownIndex` is -1 on
  it, so a layer still flagged as a countdown binds as plain text. A design without the clock
  emits exactly what it did on `d06974d`.
- **M3 The field drives it.** `update()` hands the clock's own value to `matchClockUpdate` before
  the fit measures: a changed time corrects the clock (held stays held, running keeps running),
  a resend of the same text is painted over with the running time, and a stamped value
  (`45:00@<ms>`) re-anchors it. Counting up waits for Start; Pause holds; Reset returns to the
  drawn time, held.
- **M4 A duration starts on Take, from the length the operator set off air.** A time typed while
  the graphic is off air (the machine's main group in its off state, before the Take and after the
  Out) is also its length (`data-start`), so the next Take, and every Reset after it, counts down
  from it. On air every typed time is a correction, running or paused, and leaves the length
  alone. Only an M:SS time is a length; an empty value never is. It holds at 0:00 with the root
  marked `imported-design-expired`. Nothing counts before the Take.
- **M5 Recovery is the match clock's.** A fresh output given the running origin comes back at the
  real time. Stamping that origin on the wire for the imported clock is row 9.

## What landed

- `clock.ts`: `asClockMode` (one reading of a stored mode), `clockReadout` (the two
  attributes) and `CLOCK_PICKER_MODES` (the modes the step offers). `CLOCK_RUNTIME_READY` is retired rather than flipped: with the runtime bound
  there is nothing left to switch, and one source is no flag at all.
- `artworkFields.ts`: `boundClock`; `countdownIndex` is -1 on a design carrying the clock.
- `svgBind.ts`: the three attributes on the time layer.
- `svg.ts`: the match-clock runtime and `importedClockUpdate` for a design carrying the clock.
- `scripts/imported-match-clock.test.mjs` (new): M1-M5 on score-clock-1.svg with the score tracker,
  through the real reader, draft, assembler, validator and composer on a driven clock.
- Reconciled with the coordinator, outside the row's list (row 7 corrections and the flag's
  consumers): `draft.ts` (no `ready` parameter; a built clock's name is taken first, so a choice
  called "Clock" becomes "Clock 2" and cannot share `clock_start`; only an M:SS layer is offered
  the clock), `BehaviourSection.tsx` (no `clockReady` prop; the picker offers
  `CLOCK_PICKER_MODES`), `scripts/jev-svg-contract.test.mjs` (the shipped-state lines go, the
  numbering is pinned) and `e2e/import-svg-behaviour.spec.ts` (row 7's shipped-state walk becomes
  the live one-Clock-choice walk).

## Decisions and traps

- **The duration's length is the operator's, set off air.** The countdown it replaces for new
  imports let the operator set the length; a clock fixed to the drawn time would have been a
  capability loss. Off air is the only time that cannot be a correction to a count in progress,
  so a correction during a pause never moves where Reset returns (review finding on the first
  head). Counting up keeps the native rule: Reset goes to the drawn time, whatever it reads.
- **The target time is not offered yet.** Until row 10 resolves an instant it would count down
  from the drawn time, which is not what "Counts down to a set time" says; a control is offered
  only when it does what it says. A stored target-time clock still compiles. Row 10 offers it.
- **Only M:SS layers are offered the clock.** The import reads "1:30:00" as a time, but the match
  clock reads minutes and seconds, so it would run 90 seconds. Such a layer stays text.
- **Minutes print unpadded**, as on every native scorebug ("7:05"): a layer drawn "07:05" reads
  "7:05" once the clock paints it.
- **The painted time trails the clock's truth by up to one repaint**, as on a native board; the
  test reads `matchClockValue()` where a second matters.
- **The fit is not re-run on each tick**, only on `update()`, as for every other field.
- Trap: on this cloud image the corpus harness `scripts/svg-import-passes.test.mjs` fails four
  records (inventory, bind, emit, runtime) identically on `d06974d` and on this branch: the
  image's Chromium is not the pinned build (#1647). CI runs it on the pinned browser.
- Trap: commit messages carry no co-author trailer; the command guard refuses one.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-8-build')"

The revert brings back row 7's switched-off picker. A graphic saved with a clock keeps its
compiled html and keeps counting; a wizard draft holding one simply loses it. Revert rows 9-11
first if they have landed. No saved countdown depends on this row.
