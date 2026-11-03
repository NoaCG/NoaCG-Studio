# Phase cf12: the critical journeys on every product change

Row cf12 of the [cicd-followup spec](../spec.md) (#1895). Built 2026-11-03 by the cf12 builder
(Claude Code Cloud worker of plan run #1967) from `main` at
`d48b4725e8644d6bfee13685e90c7a117a3bc3cd` (cf03 merge, #2031).

Acceptance, verbatim:

- (a) "The ten critical tests run on every product change while their added minutes per product
  change, measured on product changes after enabling, stay under a ceiling written in the phase
  brief before the change lands, stated as a share of cf03's median M3 per merge with the reason
  and not above 5% unless the owner approves a higher share, without running the same tests twice
  in one validation pipeline. If the measured added minutes exceed the ceiling, the tests are not
  enabled on every product change, the measurement is recorded, and the owner is told in the phase
  result."
- (b) "The 2-of-6 result from cicd-improvement ci11 is explained, with what the set does and does
  not protect, and the missed faults turned into worthwhile coverage improvements or recorded
  follow-ups."

## Summary

- **Ceiling** (from the phase brief, written before the change): at most **22.5 runner-minutes per
  product change**, 5% of cf03's median M3 per merge on the after side A (450 runner-minutes,
  [phase-cf03.md](phase-cf03.md) section 3.1). Reason: 5% is the spec's default share and the
  owner has approved no higher one; side A is the pipeline these tests join.
- **Enabled in the planner.** A product change's plan now holds the critical journeys beside what
  its own files select. The plan is a set, so no journey runs twice in one pipeline (section 2).
- **Estimate before landing** (section 3): replayed over cf03's 201 merges, 79 were product
  changes. The change would have added a mean of **10.1 runner-minutes per product change**
  (median 5.0) over all sides, and **17.0** on side A (median 7.6), with per-shard setup at 1.5
  minutes. This includes the two promoted journeys on shared-change plans. With setup at 3
  minutes, which is pessimistic (cf03 measured about 0.5 to 0.6), side A is 19.6 and side D is
  23.4, over the ceiling. A few changes with many pushes go far over (max 96 on side A). The
  estimate counts every PR head as a full run, so it is an upper bound on that term. It is close
  enough that the measurement decides.
- **Measured after enabling:** not yet possible. The rule has to land before a product change can
  run it. `phase-cf12-measure.mjs` measures it from each run's own annotation and job times
  (section 3.3). The verdict waits for at least 12 product changes, and is read no later than
  14 days after enabling (2026-11-17 at the latest if it lands today), by the plan-run coordinator. This phase's result states n and the mean. If the mean goes over 22.5, the rule
  is reverted (one commit) and the owner is told, as (a) requires.
- **(b) The 2-of-6 result** (section 4): the critical set is a smoke layer over each contract's
  main road. It caught F1 and F8, the two faults on that road. It missed F2 to F5, which sit on
  failure, teardown and timing paths it never takes. F4 and F5 are now covered: their own specs
  (`ograf-lifecycle`, `output-font-hold`, 0.32 measured minutes together) are critical journeys,
  and a re-injected F4 and F5 each fail them (section 4.3). The set is twelve specs and 4.93
  measured minutes, inside the D2 target of 5. F2 and F3 are follow-up #2036 (P2, `area:e2e`):
  their specs cost 6.9 minutes, more than the whole set.

## 1. What a product change is

`isProductFile` in `scripts/e2e-affected.mjs` answers "can the offline app observe this file?" A
file counts when it gets past the planner's ignore list (`IGNORE`: docs, CI, agent harness files,
`supabase/`, most of `scripts/`) and is outside:

- the test tree itself: `e2e/` (specs, baselines, helpers, fixtures), `scripts/` (the planner and
  the suite scripts the ignore list keeps), the Playwright configs;
- `docs/` and `*.md`, including the documentation the public pages load (What's new, GOALS.md, the
  SVG practice library). That is page content their own specs check, not code a journey runs;
- what `CENTRAL` already says the app never loads: `cli/`, `benchmarks/`, `.claude-plugin/`.

So app source, `api/`, `public/`, the root HTML pages, `package.json`, `package-lock.json` and the
build configs are product. So is any module the dev server loads, even under `scripts/` (for
example `scripts/dataDevPlugin.mjs`), because the app under test runs it (`planFor` asks
`devServer` beside `isProductFile`; found in review). A copy-only edit to product source is still a product change.
Migrations under `supabase/` are not: the offline journeys cannot observe them, and the
configured suite selects for them (ci06).

Decision, and why: "product change" is not defined in the spec or #1895. The narrow reading (app
code the journeys run) matches the owner's words "an additional safety net", and it keeps the cost
where the net can catch something. Counting docs or test edits would make every docs PR pay for
journeys that cannot fail on it.

