# Phase 9: Adapt clock events and recovery

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset AC-8 and AC-10, verbatim:

- AC-8: "One instanced imported clock coexists with a score full recipe, with one new-import Clock
  choice and unchanged saved countdowns; it reuses match-clock runtime/wire;
  up/down/start/pause/reset/correction, field identity and recovery work without native
  regressions. Duration starts on Take."
- AC-10: "Score changes preserve clock origin; clock changes preserve scores/effects. Existing
  +1/−1/flash semantics, reset scope and lifecycle are tested."
- Row 9: "Prove namespaced start/hold/reset effects and server-time anchoring on two outputs,
  reload and reconnect. Unrelated updates must retain the origin; existing native clocks remain
  compatible."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.

## Pinned main

Worktree created from `562452968ee7e1bd271329420d153b93b1912510` (PR #1883, row 8) after a fresh
fetch. Previous verified main: `5624529` (row 8).

## What was wrong on `5624529`

Reproduced with the real built `score-clock-1.svg` graphic on a driven clock:

- The wire (`control/matchClockWire.ts` `clockRowEffect`) read only the native verbs
  `clockStart`, `clockStop` and `clockReset`. An imported clock's `clock_start`, `clock_pause` and
  `clock_reset` got no server stamp, no banked hold and no banked reset: each output started from
  its own arrival time, and a reload came back at whatever the cue last sent.
- A duration starts on Take through its entrance's time-0 calls, which run on the entrance's first
  animation frame, after anything written beside the play row, so its count was always the
  renderer's own.
- A duration's length lived only in the graphic's `data-start`, which a reload resets to the drawn
  time and which no row carries once a Pause has banked another time.

## Rules

- **W1 The wire knows each clock by its verbs.** A clock spec read off an imported design
  (`.imported-design-clock`) carries `events` (`clock_start`, `clock_pause`, `clock_reset`) and
  `startsOnTake` (it counts down). A native spec carries neither and is exactly what it was. The
  recipe's names and the wire's are written once in each layer (the layers keep control and
  templates apart) and pinned equal by `scripts/imported-clock-wire.test.mjs`.
- **W2 Start, Pause and Reset are the match clock's.** Start stamps the event row's server time
  before the event; Pause banks the derived time after it; a count-up's Reset banks the drawn time.
  Two outputs read the same second, and a reload or a reconnect comes back to it.
- **W3 Unrelated rows leave the clock alone.** An update resending the cue's time keeps the
  origin; a score's +1, −1 or New game moves the scores and the flash and never the clock; a clock
  row never moves a score or the flash. New game does not reset the clock.
- **W4 A duration is stamped by its Take, and marked off air by its Out.** Before the play, the
  wire writes the length, stamped with the row's time: `0:30@<take>/0:30/0:30`. A paused, reset or
  run-out clock is taken from the top, as the graphic's entrance does. The graphic keeps the origin
  the wire last stamped and its entrance's start counts from it (`importedClockJs`, duration only),
  off air or on a re-take, so every output counts the same second from the first frame. A playout
  host with no wire still starts from now, as before. The Out writes the time shown, held, marked
  off air (`0:12@out/0:30/0:25`), running or not: the wire cannot see on air from off air.
- **W5 An imported clock's value carries its length and what the cue last sent.** After the origin,
  where every existing reader already stops: `time@slot/length/sent`, on count-ups and durations
  alike (count-up's length is its drawn time). Every Update resends the cue's whole value set, and
  after a Pause or a correction the cue no longer holds the clock's time, so a resend is the time
  the cue last sent, never a comparison with the clock's own state. A cue edit equal to the time
  shown changes nothing on air but becomes what was sent. Anything else is the operator's: off air
  (slot `out`), it is the new length at once, as row 8's graphic takes it; on air it is a
  correction that leaves the length alone, held where held, and where it runs running on from the
  update row's own server time (the merge marks it `@0/`, the row's effect stamps it). Pause, Start
  and Reset carry the length; Reset returns to it, on air or off. The graphic takes its
  `data-start` from it. The program monitor (`control/airState.ts`) keeps an imported clock's
  value through an Out and is sent the value it holds, as the renderer is, so the two never
  disagree. Off air, any time other than the one last sent is the new length.
- **W6 Native clocks are unchanged.** No native value ever carries a length, so every native path
  through `clockValueAfterUpdate` and `clockRowEffect` is the code it was.

## What landed

- `src/control/matchClockWire.ts`: `events` and `startsOnTake` on an imported clock's spec;
  `clockLengthOf`, `durationValue`; `clockValueAfterUpdate` keeps a duration's length; the
  duration's own row effects (`durationRowEffect`), Take included.
- `src/templates/importedDesign/svg.ts`, duration branch of `importedClockJs` only: the length
  read off the wire value into `data-start`, the Take's origin kept while off air, and
  `startMatchClock` wrapped to adopt it.
- `scripts/imported-clock-wire.test.mjs` (new): two outputs 700 ms apart on the renderer's command
  path (`output/main.ts` order: update merge, effect before or after, event instant, boot as data,
  snap, data), a reload from a report, a reconnect replaying missed rows; the imported count-up,
  the native house scorebug through the same walk, and a duration.
- `e2e/configured/scorebug-output.spec.ts`: a second walk, an imported count-up on two real
  `/output` pages over the hosted log: one origin on both after Start, kept through a typed score
  and a reload of one output, then Pause and Reset on both.

## Decisions and traps

- **Departure, reconciled with the coordinator: `svg.ts`.** The row's list does not name it. The
  Take's origin and the length cannot reach the graphic from the wire alone (the entrance mints its
  own origin on its first frame; the length lives only in the graphic). The coordinator allowed the
  duration branch of `importedClockJs` only. Every build but a duration is byte-identical to
  `5624529` (71 corpus files as dropped, every count-up and target-time build), and row 7's pinned
  entrance calls are unchanged: the start is wrapped rather than renamed.
