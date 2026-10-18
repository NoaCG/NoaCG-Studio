# Faster iteration and landing, with regression protection

Research, 18 October 2026. **Recommend a small selection-safety fix first: make the existing
CLI round-trip journey run on shared changes, including `src/model/importTemplate.ts` (#1349).**
Keep small coherent PRs, the present validation cadence and standard public runners. Finish the
separate Team observation before choosing a scheduling intervention. Optimize waiting and reliable
feedback; runner-minutes below describe contention, not a bill.

**M** = measured/code or log inspection; **E** = estimate/model; **U** = unknown. No CI setting,
required check, test, capacity limit or cadence changes in this report. No suites were launched.

## What is already implemented, and who owns adjacent work

Inspected main `bf59dcd314` (full SHA in [receipts](iteration-latency-receipts.json)), after #1467
and #1470, plus open PRs/issues and the related Codex chats. The `e2e research` chat owns the
Team comparison, **17 October 20:15:36–24 October 20:15:36 UTC**; its frozen
[3 October–17 October 06:00 baseline](landing-speed-options.md) is unchanged. Security activation
and remediation, timing-table changes and save-matrix growth confound a simple before/after claim.
Native recovery and graphic-preview qualification have other chats; open #1452 owns SVG security
work. No open PR in the bounded 30-PR query implements this selection fix or validation batching.
Open quarantine PRs include #1450, #1432 and #1322: do not compete with those owners.

Current implementation **M**, superseding old plan descriptions:

- Capacity/protection gates, weekly selection-miss reporting, placement guidance and catalog-diff
  selection are live. Shared escalation is the default, but membership still comes from `// focus`;
  the explicit per-journey list and historical audit are unfinished.
- `MAX_SHARDS=15`; **`MAIN_RUNNERS=13` remains the envelope**, 209.9 / 213.9 table-minutes,
  **98.1%**. A no-test-change report warns; additions above 95% need the existing exception.
  #1409 already split the 26.7-minute save matrix while preserving its 107 cases. Do not repeat it.
- Main still starts full validation per push; an obsolete main run can cancel itself in its plan
  step. Configured validation still runs on main pushes and its schedule. No active
  `NOACG_MAIN_VALIDATION` implementation was found. The old cadence replay is not current behavior.
- Offline CI has one worker and **zero Playwright test retries**, with a 20-minute shard cap.
  Separate same-commit diagnostic jobs already exist. `playwright.live.config.ts` independently
  has one retry today; this report neither changes it nor treats that as permission to introduce
  retries into the offline suite.
- #1349 is **still reproducible** despite the existing `covers: src/model/{importTemplate,scriptKind}.ts`
  header. `planFor` hits CORE and `continue`s before reading matching headers/traces; the subsequent
  focus union omits `editor-cli-round-trip`. The CLI plans 76 specs without it. A header-only fix
  would do nothing. This is distinct from #1337's already-landed thumbnail expectation repair.

## Where developers wait

The frozen population contains **470 landings**: first queue entry → merge **7.6 / 27.0 minutes
p50/p90 M**. The median meets the 10-minute target; p90 misses 20. Of 495 successful merge-group
runs, creation → gate is **6.5 / 22.5**; the 234 with shards take **13.8 / 32.3 M**. These are
separate populations, not additive stages.

**Scheduling and cap pressure dominate the measured CI tail; repair/re-entry dominates some
extreme landings.** Covered jobs occupied 20 runners for 17.0% of busy time. Across 9,762 shard
jobs, ready-to-start wait was **0.05 / 8.13 minutes**, versus setup **0.28 / 0.38 M**. Among 322
observed full main runs with shard timing, 114 had cap hits; slowest-shard p50/p90 was
**18.85 / 20.28 M** (API durations can extend beyond the configured cap). This predates the
15-shard fix and is not a current failure-rate estimate. Main consumed 61.4% of CI runner-minutes;
that matters only while it competes with feedback and queue jobs.

The following **diagnostic sample is deliberately not representative**: the four slowest frozen
landings and four nearest its median. All are pre-Team. PR opening is the earliest reliable
workflow-level iteration timestamp available here. Minutes M, rounded:

| PR | Open → first queue | PR CI runs before merge | First → last queue entry | First queue → merge |
|---|---:|---:|---:|---:|
| #1312 | 63.3 | 5 | 449.0 | 458.8 |
| #1325 | 55.2 | 1 | 176.3 | 193.3 |
| #1318 | 26.9 | 1 | 115.9 | 174.5 |
| #1045 | 25.6 | 2 | 86.9 | 115.1 |
| #1156 | 9.3 | 1 | 0 | 7.6 |
| #927 | 176.4 | 10 | 0 | 7.6 |
| #673 | 3.7 | 1 | 0 | 7.7 |
| #1172 | 6.1 | 1 | 0 | 7.4 |

The stage definitions prevent false attribution:

- **PR feedback:** run creation → `CI gate` completion; the first sampled runs for #1325 and
  #1318 took 54.3 and 26.7 minutes. `Reviewed` and the workflow conclusion also matter: #927's
  first gate was green but the workflow failed. Its ten PR runs comprise three failures, six
  cancellations and one success. A green product gate is not yet queue eligibility.
- **Repairs:** failed feedback → next verified revision, plus removal/re-entry. Fourteen of
  470 PRs re-entered; first-to-last entry intervals total 1,246.3 PR-minutes M, overlapping across
  PRs. They include blocked/inactive time and earlier execution, **not measured coding time**.
  #1312's final merge run took only 9.1 minutes despite its 458.8-minute landing interval.
- **Merge-queue waiting:** use queue entry → merge-run creation, retaining earlier attempts.
  #1318's first entry → final run creation was 126.6 minutes, including failed/removed attempts;
  its last entry → final creation was 10.65. Neither is pure runner wait.
- **Runner/scheduler waiting versus execution:** in #1318's final run `38976210147`, creation →
  plan completion was 6.88 minutes, last-finishing shard readiness → start **26.35**, that shard's
  execution **8.42**, gate readiness → start **6.08**, gate execution **0.07**: **47.82 total**.
  Merge followed 0.08 minutes later. In #673, Build executed for 2.88 minutes but the ready gate
  waited another 3.97. More test workers cannot remove that gate wait.

**Missing timestamps U:** local work start, local verification duration, server-received pushes,
review request/response and active repair effort. Commit author/committer dates are not push or
work-start clocks. The frozen census has no population PR-open-to-queue distribution. The new
sample stores first/latest run jobs at their latest attempt, so cannot always recover first-attempt
feedback; cancellation is not a completed verdict. Job eligibility is inferred from workflow
`needs`, not an exposed scheduler event: its wait includes GitHub orchestration as well as runner
allocation. Do not sum job durations or subtract unrelated percentiles to explain a landing.

**Post-Team, separate:** #1467, #1468 and #1470 had open→queue / queue→merge of **3.38/5.18,
9.72/5.53 and 4.87/5.47 minutes M**. These are illustrative publications, not a Team treatment
estimate; #1468 had three PR runs and the reused #1470 branch had a run before the PR opened,
which is excluded. Keep the trial's >=100 landings/seven days, workload stratification and unique
run accounting. This report's own publication adds ordinary CI workload to that observation.

## What a red main actually means

Six whole job logs were read, with compact excerpts and stable job links in the receipts; the
[earlier four-run triage](../../e2e-traced-selection/evidence/run-triage.md) supplies continuity.
This is an incident sample, **not a census of unique defects**. Multiple categories can coexist.

| Evidence | Classification and attribution |
|---|---|
| Main `39048521384`, retry job `117450872618` | **Shard capacity**, not proven save regression. Original shard cancelled; diagnostic run reports `save-transaction.spec.ts took 26.7m`, 253 passes/36 existing skips overall. #1405's blob analysis identifies all 107 matrix cases passing. #1409 already fixes packing. |
| Main `37828961726`, retry `113500881222` | **Unstable editor-groups test**: all 32 passed on the same commit after the original failure. A different, previously unreported video test then failed finding `composition.html`; the original shard hit its cap. The earlier triage found later unchanged passes. Do not call this a confirmed video/product regression from the retry headline. |
| Main `37118148332`, Build `111188860314` | **Test infrastructure**: `EADDRINUSE 127.0.0.1:38981` in the CLI window test. The same run also had the known Home fixture timing race and a capped shard. A Bridge filename is not evidence of a playout defect. |
| Main `38015497259`, retry `114108800482` | **Deterministic export-baseline mismatch / selection miss**: expected exported JS differs (+85/-1 lines). Existing triage attributes it to #927; #941 merely exposed it. A repeated failure does not establish that the intentional exporter change was a product regression. |
| Main `38966657393`, retry `117218283557` | **Outdated expectation / selection miss**: three viewport cases expect `thumbnail.png` as a source asset after #1317 intentionally removes it. #1337 fixes the expectation and checks its absence from exports. #1349 records the batch revert and collateral queue removals. This is not evidence of lost editor saves. |
| Merge-group `38427916548`, Factory `115402101422` (corroboration, not main) | **Unstable repeated-Stop check**: gt03 timer-dot x=1116 versus 1115, 92 other assertions pass; #1081 records same-commit passes on other occurrences and a docs PR removed from queue. Root mechanism is unresolved; do not weaken the pixel comparison or infer a playout-engine regression. |

**Actual save/load faults have separate evidence:** the
[fifth independent editor check](../../editor-leave-reliability/independent-5/README.md) reproduces
unlinked drafts creating duplicate records after refused writes, and renamed Save not continuing
navigation. The [repair-6 receipt](../../editor-leave-reliability/repair-6/README.md) records
main-vs-fix and mutation results (`39030465479`: 22 failed/30 passed on main; final fix
`39033191343`: 54/54). These are scratch checks against main product code, **not ordinary red-main
push incidents**. They justify durable transaction coverage; the 26.7-minute cap does not justify
removing it. This bounded review establishes no population count of actual product regressions
and no new confirmed playout regression. Untouched red-main incidents remain unclassified.

## Repeated validation and PR size

| Repetition | Distinct protection / safe combination boundary |
|---|---|
| PR build, factory and affected E2E → merge-group equivalents | PR gives early repair feedback; merge group tests integration with advancing main and other queued changes. Retain both. Same selected spec names do not mean the same tested tree. Existing multi-PR groups already union selection. |
| Merge-group subset → main full offline suite | Main catches selection escapes and tests the actual landed snapshot. Full coverage must remain. Potentially combine **main snapshots only**, after historical selection safety, pinning and culprit drills; a selected PR pass cannot replace this. |
| Main full → nightly / configured | Nightly tracing, exhaustive checks and authenticated/backend behavior answer additional questions. Configured jobs take 25.4 minutes median, 22.8 in tests and 2.0 starting the stack M. It is not chiefly repeated setup. Couple configured coverage to the same pin/range only after proving deadlines; preserve current cadence now. |
| Build → deployed verification | Built output and the deployed application are different boundaries. A skipped deploy-verification job is no pass. Reuse only immutable artifacts/results with identical tree, dependencies, config and test identity; equivalence is U here. |

A current-planner probe at the pinned SHA quantifies **selection overlap, not behavioral redundancy**:
command-adapter and proposal changes select 57 and 28 specs; the union is 57, sharing **46.94
of 152.49 separate table-minutes M/E**. Command-adapter plus rundown selects a 91-spec union,
sharing only **13.47 of 160.74**. These synthetic change shapes are not a historical selection
safety replay; all paths and selections are in the receipts. Parallel packing means neither
figure is a wall-time saving.

Prefer **small coherent PRs plus eventual batching of expensive validation**: independent review,
early feedback and one-landing reverts survive, while repeated full snapshots can be coalesced.
That requires pinned SHA/range, historical planner+headers+trace-map replay for every attributable
failure over two weeks, same-SHA confirmation, per-landing culprit isolation, stale alarm and
single-culprit revert drills. Keep full coverage during qualification. No hourly timer: the old
replay gives p90 detection 73.5 minutes; even immediate batching's slow-duration case reaches
68.3 minutes max. Refresh that replay after the Team window before activation, including failures,
configured execution and backlog. Completed relevant validation must meet 60 minutes; out-of-gate
coverage 24 hours with attributable landings. Unknown culprit is not permission to revert a batch.

**Combine related code and its necessary expectation update into one PR** when they implement one
behavior and can be reviewed/reverted together—#1317/#1337 illustrates the cost of splitting them.
Use the overlap measure to evaluate two already-ready related changes, not to hold finished work
waiting for a batch. Larger coupled changes increase first-feedback time, diagnosis search space
and revert damage; unrelated editor, catalog and playout changes stay separate. No giant PRs.

## Ranked decisions by waiting-time benefit and confidence

The ordering weighs attainable benefit, evidence and readiness, not runner cost or file counts.
No numerical figure below is a measured saving from a change made by this report.

| Rank | Decision | Expected latency gain; confidence |
|---|---|---|
| **1** | Close the live #1349 selection gap; keep related behavior/expectation changes together. | **U population median/p90**; protects against recurrence of the incident associated with 174.5/193.3-minute landings M, not a promise to save all of them. Adds about **1.04 table-minutes E** to shared plans. High confidence in the gap and earlier feedback; medium in avoided repair delay. First slice below. |
| **2** | **No scheduling change during Team trial.** Retain PR and merge-group checks, fixed envelope and cap. | New change saves **0** now; preserves interpretability. Baseline half-overhead sensitivity is **0.79 minutes p50 / 7.40 p90 E**, not a Team or batching forecast. Maximum case still about 459 minutes: scheduling alone cannot fix repair tails. High confidence that setup tuning is low priority. |
| **3** | One faithful tier move at a time; start with groups/arrangement geometry, retain rendered journeys and save/load faults. Repair unstable Factory checks from evidence. | Prior inventory estimates **2–3 full-suite table-minutes E** for geometry; per-landing gain **U**, depends on selection and critical shard. No extra saving for the already-split save matrix. Medium confidence in opportunity, low in net time until replacement/mutation receipts. Preserve current detection cadence. |
| **4** | Qualify immediate, pinned main batching after safety gates and trial. | Largest remaining load lever if contention persists: old replay **32% fewer full runs E** and detection p90 **150 observed → 28.4 modeled minutes** on its older window. Landing p50/p90 gain **U**; do not apply the 32% to landing time. Low/medium confidence until current-duration and failure replay passes; no activation now. |
| **5** | Controlled worker-throughput qualification, only if execution still dominates after trial. | Existing 51-test pilot: **318.75→224.9 s**, **93.85 s / 29.4% shorter M/E**, below the 35% threshold. Four workers' 48% is CPU-confounded; whole-suite gain **U**. No setting change. Use paired CPU-stratified arms, >=5 measured runs/arm, memory observations, identical assertions/identities, zero retries and every shard below 20 minutes. Stop on candidate-only failures. |

Do not prioritize production-preview migration, shaving 0.38-minute setup, disabling traces,
paid runners or raising limits. The existing preview evidence cannot preserve the many `/src/`
module-import tests unchanged. Any later consolidation needs defect replay/fault injection,
replacement cost and observed critical-path savings, not a smaller test count. Capacity-recorder
blindness to retry reports and the own-table “before” comparison noted in #1405 remain follow-ups;
they are not solved by this report or by adding shards.

## First implementation slice, ready for the next decision

**One PR for #1349: add the existing CLI round-trip test to shared critical journeys and pin its
selection.** At this implementation, the narrowest change is its `// focus` membership with a
reason explaining package import/export identity, plus `scripts/e2e-affected.test.mjs` regression
cases. Do not remove CORE classification or broadly rewrite the planner to make one header work.
The later explicit shared-set migration must carry this reason forward. No new browser assertions,
cadence changes or worker changes are needed for this slice.

Acceptance and verification:

1. Before change, the exact CLI probe below omits the spec. After change it selects it for
   `src/model/importTemplate.ts`, shared model/storage changes, and an integration union containing
   the import change. Previously selected specs and catalog/configured flags remain intact;
   docs-only still selects none. Pin the positive and negative cases in Node tests.
2. Record the historical #1317 selection failure separately from today's corrected plan; never
   relabel it a historical pass. Preserve #1337's intentional no-thumbnail assertions. Use the
   existing historical incident/log receipt; no full suite replay needed to prove the selector bug.
3. Report before/after selection and packed critical-shard predictions on the same SHA/table;
   current test weight is **1.042 minutes M**. Total suite capacity stays unchanged, shared-plan
   work increases. Measure actual PR/merge-group feedback in the ordinary CI, with no promised
   population latency reduction. This is a repair-prevention slice, not a throughput claim.
4. `/check`: targeted planner gates, five pinned scenario shapes, one bounded existing CLI
   round-trip selection if within the worker's allowed cap; authoritative PR/merge-group CI.
   Assertions, zero offline retries, 20-minute shard cap, 13-runner envelope and 60-minute/24-hour
   detection commitments remain. Reconcile open #1349 and active ownership again before starting.
5. **Rollback:** revert this membership/test commit through the queue if it causes unexpected
   operational trouble; record that the known selection hole reopens, keep per-push full
   validation, and require the explicit round-trip check for affected imports until repaired.
   Do not remove a product assertion to get it green. Annotate any trial-period implementation
   as a workload intervention; this research publication performs none of it.

## Reproduce without running suites

- Arithmetic: `python docs/work-specs/e2e-suite-budget/evidence/scripts/iteration-latency-study.py`.
  It reads the frozen baseline and new timestamp receipts only, checks the additive case timelines,
  and prints the case table, critical waits and overlap. Percentiles retain the baseline convention
  `sorted[floor(p*n)]`; no sample percentiles are substituted for the population.
- Selector: at the receipts' application SHA run
  `node scripts/e2e-affected.mjs --json --files src/model/importTemplate.ts` and
  `node scripts/e2e-capacity.mjs`. Both are read-only planning. Overlap uses
  `planFor(files, {sprintFocus:true, traced:readTracedMap(), specsOnDisk:specFilesOnDisk()})`, set
  intersection/union and that SHA's duration weights. `sprintFocus:true` matters: the exported
  function's default is full escalation, unlike the CLI. A changed/stale trace map may change a
  later probe; the captured selections are the dated evidence.
- Bounded GitHub collection: one GraphQL query for the 11 named PRs (`createdAt`, `mergedAt`,
  head SHA, first 100 added/removed queue events; pagination checked); one
  `actions/workflows/ci.yml/runs?event=pull_request&branch=<headRefName>&per_page=100` per PR,
  refusing >100 and filtering PR opening through merge. Read only first/latest run and the eight
  frozen final merge-run IDs: `actions/runs/<id>` and `/jobs?per_page=100`, checking total count.
  The initial collector used 60 requests with a 100-request cap; one reused-branch pre-opening run
  was excluded. The retained 23 runs contain 416 job records; no duplicate-run cost is summed.
- Additional bounded reads: 20 latest main runs, <=30 open PRs/issues per query, named #1349/#1405/
  #1081 discussions, six incident run-job lists and **six whole job logs**. CLI redirected log reads
  were unavailable; the connected GitHub log tool supplied them. Stable job links and excerpts
  are retained, not signed download URLs. Old receipts supply historical continuity; missing
  observations stay unknown. Raw working cache: `/tmp/noacg-iteration-study`, separate from the
  Team collector and its baseline. No dispatch, rerun, purchase or CI configuration write occurred
  during research; publication uses the normal repository queue.