## 2. The rule, and why nothing runs twice

`planFor` (`scripts/e2e-affected.mjs`) adds `CRITICAL` (`scripts/e2e-lists.mjs`, the specs whose
header says `// critical:`) to the plan when the change has a product file and the plan is not
full. The plan is a `Set` of spec files, so a journey the change already selects is in it once.
`critical.added` lists only what the rule added.

- **Shared-change escalation** (a CORE or unmapped file): the plan already holds every journey,
  because each journey is also `// focus` (Rule K2). The rule adds nothing.
- **Full plan** (main pushes, `--all`): runs everything. The rule adds nothing.
- **Quarantine:** a quarantined journey leaves the blocking shards the same way any planned spec
  does (`splitQuarantined`), unless the change edits it.
- **One validation pipeline** is one ci.yml run. Its shards get disjoint file lists
  (`packShards`; the shard job refuses a list that runs a file twice). The PR run and the merge
  group run are separate pipelines, and each plans its journeys once. The E2E retry job re-runs
  only failed specs, only on merge groups and main pushes, as before. The main push runs the full
  suite, which already held the journeys.
- **Price, per run:** the plan JSON's `critical` field (`criticalCost`) gives the journeys added to
  the blocking shards, their table-minutes against the whole blocking plan, and the shard count
  without them. The `E2E plan` job prints this as a `Critical journeys` notice annotation.
- **Collision check:** `scripts/collision-check.mjs` leaves the journeys out of a row's territory.
  Otherwise every pair of product rows would collide on the same twelve specs (the candidates
  test caught this).

Tests: `cf12:` tests in `scripts/e2e-affected.test.mjs` (the rule, dedupe, no-product changes,
escalations, `isProductFile`, `criticalCost`) and in `scripts/collision-check.test.mjs`. Exact-plan
tests over the real headers now expect `withCritical(...)`. Fixture tests that use made-up
coverage pass `critical: []`, so they still test only their own mapping.

## 3. (a) Cost against the ceiling

### 3.1 Ceiling

22.5 runner-minutes per product change: 5% of 450, cf03's median M3 per merge on side A (n 34).
Judged on the **mean** over product changes after enabling, because the mean is what the change
costs in total. The median is reported beside it.

### 3.2 Estimate from history (before landing)

`node docs/work-specs/cicd-followup/evidence/phase-cf12-replay.mjs [--shard-fixed m]` replays
today's planner over the files each of cf03's 201 merges changed. It runs once with the rule and
once with `critical: []`, then prices the difference per CI run as added test-minutes × the
table's `testFactor` (1.02), plus extra shards × a fixed shard cost, plus the report job when the
plan had no shard before. A shared-change plan also pays for the two journeys cf12 promoted
(they are `// focus` too, so every escalation runs them because of cf12): their table-minutes x
the test factor, about 0.33 per run. That per-run figure is multiplied by the change's PR heads plus its
merge-group runs from cf03's records. That multiplier is an upper bound, because a superseded run
is cancelled part way. No API reads.

| Side | product merges | rule added something | per product change, mean / median / p95 / max (setup 1.5) | mean (setup 3.0) |
| --- | ---: | ---: | --- | ---: |
| all | 79 of 201 | 37 | 10.1 / 5.0 / 45.3 / 96.3 | 11.4 |
| B | 47 | 11 | 4.5 / 3.5 / 13.1 / 19.6 | 4.7 |
| D | 15 | 13 | 20.0 / 15.0 / 56.2 / 56.2 | 23.4 |
| A | 17 | 13 | 17.0 / 7.6 / 96.3 / 96.3 | 19.6 |