- **A duration's length is a time typed off air, on the wire as in row 8's graphic.** A time
  corrected on air never becomes the length: after "correct on air, Out, Take" the next count is
  the length, while the operator's field still shows the correction until they type again.
- **The length rides after the origin, not in a second field.** One wire value is what the wire,
  every report and every page already hold; a second field would be a new operator field and a
  new report shape. Readers that stop at `@` see the time; the origin parsers read the number
  before the slash, so a held value with a length still reads as held.
- **Rules found after coding: three review rounds on one family, then a bounded model round.**
  Rounds on `3720ea6`, `d958674` and `e8dd5da` (PR review and two fresh read-only reassessments)
  found variants of one missing rule: an Update after a Pause pulled a clock back to the cue's
  time; a re-take on air dropped the wire's origin; a running duration taken out and given a new
  length aired the old one; a score sent while a corrected duration was paused moved it; an
  imported count-up paused and resent jumped back (a regression against row 8, whose wire banked
  no imported pause); a cue edit equal to the time shown hid the next edit; a correction typed
  while paused on air became the next length; the program monitor forgot an imported clock on
  Out, and was sent the cue's time rather than the merged one, so a resend reset a paused clock
  there; and a length typed off air equal to the time banked at Out was read as no change. The model that closes them is W4 and W5: every imported clock remembers what the cue last
  sent, and the Out says the clock is off air. Each variant is a case in
  `scripts/imported-clock-wire.test.mjs` or `scripts/air-state.test.mjs` that fails without its rule.
- **Departures reconciled with the coordinator: `src/control/airState.ts` and
  `scripts/air-state.test.mjs`.** One line: on an Out, the monitor keeps an imported clock's value
  instead of forgetting it, so it holds what air holds; one test compares the monitor with air's
  own decision row by row. The native monitor tests pass untouched.
- **A Take of a duration already on air is a new count of its length** on every output (pinned by
  the re-take case). A score is sent with Update, which leaves the clock alone (W3).
- **Typing the time a clock already shows** while paused is no change on air, only a new value the
  cue sends; typing the length while paused on air is a correction, never a new length.
- **A duration compiled under row 8 and published before this row** reads only a bare time as its
  length, so once the wire carries lengths (after its first Take here) a new length typed off air
  is not taken: it counts from the old length. Republishing the graphic fixes it. Only imported
  durations published between row 8 (`5624529`) and this row are affected.
- **A target time also starts on the Take on the wire.** It counts down from its drawn time until
  row 10 resolves its instant, and its entrance already adopts a stamped origin.
- **Out of reach here, filed (#1886, #1887):** a Take may ride the fast road, which carries no server time, so on
  the hosted road a duration's Take stamp is each renderer's arrival instant (synced machines agree
  within the fast road's spread); Start, Pause and Reset are exact. The exported control page and
  the production controller page keep their own copy of the native decision and do not yet press
  the namespaced verbs' effects. A correction typed while a NATIVE clock runs is still banked held,
  as before this row (W6 keeps every native path as it was).
- Trap: the corpus harness `scripts/svg-import-passes.test.mjs` fails the same four records
  (inventory, bind, emit, runtime) on `5624529` and on this branch on this cloud image (#1647); CI
  runs it on the pinned browser.
- Trap: a clock read where a 700 ms offset does not cross a second proves nothing about anchoring;
  the duration's first reads sit where it does, and a mutation that drops the Take's origin fails.
- Trap: commit messages carry no co-author trailer; the command guard refuses one.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-9-build')"

The revert returns the wire to native verbs only: an imported clock then counts on each output
from its own arrival and a reload loses it, as on `5624529`. A duration saved while this row was
live keeps its compiled html, whose start simply never meets a stamped Take. A wire value carrying
a length still reads as its time to every reader. Revert rows 10 and 11 first if they have landed.
