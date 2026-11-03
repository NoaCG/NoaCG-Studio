# Phase cf03: baseline merge turnaround, cost and flake waste

Plan run #1967 (cicd-followup), phase cf03. Builder session on branch
`claude/plan-cicd-followup-cf03-build`, from `main` at 561cd60c. Measurement only: this phase
changes no workflow, selector, test, limit or budget. It adds this file, the per-merge records
([phase-cf03-records.json](phase-cf03-records.json)) and two small scripts that rebuild them
([phase-cf03-collect.mjs](phase-cf03-collect.mjs), [phase-cf03-baseline.mjs](phase-cf03-baseline.mjs)).

## Acceptance, verbatim

(a) M1 to M5 measured from existing history with sample sizes, before and after the
cicd-improvement landings, for comparable changes. (b) An explanation of why each landed
improvement did or did not change total turnaround, and a ranked list of candidate optimizations
(duplicate work, cache misses, setup, shard balance, concurrency) with expected effect. Each of
the five categories gets at least one candidate or a measured reason it has none. (c) For
M1, M2 and M3, the run-to-run spread on comparable changes and the minimum sample size per side
for a before/after comparison, each derived from the history with the method stated. cf13 uses
these values unchanged. It also states the rule for grouping comparable changes (for example by
changed-path class and selected shard count), and which CI landings affect M1, M2 or M3 for a
group; only those end a cf13 before or after side. cf13 and cf20 use this rule, the spread and the
minimum sample sizes unchanged.

## Summary

- **Merges got slower, not faster.** For the changes that run the most CI (the 15-shard group),
  M1 median rose from 9.1 minutes before the cicd-improvement landings to 14.7 after them
  (14.6 over every such merge since ci06). ci06
  put the selected configured jobs (a local Supabase stack each) into the PR's CI gate, and they
  are now the critical path. Small changes (no offline E2E shards) went from 5.2 to 6.5 minutes,
  because the Build job grew from 5.3 to 6.2 minutes.
- **The merge queue is not the bottleneck.** M2 waiting is 0.7 minutes median on every side. Queue
  execution rose from 8.4 to 11.7 minutes for the 15-shard group, because ci04 put the catalog
  gate on the merge group's critical path.
- **CI minutes per merge did not drop.** Mean M3 is 615 minutes before and 604 after (median 272
  and 450, the median moved because the after side has more large changes). The landed test
  speedups (ci08 to ci10) save about 3 runner-minutes per full run, under 1% of M3, inside the
  spread. The biggest waste is PR runs cancelled by a newer push after running for about 10
  minutes: 28% of all CI minutes before, 18% after.
- **The ranked candidates** (section 7) put halving the configured selection's stack size first
  (15-shard M1 14.6 to 12.0 minutes, above the 1.26 spread), then splitting the Build job
  (small-change M1 6.2 to 3.8, above the 0.96 spread). No candidate moves the M1 p95 much: the
  p95 is set by fail-then-pass re-runs and long single runs.

## 1. Definitions and data

**Window.** Every PR merged to `main` from 2026-10-24T10:00:45Z (seven days before ci01 landed)
to 2026-11-03T12:00:00Z: 201 merges, all through the merge queue. Times are minutes.

**Data.** GitHub Actions and pull request history only. 8,525 workflow runs (every run created
2026-10-17 to 2026-11-03), the jobs and steps of the 3,167 runs of ci.yml, configured-suite.yml,
quarantine.yml, post-land.yml and deploy-verify.yml tied to these merges (every attempt), and each PR's issue events. Collected in 50 bounded passes
of at most 100 API calls each, about 3,520 calls in all (section 9), cached under the session
scratchpad and reduced to one record per merge in `phase-cf03-records.json`. No log was read.

**Copied jobs.** A re-run attempt lists every job of the run again. The jobs it did not re-run are
copies with the original start and end times (run 40241798737 attempt 2: Build 22:47:09 to
22:50:59 in both attempts). Counting them twice inflated M3 by 3 to 4% and made 99 Reviewed-only
re-runs look like full re-runs. Each job is counted once, by name and start and end time.

**M1, ready PR to green required checks.** For the head that merged: from the creation of its
first ci.yml PR run to the first successful `CI gate` job on that head (re-run attempts
included). This is what CI controls, and it is the M1 cf13 compares. Two companions are reported
and not used for cf13: **M1 with Reviewed**, which ends when the `Reviewed` check (the review
stamp, also required to queue) has passed too, and **M1 from ready**, from the PR's last
`ready_for_review` event (or its creation) to the same green gate, which includes repair pushes.

**M2, merge queue.** From the PR's last `added_to_merge_queue` event to its merge. **Execution**
is the merge group run whose head is the merge commit (ci.yml, `merge_group`), from its creation
to its first successful `CI gate` job. **Waiting** is the rest: queue entry to group run, plus
gate to merge. A PR's earlier merge-group runs (dequeues, rebuilt groups) are counted as waiting
and as M4 churn.