Twelve-spec set. Per CI run that adds anything, the cost is 0.6 to 8.0 runner-minutes: 4.93
test-minutes, plus one or two extra shards when the plan was small. At 15 shards, the planner's
cap, no shard is added and the shards get longer. 42 product merges planned the shared-change set:
the rule added nothing there, and they pay only the two promoted journeys. Side B is cheaper because more of its product changes escalated under today's
planner. The tail comes from changes with many pushes: #2005 (12 runs, 8.0 each) and #1959 (12
runs, 3.8 each). **Reading:** at 1.5 minutes of setup the estimate is under the ceiling on every
side, with sides D and A within 2.5 to 5.5 minutes of it. At a pessimistic 3 minutes, side D goes
over. Whether the rule stays depends on the measurement.

### 3.3 Measurement after enabling

`node docs/work-specs/cicd-followup/evidence/phase-cf12-measure.mjs --since <the enabling
merge's merged_at> --cache <dir>` takes every PR merged after the enabling merge. For each one it
reads the ci.yml PR runs created after that time and its merge-group runs, with their jobs and
the `E2E plan` job's annotations (at most 100 calls per pass, completed reads cached). A run with
the `Critical journeys` notice is a product-change run. Its added minutes are:

- the E2E shards' measured test-step minutes × (added table-minutes ÷ the blocking plan's
  table-minutes), the journeys' share of the test work that run actually did; plus
- the extra shards × that run's median shard setup (job minus test step); plus
- the Combined E2E report job, when the plan without the journeys ran no shard at all.

A change's figure is the sum over its runs and each run's attempts, superseded, failed and re-run work included. A re-run attempt's copied jobs are counted once, as cf03 does, and an attempt that re-ran only some shards pays the extra setup in proportion (Codex review on `a124b3dc`). The phase result
states n, the mean and the median against 22.5. It was checked against the hour before enabling,
where no run carries the notice: `n 0`, 20 calls. The verdict also waits for a complete pass: when
the call budget stops a pass early, it prints `not yet: collection incomplete` (checked with
`--max-calls 2`; Codex review on `45f3fc62`). The PR-run lists are read fresh on every pass, so a run
still in progress is read again later. The E2E retry job is not counted: it re-runs only failed
specs on merge groups, which is a flake cost (M4), not this rule's per-change cost.

**When, how many, and who.**

- **Sample size.** The verdict waits for at least **12 product changes** measured after enabling.
  That is cf03's minimum sample per side for an M3 median (section 5.1). Below 12 the script prints
  `not yet` and judges nothing.
- **When.** The measurement is read once 12 changes exist, and no later than 14 days after the
  enabling merge (**2026-11-17** if it lands on 2026-11-03; the 14 days govern if landing slips). If fewer than 12 product changes have landed by that date, the result
  records the n reached and its mean. It is judged on that mean and says plainly that the sample
  is short.
- **Who.** The cicd-followup plan-run coordinator runs it. It is a checker step of this phase, and
  cf20 reads the same script again. The human owner (`miwco`) is told the result in the phase
  result.
- **Shared-change runs.** A run whose notice says every journey was already planned is charged the
  two promoted journeys (0.319 table-minutes x 1.02). The promotion is why they run there, and
  charging every such run over-counts, which keeps the judgement strict.
- **Durable reminder.** The read date goes in this phase's receipt to the coordinator, which keeps
  the run ledger (#1967). #1895 stays open until the measurement is recorded.
- **First check after landing.** The first product-change run on `main`'s new planner must show
  the `Critical journeys` notice on its `E2E plan` job. `noticeRuns` in the script's output
  counts those runs. If `noticeRuns` stays 0 while product PRs merge, the measurement is broken,
  not cheap.

**If the mean is over 22.5:** revert this PR's planner commit (`git revert` of the merge, through
`/queue-merge`). Record the measurement here, and tell the owner in the phase result. **If it is
under:** the rule stays, and cf20 re-reads the same script for its report.

**The D2 target.** The set is now at 4.93 of the 5-minute target, so #2036's save smoke spec
(under 0.5 minutes) would take it past 5. `criticalBudget` reports this and does not block. #2036
must say which gives way: the target is raised with a reason, or the smoke spec replaces a
heavier journey's overlap.

## 4. (b) The 2-of-6 result

### 4.1 Which six

