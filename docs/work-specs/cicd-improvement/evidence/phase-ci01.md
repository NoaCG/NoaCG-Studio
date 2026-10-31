# Phase ci01: baseline and launch-readiness evidence

Read-only baseline for the [cicd-improvement spec](../spec.md), row ci01 (P0; AC-1 baseline).
Prepared 2026-10-31 by the ci01 builder (Claude Code Cloud worker of plan run #1842). Every
number below comes from repository files or GitHub REST reads made in this session; no workflow,
setting, test, list, budget or product file changed. Nothing here passes AC-1 or any later
criterion: it is the frozen starting point later rows measure against.

## 1. Pinned source and configuration

| What | Pin |
| --- | --- |
| Main at phase start | `cba1fcf2c5096aca5be9b64fa5eb472ead395d5e` (#1841). Its push CI 41182134885, configured suite 41182134823, post-land and quarantine runs all succeeded. |
| Main when this file was written | `ee73212a19d9260de8ccc8abebe489a95a4edeb1` (#1843: cloud-session setup hook only; no workflow, selector, capacity or table file changed) |
| Configured-suite sharding cutoff | four shards landed in `c80b571d` (#1675) at 2026-10-24T16:52:03Z. Cohort rows start after it. |
| Production-page ledger | `claude/noacg-recovery/plan-production-page-2026-10-21` at `7d45649ece0b81d590905e04d3ffae7eabd7c732` (2026-10-28T22:32Z), `ledger.md` |
| Ruleset `22389043` "main is landed by the queue" | merge queue ALLGREEN, MERGE method, build 5 / merge 5 entries, min 1 entry, 2 min wait, 60 min check timeout; required checks `CI gate` and `Reviewed`; strict policy off. Unchanged since the 2026-10-25 read. |
| Repository | public, auto-merge allowed |

Workflow and budget files at `cba1fcf2` (git blob prefixes, identical at `ee73212a`):

| File | Blob |
| --- | --- |
| `.github/workflows/ci.yml` | `64c16b0d1f20` |
| `.github/workflows/configured-suite.yml` | `a393911a51a7` |
| `.github/workflows/nightly.yml` | `fc915484533d` |
| `.github/workflows/catalog-gates.yml` | `34f3561d20b6` |
| `.github/workflows/deploy-verify.yml` | `d763a9bbaf2b` |
| `.github/workflows/post-land.yml` | `b37d401724d6` |
| `.github/workflows/quarantine.yml` | `2cf95f9a83f8` |
| `.github/workflows/e2e-durations-refresh.yml` | `f44d07699ef1` |
| `scripts/e2e-capacity.mjs` | `9aaadad3a0c0` |
| `scripts/e2e-durations.json` | `ee66a8eb3380` |
| `scripts/e2e-affected.mjs` | `9ddea510d9f9` |

Concurrency groups as configured: CI keys merge groups by run id and everything else by ref,
cancelling in progress except on main and merge groups. The configured suite keys a push by SHA,
a non-main dispatch by its branch (#1816), and schedules plus main dispatches share `shared`;
it never cancels in progress. Nightly, post-land and the durations refresh each use one group.

### Collection method and limits

GitHub REST reads through `gh api`, with every immutable read (closed PR, completed run, its
jobs, deployment statuses) cached by path and each collection pass stopped at 100 calls:
fourteen passes, about 1,000 calls in all plus a few single reads; one pass was cut short by a
connection reset and the next resumed from the cache. The 15,000-per-hour limit never fell
below 14,400 remaining. Organisation endpoints (plan, billing) and repository environments are refused to
this session, so the account plan was not read directly. No log text beyond the failing test
lines below was kept; no credential or signed URL is recorded. Run end times are `updated_at`;
job times are `started_at` to `completed_at`.

## 2. Baseline cohort and missing samples

**Cohort.** Every production-page row whose first `build` event follows the sharding cutoff and
that reached a final independent PASS by the ledger pin: rows 30 to 50, **21 completed rows**,
24 landed PRs. The run was serial (one row at a time), so rows do not overlap each other.
Unfinished eligible rows in the window: **none**. Rows 51 (H0.2) and 52 (S) are owner-only blocks
with no builder and are outside the cohort. Row 29 started before the cutoff and is excluded.

**Strata.** A row is *backend/stateful* when its first PR changed `supabase/`, `api/` or
`e2e/configured/` files (13 rows: 30-34, 38-41, 43, 45-47); otherwise *feature* (8 rows: 35-37,
42, 44, 48-50). No row is an *extraction* row.

| Stratum | Rows | Builder start to final PASS, hours: p50 / p90 / max | Sample status |
| --- | ---: | --- | --- |
| Pooled | 21 | 3.69 / 9.15 / 10.63 (mean 4.48) | meets the 12-row minimum |
| Backend/stateful | 13 | 3.7 / 10.2 / 10.6 | meets 12 |
| Feature | 8 | 3.0 / 7.2 / 7.2 | **provisional**: 4 short of 12 |
| Extraction | 0 | none | **missing**: no comparable post-sharding row |

Percentiles are nearest-rank. Small strata are reported, never padded.

### Sequential segments (no overlapping intervals)

Each row's builder-start-to-final-PASS time is cut at its own ordered events into consecutive
segments, so the segments of a row add up exactly to its gross time (checked for all 21 rows,
rounding only). A segment that would start before the previous one ended is clipped, so no
minute is counted twice. Minutes, nearest-rank over the 21 rows:

| Segment (start to end) | What it holds | p50 | p90 | max | Share of all row time |
| --- | --- | ---: | ---: | ---: | ---: |
| Builder start (ledger `build`) to PR open | coding and local checks | 64.8 | 110.2 | 484.2 | 32.2% |
| PR open to first `noacg/reviewed` stamp | PR CI, configured dispatch, Codex review, in-PR repair | 87.7 | 208.8 | 429.2 | 42.8% |
| Stamp to merge-queue entry | coordinator approval and auto-merge request | 15.0 | 29.1 | 84.0 | 6.2% |
| Queue entry to merge-group run start | queue wait | 0.3 | 0.3 | 0.9 | 0.1% |
| Merge-group CI run | execution | 9.2 | 12.3 | 27.2 | 4.0% |
| Merge-group run end to merged | queue bookkeeping | 0.0 | 0.2 | 0.5 | 0.0% |
| Merged to independent check start | checker wait | 0.8 | 2.4 | 5.0 | 0.5% |
| Independent check | checker | 20.3 | 70.2 | 86.9 | 11.3% |
| FAIL to repair start | diagnosis | 0 | 0 | 4.6 | 0.1% |
| Repair start to repair PR open | repair coding | 0 | 0 | 133.1 | 2.6% |

The repair PRs' own review, queue and check time fall into the matching segment rows above.

**Execution inside review time.** The PR-open-to-stamp segment overlaps CI. Within it, the
union of time with at least one of the branch's CI or configured-suite runs executing is
reported per PR in the table below (union, so parallel runs are not added): 1,894 of 2,418
minutes in total. The remainder is time with nothing running: review service, coding fixes and
agent turns. This is measured occupancy, not active agent work; commit frequency was not used.

**Review.** First PR review event after open: p50 3.3, p90 10.0, max 37.3 minutes. PR review
events per PR: p50 2, p90 14, max 26 (122 in all). Review events are counted, not finding
families: the ledger and timeline do not record families, so that measure stays **missing**.

**Repair rounds.** 2 of 21 rows (9.5%) failed an independent check after landing, in 3 failed
check attempts: row 30 once, row 32 twice. Row 32's two failures are one family (press-safety
base and instance identity), so it is a repeated-family row. These 3 failed checks in 2 rows are
the cohort's **escaped defects**: product faults that passed every PR and merge-group gate and
were found only by the post-landing checker. Later comparisons count rows and attempts apart.

**Cancelled and failed attempts.** Across the 24 PRs: 267 PR CI runs, 186 cancelled and 28
failed; 197 configured-suite dispatches, 100 cancelled (mostly before #1816 gave each branch its
own group). Runner-minutes by conclusion, including estimated PR-event waste, are in section 5.

### Eligible runner wait versus dependency wait

GitHub creates a job record when its `needs` are satisfied, so job `created_at` to `started_at`
is the eligible wait for a runner; run start to job creation is dependency wait, which
holds build and plan jobs and is not tabulated separately here.
In two dense windows (2026-10-25 04:30-08:00Z, 1,123 jobs from 168 runs; 2026-10-30
21:00-23:00Z, 670 jobs from 98 runs) eligible runner wait was p50 0.03, p90 0.03-0.05, p99
0.08-0.18 and max 0.3 minutes. No job waited a minute for a runner. Queue-to-merged time from the last queue entry
(p50 9.2, p90 12.1 minutes) is almost all merge-group execution, not waiting for runners.

### Per-PR detail


| PR | Row | Exec union in open-to-ready | PR CI runs (cancelled/failed) | Configured dispatches (cancelled) | PR review events | Queue to merged | MG SHA = merge | Merge to Vercel | Merge to migrations | Merge to configured verdict | Configured push |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #1695 | 30 | 336.8 of 428.7 | 39 (23/1) | 36 (9) | 26 | 10.5 | yes | 2.9 | 0.6 | 13.2 | 40162651190 success |
| #1704 | 30 | 0.4 of 0.5 | 1 (0/0) | 1 (0) | 0 | 7.4 | yes | 2.9 | 0.7 | 12.7 | 40166932918 success |
| #1724 | 31 | 25.7 of 56.4 | 6 (4/1) | 2 (1) | 2 | 10.3 | yes | 3.1 | 0.5 | 12.9 | 40195784477 success |
| #1728 | 32 | 136.8 of 138.8 | 18 (14/0) | 17 (14) | 14 | 11.6 | yes | 2.9 | 0.5 | 13 | 40220670819 success |
| #1730 | 32 | 12.4 of 12.4 | 2 (0/1) | 2 (0) | 0 | 8.9 | yes | 2.9 | 0.7 | 12.4 | 40228841896 success |
| #1731 | 32 | 33.1 of 33.2 | 8 (6/1) | 4 (3) | 1 | 8 | yes | 2.2 | 0.6 | 13.6 | 40243461679 success |
| #1732 | 33 | 97.4 of 113.7 | 11 (6/4) | 10 (3) | 5 | 8.8 | yes | 2.3 | 0.5 | 12.4 | 40262481644 success |
| #1735 | 34 | 67.3 of 89.6 | 9 (3/5) | 1 (0) | 1 | 8.9 | yes | 3.4 | 0.7 | 13 | 40281001994 success |
| #1740 | 35 | 58.8 of 79.8 | 10 (8/0) | 10 (8) | 2 | 12.1 (2 entries, first 70.5) | yes | 2.8 | 0.5 | 13.4 | 40302896279 success |
| #1753 | 36 | 150.5 of 194.4 | 15 (6/3) | 9 (0) | 8 | 12.3 | yes | 3.5 | 0.8 | 13.2 | 40364795490 success |
| #1756 | 37 | 14.5 of 14.6 | 4 (3/0) | 3 (2) | 3 | 9 | yes | 2.8 | 0.8 | 13.5 | 40382043283 success |
| #1757 | 38 | 34.4 of 34.5 | 7 (6/0) | 7 (6) | 2 | 10.5 | yes | 3 | 1.1 | 13.5 | 40400474947 success |
| #1763 | 39 | none: stamped 8.4 min before the PR opened | 4 (2/0) | 9 (2) | 0 | 8.9 | yes | 2.5 | 0.9 | 13.8 | 40458529397 success |
| #1765 | 40 | 56.8 of 56.9 | 8 (5/0) | 6 (1) | 3 | 7.9 | yes | 2.1 | 0.5 | 13.4 | 40476286073 success |
| #1772 | 41 | 87.7 of 87.7 | 16 (15/0) | 11 (9) | 8 | 12.1 | yes | 2.4 | 0.5 | 13.4 | 40501378422 success |
| #1774 | 42 | 38.8 of 42.5 | 5 (3/1) | 4 (2) | 2 | 10.4 | yes | 2.6 | 0.6 | 13.9 | 40522413219 success |
| #1776 | 43 | 140.2 of 159 | 17 (12/3) | 13 (3) | 9 | 12.4 | yes | 5.1 | 2.8 | 15.6 | 40569021396 success |
| #1779 | 44 | 79.4 of 129.8 | 9 (6/2) | 4 (2) | 4 | 12 | yes | 3.3 | 0.5 | 13.8 | 40606317710 success |
| #1780 | 45 | 56.9 of 63.8 | 11 (9/0) | 11 (7) | 7 | 9.2 | yes | 3.6 | 1.3 | 13.9 | 40624330563 success |
| #1781 | 46 | 189 of 208.8 | 27 (24/2) | 23 (22) | 16 | 9.4 | yes | 2.8 | 0.5 | 14 | 40651918160 success |
| #1786 | 47 | 41.3 of 45.5 | 6 (5/0) | 6 (3) | 2 | 8.6 | yes | 2.6 | 0.7 | 13.7 | 40663901945 success |
| #1790 | 48 | 30.2 of 41.8 | 3 (2/0) | 3 (2) | 0 | 9.2 | yes | 2.8 | 0.6 | 13.8 | 40680316462 success |
| #1791 | 49 | 117 of 281.1 | 17 (13/3) | 2 (0) | 6 | 8.6 | yes | 3.9 | 1 | 14.3 | 40745259430 success |
| #1800 | 50 | 88.9 of 104.8 | 14 (11/1) | 3 (1) | 1 | 8.7 | yes | 3 | 0.5 | 13.8 | 40771239691 success |

Row-level segment minutes (Cat is the stratum; Gross is builder start to final PASS):

| Row | Cat | PRs | Gross | Build | Open to ready | Ready to queue | Queue wait | MG run | MG end to merge | Merge to check | Check | Fail to repair | Repair build |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | backend | #1695 #1704 | 637.6 | 70 | 429.2 | 28.6 | 0.6 | 17.1 | 0.3 | 2.1 | 73.8 | 0.2 | 15.7 |
| 31 | backend | #1724 | 148.1 | 45.1 | 56.4 | 15 | 0.3 | 9.9 | 0.2 | 0.4 | 20.9 | 0 | 0 |
| 32 | backend | #1728 #1730 #1731 | 610.8 | 84.2 | 184.4 | 84 | 0.9 | 27.2 | 0.5 | 5 | 86.9 | 4.6 | 133.1 |
| 33 | backend | #1732 | 234.3 | 82 | 113.7 | 8.3 | 0.3 | 8.7 | 0 | 2.2 | 19.1 | 0 | 0 |
| 34 | backend | #1735 | 221.6 | 71.3 | 89.6 | 19.3 | 0.3 | 8.6 | 0 | 0.8 | 31.6 | 0 | 0 |
| 35 | feature | #1740 | 177.7 | 53.6 | 79.8 | 15.5 | 0.3 | 11.6 | 0.2 | 0.7 | 15.9 | 0 | 0 |
| 36 | feature | #1753 | 433.5 | 201.3 | 194.4 | 4.2 | 0.3 | 12.3 | 0 | 1.3 | 19.8 | 0 | 0 |
| 37 | feature | #1756 | 107.3 | 49.7 | 14.6 | 18 | 0.3 | 8.9 | 0 | 0.8 | 15 | 0 | 0 |
| 38 | backend | #1757 | 125.6 | 52.8 | 34.5 | 9.7 | 0.3 | 10.2 | 0 | 3.2 | 15 | 0 | 0 |
| 39 | backend | #1763 | 548.8 | 484.2 | 0 | 29.1 | 0.3 | 8.6 | 0 | 2.4 | 24.2 | 0 | 0 |
| 40 | backend | #1765 | 161.5 | 47.8 | 56.9 | 30.2 | 0.3 | 7.6 | 0 | 1.9 | 16.7 | 0 | 0 |
| 41 | backend | #1772 | 199.9 | 66 | 87.7 | 13.1 | 0.3 | 11.6 | 0.1 | 0.8 | 20.3 | 0 | 0 |
| 42 | feature | #1774 | 155.6 | 59.5 | 42.5 | 12 | 0.3 | 10 | 0.1 | 0.8 | 30.5 | 0 | 0 |
| 43 | backend | #1776 | 285.7 | 64.8 | 159 | 21.7 | 0.3 | 12.2 | 0 | 0.8 | 27 | 0 | 0 |
| 44 | feature | #1779 | 270.3 | 110.2 | 129.8 | 0.4 | 0.3 | 11.6 | 0.1 | 2.3 | 15.7 | 0 | 0 |
| 45 | backend | #1780 | 177.9 | 68.4 | 63.8 | 18.5 | 0.3 | 8.8 | 0 | 2.3 | 15.9 | 0 | 0 |
| 46 | backend | #1781 | 283 | 44.1 | 208.8 | 0.5 | 0.3 | 9.2 | 0 | 0.6 | 19.4 | 0 | 0 |
| 47 | backend | #1786 | 124.9 | 24.7 | 45.5 | 0.4 | 0.3 | 8.5 | 0 | 0.5 | 45 | 0 | 0 |
| 48 | feature | #1790 | 118.7 | 28.1 | 41.8 | 0.4 | 0.3 | 8.8 | 0.1 | 1 | 38.3 | 0 | 0 |
| 49 | feature | #1791 | 396.5 | 87.7 | 281.1 | 1.2 | 0.3 | 8.8 | 0 | 0.4 | 16.9 | 0 | 0 |
| 50 | feature | #1800 | 226.2 | 24.1 | 104.8 | 17.6 | 0.3 | 8.4 | 0 | 0.6 | 70.2 | 0 | 0 |

Row 39's 484-minute build segment runs overnight (21:18 to 05:22Z) and is kept as a tail, not
removed. Rows with repair PRs sum each segment over their PRs.

## 3. Nightly failures and deployment ordering

### Nightly classification

The spec cites four failed nightlies among the last ten. The fifteen most recent `nightly.yml`
runs at collection (2026-10-18 to 2026-10-31) hold five failures, all between 2026-10-19 and
2026-10-23; the eight runs since 2026-10-24 all passed, so the current last ten hold two.

| Run | Date | Failing job | Failure | Class | Status |
| --- | --- | --- | --- | --- | --- |
| 39201147576 | 10-19 schedule | Combined nightly report, "E2E time budget" | mean per-test time 6.09 s over the 5.50 s ceiling; like-for-like 12.4% slower over 2,148 tests | suite-wide slowdown, not a product fault | budget step passed in all 13 later runs; the trace-overhead reduction #1504 landed the same day (attribution by timing only, no replay) |
| 39323236011 | 10-19 dispatch | Nightly E2E 7/15 | `editor-arrangement.spec.ts:277`: execution context destroyed by a navigation | flaky spec (timing) | released from quarantine 10-17; no failure since; no dedicated issue |
| 39372122320 | 10-20 schedule | Nightly E2E 9/15 | `wizard-shell.spec.ts:558`: cold open on a foreign step does not land on Entry | flaky spec | quarantined 10-23 (#1635), released 10-25 (#1707); cause open in **#1622** |
| 39724997061 | 10-22 schedule | Nightly E2E 4/12 | `rundown-history.spec.ts:268`: Undo after Delete ignored | product race | fixed by #1650; #1649 closed 10-24 |
| 39903020781 | 10-23 schedule | Nightly E2E 3/12 | `wizard-shell.spec.ts:424`: reload on a step URL | flaky spec, same file as 10-20 | **#1622** open |

One of five was a real product defect (fixed), one a suite-wide slowdown that has not recurred,
and three were flaky specs, two of them in one file whose cause is still open. None of this
justifies narrower coverage: the wizard-shell spec runs again and #1622 owns its cause.

### Deployment ordering

Production is deployed by Vercel's Git integration on every push to `main`; `post-land.yml`
applies migrations under the `production` environment on the same push; `configured-suite.yml`
judges the same SHA in parallel; the merge group skips the configured suite. For all 24 cohort
landings (statuses read per deployment record), minutes from merge:

| Event | p50 | p90 | max |
| --- | ---: | ---: | ---: |
| Migrations applied (post-land, `github-merge-queue[bot]` success) | 0.6 | 1.1 | 2.8 |
| Vercel production deployment success | 2.9 | 3.6 | 5.1 |
| Configured-suite verdict on the merge SHA | 13.5 | 14.0 | 15.6 |
| Full push CI on the merge SHA | 15.3 | 17.9 | 29.3 |

**In 24 of 24 landings, production and its migrations were live before the configured
verdict**, by 9.5 to 11.4 minutes (p50 10.5). All 24 of those verdicts passed. Across all 122
landings in 2026-10-24..30 the configured push run failed 4 times (runs 40177524989,
40289330116, 40724937287, 41134775201) and was cancelled 3 times. All 7 SHAs had their
migrations applied first. Three (failures 40177524989 and 40724937287, cancellation
40093685213) also had a Vercel production deployment before the verdict; the other four show no
Vercel success on their deployment record, which suggests (not shown) that Vercel skipped the
build and production kept an earlier one. Backend
integration of the combined tree is never checked before migrations reach production.

The existing incident path: a red configured run files or updates the rolling issue
`Configured (authenticated) E2E suite is red`, which `scripts/alarm-issues.mjs` shows in every
session; repair is a fix or revert landed through the queue (docs/DEPLOYMENT.md). It is a report,
not a gate. There is no automatic rollback, and a revert does not undo an applied migration.

### Unresolved blockers, named and not authorized away

- Deployment and migrations precede the backend verdict (above). ci06 adds selected configured
  PR checks, which still leave the combined-tree gap the spec states. Changing the deployment
  order is an owner decision outside this plan's rows: **#1846**.
- A PR can land before its own configured run reports: **#1101** (open).
- wizard-shell nightly flakiness: **#1622** (open).
- Quarantined at collection: `e2e/configured/late-send-abandoned.spec.ts` (#1805) and
  `e2e/editor-transform-qualification.spec.ts`. Each is a coverage gap while quarantined.
- The durations table is past its freshness bound (section 4.4): **#1847**.

None of these authorizes narrower coverage; every existing check stays.

## 4. Frozen ceilings (version 1, 2026-10-31)

These are the starting ceilings ci18 implements. They are not gates yet: nothing here changes a
workflow, script or budget constant. They count as frozen once the independent assessment of
this PR and the phase checker accept them. A later change needs an explicit reviewed rationale
and owner authority, never automatic rebaselining.

Owners: the cicd-improvement plan coordinator (run issue #1842) operates them until ci17 hands
off; the repository owner is the authority for any change.

### 4.1 Account concurrency

The suite-budget evidence measured a hard plateau at 20 running jobs on the Free plan
([cost-and-growth](../../e2e-suite-budget/evidence/cost-and-growth.md)). Measured now, counting
distinct runner names so a job listed twice is not counted twice:

| Window | Jobs | Peak distinct runners | Time at peak | Eligible wait max |
| --- | ---: | ---: | --- | ---: |
| 2026-10-25 04:30-08:00Z | 1,123 | 55 | 17 s at 55 or more | 0.3 min |
| 2026-10-30 21:00-23:00Z | 670 | **60** | 24 s at exactly 60, never above | 0.2 min |

Actual concurrency: **at least 60 concurrent standard Linux jobs observed**, with no job
waiting, which matches GitHub's documented Team plan limit of 60
(https://docs.github.com/en/actions/reference/limits). The 20 limit is obsolete. Not shown: the
limit itself, since no sampled moment had more than 60 eligible jobs; the plan (organisation
endpoints are refused to this session); and whether other NoaCG repositories share the pool. **Neither number raises any ceiling**: `MAIN_RUNNERS` stays 13 for a
full offline run, `MAX_SHARDS` stays separate from it, and the merge queue keeps 5 builds.
Slots and runner-minutes are reported separately; neither proves the other fits.

### 4.2 Tier ceilings and the common-basis envelope

**Measure.** Runner-minutes of every job that held a runner (started to completed), including
failed, cancelled and re-run attempts. Each job counts once, in one tier, by workflow and job
name:

- *Offline*: `ci.yml` E2E shards, plan, retry and combined report; nightly E2E shards and plan;
  offline quarantine runs.
- *Backend, selected and full*: every `configured-suite.yml` and `hosted-latency.yml` job.
- *Graphics, affected, broad and scheduled*: catalog calibration (CI and nightly), the type-floor
  and overflow sweep, `catalog-gates.yml`, `fit-sweep.yml`.
- *Fixed overhead*: everything else, including build, factory gates, CI gate, Reviewed, the
  Vercel wait, post-land, deploy-verify, cloud queueing, verdict jobs and CodeQL scanning.

**Common basis, normalised to the workload.** A ceiling must not refuse growth just because more
work lands (D6 aims at three plans at once; AC-8 judges cost per accepted change). So each tier
has two ceilings: **runner-minutes per landing** for everything a landing causes (its push run
plus its share of merge-group, PR and dispatch runs, so repeated and cancelled PR runs count
against the change), and **runner-minutes per day** for scheduled work, which does not scale with
landings. The rolling window is 7 days.

**Reference workload,** 2026-10-24..30: 122 landings (17.4 a day), 129 merge-group runs, 473 PR
CI runs, 276 configured dispatches, 606 CodeQL runs, and the scheduled nightly, configured,
catalog-gates, hosted-latency and fit-sweep runs. Jobs were read for all 657 completed push,
merge-group, dispatch and scheduled runs. PR-event runs are estimated: every PR CI run (44) and
configured dispatch (8) created in the two dense windows of section 2, scaled by exact run
counts per conclusion; for CodeQL, the most recent 86 PR runs, every sixth push run (20), and the
dependency-update and scheduled runs (5), 111 of 606. Lines resting on estimates are marked;
they are provisional calibration for ci18.

Baseline, 7-day totals in runner-minutes (est. marks the estimated lines):

| Tier | Push runs | Merge group | PR (est.) | Dispatch | Scheduled or other | Landing-driven total | Scheduled per day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Offline | 19,237 | 4,717 | 24,671 | 1,426 | 1,161 | 50,051 | 166 |
| Backend | 5,606 | 0 | 5,841 | 0 | 431 | 11,447 (half est.) | 62 |
| Graphics | 378 | 95 | 380 | 93 | 642 | 946 | 92 |
| Fixed overhead | 3,122 (2,083 CodeQL, est.) | 903 | 6,111 (2,191 CodeQL) | 70 | 56 | 10,206 | 8 |

Frozen ceilings, version 1:

| Tier | **Baseline per landing** | **Ceiling per landing** | **Baseline scheduled/day** | **Ceiling scheduled/day** | Baseline share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Offline | 410 | **535** | 166 | **215** | 77% |
| Backend | 94 | **117** | 62 | **78** | 80% |
| Graphics | 7.8 | **10** | 92 | **115** | 78-80% |
| Fixed overhead | 84 | **105** | 8 | **10** | 80% |
| **Sum** | 596 | **767** | 328 | **418** | |

**Envelope: 28,800 runner-minutes per day**, 20 concurrent slots for 24 hours: the envelope the
existing offline line was sized against. The observed 60 slots do not enlarge it. At the
reference workload the ceilings allocate 767 x 17.4 + 418 = about 13,800 a day, inside the
envelope; the rest is unallocated, and no tier may claim it without a reviewed decision. The
envelope holds the full ceilings up to about 37 landings a day (2.1 times the reference). The
daily raw total by tier (10,706 a day in the window) is the weekly report line and the envelope
check, not a PR gate.

**Offline ceiling preserved.** The authoritative offline control stays the existing per-run line
in `scripts/e2e-capacity.mjs`: 13 runners x `budgetMinutes`, warn at 85%, refuse additive growth
at 95%; today 161.4 of 210.3 table-minutes, 76.7%. That line measures table-minutes of one full
run; the per-landing figure measures real runner-minutes of everything a landing causes. They
are different measures. The per-landing offline ceiling is a companion set at the same 76.7%
share (410 / 0.767), so at the reference workload it is no looser than the existing line; it
never replaces or raises that line.

The other three tiers put the baseline at about 80%: a tier warns (85%) after about 6% growth in
cost per landing and refuses additive growth (95%) after about 19%. Each tier is judged alone; no
cheaper tier offsets a refused one.

### 4.3 Clocks and timing ceilings

Clock starts, all observable, never reset by a fix, requeue or new head:

| Item | Clock starts | Clock ends |
| --- | --- | --- |
| PR ready-to-merge | the first worker receipt reporting every worker gate green on a named head, excluding Reviewed; if none, the first `noacg/reviewed` commit status `created_at` on any head of the PR; if neither, **unknown**, never zero | PR `merged_at`; a PR closed unmerged is unfinished at its close |
| Phase | the phase's first ledger `build` event | its final ledger `pass` event |
| Queue-to-landing | the PR's first `added_to_merge_queue` timeline event | PR `merged_at` |

Baseline from the cohort. The PR clock uses the stamp fallback, because the production-page
ledger kept no worker-receipt time. **The PR ceilings below are calibrated on, and apply to, the
stamp-based start.** A receipt starts earlier than the stamp, so once receipt-timed samples exist
the same PR reads longer with no real slowdown. Switching a PR's measured start from stamp to
receipt is a measurement change, not a breach: ci02/ci18 recalibrate the PR ceilings on
receipt-timed samples with a reviewed rationale, and until then reports keep the stamp-based
figure beside the receipt-based one. Queue figures here count from the first queue entry (#1740
entered twice; from its last entry it took 12.1 minutes, from its first 70.5).

| Item | n | p50 | p90 | max | **Per-item age ceiling** | **Pooled ceiling** |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| PR ready-to-merge, minutes | 24 | 25.0 | 38.1 | 72.5 | **120** | **p50 30, p90 60** |
| Phase, hours | 21 | 3.69 | 9.15 | 10.63 | **12** | **p50 4.0, p90 10.0** |
| Queue-to-landing, minutes | 24 | 9.2 | 12.3 | 70.5 | **30** | **p50 10, p90 20** (existing targets, retained) |

Any unfinished item older than its per-item ceiling gets an owned, dated corrective action at
once, with no sample minimum. Pooled ceilings use a rolling 28-day window reported weekly with
p50, p90, max and counts, need 12 completed samples pooled across categories, and count as a
sustained breach only after two consecutive adequately sampled weeks above them. Categories stay
in the reports. Improvement claims still need the AC-1, AC-2 and AC-6 matched cohorts.

### 4.4 Durations table

| Fact | Value |
| --- | --- |
| Table | `scripts/e2e-durations.json`, `source.recordedAt` **2026-10-19**, from full CI runs 39243785986, 39245690239 and 39246625438 (`codex/reduce-ci-trace-overhead`) |
| Last landed | `a5360d4c` (#1757), 2026-10-26 |
| **Freshness bound** | **8 days** from the measurement date, including merge delay |
| Age on 2026-10-31 | 12 days: **stale**, past the bound since 2026-10-27 |
| Pending refresh PRs | **#1503** (`bot/e2e-durations`), open since 2026-10-19, last re-recorded 2026-10-26 from run 40312434120 and five more, merge state blocked. An open bot PR is not a fresh accepted table; landed now, it would go stale after 2026-11-03. |

Until a fresh table lands, ci18 keeps conservative estimates and refuses added cost whose
headroom cannot be established. Tracked in **#1847**.

## 5. Cancelled and failed runner-minutes

Over the 657 collected runs (success / failed / cancelled minutes): offline 26,037 / 65 / 439;
backend 5,904 / 12 / 121; graphics 1,178 / 2 / 28; overhead 2,017 / 3 / 5. The two dense windows
used 5,301 and 3,021 runner-minutes, of which 293 and 191 were cancelled and 48 and 32 failed.
Runs cancelled while pending cost no runner time and are counted only as runs.

PR-event runs, estimated from the dense-window samples and labelled as estimates: PR CI runs
that ended cancelled (254 of 473, superseded by a newer push) used about **20,000
runner-minutes** in the week, about 2,860 a day and about two thirds of all PR CI time; inside
them, jobs that were themselves cancelled used about 7,200. Failed jobs in PR CI runs used about
970. For configured dispatches, 144 of 276 ended cancelled, but no cancelled dispatch fell in
the samples, so their cost is **missing**, not zero.

## 6. Live landing evidence (acceptance d)

This PR is the legitimate phase PR whose landing records the shared stamp and auto-merge order;
there is no dummy landing. The coordinator runs in Claude Code Cloud, not on a local Windows
machine, so the Windows restoration qualification does not apply.

The worker part is in the worker receipt and the PR description: the reviewed head, the
configured-suite run dispatched on it with its `head_sha` and result, and the CI gate and Codex
review on that head. The coordinator part happens after this file is final and cannot be
written into it without moving the head: the pinned `noacg/reviewed` stamp, the head-checked
auto-merge request (head read before and after), and GitHub's admission on the required
`CI gate` and `Reviewed` checks. The coordinator records those on the PR and in the run ledger.

## 7. Phase notes

- **Previous verified main:** `cba1fcf2c5096aca5be9b64fa5eb472ead395d5e` (green push CI,
  configured suite and post-land). The branch also carries `ee73212a` (cloud-session setup hook)
  and `b9950454` (#1845, provider wording only; acceptance unchanged).
- **Revert:** `git revert -m 1 <merge commit of this PR>`, landed through `/queue-merge`. It
  removes only this file.
- **Decisions:**
  - Phase notes live here, not in `spec.md`: `work.json` pins the spec's SHA-256, and #1845,
    which landed during this phase, edited the spec, so a note there would re-pin the authorized
    hash and race other spec changes.
  - Strata come from changed paths (`supabase/`, `api/`, `e2e/configured/`), because the ledger
    records no category.
  - The envelope is the historical 20-slot day, so a larger account limit buys no budget.
  - Ceilings are per landing (plus per day for scheduled work) so more throughput is never
    refused as growth; non-offline ceilings are baseline / 0.8, so growth warns early without
    refusing today.
  - Collection scripts were scratch work and are not committed. This file holds the method and
    every derived number, and names every run, PR and job so each can be read again.
- **Traps:**
  - Organisation and environment endpoints are refused to a cloud session; measure
    concurrency from job records.
  - A job list can name the same runner twice for one interval; count distinct runner names.
  - `noacg/reviewed` can be posted before the PR opens (#1763); clip, never count backwards.
  - PR timelines over 100 events need paging, or merge events go missing.
  - A job's `created_at` is when its `needs` were met, which separates dependency wait from
    runner wait.
