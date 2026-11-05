# Phase cf14: pay down the graphics tier exception (#1863)

Row cf14 of the [cicd-followup spec](../spec.md), plan run #1967. Built 2026-11-05 by the cf14
builder (Claude Code Cloud worker) on `claude/plan-cicd-followup-cf14-build`, from `main` at
`314862e635ee0ceaa2fae3b2560eac94a137b1be`.

Acceptance (a), verbatim: "The graphics tier cost is paid down before 2026-11-30, prioritising
measured waste and critical-path impact, or, only if the remaining work cannot safely finish by
then and the reason is recorded, a short dated extension is recorded with current cost evidence, an
owner and a concrete reduction plan (no automatic or indefinite renewal). Coverage is not weakened
to meet a limit."

## Result

- **Paid down:** the avoidable share #1862 names. The Companion module, the harness bench's data
  and the endurance and instrument suites stop escalating to the shared-change set and the catalog
  gate. Over 285 landings since 2026-10-24, 4 of the 112 that reached the gate no longer do, and
  none is added. Measured on those landings: 105.4 gate runner-minutes in 10 runs, **0.37 per
  landing**. The JEV fixture folder stays as it is (#2166, section 3.3).
- **Not paid down by 2026-11-30, with the reason** (section 4): the gate costs 29.1 runner-minutes
  per landing (2026-11-04, every run) against a ceiling of 10. The merge queue and main push runs
  alone are 10.2. Both are required coverage this run may not cancel or replace, and narrowing the
  catalog waits for cf18 and cf19.
- **Extension recorded:** `cf14-catalog-gate-extension` in `scripts/growth-ceilings.json`,
  2026-12-01 to 2026-12-14 (14 days past the original date, once), 17.3 per landing (the reviewed
  17.7 less the 0.37 repaid, so the allowance does not grow), owner `miwco` with the weekly owner
  session as backup, decision on #1863
  ([comment](https://github.com/NoaCG/NoaCG-Studio/issues/1863#issuecomment-6645898515)), reduction
  plan #2165. Not renewed automatically: a further extension needs the owner's approval on #1863.
- **Coverage is not weakened** (section 3.2): every kind of change that can move a design still
  raises the gate, and no landing in the replay gains or loses the gate except the four.
- **Selection audit restarts** at this merge (section 6).

## 1. Current cost, measured

The tier is measured three ways. Runner-minutes are job `completed_at - started_at`, every attempt
(`filter=all`), cancelled jobs included, as the weekly report counts them. A landing is a push run
on `main`.

| Source | Window | n | Method | Graphics tier | Catalog gate |
| --- | --- | --- | --- | ---: | ---: |
| Weekly growth report (the capacity gate's own, weekly-audit run 41704224273) | 2026-10-27 to 11-03 | 131 landings | stratified sample, 7 runs per ci.yml stratum, 550 API calls | 22.3 | 21.8 |
| Every ci.yml run of one day (this phase) | 2026-11-04 00:00 to 24:00 UTC | 42 landings, 225 runs | every run, no sampling | | **29.1** |
| Every ci.yml run of seven hours (this phase) | 2026-11-04 15:00 to 22:00 UTC | 18 landings, 80 runs | every run | | 26.7 |
| Frozen measurement before ci04 (`growth-ceilings.json`) | 2026-10-24 to 10-30 | 122 landings | ci01 reference week | 7.8 | |

The weekly window starts four days before ci04 landed (2026-10-31), so it understates today's
cost. The report's own collector with a 100-call budget (this run's bound) cannot measure a fresh
window: on 2026-11-02 to 11-05 its run lists used the budget and it sampled one run per stratum,
none with a gate, so it read 0 and marked the tier partial. That is why the day was read in full,
in two passes of at most 100 calls, cached.

**Where the gate's minutes go** (2026-11-04, n = 42 landings):

| Trigger | Runs | Gate jobs | Cancelled (minutes) | Failed | Per landing |
| --- | ---: | ---: | --- | ---: | ---: |
| Pull request | 128 | 101 | 38 (131.7) | 0 | 18.9 |
| Merge queue | 54 | 26 | 0 | 0 | 6.4 |
| Main push | 42 | 19 | 4 (0) | 0 | 3.8 |
| **Total** | | | | | **29.1** |

A successful run takes 11.0 minutes (median of 104), almost all of it in the tripwire step (job
setup and emit fingerprints under 0.5). Its 41.9 test-minutes on 4 workers (gate job logs of runs
41929186945 and 41435677487): OGraf parity 26.5 (63%, 24 catalog units of about 22 designs, each
mounted three times), the calibration bench 12.6 (30%), the five containment and stability specs
2.8.

**Which landings raise it.** Today's planner, replayed over 285 landings since 2026-10-24 with the
shared-change set on as CI runs it, raises the gate on 112 (39%). By the files that raise it alone,
on the first 255 of those landings (105 raised): templates, blocks, assets or fonts on 38; other
source in the catalog reach, and nothing else, on 28, mostly control and export code the OGraf
target imports (the reach is 864 files, 139 of them only through
`e2e/catalog/ograf-parity.spec.ts`); the rest are escalations: `package.json` and lockfiles, planner
and Playwright config changes, and the #1862 paths.

## 2. Candidates, by measured effect

| Candidate | Measured effect per landing | In this phase? |
| --- | --- | --- |
| Pull request heads re-running the gate on catalog input that did not change | up to 18.9 (65%) | No. Reusing an earlier head's result changes what the PR's CI gate accepts: it needs written rules and a fresh review before code (known-traps "Risky"). First item of #2165 |
| Superseded pull request runs cancelled mid-gate | 3.1 | No. cf03 rank 8, a worker behaviour (#2165) |
| Main push repeating the merge queue's calibration of the same commit | 3.8 | No. Exact-merge coverage is never cancelled or replaced; cf16 decides whether the merge group's run is equivalent evidence |
| OGraf parity's 63% of each run | up to about 7 if halved | No. It already skips decoding identical frames; its time is real rendering of three mounts per design. A speed-up belongs to its owners (#2165) |
| Run only the catalog specs whose own reach a change touches | about 10% of runs | No. It narrows the gate, which the owner put after narrowing's safety requirements pass (cf16 to cf19) |
| Gate off pull requests, merge queue and main only | -18.9, but the rest is 10.2, still over | No. It moves every catalog failure into the queue and still does not fit |
| **#1862: map paths that cannot move a design** | **-0.37**, and the same landings skip the shared-change set | **Yes** |
| Split the gate into two jobs (cf03 rank 4) | critical path only: +0.9 per run | No. A cf13 candidate; it raises cost |

Critical-path impact: the gate ends the merge queue's run in about 30% of groups (cf03 section 3.5)
and is hidden behind the configured jobs on pull requests. #1862's mapping takes the gate off the
queue's path for the landings it maps; the larger critical-path lever is cf03 rank 4, which cf13
owns.

## 3. Pay-down: the #1862 mappings

### 3.1 The change

`scripts/e2e-affected.mjs` adds three `CENTRAL` entries, the planner's existing rule for files no
spec observes (a spec that reads one by path is still planned for it, `readerIndex`):

- `companion-module/`: its own package. `yarn test` runs in `release-companion.yml`. No spec or app
  module imports it; `e2e/downloads.spec.ts` mocks its GitHub Release. A Companion change is still a
  product change, so the critical journeys (cf12) still run for it.
- `benchmarks/harness/`: the harness bench's data, read by `scripts/harness-bench.mjs` and its
  helpers.
- `e2e/endurance/`, `playwright.endurance.config.ts`, `e2e/instruments/`,
  `playwright.instrument.config.ts`: suites with their own Playwright configs and workflows
  (`endurance.yml`, `hosted-latency.yml`). The offline and catalog configs never load them. The
  instrument pair is the same case as #1862's endurance pair and met the replay (#2100).

The catalog reach is asked before `CENTRAL` (`inCatalogReach`, before `IGNORE`), so a file the gate
measures through cannot be routed around it by a mapping.

### 3.2 Proof that coverage is not weakened

- **Selection tests** (`scripts/e2e-affected.test.mjs`): "cf14: the mapped #1862 paths never
  escalate or raise the catalog gate" (fails on `main`'s planner: mutation-checked) and "cf14:
  every change that can move a design still raises the catalog gate": templates, blocks, assets,
  bundled fonts, the font registry, the bench, the OGraf target, control code in the reach,
  `composeDocument`, the svg-corpus fixture, a catalog spec, the catalog config and `package.json`,
  each alone and beside a mapped path. The existing ci04 and ci05 tests (the corpus stays in the
  reach; every fixture plans a spec) pass unchanged.
- **Before and after** (`phase-cf14-replay.mjs`): today's planner over the 285 first-parent
  landings since 2026-10-24, with and without the three entries. Gate: 112 before, 108 after.
  Dropped: #2100 (instrument suite), #2043 (Companion lockfile), #1815 (harness cells), #1800
  (Companion module). Added: none (the script exits non-zero if any landing gains the gate). The shared-change set: 117 before, 113 after, the same four.

### 3.3 Not mapped: `e2e/fixtures/jev-svg/`

#1862 lists it. Five of its files (`dev.expect.json`, `manifest.json`, `regression.manifest.json`,
`qualification/expect.json`, `qualification/ticker.svg`) are read by the JEV scripts alone, and
ci05's test says every file under `e2e/fixtures` plans a spec. Mapping the folder would break that
rule, so it stays as it is. Its two landings in the replay (#1853, #1820) still reach the gate.
#2166 (P3, `area:e2e`) asks the JEV owners where those files belong.

### 3.4 The repayment, measured

The gate's runs on the four dropped landings, all attempts: 40771239684 (10.9, push), 40888647783
(9.1, push), 41716995582 (11.2, PR), 41719670400 (11.5, merge queue), 41721685420 (11.7, push),
41851987631 (4.0, PR, cancelled), 41856260630 (5.3, PR, cancelled), 41861459941 (2 x 11.1, PR,
re-run), 41868667669 (9.0, merge queue), 41870484041 (10.6, push). 105.4 runner-minutes over 285
landings: 0.37 per landing. Three more PR gate jobs of #2100 were cancelled at 0 minutes. The two
October landings ran the gate on their main push only (before ci04 coupled escalations to it), so
under today's planner they would have cost more; the receipt counts what ran.

## 4. The extension

**Why the rest cannot safely finish by 2026-11-30.** To fit the ceiling without an exception, the
gate must cost at most about 9.4 per landing (the tier's other per-landing graphics cost is 0.6).
On 2026-11-04 the merge queue and main push calibrations alone cost 10.2. They are the required
merge-queue and exact-merge coverage the spec's rules say is never cancelled or replaced, and the
main push's repeat is cf16's question. Narrowing the catalog is cf18 and cf19's, after a clean
audit (cf18's limit is 2026-12-31). The largest share, pull request heads, needs a change to what
the CI gate accepts, which needs written rules and a fresh review before code, and its effect is
not measured yet.

**The entry.** Rule X3 needs a measured repayment receipt for a later exception in a tier, and X4
one active exception per tier, so it starts the day after `ci04-catalog-gate` expires:

| Field | Value |
| --- | --- |
| id | `cf14-catalog-gate-extension` |
| tier, covers | graphics, `job:ci.yml/Catalog calibration gate` |
| perLanding | 17.3: the reviewed 17.7 less the 0.37 repaid. Measured cost above it counts against the ceiling: at the 2026-11-04 level the tier reads 124% and further graphics growth is refused |
| owner | `miwco (primary); the weekly owner session (backup coverage)`, the ledger's owner string (#1951) |
| from, expires | 2026-12-01, 2026-12-14 |
| reviewed | #1863 [comment](https://github.com/NoaCG/NoaCG-Studio/issues/1863#issuecomment-6645898515) |
| repayment | #2165 (the reduction plan) |
| repaid | 0.37 per landing, 105.4 minutes, the 10 runs above, measured 2026-11-05 |

Checked with `exceptionStatus`: valid; `ci04-catalog-gate` is the active graphics exception through
2026-11-30 and this one from 2026-12-01 through 2026-12-14; none from 2026-12-15. With the weekly
report's numbers the tier's per-landing use reads 4.6 of 10 to 2026-11-30, 5.0 during the extension
and 22.3 after it (its share is 79% from the per-day side until then, 223% after).

**The reduction plan** (#2165, P2, `area:ci`), in order of measured effect: reuse a passed gate on
pull request heads whose catalog input did not change; superseded runs; the main push's repeat
(cf16); OGraf parity's share; catalog narrowing (cf18 and cf19). By 2026-12-14 the weekly owner
session decides: a reviewed new ceilings version for the graphics tier (the frozen ceiling predates
ci04's fix, which put the gate on about 40% of landings), or the refusal stands.

## 5. Issues

- Closes #1862: its mappings land here; the JEV folder moves to #2166.
- #1863 stays open: item 1 is decided here, a further extension needs the owner's approval there,
  and items 2 to 5 (ci04 review notes) are not this phase's.
- Filed: #2165 (P2, `area:ci`, the reduction plan), #2166 (P3, `area:e2e`, the JEV fixtures).

## 6. Selection audit and cf13 sides

- **Audit reset.** This changes selector code (`scripts/e2e-affected.mjs`) after cf11's final
  selector change, so the miss audit's 14-day window restarts at this merge, and the commit carries
  a `Selection-audit-reset:` trailer. It is a deliberate mapping, not a miss, so it does not count
  toward cf18(c)'s two restarts. cf18's earliest date moves to 14 days after this merge.
- **cf13 sides.** `phase-cf03-baseline.mjs rule` on the selection commit ends the M1, M2 and M3
  sides of every group (the planner is a script ci.yml runs); the ledger commit alone ends none.

## 7. Verification

- `node --test scripts/e2e-affected.test.mjs scripts/catalog-affected.test.mjs
  scripts/configured-selection.test.mjs scripts/keyed-selection.test.mjs
  scripts/e2e-selection-misses.test.mjs scripts/e2e-traced.test.mjs`: 306 tests, all pass.
- Mutation: the new "mapped paths" test fails on `main`'s planner and passes on this one.
- `node docs/work-specs/cicd-followup/evidence/phase-cf14-replay.mjs`: 112 to 108, none added.
- `node scripts/growth-report.mjs fetch` then `node scripts/e2e-capacity.mjs --changed origin/main
  --growth <file>`: WARN (graphics OK at 79%); it names the new exception as needing its recorded
  review, which is the #1863 comment.
- `node --test scripts/growth-controls.test.mjs scripts/e2e-capacity.test.mjs`: 121 tests, all
  pass. One test pinned the real ledger's refusal on 2026-12-01; it now pins the same refusal on
  2026-12-15, and that the extension, not ci04's entry, holds 2026-12-01 to 2026-12-14.

## 8. Phase notes

- **Previous verified main SHA:** `314862e635ee0ceaa2fae3b2560eac94a137b1be` (push CI run
  41932272913 green).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. Note the ledger is append-only:
  reverting removes the extension entry, which the capacity check refuses as a ledger edit, so
  revert only the planner commit (`git revert <selection commit>`) unless the owner decides the
  extension goes too.
- **Decisions:**
  - Pay down only what is safe and measured now (#1862), and extend for the rest. Every larger lever
    belongs to a later or gated decision (section 2).
  - The extension does not grow the reviewed allowance, although today's cost is higher: the
    excess stays visible against the ceiling and refuses further graphics growth instead of being
    excused.
  - The owner string is the ledger's own (`miwco` with the weekly owner session), not the finished
    plan's coordinator the old entry names.
  - The JEV fixture folder is left out rather than bending ci05's rule.
- **Traps:**
  - `growth-report.mjs collect` at a 100-call budget spends the budget on run lists and samples one
    run per stratum: it reads 0 for the catalog gate. Read the jobs of every run instead, cached.
  - The jobs API returns only the latest attempt unless `filter=all`.
  - The runs API sometimes answers 502: check each cached file parses before using it.
  - `planFor` takes no `central` option; the replay swaps the exported `CENTRAL` array in place.
