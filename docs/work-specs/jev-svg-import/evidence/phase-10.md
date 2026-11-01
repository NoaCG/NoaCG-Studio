# Phase 10: Resolve absolute target times

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset AC-9, verbatim:

- AC-9: "A fixed target instant resolves input/date/zone, handles midnight/DST/past targets and
  survives updates/replay/recovery. Correct hours display and minimal mode-specific controls."
- Row 10: "Inject now/timezone: 7 pm, explicit date, past time, midnight, DST gap/fold and expired
  target. A resolved target survives resend/replay and uses the existing stamped-countdown
  contract."

Row 11 shares AC-9: the hours display (`templates/shared/matchClock.ts`), which playout controls
each mode shows and the per-mode polish are its. This row resolves, stores and carries the instant.

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.

## Pinned main

Worktree created from `fb15e6b8f6358ef8b0fad080cf71552b4da37187` (PR #1880) after a fresh fetch.
Previous verified main: `e6eadad` (row 9, PR #1888), followed by PR #1880 (the cicd run).

## Rules

Written while building, not before: the row was first scoped as a pure resolver, and the wire and
storage rules (T5-T7) came from reproducing that a resolved target could not survive a Take.

- **T1 A bare time is the next occurrence** of that wall time in the chosen zone: today while it is
  still ahead, otherwise tomorrow. The answer says it was proposed, and the import step shows the
  date and zone it chose.
- **T2 An explicit date is that day.** A past one stays expired and is never rolled forward.
- **T3 Midnight starts a day** (`00:00`, `12 am`); a bare midnight is the next one.
- **T4 A DST gap has no instant and a fold has two.** Neither resolves until the author picks:
  a gap asks for another time, a fold offers both instants by their offsets.
- **T5 The instant is the truth.** It is stored on the clock as
  `2026-11-14T19:00:00+02:00[Europe/Helsinki]` (RFC 9557); the wall time is never re-read.
- **T6 The graphic counts it as the existing stamped countdown.** The readout's `data-start` and
  the clock field's value are the seconds left at a fixed origin, one second after the epoch:
  `"<minutes>:<ss>@1000"`, a pure function of the instant (the same build is the same bytes). The
  match clock paints that minus the seconds since the origin, by the wall clock, so every output,
  reload, replay and host reads the same second, it reaches 0:00 on the instant and a past target
  shows 0:00 from its first frame.
- **T7 On the wire it is a fixed instant.** An imported clock whose `data-start` carries an origin
  is `fixedInstant`: no Take restarts it, no Out holds it, Start/Pause/Reset rows do nothing, and a
  Take or Update carrying any other value for it (an older cue, a plain time) is answered after the
  row with the graphic's own start. Count-up, duration and native clocks are the code they were.
- **T8 Its field is hidden and carries the start.** A target clock has nothing for an operator to
  correct, and a visible field would send the drawn time on every Take to a host with no wire (SPX),
  where the match clock would adopt it.
- **T9 Picking Target time proposes the next whole hour** in the author's zone, shown with its date
  and zone, so the picker never offers a clock with nothing to count to; only a resolved instant
  replaces the stored one.

## What landed

- `src/control/clockTarget.ts` (new): `parseTargetTime`, `resolveClockTarget` (T1-T4),
  `formatClockTarget` / `parseClockTarget` (T5). Pure: `now` and the zone are injected.
- `src/templates/behaviours/clock.ts`: Target time in `CLOCK_PICKER_MODES`; `clockReadout` takes the
  stored target; `clockTargetStart` (T6).
- `src/control/matchClockWire.ts`: `fixedInstant` on the spec and its row rule (T7).
- `src/templates/importedDesign/designTypes.ts`: `DesignSvgClock.target`.
- `src/templates/importedDesign/artworkFields.ts`: the target passed to `clockReadout`; the hidden
  field (T8).
- `src/components/wizard/import/draft.ts`: `SvgClockDraft.target`, carried by `svgClockOption`.
- `src/components/wizard/import/BehaviourSection.tsx`: the time, date and zone input shown only for
  Target time, the line naming the instant, the fold choice when one arises (T9).
- `scripts/clock-target.test.mjs` (new): every resolver case with injected `now` and zones, T6 and
  T7 against the wire's own functions, and a built graphic on a driven clock over two hosted
  outputs (one 700 ms behind) and one host with no wire, through a resend, a plain time sent over
  it, a reload ten minutes on, an Out, a second Take and past the instant.

## Decisions and traps

- **Departures, reconciled with the coordinator before the edit:** `matchClockWire.ts`,
  `designTypes.ts`, `artworkFields.ts` (the pass-through, then the hidden field), `draft.ts`,
  `BehaviourSection.tsx`, and the pre-approved `scripts/jev-svg-contract.test.mjs` and
  `e2e/import-svg-behaviour.spec.ts` picker expectations (3 to 4 options, and the new input's walk).
  Reason: the three listed files could not make an instant survive a Take (row 9's wire restarts
  every imported clock counting down) or persist one, and the picker can offer Target time
  honestly only with its input.
- **The stamp is a fixed origin, not a resolution time.** A compile-time `Date.now()` would make
  every build different bytes; the epoch origin keeps the start a function of the instant and is
  before any moment a graphic is read. Its minutes are large in the wire value, never on screen.
- **Hours are shown as minutes until row 11** (`219:30` for 3 h 39 min 30 s): the match clock's
  formatter is row 11's file, and its minute/second wire parsing is unchanged.
- **A target time saved without an instant** (no such draft exists: the picker never offered it)
  still compiles as rows 7-9 did, counting down from its drawn time on Take.
- **Templates import nothing from control**, so the stored form is read in `clock.ts` too; the test
  pins the two readers to the same instants.
- Trap: commit messages carry no co-author trailer; the command guard refuses one.

## Verification on this worker

Recorded in the pull request, with the commands and results.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-10-build')"

The revert takes Target time out of the picker. A graphic published with a target keeps its
compiled html and counts to its instant on a host with no wire; on the hosted wire a Take would
restart it from its stamped start's minutes, so republish such graphics after a revert. Revert
row 11 first if it has landed.
