# E2E suite budget: shorter landings with credible regression protection

Status: AGREED - the owner's task of 2026-10-11 ("research and plan a sustainable test strategy")
with his amendments of the same day (staged move to batched full validation on pinned main commits,
selection safety first, maintenance as completed work). Baseline commit `f2eee85cf`.

## Why

The offline E2E suite grew from 115 measured minutes (2026-09-22) to 169 (2026-10-11), +47% in three
weeks, almost all of it new spec files (+26 minutes a week). The main-branch full run outgrew nine
shards in the week of 2026-09-28 (70 of 153 runs lost a shard at the 20-minute cap) and ten shards
the week after (49 of 121 runs; issue #1020 was the end of it), and now needs eleven of the
account's twenty concurrent runners for a 169-minute suite packed at 16.4 minutes a shard. The
twenty-runner ceiling is measured, not assumed: the account sat at exactly twenty running jobs for
17% of all busy time, and a third of shard jobs waited over two minutes for a runner. Queue entry
to landed is p50 9 / p90 22 minutes and the p90 rises about three minutes a week;
`docs/METRICS.md` targets p90 <= 20. CI consumed 57,600 runner-minutes in the week of 10-05 against
a target of 45,000 a month. Nothing budgets the total, nothing retires or consolidates tests (0 of
516 pull requests since 2026-09-20), and the instructions that create tests ("a Playwright spec in
the same commit") name no cheaper layer.

The evidence is in `evidence/`: measurements carry run IDs and commits, estimates are labelled, and
what could not be measured is listed as unknown.

## Goal

Landings stay fast and CI consumption stays inside a fixed resource envelope as the product grows,
while every protected behaviour keeps a maintained check at the cheapest layer that can prove it.
Concretely: queue entry to landed p50 <= 10 / p90 <= 20 minutes; a completed full validation of a
main snapshot containing any landed relevant change within 60 minutes; detection of anything
outside the merge gate within 24 hours with an attributable landing list; recurring CI minutes that
do not grow with the suite's file count.

## Non-goals

- Raising the 20-minute shard cap, or treating a shard that stops at the cap as a verdict.
- Adding runners, workers or concurrency as the primary answer (experiments measure them; they are
  not the plan).
- Moving work to nightly as such. "Nightly" is a cadence; the tiers are defined by what a check
  needs, and scheduled validation keeps attribution and a detection limit.
- Fewer test files or assertions for their own sake. Protected behaviours, failure modes and
  integration boundaries are what is preserved; counts are warning signals.
- Weakening required product behaviour to improve timing, or letting an automatic repair do so.
- Restoring every old-editor test as it was. Issue #800's ruling (rewrite onto current surfaces, do
  not delete) stands; each skipped test is mapped to a current behaviour or found obsolete.

## Owner requirements (his words, 2026-10-11)

1. Latency: "Keep p50 10 / p90 20 min" queue entry to landed; a full validation of a main snapshot
   with newly landed changes within 60 minutes (operational target, replaces a separate full verdict
   on every intermediate commit); out-of-gate detection <= 24 h with an attributable landing list.
2. Cost: "Capacity line, soft 85% / hard 95%": a capacity-derived line on the full-run table, a
   warning on every pull request above 85%, above 95% a pull request that adds measured spec-minutes
   needs an expiring exception recorded in its work spec naming what it protects; recovered minutes
   stay as headroom unless he reallocates; no one-in-one-out rule; weekly runner-minute report
   without a gate. Amended: base capacity on measured job headroom and a fixed resource envelope;
   a higher shard count must not silently raise the budget; no blanket exemptions by bot identity or
   a revert label; automatic repairs can neither weaken protection nor manufacture exceptions.
3. Evidence: "Graded rule with defect replay or fault injection". Amended: preserve named
   behaviours, failure modes and necessary integration boundaries, not raw counts; consolidation may
   reduce duplicate cases when retained protection is demonstrated; counts and skips are warning
   signals, not equivalence proof; assess qualification/task tests individually.
4. Cadence, amended: a staged move toward affected tests plus a small set of critical journeys
   before merging, lightweight verification of the deployed application reusing existing checks,
   batched full E2E runs on pinned main commits, and scheduled exhaustive validation for expensive
   checks. Broader pre-merge checks stay for genuinely shared or uncertain impact. Tests are never
   selected solely by folder or product-domain labels. Selection safety is established before the
   full-run frequency drops, with full post-merge coverage kept during that validation phase.

## Decisions (derived; the owner can revert any of them in this file)

1. **Capacity envelope.** Capacity is `MAIN_RUNNERS x budgetMinutes(table)`, where `budgetMinutes`
   is the existing `(20 - 3 - jobMinutes p90) / testFactor` and `MAIN_RUNNERS` is a constant held
   in `scripts/e2e-durations.mjs` (11 today), changed only by a reviewed commit that cites the
   org-wide 20-job ceiling and the measured peak concurrency. `MAX_SHARDS` may follow the table;
   the envelope does not. Usage is `planMinutes(full suite on disk) / capacity`. Lines: 85% warn,
   95% exception. Today: 169.4 / 180.6 = 94%.
2. **Estimated at the plan, measured at the report.** `scripts/e2e-capacity.mjs` runs twice on a
   pull request or merge group. In the plan job, before any shard starts, it estimates usage with
   the change's spec files counted at their table value or, for a spec the table has never seen,
   the median; that estimate is what the gate reads, so a refusal arrives in seconds rather than
   after a 10-minute report job the gate would otherwise have to wait for. In the `e2e-report`
   job, which already merges every shard's blob, it weighs the same files with what they cost in
   this run and prints the measured usage beside the run's runner minutes and wall clock, three
   separate figures; a spec the report does not carry (its shard died) counts at the suite's p90,
   not the median, so a partial report cannot flatter a change. The weekly refresh pull request
   reconciles both with the next full run on main. (Amended 2026-10-12 from "measured only in
   the report job": the report job is deliberately not in the gate's `needs`, and adding it would
   put a minute on every landing.)
3. **Exceptions are narrow and expire.** An exception is one line in the pull request's work spec
   (`docs/work-specs/<x>/spec.md`, section "Budget exceptions"): the spec file, the measured
   minutes, the protected behaviour, and an expiry date at most 30 days out. The check refuses an
   entry without all four. A mechanical landing is exempt only for the files it owns
   (`e2e/quarantine.json`, `scripts/e2e-traced.json`, `scripts/e2e-durations.json`, a revert that
   removes the files it reverts); any other file it touches is checked like any pull request.
4. **Fixers cannot write exceptions or lower protection.** The build check `check:e2e-protection`
   refuses a change that removes a spec, removes test declarations, adds `test.skip`/`fixme`, or
   raises a per-test timeout above 120 s in the merge-gate set, unless the same change carries a
   maintenance entry (section "Test maintenance" in a work spec: behaviours preserved, replacement
   check, evidence receipt). The root auto-fix rule gains: a repair never writes a budget exception
   or a maintenance entry. Both entries are reviewed by `/check` like any other claim.
5. **Selection extends `scripts/e2e-affected.mjs`; nothing new selects.** The expired sprint focus
   is replaced by an explicit, reviewed `SHARED_CHANGE_SET` in `scripts/e2e-lists.mjs`: the specs
   that run when a change is shared or uncertain (CORE, unmapped, helpers, traced-map problem).
   Membership is by named journey, documented per entry; no folder or domain label selects. The
   traced map flags specs it cannot see (own browser context) and the planner treats their covered
   files as unmapped for them. Configured triggers are reported on the pull request and run at the
   next full validation, not on every push.
6. **Main validation is batched, pinned and never cancelled.** A full validation starts when at
   least one landing since the last validated snapshot has a plan other than `none`, and no
   validation is in progress; it pins main's tip, records the landing range (`validated.json` in
   the run's summary and the `noacg/validated` commit status on the pinned SHA), runs the full
   offline suite, the catalog gate when any landing in the range flagged it, and the configured
   suite. A finished validation starts the next one at once if new relevant landings arrived.
   Replayed over 2026-09-15..10-11 this cuts full runs by a third and brings detection from
   p50 33 / p90 150 minutes (cancellations) to p50 19 / p90 28 (`evidence/cadence-replay.md`).
7. **Stale validation and failure assignment.** No completed validation within 60 minutes of a
   relevant landing raises the existing rolling red-main issue with reason "validation stale" and
   the landing range; landings are not blocked. A red validation re-runs the failed specs on the
   pinned SHA (existing retry); a confirmed failure runs those specs against each landing SHA in
   the range in one job (at most a handful: batch p90 is 2) and names the culprit; the revert takes
   that landing, not the range. A landing list is the candidate set, never the verdict.
8. **Rollout gate for the cadence.** Enabled only after `evidence/selection-audit.md`'s criteria
   pass: two weeks in which every failure found by a full validation was also selected by the
   pull-request plan of its culprit (replayed), the stale alarm and the bisect job have fired in a
   drill, and the capacity check is live. Rollback is one repository variable
   (`NOACG_MAIN_VALIDATION=per-landing`) read by the plan job.
9. **Placement rule replaces the bare new-flow rule.** A durable check goes to the cheapest
   faithful layer: a Node test under `scripts/` importing `src` for pure logic; a browser
   integration spec (import in a blank page, no `/app` boot) for DOM, canvas, fonts or layout;
   one journey spec per user-visible flow, extended in the maintained file for that flow rather
   than a new file per feature or bug; the configured suite only for backend-dependent behaviour;
   scheduled validation for exhaustive or qualification walks, with a landing list. Cadence is
   not a tier.
10. **Maintenance is scheduled work.** The weekly `e2e-durations-refresh.yml` pull request carries
    the capacity usage, the week's top adders and a ranked candidate list (expected saving x
    selection share, risk, effort). The monthly quality review already owns "CI and e2e cost" and
    turns the top candidates into wave rows with an owner, a completion trigger and a measured
    result recorded in this spec's "Completed maintenance" section. This starts now, at 94%, not
    at 95%. Quarantine entries older than 14 days without release open an issue; exceptions expire.