ci11 injected ten faults. Six sit in offline layers the critical set could see: browser and
artifact, F1 to F5 and F8. F6, F7 and F10 are configured-suite faults, and F9 is a catalog fault.
The offline set cannot run those layers by design (`e2e-contracts.mjs`, the backend exception).
With each of the six faults in place, ci11 ran all ten critical specs in complete runs. They
caught F1 (`cross-tab`) and F8 (`exports`) and passed under F2, F3, F4 and F5
([phase-ci11.md](../../cicd-improvement/evidence/phase-ci11.md) section 5). The ci11 checker's one
red under F2 (`project.spec.ts:154`) then passed 4/4 with and without F2: load noise, not a catch.

### 4.2 Why: what the set protects and what it does not

Each critical journey walks the **main road** of one D2 contract, end to end, with a healthy
network, one or two tabs, and a graphic that stays loaded:

| Contract | Journeys | It protects | It does not protect |
| --- | --- | --- | --- |
| site-entry | flows, project | the app boots; a graphic is created, imported and reopened | failure paths of the wizard; slow or failed loads |
| edit-save-reopen | cross-tab, production-persistence, storage-full | a write lands, survives reload, is adopted by another tab (F1); a full disk is said | a reserved id honoured by the wrong tab (F2); a refused save that reads as landed on leave (F3); sync against a real backend (configured) |
| production-playout | production-controls, playout-drills | take, next and clear on the production; the drills | physical playout devices; hosted races (configured) |
| export-portability | exports, **ograf-lifecycle** (cf12) | every export target ships what its code references, fonts included (F8); since cf12, dispose() stops the template's timers and listeners (F4) | vendor builds (SPX, CasparCG, LiveOS) |
| graphics-runtime | offline, snap-recovery, **output-font-hold** (cf12) | the offline runtime and snap recovery; since cf12, a font host that never answers cannot hold a graphic off air (F5) | every design, font and browser (the catalog gate) |
| access-durability | none (backend exception) | nothing offline: its faithful layer is the configured stack | grants and tenancy (F7 class), checked by the configured suite |

F1 and F8 break the main road itself, so a journey trips on them. F2 needs two tabs racing a
reservation, F3 a refused write, F4 a dispose with timers running, and F5 a font request that never
returns. No main-road walk creates those conditions. Each of the four is caught by its own
header spec, and the planner selects that spec for a change to the faulted file. So the set
missing them is not a selection miss. It is the line between a smoke layer and a file's own
coverage. The owner's words fit this: "an additional safety net, not a replacement for broader
testing". The net catches a break that arrives through a file no header connects to the journey.
It cannot replace the specs that test a path's edges.

### 4.3 The missed faults, turned into coverage or follow-ups

