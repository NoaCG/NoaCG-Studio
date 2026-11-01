# Phase ci13: scheduled detection and recovery readiness

Row ci13 of the [cicd-improvement spec](../spec.md) (P3; AC-5). Built 2026-11-01 by the ci13
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`2314eeec9dba6c33f458db926934ea5058362efc`.

Acceptance, verbatim:

- (a) "Measure each landing's merge-to-completed-coverage delay for omitted designs and required
  contracts; preserve the existing schedule alarm and detect the oldest uncovered landing.
  Whole-catalog IDs alone do not prove all required check coverage."
- (b) "Use requested-commit identity for drills; exercise missed, failed, late and incomplete runs,
  interacting landings, culprit replay and full-scope rollback. Resolve nightly causes before
  relying on cadence."
- (c) "Record qualified only with real complete coverage within 24 hours and all drill receipts;
  otherwise record not qualified with a named blocker and existing full pre-merge catalog
  protection retained. Either assessment may PASS only if accurate and protection is preserved;
  AC-5 remains open when unqualified."

## Assessment: NOT QUALIFIED

**Named blocker: two required contracts have one carrier, the nightly, and one daily cron whose
start drifts by up to two hours cannot clear every landing within 24 hours.** Engine-floor and
the full E2E suite (every spec a scoped selection would omit) run only in `nightly.yml`. In the 14
days measured (337 landings), 15 landings waited more than 24 hours for a complete green
engine-floor verdict and 129 for a complete green E2E suite verdict, 7 of them in the nine
all-green nights after the last red one. The catalog battery itself met the bound (0 breaches,
longest 14.4 hours), but only because the midday catalog-gates pass happened to plan the whole
catalog on every day in the window; nothing guarantees that.

AC-5 stays open. Nothing is narrowed. `ci.yml`'s catalog calibration job still runs the whole
catalog whenever its flag is raised, untouched by this row and judged by ci12's guard
(`2314eeec`). The change here adds a read-only report and its tests; it removes or loosens
nothing.

What would lift the blocker (not done here, and not authorized for this row): a second complete
carrier for engine-floor and for the E2E specs a scoped selection omits, or keeping those checks
pre-merge. The 24-hour bound breaks at the landings that arrive just after a nightly has been
created, so a second run must be complete, not a start, and must follow the nightly by well
under 24 hours. The spec names "the smallest justified fallback using existing workflows or
retain pre-merge coverage"; that choice is ci16's, after ci15.

## 1. Rules (how a landing counts as covered)

These are the rules `scripts/schedule-coverage.mjs` applies and its tests pin.

- R1. A landing is a commit on `main`'s first-parent line; its time is the merge commit's
  committer time (the merge queue writes it moments before the push).
- R2. A run speaks for the commit it **requested** (`head_sha`), and only when that commit is a
  landing on the first-parent line and the run's branch is `main`. A branch run, or a run whose
  commit is not a landing, covers nothing. No ancestry inference from any other commit.
- R3. A run at landing *k* covers landings 1..*k* as **range** evidence: the combined tree, never
  an exact verdict on an earlier landing's own tree. The report counts how many were exact.
- R4. A run is **complete** for a contract when every job that carries that contract reached
  success or failure, every planned E2E shard 1..N is present, and (catalog-gates) the scope was
  the whole catalog. Cancelled, skipped, missing or timed-out-and-cancelled jobs make it
  incomplete, and an incomplete run covers nothing.
- R5. A complete **red** run is a detection, not a clearance. The strict delay waits for a
  complete **green** run. The landings in a red run's range are the culprit replay's input.
- R6. Delay = completion time of the first complete green run that covers the landing, minus the
  landing time. A breach is a delay, or a wait still open, over 24 hours. Every breach is counted;
  the maximum is reported, never a percentile.
- R7. The oldest uncovered landing is projected against the first nightly that will contain it:
  a run on `main` already going at or after it (its start plus the worst observed duration);
  else today's slot if no scheduled run has been created for it yet and the worst observed start
  delay has not run out; else the next slot. A slot's projection is its cron instant plus the
  worst observed start delay plus the worst observed duration. A deadline before that is a
  projected breach, and the repair is a nightly dispatch on `main` before the deadline.
- R8. Full scope is required (`scopeDecision`) while any breach, incomplete run, missed slot,
  projected breach or unresolved culprit replay stands.

Known limit of R4: a shard stopped by Playwright's own `--global-timeout` ends **failed**, not
cancelled, so the job list reads it as a complete red run (2026-10-15 did this). Under R5 a red
run never clears a landing, so this cannot make coverage look better; it can only make the
"first verdict" delay look shorter than the real detection.