**M3, CI minutes per merge.** Sum of job minutes (start to end) of every run of the change, every
attempt: its branch's PR, dispatch and configured-suite runs from PR creation to merge, its CodeQL
PR scans and preview deployment checks, its merge group runs, and the runs on the merge commit on
`main` (ci.yml push, configured-suite push, post-land, quarantine, deploy-verify, CodeQL). Runs
without a job read (single-job workflows) count their latest attempt's run duration. Manual-only workflows
(endurance, alarm-test, jev-svg-qualification, rerecord-screenshots, jev-svg-eval) are not a cost
per landing (#2011, PR #2012) and are reported apart as drill minutes. Scheduled workflows are
per day, not per merge, and are reported apart (section 3.6).

**M4, flake and rerun waste.** Per head and job name: a failed, cancelled or timed-out attempt
followed by a success on the same commit is a fail-then-pass. One that ran to within half a minute
of its `timeout-minutes` cap is a **hang** (the job's own cap from ci.yml or configured-suite.yml), counted apart;
#1991 (main 9a06d385, run 41549810210 attempt 1, Build stopped at 15.3 minutes, re-run passed) is
one. Also counted: real re-run attempts (an attempt that re-ran a job that tests something, not
only the Reviewed check), E2E retry jobs that passed, dequeues, merge-group churn, runner minutes
of PR runs cancelled by a newer push (**superseded**), of failed runs on heads later replaced
(**repair**), and of `Reviewed` attempts that failed before the stamp existed (**review wait**).

**M5, critical path.** For the final PR run and the merge group run: from `CI gate` back through
the input that finished last, by the `needs:` graph of ci.yml, to a job with no inputs. Each job
on the chain is split by step into runner wait (job created to started), setup (set up job,
checkout, setup-node, node-modules, Playwright, Supabase setup and stack start), build (the Build
step `npm run build`, which includes the build gates' tests, the CLI package, the E2E plan
steps), test (E2E shards, configured E2E, factory tests, catalog checks) and other.

## 2. Sides

| Side | Merges, by the creation time of the final head's PR run | n |
| --- | --- | ---: |
| B, before | 2026-10-24T10:00:45Z to ci01 (#1848 merged 2026-10-31T10:07:34Z) | 122 |
| D, during | ci01 to ci16 (#1948 merged 2026-11-02T00:56:41Z): the cicd-improvement landings | 44 |
| A, after | ci16 to cf04 (#2014 merged 2026-11-03T09:50:01Z) | 34 |
| A2 | after cf04 to the window end | 1 |

The side is set by the final head's PR run, because that run used the workflow from the base at
that time. A landing's boundary is its PR's `merged_at`, when it reached `main`; its merge commit's
own time is earlier, while it waited in the queue (cf04: 09:37:36 against 09:50:01). The cicd-improvement landings are those listed in
[phase-ci17.md](../../cicd-improvement/evidence/phase-ci17.md) section 1. This run's landings so far,
marked under the section 4.2 rule:

| Landing | Merge | Ends sides for |
| --- | --- | --- |
| cf07, #1990 | 27c737a2 | nothing: configured specs, their shared helper and a trial tool are workload |
| cf09, #1995 | 0b73b488 | nothing: documentation only |
| #2012, overhead price | a090662a | nothing: it changes how the capacity line prices manual-only workflows, not what runs |
| cf04, #2014 | e6a3bc1c | M1 of the `+cfg` groups, M3 of every group (configured job and stack action) |

## 3. (a) M1 to M5

### 3.1 All merges, per side

| Side | n | M1 median / p95 | M1 with Reviewed | M1 from ready | M2 wait | M2 execution | M3 median / p95 / mean |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| B | 122 | 5.9 / 11.9 | 6.0 / 27.0 | 6.1 / 195.7 | 0.7 / 0.7 | 5.8 / 11.6 | 272 / 1,848 / 615 |
| D | 44 (M1 43) | 7.7 / 20.6 | 16.4 / 34.4 | 21.4 / 144.7 | 0.7 / 0.8 | 6.3 / 12.7 | 417 / 2,071 / 705 |
| A | 34 | 13.5 / 18.5 | 15.1 / 22.6 | 20.8 / 151.8 | 0.7 / 0.7 | 6.6 / 13.3 | 450 / 1,942 / 604 |
| A2 | 1 | 4.5 | 9.1 | 20.6 | 0.7 | 6.7 | 295 |

Medians and p95 are nearest-rank. #1909 has no M1: its merged head has no ci.yml PR run of its own.

### 3.2 Comparable changes, per side (groups of section 4.1)

| Group | Side | n | M1 median / p95 | M2 wait | M2 execution | M3 median / p95 |
| --- | --- | ---: | --- | --- | --- | --- |
| none | B | 68 | 5.2 / 6.3 | 0.7 | 5.2 / 6.3 | 252 / 281 |
| none | D | 18 (M1 17) | 6.1 / 7.1 | 0.7 | 6.0 / 11.6 | 274 / 416 |
| none | A | 9 | 6.5 / 6.8 | 0.7 | 6.2 / 6.6 | 284 / 302 |
| cap | B | 48 | 9.1 / 13.4 | 0.7 | 8.4 / 11.9 | 931 / 2,727 |
| cap | D | 6 | 9.3 / 11.7 | 0.7 | 8.8 / 11.6 | 724 / 1,399 |
| cap+cfg | D | 16 | 14.4 / 28.8 | 0.7 | 11.6 / 71.6 | 753 / 4,401 |
| cap+cfg | A | 16 | 14.7 / 34.1 | 0.7 | 11.7 / 13.8 | 726 / 2,018 |
| small | B, D, A | 6, 4, 3 | 5.8, 6.3, 7.6 | 0.7 | 5.6, 6.1, 6.7 | 273, 288, 327 |
| small+cfg | A | 4 | 6.5 / 14.2 | 0.7 | 5.1 | 332 |
| none+cfg | A | 2 | 15.6 / 16.2 | 0.4 | 5.6 | 369 |

`cap` exists only before ci06 and `cap+cfg` only after it: ci06 moved large changes from one
group to the other by adding configured jobs to their PR runs. The before/after comparison for
large changes is therefore `cap` on B (9.1) against `cap+cfg` on A (14.7): +5.6 minutes median,
caused by the change of what runs (section 6). The `none` group is the one group present on every
side: +1.3 minutes median from B to A, all of it in the Build job (section 3.5).

### 3.3 M3 by where the minutes go (mean per merge)

| Part | B | D | A |
| --- | ---: | ---: | ---: |
| PR runs, ci.yml | 267.5 (43%) | 333.5 (47%) | 275.9 (46%) |
| PR worker dispatches, configured-suite.yml | 70.3 (11%) | 36.3 (5%) | 0 |
| PR CodeQL | 11.7 | 13.6 | 10.0 |
| Merge queue, ci.yml | 43.1 (7%) | 80.4 (11%) | 56.6 (9%) |
| Main push, ci.yml (full suite) | 158.9 (26%) | 174.1 (25%) | 187.3 (31%) |
| Main push, configured-suite.yml | 44.9 (7%) | 47.5 (7%) | 51.7 (9%) |
| Main push, CodeQL and quarantine | 17.8 | 18.6 | 20.9 |
| **Total** | **615.3** | **705.2** | **603.7** |
| PR heads per merge, mean | 3.8 | 4.5 | 3.1 |

By growth tier (`tierOfJob` in `scripts/growth-controls.mjs`), mean per merge: offline 421.0,
433.4, 380.9; backend 115.2, 156.7, 123.8; graphics 8.2, 27.7, 23.2; overhead 44.4, 58.6, 49.5;
CodeQL (outside the tiers) 26.4, 28.7, 26.3. Drill minutes (manual-only workflows dispatched on a
PR branch): 3.3, 0, 0.3 per merge, outside M3.

**The overhead tier after #2012.** The capacity line still judges the frozen seed (overhead 84
per landing against 105). Measured here, the per-merge overhead tier is 44.4 (B) to 49.5 (A),
without the manual-only workflows, which #2012 prices at 0 per landing. In this window those
manual-only workflows ran 1,317 run-minutes in all (endurance 1,284, jev-svg-eval 29,
rerecord-screenshots 2, jev-svg-qualification 1, alarm-test 0), about 6.6 per landing if they had
been charged per landing. The cloud-queue-merge dispatches (281 runs, 287 run-minutes, about 1.4
per landing) run on `main` and are not attributed to a merge here.

### 3.4 M4: flake and rerun rate, and the jobs that waste the most time

| | B (122) | D (44) | A (34) |
| --- | --- | --- | --- |
| Merges with a fail-then-pass job | 7 (5.7%) | 10 (22.7%) | 5 (14.7%) |
| Merges with a hang (job at its cap, then passed) | 1 | 0 | 1 (#1991) |
| Merges with a real re-run attempt (attempts) | 8 (10) | 11 (11) | 6 (7) |
| E2E retry jobs that passed (a spec failed, then passed in-run) | 4 | 3 | 1 |
| Dequeues / merges with more than one merge group | 1 / 1 | 2 / 2 | 0 / 0 |
| Fail-then-pass minutes | 18.9 | 29.4 | 21.7 |
| Hang minutes | 20.3 | 0 | 15.3 |
| Merge-group churn minutes | 120.8 | 9.4 | 0 |
| Review wait minutes (Reviewed failed before the stamp) | 594 | 466 | 261 |
| Repair minutes (failed runs on heads later replaced) | 5,547 (7.4%) | 3,855 (12.4%) | 2,585 (12.6%) |
| **Superseded minutes (PR runs cancelled by a newer push)** | **21,377 (28.5%)** | **7,910 (25.5%)** | **3,747 (18.3%)** |
| All M3 minutes | 75,067 | 31,027 | 20,525 |

Percentages of minutes are of all M3 minutes on that side. Superseded runs hit 42 of 122, 21 of 44
and 14 of 34 merges, so a few PRs carry most of it: on `claude/plan-production-page-p32d-font2` six
heads were pushed 10 minutes apart (10:40 to 11:41 on 2026-10-26), each cancelling a ci.yml run
and a configured-suite dispatch at 10 to 13 minutes, most of their jobs done.

The jobs that waste the most, by fail-then-pass and hang minutes: offline E2E shards (`E2E n/m`,
30.4, 13.7, 13.8), the configured-suite stack start (`Configured E2E shard n/m` and the selected
`Configured E2E n/m`, 5 to 10 per side, each a 1.3 to 2 minute failure at stack start, the port
54322 collision cf04 fixed), and Build (15.3 on A: the #1991 hang). By all waste, the PR runs
cancelled by a newer push dominate every side; the per-job split of those minutes follows the PR
run's job split (section 3.3).

### 3.5 M5: critical path, split into setup, build and test

Median minutes of the jobs on the chain, per chain kind:

| Side, run | Chain (share of runs) | Span | Wait | Setup | Build | Test |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| B, PR | Build (60%) | 5.3 | 0.1 | 0.3 | 4.8 | 0 |
| B, PR | plan, offline E2E shard (31%) | 9.1 | 0.1 | 0.5 | 0 | 7.5 |
| B, PR | plan, E2E shard, E2E retry (6%) | 8.4 | 0.1 | 0.6 | 0 | 7.0 |
| B, PR | plan, catalog gate (3%) | 11.7 | 0.1 | 0.4 | 0 | 10.2 |
| A, PR | plan, configured E2E, configured verdict (50%) | 14.7 | 0.2 | 2.9 | 0.1 | 10.6 |
| A, PR | Build (41%) | 6.5 | 0.1 | 0.3 | 5.9 | 0 |
| A, PR | plan, offline E2E shard (9%) | 18.5 | 0.1 | 0.5 | 0.1 | 4.6 |
| B, queue | Build (61%) | 5.3 | 0.1 | 0.3 | 4.8 | 0 |
| B, queue | plan, offline E2E shard (26%) | 8.3 | 0.1 | 0.5 | 0 | 7.5 |
| B, queue | plan, catalog gate (4%) | 11.6 | 0.1 | 0.5 | 0 | 10.7 |
| A, queue | Build (50%) | 6.3 | 0.1 | 0.3 | 5.8 | 0 |
| A, queue | plan, catalog gate (29%) | 11.7 | 0.1 | 0.5 | 0.1 | 10.7 |
| A, queue | plan, offline E2E shard (18%) | 11.5 | 0.1 | 0.5 | 0.1 | 10.5 |

The A-side PR offline-shard chain is 3 runs, two of them with a re-run attempt (#1966, #1985). When each gate
input finishes, medians for `cap+cfg` on A (16 runs): Build 6.1, offline E2E 9.7 (slowest of 15
shards 8.9, their median 6.7), catalog gate 11.2, configured verdict 14.4 (4 configured jobs of
12.3 to 13.2). For `none` on A: Build 6.2, factory 1.6. The Build job ends 5.3 (B), 6.0 (D), 6.25
(A) minutes after the run starts, and the plan job 0.28, 0.38, 0.42.

**What the Build step does**, timed locally on this 4-CPU cloud machine on 561cd60c (the step was
443 s here and about 5.3 minutes on Actions): the build gates' tests 243 s (55%: 335 test files,
4,981 tests), ESLint 127 s (29%), `tsc` and `tsc -p tsconfig.api.json` 41 s (9%), Vite build 14 s,
prerender 8 s, the rest under 10 s. All of it runs one after another in one job.

### 3.6 Per day, outside M3

Scheduled workflows in the window (run-minutes): nightly 182, fit-sweep 159, catalog-gates 127,
configured-suite 125, hosted-latency 76, deploy-verify 22, weekly-audit 11, nightly-drift 5, the
others under 5. Runner wait is no constraint: over 25,347 jobs, job created to started was 0.03
minutes median, 0.20 at p99, 3.8 at most, 28 jobs over 1 minute and none over 5.

## 4. (c) Comparable changes

### 4.1 The grouping rule

A merge's group is the offline E2E shard count its final head's PR run was given, and whether that
run started configured jobs:

- `none`: no offline E2E shard (the plan said `none`: docs, bot updates, most tooling).
- `small`: 1 to 14 shards.
- `cap`: 15 shards, the planner's ceiling (`MAX_SHARDS`). Every large selection in the window hit
  it: 86 of the 103 merges with shards had exactly 15.
- `+cfg` is added when the PR run started at least one selected configured job (`Configured E2E
  n/m (selected, local Supabase)`), which exists since ci06.

The changed-path class (docs, bot, tooling, infra, product, tests) is recorded per merge
(`path_class`) and not used: within a shard bucket it did not separate M1 (`none` group on B, M1 median:
bot 5.0, tooling 5.0, docs 5.2, infra 5.4, product 5.7), while the shard bucket and the configured jobs
decide which chain is critical (section 3.5). A group is compared only with at least 8 merges per
side (the minimum below never goes under 8), so `small`, `small+cfg` and `none+cfg` have no
comparison yet.

### 4.2 Which landings end a side

`node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs rule <merge-sha>` applies this
rule to a merge (`SIDE_RULE` in the script). A landing ends a side only for the metrics and groups
of the entries its changed paths match:

| Changed paths | Ends | For groups |
| --- | --- | --- |
| ci.yml outside the configured jobs (another job, triggers, concurrency, env) | M1, M2, M3 | all |
| ci.yml configured jobs (`configured`, `configured-verdict`) | M1, M3 | `+cfg` |
| `.github/actions/node-modules`, `.github/actions/playwright-chromium` | M1, M2, M3 | all |
| `package-lock.json`, a dependency version or the `build` script in package.json, the toolchain the build runs (`eslint.config.js`, `tsconfig*.json`, `vite.config.ts`, `.dependency-cruiser.cjs`, `scripts/{build-player-host,build-production-pack,prerender,write-version,check-client-secrets}.mjs`), the runners `scripts/gates.mjs`, `scripts/factory.mjs`, `scripts/e2e-retry.mjs` | M1, M2, M3 | all |
| E2E planner, selection and quarantine code (`scripts/e2e-affected*.mjs`, `scripts/e2e-traced.mjs`, `scripts/e2e-quarantine.mjs`), `scripts/e2e-durations.json`, `playwright.config.ts` | M1, M2, M3 | all |
| catalog gate code and config (`scripts/catalog-*.mjs`, `scripts/e2e-run-integrity.mjs`, `playwright.catalog.config.ts`) | M1, M2, M3 | `small`, `cap` and their `+cfg` |
| configured suite definition (configured-suite.yml, `.github/actions/configured-stack/`, `scripts/configured-{selection,shards,verdict,stack}*.mjs`, `playwright.live.config.ts`, `supabase/config.toml`) | M1 | `+cfg` |
| the same, except selection | M3 | all (every landing pays the configured suite on `main`) |
| post-land.yml, quarantine.yml, deploy-verify.yml | M3 | all |

Test files (`*.test.mjs`) never match. Nothing else ends a side: quarantine entries and releases
(`e2e/quarantine.json`), selection-map refreshes (`scripts/e2e-traced.json`), `covers:` edits,
spec bodies and shared spec helpers, schema migrations, product code, new gate tests, docs,
scheduled-only and manual-only workflows, and scripts that only estimate or report
(`e2e-capacity`, `growth-*`). These are workload that changes at product pace: on side B, 54 of
the 122 merges were such landings (25 quarantine, 6 selection-map, 23 `covers:`), so the spread
below already contains their effect. (A merge can count in two of these kinds.)

Applied to the window, the rule ends sides at 20 merges (each record's `ends` and `ends_why`):
on B #1675, #1683, #1724 (dependency-cruiser config, production-pack build step), #1756, #1804,
#1816, #1589, #1837, #1838, #1841; on D #1854 (ci03), #1861 (ci04),
#1866 (ci05), #1872 (ci06), #1880 (ci18), #1896 (ci07), #1922 (ci11), #1927 (ci12, sharded groups
only); on A #1970 (cf01: `scripts/e2e-quarantine.mjs`) and #2014 (cf04). ci01, ci02, ci08, ci09, ci10, ci13 to ci17, cf07, cf09 and #2012
end nothing.

**cf13 starts after cf04.** cf04 (#2014) ends the M1 sides of the `+cfg` groups and the M3 sides
of every group, and the window holds one merge after it (#2018). So before its candidate lands,
cf13 collects at least the minimum n of section 5.1 after cf04 for the group and metric it compares
(for example 8 `cap+cfg` merges for M1, 12 for M3); the baseline sides here are not its before side.

**cf13's sides.** For a candidate compared on group g and metric m, the before side is the merges
of group g measured after the last landing whose `ends[m]` includes g and before the candidate
lands; the after side is the merges of g measured after the candidate lands and before the next
such landing. A merge's time is the creation of its final head's PR run (`side_at`), as here.

## 5. (c) Spread and minimum sample size per side

### 5.1 Values (cf13 and cf20 use these unchanged)

| Group | Reference | n | Metric | Median | Spread | Min n per side, median | Min n per side, p95 |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| none | B | 68 | M1 | 5.2 | 0.96 | 11 | 20 |
| | | | M2 wait | 0.7 | 0.06 | 9 | over 120 |
| | | | M2 execution | 5.2 | 0.93 | 9 | 20 |
| | | | M3 | 251.6 | 16.75 | 12 | over 120 |
| cap | B | 48 | M1 | 9.1 | 2.59 | 8 | 40 |
| | | | M2 wait | 0.7 | 0.10 | 15 | 40 |
| | | | M2 execution | 8.4 | 1.62 | 8 | 40 |
| | | | M3 | 930.8 | 709.74 | 9 | over 120 |
| cap+cfg | after ci06 | 31 | M1 | 14.6 | 1.26 | 8 | over 120 |
| | | | M2 wait | 0.7 | 0.04 | 9 | 20 |
| | | | M2 execution | 11.7 | 0.58 | 11 | over 120 |
| | | | M3 | 731.9 | 290.26 | 12 | over 120 |
| small, small+cfg, none+cfg | | 6, 4, 2 | | | | no comparison | |

"Over 120" means no sample of up to 120 per side meets the test: cf13 compares that metric by
its median only, or records it as unmeasured. The `cap` row is for completeness: `cap` merges stop
after ci06, and a later `cap` change is compared with these values.

### 5.2 Method

- **Reference records.** A group's merges on side B when B holds at least 12 of them; otherwise
  every merge of the group measured after ci06 landed (#1872 merged 2026-10-31T21:28:08Z), when the `+cfg`
  groups began.
- **Spread.** The run-to-run spread is the robust standard deviation of the metric over the
  reference merges: 1.4826 times the median absolute deviation from their median. It is also
  computed inside the longest stretch of the reference with no landing that ends that group's
  side for that metric (section 4.2), and the larger of the two is the spread: a larger spread
  makes an improvement harder to claim, never easier. (Whole and clean values: none M1 0.93 and
  0.96 over 22 merges; cap M1 2.19 and 2.59 over 18; cap+cfg M1 0.98 and 1.26 over 10; all in the
  report output.)
- **Minimum sample size per side.** The smallest n (at least 8, and at least 20 for a p95, below
  which the nearest-rank p95 is the sample maximum) for which, drawing n merges with replacement
  from the reference for each side, 2,000 times: (1) with no change, the after side's statistic is
  lower than the before side's by more than the spread in at most 5% of draws, and (2) with every
  after value lowered by twice the spread, it is lower by more than the spread in at least 80% of
  draws. The statistic is the median or the nearest-rank p95. Random draws use mulberry32 with
  seed 3, so the numbers repeat exactly.
- **What cf13 claims.** An improvement on group g is an after-side median (or p95) lower than the
  before side's by more than the group's spread, with at least the minimum n on each side. A
  regression in M2 waiting, M2 execution or M4 is the same test the other way.

## 6. (b) Why each landed improvement did or did not change total turnaround

| Row | What changed in CI | Effect measured here |
| --- | --- | --- |
| ci01, ci02, ci14, ci15, ci16, ci17 | nothing that runs: baseline, review guidance, reports, no activation | none, as expected; ci02's review guidance acts before the queue, outside M1 to M3 |
| ci03 | configured-suite.yml keeps one pending run per branch; worker dispatch helper | worker configured dispatches per merge 70.3 (B) to 36.3 (D) to 0 (A), together with ci06 and the traps file's "a full dispatch is for a reason". Off the M1 path (a dispatch is not a required check), so M1 unchanged; it removed 11% of M3 |
| ci04 | selection fix; catalog gate raised on many more changes (#1863) | graphics tier per merge 8.2 to 27.7 (D) and 23.2 (A), as ci04 projected (+15 to +18). The catalog gate became the merge queue's critical path in 30% of groups (4% before): `cap` M2 execution 8.4 to 11.7 minutes (the gate ends at 11.4 against the slowest E2E shard at 9.5). On PRs it is hidden behind the configured jobs. A safety cost, not a regression to undo |
| ci05 | selection correctness (+0.15% planned minutes) | below any spread: no change visible |
| ci06 | selected configured jobs in the PR's CI gate | large changes' M1 9.1 (`cap`, B) to 14.6 (`cap+cfg`): the 4 configured jobs (2.0 setup and stack start, about 10.5 of tests each, packed at ten measured minutes per stack) finish at 14.4 against the offline shards' 9.7. Backend tier per merge 115 (B) to 157 (D) and 124 (A). It made M1 worse and removed the worker dispatches; intended coverage, not a regression to undo |
| ci18 | growth gates and capacity line in the plan job | plan job ends 0.28 to 0.42 minutes into the run: +0.14, inside every spread |
| ci07 | contract map, quarantine workflow | quarantine.yml on `main` rose from 3.1 to 4.6 job-minutes per merge over the window; nothing on the critical path |
| ci08, ci09, ci10 | faster tests: 8.2 s, about 74 s and about 90 s per execution | about 2.9 runner-minutes per full suite execution, about 6 to 9 per merge (a few executions each), under 1% of `cap` M3 (spread 290 to 710): invisible. M1 is set by the slowest of 15 shards, and the shards are packed from the durations table of 2026-10-19 (15 days old, over its 8-day bound), so the saved seconds were never re-packed into a shorter slowest shard |
| ci11 | selection mapping correction (audit reset) | no change visible |
| ci12, ci13 | catalog-gates.yml and nightly-drift.yml (scheduled) | not per merge |

Over the same window the Build job grew from 5.3 to 6.25 minutes (product code and gate tests
from the JEV and production-page runs, workload under section 4.2), and the main-push full suite
from 159 to 187 minutes per merge. Neither is a CI landing.

**Why total turnaround did not improve.** The rows that saved time (ci08 to ci10, ci03's
dispatches) saved runner-minutes off the critical path or far inside the spread, and the duplicate
runs that cost the most (superseded PR runs, the main push suite) were not their target. The rows
that changed the critical path (ci04 in the queue, ci06 on the PR) added required work, on
purpose, for selection safety and backend coverage. Speeding up one suite did not shorten the
chain that decides when a merge is green.

## 7. (b) Ranked candidates

**Expected effect.** Each chain candidate rewrites the finish time of one input of the CI gate
from that input's measured parts, and moves the merge's M1 (or M2 execution) by the change in the
latest-finishing input. It is applied to the 65 merges measured after ci06 (66 with M2 execution),
today's configuration, by `report` (`candidates`). Base: M1 median 13.1, p95 18.5; M2 execution
median 6.6, p95 13.3. The overall median sits between the `none` cluster (6.2) and the `cap+cfg`
cluster (14.6), so the per-group effect is the one to compare with the spread.

| Rank | Candidate | Category | M1 median, p95 (all) | M1 by group | M2 execution median, p95 | M3 per merge | M1 effect above the spread? |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Pack the PR's selected configured specs at five measured minutes per stack instead of ten | shard balance | 13.1 to 9.7 (-3.4), p95 0 | cap+cfg 14.6 to 12.0 (-2.6) | 0 | about +29 (4 more stack starts of 2.3 per PR run, 3.1 heads), 4% of cap+cfg M3 | yes: -2.6 against 1.26 |
| 2 | Run the Build step's parts as parallel jobs (gates' tests, ESLint, tsc plus the rest) | shard balance | 0, p95 0 | none 6.2 to 3.8 (-2.4), small 6.3 to 4.8 | 6.6 to 4.8 (-1.8), p95 0 | about +5 (two more job setups of 0.5, about 5 runs per merge) | yes: -2.4 against 0.96 (none) |
| 3 | Persist ESLint and tsc caches between runs | cache misses | 0, p95 0 | none 6.2 to 4.2 (-2.0), small 6.3 to 5.3 | 6.6 to 4.8 (-1.8) | about -10 (2 minutes off each Build) | yes for `none`. Risk: type-aware lint results cached for files whose types changed; it must key on more than file content |
| 4 | Split the catalog calibration gate into two jobs | shard balance | 0 alone; with rank 1, 13.1 to 8.5 (-4.6) | with rank 1, cap+cfg 14.6 to 10.2 (-4.4) | -0.1 median; the 30% of groups it leads drop from 11.7 to the E2E shard at about 9.5 | +0.9 per run where it runs | alone, no; it is the next limit after rank 1 |
| 5 | Halve the configured stack start (1.77 minutes median per configured job) | setup | 13.1 to 12.5 (-0.6) | cap+cfg 14.6 to 13.7 (-0.9) | 0 | about -16 (1 minute per configured job: 4 per PR run, 3.1 heads, plus 4 on the main push suite) | no: -0.9 against 1.26 |
| 6 | Re-pack the offline E2E shards from fresh durations (slowest shard 8.9 against a 6.7 median) | shard balance | median 0, p95 18.5 to 17.1 (-1.4) | 0 | p95 13.3 to 12.1 (-1.2) | 0 | median, no; p95 claims need over 120 per side |
| 7 | Do not rerun the full suite on `main` for a merge commit the merge group already ran | duplicate work | 0 | 0 | 0 | 187 (A), 32% of M3; the Build, factory and plan jobs alone repeat about 8 | M1, no. Not allowed by the spec's rule that exact-merge coverage is never cancelled or replaced: it belongs to cf16, not cf13 |
| 8 | Keep workers from pushing a new head while its CI is still running, unless the push fixes a red already read | concurrency | 0 (could raise M1 from ready) | 0 | 0 | superseded minutes 175 (B) and 110 (A) per merge, 28% and 18% of M3; the share avoided is unknown | M1, no; M3 only |

**M3 cannot carry a claim.** The M3 spreads are 16.8 (`none`), 290 (`cap+cfg`) and 710 (`cap`),
and every M3 effect above is smaller than its group's spread: rank 1 +29, rank 3 -10, rank 5 -16,
rank 7 -187 and rank 8 at most -110 per merge, all on groups whose spread is 290 or more. So no
M3-only candidate (ranks 7 and 8) can pass cf13's test with these values, and for the others cf13
claims on M1. Most of the M3 spread is how many heads a PR pushed (3.1 to 4.5 per merge on
average, each a full PR run), not run-to-run noise of one run.

All four chain changes together (ranks 1, 2, 4, 6): M1 median 13.1 to 8.3 and p95 18.5 to 17.1;
`cap+cfg` 14.6 to 8.9, `none` 6.2 to 3.8; M2 execution 6.6 to 4.2, p95 13.3 to 9.8.

**Arithmetic for rank 1**, per `cap+cfg` merge: configured finish minus half of (slowest
configured job minus 2.0 of setup). With the median values: 14.4 - 0.5 x (13.2 - 2.0) = 8.8, so the
gate waits for the next input, the catalog gate at 11.2, then the offline shards at 9.7. Hence
14.6 to 12.0 alone and 10.2 with rank 4. **Rank 2**: Build ends at 0.4 + 0.58 x (end - 0.4), the
0.58 being the gates' share 55% plus job overhead (section 3.5): 6.2 to 3.8 on the `none` median.
**Rank 3**: the Build step without 35% (ESLint and tsc warm: 121 s to 3.5 s and 32 s to 4 s
locally on an unchanged tree). **Rank 5**: configured finish minus 1.0. **Rank 6**: offline E2E
finish minus (slowest shard minus the mean shard) per run.

**The five categories.**

- **Duplicate work**: rank 7 (main-push full suite on an already-validated merge commit; blocked
  for cf13 by the coverage rule, cf16 decides). Already removed: worker configured dispatches,
  70.3 to 0 per merge (section 6). Checked and not duplicate: the 99 "full re-runs" after a late
  stamp re-ran only Reviewed (section 1, copied jobs).
- **Cache misses**: rank 3. Measured reason the existing caches have no candidate: over 18,294
  jobs the node_modules step took 0.07 minutes median, 0.18 at p99 and never over 1 minute; the
  Playwright step 0.05, 0.10 and never over 1 minute in 16,674. Both hit.
- **Setup**: rank 5. Measured reason ordinary job setup has none: set up job 0.02, checkout 0.08,
  setup-node 0.03, node_modules 0.07, Playwright 0.05 (medians), about 0.25 per job; only the
  Supabase stack start (1.77 to 1.83 median) is large.
- **Shard balance**: ranks 1, 2, 4 and 6. The configured selection packs ten measured minutes per
  stack while offline shards are sized for about three, and the Build job is one unsharded chain
  on the critical path of 41 to 61% of runs.
- **Concurrency**: rank 8 (M3 only). Measured reasons there is no M1 or M2 candidate: runner wait
  0.03 median and 0.20 at p99 over 25,347 jobs, so runner capacity never holds a job; merge queue
  waiting 0.7 median and p95 on every side, so batching or more queue slots gain at most 0.7.
  PR runs already cancel superseded runs (ci.yml `concurrency`, `cancel-in-progress` off only on
  `main` and merge groups); the waste is the minutes they run before the newer push arrives.

## 8. What the p95 is made of

The five slowest M1 values after ci06 (34.1, 28.8, 20.6, 18.5, 16.2) are runs with a re-run
attempt or a fail-then-pass shard (#1985, #1899, #1943, #1966) or a slow configured stack. No
chain candidate removes them, which is why ranks 1 to 5 leave the M1 p95 at 18.5: the p95 falls
with fewer fail-then-pass failures (M4), not with shorter chains.

## 9. Reproducing the numbers

From the records alone (no API):

    node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs report --records docs/work-specs/cicd-followup/evidence/phase-cf03-records.json

prints every table above as JSON (`bySide`, `bySideGroup`, `spread`, `m4`, `m5`, `candidates`);
the spread step takes about a minute. To rebuild the records from GitHub:

    git fetch --shallow-since=2026-10-10 origin main
    node docs/work-specs/cicd-followup/evidence/phase-cf03-collect.mjs --cache <dir>     # repeat until it prints "complete"
    node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs derive --cache <dir> --out <records.json>

Each collector invocation is one pass of at most 100 calls (`--max-calls`), reads run and job
metadata only and caches each completed read. This collection took 50 passes and about 3,520
calls: passes 1 to 6 (600, pull requests, runs by day, issue events, the first job reads), 7 and 9
to 20 (100 each), pass 8 stopped on a GitHub 502 without writing, pass 21 (35), passes 22 to 31
(1 each: one run whose 99-job list returned 502 at 100 per page), a pass of 2 after the
page size became 50, and, after review, 3 passes (29 calls, then 0) that listed 2026-10-18 again in
six-hour ranges (one listing had stopped at GitHub's 1,000-run cap; the day holds 1,094) and
2026-11-01 to 2026-11-03 again, so every run in the window was read after it completed;
then, after the Codex review, 15 passes (1,441 calls) read the jobs of quarantine.yml (a per-spec
matrix), post-land.yml and deploy-verify.yml, which had counted as one run duration each. About 25 more calls checked single runs by hand (the copied-job attempt, eight
re-run actors, two M1 spot checks: #1974 run 41460036550 created 14:14:25, gate 14:29:32, 15.12
minutes, as recorded). The re-listing found 113 more runs, none tied to a merge in the window: the
re-listing changed no M3 value; the extra job reads moved M3 by about 1 minute per merge.

## 10. Phase notes

- **Previous verified main SHA:** 561cd60c (PR #2028), the branch base.
- **Revert:** `git revert -m 1 <this merge's SHA>` removes the four files; nothing else depends on
  them.
- **Decisions.**
  - M1 ends at the CI gate, not at Reviewed: the Reviewed check reads a review stamp posted by a
    person or the coordinator, whose timing no CI change controls. Both are reported (section
    3.1); cf13 compares the CI gate figure.
  - Groups by shard bucket and configured jobs, not by path class (section 4.1).
  - The rule in 4.2 lists what ends a side; everything else is workload inside the spread. When
    unsure, a path was put in the rule (a side that ends early is recorded as unmeasured, never a
    wrong comparison).
  - The larger of the whole-reference and clean-stretch spreads is used.
  - Side boundaries are landing PRs' `merged_at`, not merge commit times.
  - Manual-only workflows are outside M3, as #2012 prices them.
- Section 3.5's split of the Build step was timed once on this cloud machine; ranks 2 and 3 rest on
  it, so cf13 times the step's parts on an Actions runner before choosing either.
- **Traps met.**
  - A re-run attempt lists copies of the jobs it did not re-run, with the original times. Count
    each job once, or M3 and the re-run rate are wrong.
  - One run's job list (41240775735, 99 jobs) returns 502 at 100 per page and works at 50.
  - A filtered run listing stops at 1,000 results without an error: compare with `total_count`
    and split the time range.
  - `pgrep -f`/`pkill -f` with a pattern that appears in the calling shell's own command line
    matches that shell: a wait loop waited on itself, and a `pkill` ended its own session command.

## 11. Verification

| Criterion | Result | How |
| --- | --- | --- |
| (a) M1 to M5 with sample sizes, before and after, comparable changes | met | sections 3.1 to 3.6, n on every row; groups in 3.2 |
| (b) why each landed improvement did or did not change turnaround | met | section 6, every ci row |
| (b) ranked candidates with expected effect, five categories each covered | met | section 7: eight candidates, each category has one or more, plus measured reasons where an obvious one is absent |
| (c) spread and minimum n per side for M1, M2, M3, with method | met | section 5 |
| (c) grouping rule and which landings end a side | met | section 4, as code (`rule`) |
| M1 and M2 values match the API | met | #1974 spot check (section 9) |
| Reproducible from the committed records | met | `report` run on the committed file gives the numbers in this file |