| Fault | Its own spec, measured minutes | Done | Proof |
| --- | --- | --- | --- |
| F4 dispose leaves timers and listeners running (#989, #998) | `ograf-lifecycle.spec.ts`, 0.20 | **made a critical journey** (`// focus`, `// critical: export-portability`; added to the contract's checks) | ci11's F4 patch re-applied: 2 failed (`dispose() stops the timers...`, `dispose() removes the listeners...`); correction 8/8 passed (with F5's spec), queue jobs j-0001 and j-0003 |
| F5 a font that never answers holds the frame off air | `output-font-hold.spec.ts`, 0.12 | **made a critical journey** (`// focus`, `// critical: graphics-runtime`) | ci11's F5 patch re-applied: 1 failed (`that never answers: every graphic still airs...`); correction 8/8 passed, jobs j-0002 and j-0003 |
| F2 reserved id honoured by the wrong tab (#1402) | `save-transaction.spec.ts`, 5.02 | **follow-up #2036** (P2, `area:e2e`): a small critical spec with just the two oracle rows | too costly as is: more than the whole set |
| F3 refused save reads as landed on leave | `save-transaction-leave.spec.ts`, 1.86 | **follow-up #2036**, same spec | same |

Why F4 and F5 are worth it: both are on-air properties a broadcast user feels (a graphic that
keeps animating after it was taken off, a graphic that never airs). They cost 0.32 measured
minutes together, and the set stays inside the D2 target of 5 minutes (4.93). The faults were
applied from `phase-ci11-faults.json` exactly and reverted after each job; the tree was clean
before the correction run. The critical set is now twelve specs. The ten of (a) are all in it,
and the ceiling is judged on all twelve, including the two promoted journeys' cost on shared-change
plans (sections 3.2 and 3.3), which is stricter.

## 5. Selection audit and cf13 sides

- **Audit reset.** This changes selector code (`scripts/e2e-affected.mjs`, `scripts/e2e-lists.mjs`)
  and adds critical and focus header lines. The miss audit's 14-day window therefore restarts at
  this merge (Rule A4). The first commit also carries a `Selection-audit-reset:` trailer.
  Under cf11(d), cf12's change to selection lands before cf11's final selector change. cf18's
  earliest date moves with it.
- **cf13 sides (cf03 section 4.2 rule).** `scripts/e2e-affected.mjs` and `scripts/e2e-lists.mjs`
  are in the import closure of the scripts ci.yml runs, and ci.yml's plan job changed outside the
  configured jobs. So this merge **ends the M1, M2 and M3 sides of every group**. Run
  `node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs rule <merge-sha>` to
  confirm.

## 6. Verification

- `node --test scripts/*.test.mjs`: 5,223 pass, 7 fail. 6 of the failures fail the same way on
  clean `main` d48b4725 (`port-registry` hash collision and port probe, four `svg-import-passes`
  corpus records: environment, not this change). The seventh was `candidates.test.mjs` "the third
  bad pick": a real effect of the rule, fixed in `collision-check.mjs`, now passing.
- Targeted: `scripts/e2e-affected.test.mjs`, `e2e-traced`, `e2e-contracts`, `collision-check`,
  `candidates`, `e2e-lists`: all pass after the changes.
- `auditContracts` over the real headers: no problems. `criticalBudget`: 12 specs, 4.93
  measured test-minutes against the 5-minute target.
- Fault drill: section 4.3 (queued `--cap 5` jobs on this machine).
- The plan job's shell step: its `run:` text from ci.yml passes `bash -n`, and its two `node -e`
  blocks, run by bash on a real plan (`--files src/legal.css`), print `::notice title=Critical
  journeys::product change: added 12 critical spec(s) (4.93 of 5.09 table-min; shards 1 -> 2): ...`
  and write the outputs. The first review found an apostrophe in a comment that closed the
  single-quoted script; `check:workflows` does not parse a step's shell, so it passed.
- `phase-cf12-measure.mjs`, run before enabling: `n 0`, `noticeRuns 0`, verdict `not yet: 0 of 12`.
- Fresh `/so` on `a124b3dc`: A-, no blocking findings. It asked for three changes: a sample size,
  date and owner for the measurement; a first-run check for the notice; and the D2 target
  question for #2036. It also noted that `CRITICAL` duplicated `criticalSpecs`. All four are
  addressed on the next head.
- `npm run gates -- run --changed origin/main`: all ok, 236 tests. `npx eslint` on the changed
  scripts, specs and evidence scripts: clean. `node scripts/check-e2e-protection.mjs --changed
  origin/main`: OK.
- Review (`/check`, a fresh read-only agent): five findings, all fixed. They were the broken shell
  quote above; merge-group runs past the first page of 100, which the measurement would have
  dropped (now paged to the end, read once per pass); dev-server modules not counted as product;
  a misplaced doc comment; the replay pricing an unmeasured spec at 0 instead of the median.

## 7. Phase notes

- Previous verified main: `d48b4725e8644d6bfee13685e90c7a117a3bc3cd` (cf03 merge, #2031).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. The revert
  changes selector code too, so it is also an audit reset, and it ends cf13 sides again.
- Decisions: "product change" is the app the offline suite can observe (section 1). The ceiling
  is judged on the mean, the stricter and cost-relevant figure. Coverage for F4 and F5 is added by
  promoting their existing specs rather than writing new ones. F2 and F3 go to a follow-up,
  because their specs cost more than the set. The collision check ignores the journeys.
- Traps: `planFor` tests over the real headers now see the critical set on every product file, so
  an exact-plan test needs `withCritical(...)`, and a fixture test with made-up coverage needs
  `critical: []`. The orchestrator's collision check needs the same exclusion, or every pair of
  product rows collides. A comment inside ci.yml's single-quoted `node -e '...'` blocks must not
  hold an apostrophe, and `check:workflows` will not catch it: run the step's text with `bash -n`.
  Local `e2e-affected` runs add the journeys to a product change too, about five minutes. The
  repo's commit hook refuses `Co-Authored-By` trailers.
- Follow-ups: #2036 (F2 and F3 save smoke). #1921 (CORE reader specs) stays cf11's.
- Issues this phase closes: none on landing. #1895 closes once the measurement in section 3.3 is
  recorded under the ceiling, or once the rule is reverted with the owner told.