## 2. Measurement (a), from real Actions history

Window: landings 2026-10-18T00:00Z to 2026-11-01T20:30Z (337 landings); runs on `main` from
2026-10-14. Data: 19 `nightly.yml` and 16 `catalog-gates.yml` runs on `main`, their job lists and
the 15 midday sweep logs needed to read each run's scope. 60 API calls in one pass, run and job
records cached by ID.

### 2.1 Which contracts each scheduled run carries

| Contract | `nightly.yml` (00:20 UTC cron) | `catalog-gates.yml` midday (11:50 UTC cron) | Pre-merge today |
| --- | --- | --- | --- |
| Catalog emit fingerprints | whole catalog | the plan's scope | `ci.yml`, whole catalog when flagged |
| Calibration bench (tripwire) | whole catalog | the plan's scope | `ci.yml`, whole catalog when flagged |
| type-floor, overflow, field coverage, numerals | whole catalog | the plan's scope | not run |
| engine-floor | whole catalog | **not run** | not run |
| Full E2E suite | every spec on disk | not run | the selected specs only |
| E2E time budget, traced map | yes | no | no |

Whole-catalog IDs do not prove coverage of every required check:

- `designs=all` in catalog-gates omits engine-floor and the E2E suite.
- The calibration bench does not measure the `imported-design` category (`imp01`, `svg01`) in any
  run, full or scoped (#1926; ci12 declares it as not benched).
- `l3-sweep.mjs` writes screenshots and asserts nothing; no automated run carries it.

### 2.2 Per-contract delay, every landing

| Contract (carriers) | Landings | Cleared | Breaches > 24h | Longest wait to green | After last red (180 landings) |
| --- | --- | --- | --- | --- | --- |
| Catalog battery (nightly catalog jobs or a whole-catalog midday pass) | 337 | 334 | **0** | 14.4h | 0 breaches, 14.4h |
| engine-floor (nightly only) | 337 | 324 | **15** | 24.6h | 7 breaches, 24.6h |
| Full E2E suite (nightly only) | 337 | 324 | **129** | 72.5h | 7 breaches, 24.6h |
| Whole nightly, every job | 337 | 324 | **129** | 72.5h | 7 breaches, 24.6h |

Uncovered landings are those after the last nightly (waiting, inside their deadline at
measurement time). The 129 E2E breaches fall almost entirely in 2026-10-18..22, when four of five
nights were red (section 3). The 15 engine-floor breaches are the structural ones: a landing
merged minutes after a nightly is created waits for the next night, about 24 hours plus that
night's later start plus its 18 minutes. Examples: `f393e930` merged 05:32:58 on 10-27, after
that night's run was created at 05:11; cleared 24.6h later. `a083fc29` merged 04:48:28 on 10-25,
71 seconds after that night's run was created; cleared 24.4h later.

Exact verdicts: 11 of 324 landings were checked by a nightly at their own commit; every other
clearance is range evidence (R3).

### 2.3 Start drift and cost

| Workflow | Runs | Created after cron | Wall clock | Runner minutes |
| --- | --- | --- | --- | --- |
| nightly.yml | 15 scheduled | 4.3h to 5.9h | 15.5 to 20.3 min | 174 to 251, mean 202 |
| catalog-gates.yml midday | 15 scheduled | 3.0h to 5.9h | 12.3 to 13.3 min | 22.0 to 24.7, mean 23.4 |

The midday pass's whole battery is three jobs (plan, emit and catalog specs, four sweeps), 23.4
runner minutes a run. Every scheduled midday run in the window planned the **whole catalog**
(`ONLY` empty in the sweep job), because each day's landings changed shared files (on 11-01:
`escalated by eslint.config.js`, `package.json`). On a day whose landings each name one design it
would plan a slice, and the designs outside it would wait for the nightly. So the catalog
battery's 0 breaches is a fact about this window's landings, not a guarantee.

Missed scheduled slots: none from 2026-10-14 to 2026-10-31 for either workflow.

### 2.4 Oldest uncovered landing (detection)

