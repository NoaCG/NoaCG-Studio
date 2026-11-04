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
- `src/control/matchClockWire.ts` (C5), `src/control/airState.ts` (the target seed of H1a, the
  imported-clock monitor only),
  `src/control/clockTarget.ts` (C7): the pre-approved boundary, each with a test that failed first.
- `src/components/wizard/import/BehaviourSection.tsx` (C8).
- Tests: `scripts/imported-clock-wire.test.mjs` (C5), `scripts/air-state.test.mjs` (H1a seed),
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
- **Left open:** #1891 (the monitor forgetting an off-air imported clock on reload), #1906: the
  reseed from the report (C6) was withdrawn after the Codex review on `4cee560` showed the report
  can predate an Out and an off-air edit, and the rows after it are fetched only for on-air
  graphics (`hostedControl.ts` `bootMonitorReplay`, outside this row). The first half of #1890 (a Reset or Pause before the first Take), #1903: see the
  review rounds. #1884 item 1 (the same length typed twice off air) is a product decision: whether
  an off-air Take counts the length or the field's last sent value; rows 9 and 10 and #1891 assume
  the length. #1884 item 2 (re-fit as the clock ticks) lives in `svg.ts` `importedClockJs`, beyond
  this row's one approved call site. The fold-at-Finish half of #1894's comment (an author already
  past the step does not see the fold question) needs `draft.ts` or the Finish step, outside the
  boundary; the step itself now asks. Filed as #1898.
- **Review rounds, in order.** All three found one family: readers of a host's painted text.
  - `/check` review: the hours text a host reads back parsed as minutes; the off-air monitor seed
    must take only a wire value (C6, later withdrawn); the "still counts to" line must name the instant in its own zone.
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
  - Final /so (`session_017SdbwR5541AfgyH9pyJeu6`, A on `4cee560`).
  - Codex on `4cee560` (P2): the off-air seed (C6) adopts a report older than an Out and an off-air
    edit. Confirmed; C6 needs `hostedControl.ts`, so it is withdrawn (#1906), not patched.
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

## Follow-up: the clock wire and the monitor (#1889, #1903, #1906)

After the run, on `4e6b1114` (PR #2067 landed: server-instant stamping, `clockFollower`, both
exported pages carrying the wire's decision). One owner, branch
`claude/fix-clock-wire-1889-1903-1906`. #1884 item 1 (the same length typed twice off air) waits
on the owner's decision whether an off-air Take counts the length or the field's last sent value,
and is not touched; #1884 item 2 (re-fit as the clock ticks) belongs to `importedClockJs`, which
another follow-up owns.

### Rules, stated before the code

Risky scenario (reload and recovery rules change). Each line is observable.

- **W1 (#1889) A native clock's value says what the cue last sent.** Once a clock row has moved a
  native clock (Start, Pause, Reset, a correction while it runs), its wire value has the imported
  clock's shape, `time@slot/length/sent`, with the design's reset time as its length. A resend of
  the cue's time (equal to `sent`) moves nothing: Start, Pause, then a score Update leaves the
  clock at the paused time on air, on the program monitor and after a reload. The same holds
  running (a Pause, a Start, then a score Update does not pull it back to the cue's time).
- **W2 A typed time is still a correction.** Held, the clock holds at the typed time. Running, it
  runs on from the typed time, counted from the update row's instant, and a reload shows it
  running (before, the wire banked it held, so a reload showed it stopped). The Update keeps its
  fast road (the owner's slow-road decision covers imported clocks only), so live outputs count
  from their own arrival as the native runtime always did, and a reload counts from the instant in
  the report it boots from (the reporting renderer's arrival) or, replaying the row, from its server
  time: they can differ by the fast road's lead, under a second.
- **W3 Out and Take of a native clock.** Out leaves the clock as it stands, as before; the next
  Take resends the cue's time, which moves nothing. The program monitor keeps a native clock's
  value through an Out, as every output does (`airState.ts` `programItems` drops the line that
  forgot it, which made a re-Take on the monitor read the cue's time while air kept the clock), and
  is sent the value it holds rather than the cue's resend for every match clock, native included
  (the same function's staging, which did that for imported clocks only).
- **W4 Values written before this change still read.** A plain or `time@origin` native value reads
  as it did; the next clock row writes the new shape. A value banked before the change does not
  know what the cue sent, so the first resend after a Pause that spans the deploy can still jump
  once.
- **W4b A host that reports painted text keeps the old fault (known limit, follow-up).** A
  `hostedReceiver.ts` host applies the log's rows as they came and reports its layer's text
  (`harvest`), so its own template judges a resend by itself, and a reader booting from such a
  report gets a bare time. Moving `harvest` to the wire value is the fix #1903 names; it is outside
  this change and filed as its own issue.
- **W5 Every reader of a native value reads the new shape.** The template runtime's parsers stop
  at `@` and read the origin as a number that ends at `/`; the dashboard, the hosted page and both
  exported pages show the plain time; the exported pages' copy of the decision changes with the
  TypeScript and stays pinned equal (scripts/clock-page-wire.test.mjs). A package exported before
  keeps its own page script and its old native values; its own templates read both.
- **N1 (#1903) An imported duration never taken is off air.** Durations only (`startsOnTake`): a
  count-up or a native clock has no Take to wait for. A reader whose held value for the clock is
  ABSENT (nothing sent, nothing reported) AND which does not show the graphic on air (the
  renderer's own `onAirHere`, the monitor's ON AIR marker) holds the design's start time in the
  off-air slot before it folds the row (`clockHeldBeforeRow`). So a time typed before the first
  Take is the length, a Reset or Pause before the Take keeps it so, and the first Take counts the
  time in the field (type 0:45, Reset, type 0:50, Take: the clock counts 0:50). A graphic on air
  with nothing held (a lost report, a boot that put a layer up from its head) reads as before.
- **N2 A bare value still reads as on air.** Only an absent value is "never taken". A host that
  reports the painted text (`hostedReceiver.ts` `harvest`) still produces bare values while on
  air, and those read exactly as before (phase-11 H1b).
- **N3 The exported pages keep their own rule (known limit, follow-up).** The standalone panel and
  the production controller are the only senders their relay has, and they do not yet say whether
  a graphic is on air to their clock fold; a Reset before the first Take there behaves as before.
  Filed as its own issue.
- **M1 (#1906) The program monitor reseeds an off-air clock on reload.** For every match clock
  (native or imported, not a target time) whose graphic is off air and has a renderer report with
  a baseline, the monitor's clock memory is that report's value folded through the rows after the
  report, in log order (`clockAfterRows`: `clockValueAfterUpdate`, then `clockRowEffect`), exactly as
  a renderer rebuilds it. The next Take on the monitor counts what air counts. Those rows are read
  APART from the on-air layers' rows (`bootClockReplay`), so an old off-air report can never make
  the on-air read too long to finish.
- **M2 A clock the page moved meanwhile keeps the page's memory.** If a command was applied while
  the resolve was out, the off-air reseed is skipped, as the on-air replay is.
- **M3 No report, no reseed.** An off-air clock with no report, one whose report carries no
  baseline, or one whose rows were not read to the head, stays unseeded, as today. The on-air
  replay stands either way.

### Rules review

A fresh read-only `/so` on the rules alone (`session_017SdbwMomDi8u9wA1JakUvM`, on `ddf71327`):
AGREE WITH CORRECTIONS, B. Its four corrections, all taken before the code was committed: N1
decided from the reader's own on-air record and limited to durations; the off-air rows read apart
and failing alone (M1, M3); the monitor's staging and Out lines named (W3); the painted-text host
named as a limit (W4b).