## Acceptance criteria

### AC-1: The evidence is recorded and reproducible
`evidence/` holds the measurements with run IDs, commits, sample sizes and percentiles, labelled
measured / estimated / unknown, and the scripts that recompute them from the Actions API.

### AC-2: Selection is audited and extended before the cadence changes
`evidence/selection-audit.md` records the expired focus set, the traced map's blind spots, unmapped
and shared files, configured behaviour and multi-domain merge groups, with the expected plan for a
playout-only change, one catalog template, an editor-only change, a shared model/rendering/storage
change and an uncertain change, pinned by `scripts/e2e-affected.test.mjs`. Misses are measured
against continuing full runs; "no miss observed" is not completeness.

### AC-3: The capacity check runs on every pull request and merge group
The check summary shows execution, runner and latency figures separately, warns above 85%, refuses
added measured minutes above 95% without a valid expiring exception, counts unmeasured specs at the
p90, exempts mechanical landings only for their own files, and does not change when `MAX_SHARDS`
changes.

### AC-4: Full validation is batched, pinned and attributable
Main runs the full suite on pinned snapshots with the landing range recorded; no validation is
cancelled by a later landing; nothing relevant waits more than 60 minutes (p90, replayed and then
observed over two weeks) for a completed validation; a stale validation alarms; a red validation
names its culprit landing by re-running the failed specs per landing.