The existing alarm, `nightly-drift.yml`, is unchanged: its three matrix entries still alarm when
a watched schedule has no run created inside 26 hours. Added beside it, on the nightly entry only,
is a report step that runs `node scripts/schedule-coverage.mjs` (rules R1 to R7) and writes the
oldest uncovered landing, its deadline and the projection to the step summary, with a warning on a
projected breach. It is a report, not an alarm: `continue-on-error`, no issue, no change to the
job's verdict. It reads the last 14 days (about 16 API calls, 6 seconds in Actions). The
projection takes the worst start delay and duration in its window, so the window decides the
margin: for the landing below, the last 5 or 14 days projected completion 3 to 4 minutes inside
its deadline, and runs back to 2026-10-14 (one of them 24 minutes long) projected 44 seconds past.
A margin of minutes is no margin; the report says which side it falls on and the repair. Why not blocking: nothing relies
on this bound yet, and a red twice-daily alarm for the structural breaches above would be noise;
if ci16 activates narrowing, that is where it becomes blocking.

Priced by the growth gate (ci18) as no addition: it is two steps in an existing job, not a job,
and runs in seconds (measured below). A separate job would have been priced at the overhead tier's
6 runner-minutes per run, 12 a day, over the 10-a-day ceiling.

Live reading at 2026-11-01T20:30Z, runs from 2026-10-14: oldest uncovered `4c42dc88`, landed
06:36:01Z, deadline 2026-11-02T06:36:01Z, next nightly projected complete by 06:36:45Z:
**projected breach by 44 seconds.** The repair it names was run (section 4.2) and cleared the landing.

## 3. Nightly causes, triaged before relying on cadence (b)

| Night | Run | What failed | Cause | Status |
| --- | --- | --- | --- | --- |
| 10-15 | 38683155633 | E2E 9/11 | Shard stopped at `--global-timeout`, 22 tests unfinished (#1238) | Not recurred in 17 nights |
| 10-19 | 39201147576 | Report job, E2E time budget step; every spec green (#1498) | Suite over its time budget that night | Not recurred |
| 10-20 | 39372122320 | `wizard-shell.spec.ts` cold-open check (#1498) | Shared page between checks; fixed by `117f08bd` (isolate each cold-open check) | Fixed |
| 10-22 | 39724997061 | `rundown-history.spec.ts:268` (#1598) | Product race: Undo pressed while a write was landing was dropped; fixed by `9ed483bf` (#1649, proved by fault injection) | Fixed |
| 10-23 | 39903020781 | `wizard-shell.spec.ts:424` (#1598) | Fail then pass at the same commit 799924c (#1622) | **Open**: a flake signal not routed to quarantine; green the nine nights since |

Every nightly from 10-24 to 11-01 is green and complete. One cause, #1622, is open. It does not
change this verdict (the blocker above stands on green nights alone), but a qualification after
ci13 cannot rely on cadence until #1622 is resolved or quarantined.

## 4. Drills (b), by requested-commit identity

### 4.1 Controlled fixtures

`scripts/schedule-coverage.test.mjs`, 11 tests, run by the build gate's `scripts/**/*.test.mjs`
glob. Each run in a fixture names the commit it requested.

| Drill | What the fixture does | What it proves |
| --- | --- | --- |
| Identity | A green run on a branch at a landing's SHA, and one at a commit off the landing line | Neither covers anything (R2) |
| Late | Next nightly created two hours late | The landing breaches at 26h25m; the others do not; count, not percentile |
| Failed | Red run, then green a day later | Red detects but does not clear; strict delay waits for green (R5) |
| Incomplete | One shard cancelled; a report job skipped; a shard missing; a scoped or `none` midday pass | Incomplete, covers nothing; the rollback rule names the run (R4, R8) |
| Missed | A day with only a dispatch | The slot is named missed; full scope (R8) |
| Oldest uncovered | One night's history, then one slower night; then before the day's run exists; then a run going, a dispatch going, and one going at an earlier landing | Inside the bound, then a projected breach; the pending slot, not tomorrow's; a going run that contains the landing projects from its start, one that does not is ignored; no history means no margin (R7) |
| Interacting landings and a corrected successor | Exact replays r1 pass, r2 fail, r3 fail, r4 pass; r2's own PR passed | Culprit r2, masked by r4, an interaction; two defects in one range both named |
| Culprit replay with a gap | One commit not replayed | Attribution unresolved, never guessed; full scope |
| Full-scope rollback | Clean window, then an unresolved replay, then a late run | `scoped-eligible`, then `full` with each reason |

Mutation check, each rule broken in turn: crediting a branch run, letting red clear a landing,
counting a cancelled job as complete, guessing an unreplayed commit, and a projection that never
alarms. Each fails the tests (1, 1, 2, 2 and 1 failures); the unmodified module passes 11 of 11.

### 4.2 Real runs

- **Repair of a projected breach (missed or late recovery).** The detector projected `4c42dc88` to
  miss its deadline (section 2.4). Its repair, a nightly dispatch on `main`, was run: run
  41347406304, requested commit `d7b4927b87f037a74411883b69a6282b780b9c19` (main's tip at
  dispatch, 2026-11-01T20:32:52Z). While it ran the report named it as the run that would clear the oldest
  landing ("run 41347406304, already going"). It finished green and complete at 20:53:05Z (11
  shards, all six job kinds). Afterwards the report read "274 landing(s); 274 cleared ... 0
  waiting": `4c42dc88` cleared after 14.3 hours, by range evidence at `d7b4927b`.
- **Culprit replay input, real ranges.** For the five red nights the exact replay lists are the
  landings between the last green run's requested commit and the red run's:
  10-15 `1dc34ceb..3738cda3` (54 landings), 10-19 `aeafa14e..bb82c4df` (57),
  10-20 `aeafa14e..b433aba4` (81), 10-22 `0ca77426..570da40a` (23),
  10-23 `0ca77426..799924c3` (40). The 10-23 failure has an exact-commit replay on record (#1622:
  `wizard-shell.spec.ts:424` passed at `799924c` itself), which classifies it as fail-then-pass,
  not a culprit. The others were attributed by their fixes (section 3), not by replay.
  **Not done here:** an Actions replay of a historical failure at each commit of its range. A
  replay at October commits would run on today's runners against those commits' dependencies
  (`package-lock.json` changed 626 lines since `0ca77426`), which this row cannot set up faithfully
  inside its bounds. It is a missing drill receipt and part of the not-qualified verdict.
- **Full-scope rollback.** On the real 14 days, `scopeDecision` returns `full`, naming the 129
  breaches and the projected breach. The full path itself: catalog-gates
  dispatched with `designs=all` on this branch, run 41348085799, requested commit `47353047`
  (this branch's head then). Green in 12.4 minutes; its bench scope report: mode `full`, 526 of
  526 expected designs measured, 22 categories, 30 units, no empty unit, `imp01` and `svg01`
  declared not benched (#1926). That is the whole-catalog battery ci16 would restore on rollback,
  with the same gap section 2.1 names.
- **Report step in Actions.** nightly-drift dispatched on this branch, run 41348087839, green:
  the nightly entry's checkout took 6 seconds and the report 6 seconds; the other two entries
  skipped both steps; the existing checks ran as before.

## 5. Protection preserved (c)

- `ci.yml` is not touched. Its catalog calibration job still runs `npm run test:e2e:catalog` over
  the whole catalog when the plan raises the catalog flag, judged by ci12's bench guard.
- `nightly.yml` and `catalog-gates.yml` are not touched.
- `nightly-drift.yml`'s existing check, rolling issues and failure step are unchanged; the two
  added steps run after the issue steps and before the failure step, on the nightly entry only,
  with `continue-on-error`. The workflow gains `actions: read`.
- No test, threshold, budget, quarantine entry or exception is added or changed.

## 6. Audit reset classification

**Not a reset.** No selector code, header or list interpretation, critical or shared set
membership, or dependency mapping changes. `catalog-affected.mjs`, `e2e-affected.mjs`, the traced
map and every header are untouched; for every file the plans select the same designs and specs as
before. The workflow change adds a report step to an alarm, which selects nothing. The latest
reset stays `8e84002d` (ci11).

## 7. Phase notes

- Previous verified main: `2314eeec9dba6c33f458db926934ea5058362efc` (ci12, PR #1927).
- Revert: `git revert -m 1 <this PR's merge commit>`. It removes the report step, the module and
  its tests; nothing else depends on them.
- Decisions:
  - The bound is judged per contract, because the carriers differ: the catalog battery has two,
    engine-floor and the E2E suite have one.
  - A red complete run never clears a landing (R5). A delay to "any verdict" is reported beside
    the strict one but never qualifies.
  - The detector is a report step in the existing drift job, not a new job and not an alarm (2.4).
  - No historical exact-commit Actions replay (4.2).
- Traps for later rows:
  - ci15 and ci16: "the midday pass planned the whole catalog every day" is a property of this
    window's landings. Read the sweep job's `ONLY` (empty means whole catalog) before counting a
    midday run as coverage of omitted designs.
  - `schedule-coverage.mjs` reads job names (`Nightly E2E i/N`, `Type floor, overflow sweep and
    field coverage`, ...). Renaming a nightly job makes every run incomplete in the report until
    `NIGHTLY_JOBS` and `CONTRACTS` follow; that fails toward "not covered", never toward covered.
  - A nightly dispatch on `main` counts as coverage (it requests main's tip); one on a branch does
    not.