### AC-5: Shared-change set and critical journeys are explicit
The focus set is retired; `SHARED_CHANGE_SET` lists named journeys with a reason each; the catalog
gate runs on main only when a landing in the range flagged catalog paths.

### AC-6: Qualification and task walks are assessed one by one
Each of the five has a written verdict (keep pre-merge, move to scheduled validation with a named
replacement, or merge) and the move is made only where replacement coverage is credible.

### AC-7: Maintenance produces completed work
The weekly refresh pull request shows usage, adders and ranked candidates; at least three
candidates from `evidence/candidates.md` land as wave rows with measured before/after; the
"Completed maintenance" section below records them.

### AC-8: Instructions stop creating unnecessary browser tests
The new-flow rule is replaced by the placement rule; `docs/VERIFICATION.md` no longer says there is
no unit-test suite; the work-spec README asks acceptance criteria to name the tier.

### AC-9: Automatic repairs cannot weaken protection
`check:e2e-protection` refuses coverage removal without a maintenance entry; the auto-fix rule
forbids a repair from writing exceptions or maintenance entries; both are mutation-tested.

### AC-10: Every phase reports measured before/after
Each phase's pull request records runner minutes per week, queue entry to landed p50/p90, slowest
shard p50/p90, and detection p50/p90 before and after.

## Budget exceptions

None.

## Test maintenance

Each entry: date, spec files, behaviours preserved, replacement check, evidence receipt, measured
saving.

- 2026-10-17 `e2e/save-transaction.spec.ts`: 78 of its 107 matrix cases moved unchanged (same titles, same assertions, same fault injector) into `e2e/save-transaction-holds.spec.ts`, `-wizard`, `-leave` and `-leave-modal.spec.ts`, with the shared helpers in `e2e/_saveMatrix.ts`; every row of the repair-6 and repair-7 matrices (docs/work-specs/editor-leave-reliability) stays protected by the same case. Replacement check: `npx playwright test --list` over the five files declares exactly the 107 titles the one file declared. Receipt: issue #1405; the file measured 26.7 minutes on one runner in run 39048521384's retry job, above the 20-minute shard cap, so no shard could ever carry it. Measured saving: none - the same 26.7 minutes, split so the packer can place them.

## Completed maintenance

None yet. Each entry: date, candidate, owner, result (table-minutes, runner-minutes per week,
latency), escaped regressions since.
