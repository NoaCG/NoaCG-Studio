# Phase cf13: shorten the measured critical path

Plan run #1967 (cicd-followup), phase cf13. Builder session on branch
`claude/plan-cicd-followup-cf13-build`, from `main` at acf26dbe. This file is written in two
steps: before the candidate lands (what it is, its expected effect and its side windows, as the
brief requires), and after its after side is read (the result). Until the second step, the
result is open and the phase has not passed.

## Acceptance, verbatim

(a) At least one optimization chosen from the cf03 ranking lands. Before and after M1 and M3 on
comparable changes, with sample sizes stated and at least the sample size cf03 judged sufficient,
show M1 median or p95 lower or M3 lower beyond cf03's measured run-to-run spread, with no
regression in M2 waiting time, M2 execution time or M4. The before side of each comparison is the
merges after the last earlier landing that changed CI (this run's or any other: workflows, e2e
selection or quarantine scripts, `covers` metadata) and that cf03's rule says affects the compared
group landed and before the candidate lands; cf03's baseline is not the before side. The after
side is the merges after the candidate lands and before the next landing that changes CI and that
cf03's rule says affects the compared group. If either side cannot reach cf03's minimum sample
size within 7 days of the candidate's start, the candidate is recorded as unmeasured with the
sample sizes it reached, counts toward the three, and goes to cf20(c). If no candidate improves
beyond that spread, the phase records the result, reverts or keeps the change on cost grounds with
its reason, and moves to the next ranked candidate. Candidates are tried in ranked order, at most
three; untried candidates go to cf20(c) as measured next steps. It does not PASS on landing alone.
If every tried candidate (at most three) is unmeasured or has failed to show an improvement beyond
the spread, the phase PASSES with that negative result recorded, the speed goal stays open, and
cf20 reports it as open. (b) Obsolete PR runs are cancelled where safe: Actions history after the
change shows superseded PR runs cancelled and no merge-queue or exact-merge coverage run
cancelled. If existing concurrency settings already do this for every PR workflow, the phase
cites those workflow lines and changes nothing.

## Status

| Item | State |
| --- | --- |
| Rank 1, 8 configured stacks | tried, not landed: it grows the backend tier, which is in an active cost breach (section 1) |
| Rank 2, Build step in parallel | this PR; lands when its before side holds cf03's minimum n (section 2) |
| Rank 3, ESLint and tsc caches | next, only if rank 2 does not improve beyond the spread |
| Ranks 4 to 8 | untried; they go to cf20(c) |
| (b) | this PR: preview-trial.yml was the one PR workflow without cancellation (section 3) |

## 1. Rank 1: give the PR's configured selection 8 stacks

cf03 ranks it first (`cap+cfg` M1 14.6 to 12.0) at about +29 backend runner-minutes per merge,
four more stack starts per PR run. The weekly growth report (weekly-audit run 41704224273,
2026-11-03) puts the backend tier at 164.7 of 117 per landing, 141% of its ceiling, as an open
cost breach in correction, due 2026-11-09, owned by `miwco`. Adding about 18% more to that tier
while it is being corrected would work against the ceiling the run may not loosen, and the brief
forbids a budget exception for it.

The E2E capacity gate itself does not refuse it: with `SELECTED_SHARD_MINUTES` set to 5 it
returns WARN, as it does on main, because it prices added spec files and added jobs, not a change
to a stack-count constant. The gate passing is a gap in what it can see, not permission, so rank 1
is recorded as tried and not landed for cost, and counts toward the three. It stays a measured
next step for cf20(c) once the backend tier has room. The gap is filed as #2172.

## 2. Rank 2: the Build step's parts in parallel, in the one Build job

### What changes

`npm run build` ran its parts one after another. Timed from the Build job log of merge group run
41945882373 (2026-11-05, job 126977833002, step `npm run build`, 6.7 minutes):

| Part | Seconds |
| --- | ---: |
| `gates.mjs run`: checks, `test:ai-gateway` (79.8), `check:contracts` (19.3), then `node --test` over 346 files (173.3) | 280.7 |
| `tsc`, `tsc -p tsconfig.api.json`, ESLint, dependency-cruiser | 107.4 |
| player host, production packs, Vite build, prerender, version, secrets, after-build checks | 14.1 |
| CLI package step (a separate step) | about 23 |

The two big parts share no input: the gates read the tree, and tsc, ESLint and
dependency-cruiser read `src/` and `api/`. The build line now starts both at once through
`scripts/build-lanes.mjs` and goes on when both have ended. The gates lane streams its log as
before; the typecheck and lint lane prints as one block when it ends, with its time. Both lanes
always run to the end, so a run shows every failure. Order is otherwise kept: the gates still run
before the player host and production packs are rebuilt, and tsc and ESLint never read those
outputs (`tsconfig.json` includes `src`, `tsconfig.api.json` includes `api`).

**Why lanes in one job and not cf03's separate jobs.** cf03 ranked "parallel jobs". The overhead
tier, where the Build job is priced, is also in an open breach (132.1 of 105 per landing, 126%,
due 2026-11-09), and the capacity gate prices a new job at 6.0 minutes per run. Lanes add no job,
no setup and no runner: they reduce runner-minutes slightly instead of adding about 5 per merge.
The runner has four cores; `node --test` uses three of them, and the lane adds one or two
single-threaded tools.

### Expected effect

The step goes from about 280.7 + 107.4 + 14.1 = 402 seconds to the gates lane plus whatever the
second lane's contention adds to it, plus the 14-second tail: about 5.0 to 5.5 minutes instead of
6.7, so about 1.2 to 1.7 minutes off the Build job. cf03 put rank 2 at 6.2 to 3.8 for the `none`
group with separate jobs; lanes give less because the gates lane alone is 4.7 minutes.

The compared group is `none` (no offline E2E shard), whose M1 chain is the Build job (cf03 section
3.5). Expected M1 median 6.5 (cf03 side A) to about 5.0. cf03's spread for `none` M1 is 1.19, so
the expected effect is about 1.0 to 1.4 spreads: a real improvement could fail to clear the
spread, and the minimum n of 8 is sized for an effect of two spreads. M2 execution for `none`
(Build is the merge group's chain in half the runs) should fall by about the same. M3 should fall
by about 1.5 runner-minutes per Build run, about 7 per merge, inside the 16.75 spread. No change
is expected for `cap+cfg`, whose chain is the configured jobs.

The first Actions run of this PR gives the lanes' real times; section 2.1 records them before
landing.

### 2.1 Measured on this PR's own CI run

PR run 41950548989 (head b3ac3a2f, 2026-11-05), Build job 126993773542, from its log:

| Part | Sequential (merge group 41945882373) | Lanes (this PR) |
| --- | ---: | ---: |
| `npm run build` step | 402 s (6.7 min) | 268.6 s (4.5 min) |
| gates lane | 280.7 s | 255.8 s, `node --test` 147.7 s against 173.3 |
| typecheck and lint lane | 107.4 s, after the gates | 97.9 s, inside the gates lane |
| Build job, start to end | about 7.4 min | 5.4 min |

The typecheck and lint lane ended during `test:ai-gateway` and did not slow the gates lane: one
run each, so the 25-second difference in the gates lane is runner noise, not a gain. The step is
about 2.2 minutes shorter, more than the 1.2 to 1.7 expected above. Revised expectation for
`none`: M1 median about 6.5 to 4.3, about 1.8 spreads; M2 execution lower by up to the same where
Build is the group's chain; M3 about 2 runner-minutes lower per Build run, about 10 per merge,
inside the 16.75 spread. One run is not a measurement; the sides are.

### Side windows

Group `none`, metrics M1, M2 waiting, M2 execution, M3, with cf03's values unchanged (section 5.1):

| Metric | Spread | Minimum n per side (median) | Minimum n (p95) |
| --- | ---: | ---: | ---: |
| M1 | 1.19 | 8 | 20 |
| M2 waiting | 0.06 | 9 | over 120 |
| M2 execution | 0.93 | 9 | 20 |
| M3 | 16.75 | 12 | over 120 |

- **Before side.** `none` merges whose final head's PR run was created after the last landing that
  ends `none` sides and before this PR's `merged_at`. Today that landing is cf14 (#2167, merge
  86749ef1, merged 2026-11-05T01:09:30Z); `phase-cf03-baseline.mjs rule acf26dbe` (#2170) ends
  nothing. Every later merge is checked with `rule` before the count is used.
- **Landing condition.** This PR lands only once the before side holds at least 12 `none`
  merges (the largest minimum above, M3), so every metric can be measured on that side. If a
  side-ending landing arrives first, the before side restarts after it.
- **After side.** `none` merges whose final head's PR run was created after this PR's
  `merged_at`, up to the next landing whose `ends` include `none`, or 7 days after the candidate's
  start, whichever is first.
- **Candidate start and the 7-day bound.** The candidate started when this PR opened on
  2026-11-05. If either side has not reached the minimum by 2026-11-12, the candidate is recorded
  unmeasured with the n it reached, counts toward the three and goes to cf20(c).
- **Reading.** Collect the window with `CF03_FROM=<before-side start> CF03_UNTIL=<read time>`,
  `phase-cf03-collect.mjs` until it prints `complete`, then `phase-cf03-baseline.mjs derive`, then
  `phase-cf13-sides.mjs --group none --before-from <ISO> --land <ISO> --after-until <ISO>`.
  It prints n, median and p95 per side and metric, the verdicts of cf03 section 5.2 and the M4
  Fisher test (every group, as cf03 defines it). Checked on cf03's own records: sides B and A of
  `none` give B M1 median 5.2 against A 6.13 and M4 7 of 122 against 15 of 79, as cf03 reports.

### If it does not improve beyond the spread

It stays: it lowers runner-minutes and adds no job, so the cost grounds favour keeping it. The
phase then moves to rank 3 (ESLint and tsc caches, keyed on more than file content), whose own
before side starts at this PR's landing.

## 3. (b) Obsolete PR runs

Workflows with a `pull_request` trigger, on `main` at acf26dbe:

| Workflow | Cancels a superseded PR run | Lines |
| --- | --- | --- |
| ci.yml | yes; never on `main` or a merge group | `.github/workflows/ci.yml` lines 97 to 100: `group: ci-${{ github.event_name == 'merge_group' && github.run_id \|\| github.ref }}`, `cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.event_name != 'merge_group' }}` |
| toolkit-distribution.yml | yes | `.github/workflows/toolkit-distribution.yml` lines 37 to 39 (pull requests and dispatch only) |
| preview-trial.yml | **no**: no `concurrency` at all | changed here |

CodeQL runs as GitHub's default setup, not a workflow file in the repository, and the preview
deployments are Vercel's, so neither has a concurrency setting here to change. release-cli.yml
names `pull_request` only in a comment.

So the existing settings did not cover every PR workflow, and this PR adds to preview-trial.yml a
group per pull request ref that cancels in progress for `pull_request` only; a dispatch keys on
its own run id and is never cancelled. preview-trial.yml is not a required check, does not run in
the merge queue or on `main`, and is one of the four path-filtered workflows cf03's rule leaves out
(section 4.2), so it ends no side.

**History so far.** ci.yml since 2026-11-03: 102 cancelled pull request runs against 94 green and
46 red ones. One merge group run was cancelled in that time (41636612475, #2021): GitHub removed
the PR from the queue at 12:48:13Z and cancelled its group run at 12:48:24Z, the queue's own
behaviour for a dequeued group, not a concurrency setting (its group keys on the run id).

**After the change, on this PR.** Pushing b3ac3a2f at 01:44:28Z cancelled the preview-trial run of
the previous head (41950488091, created 01:43:57Z, cancelled) and the ci.yml PR run of that head
(41950488062, cancelled); the new head's preview-trial run 41950549139 passed. The coordinator's
reading after landing adds the history on other branches: merge group runs cancelled (expected
0 by concurrency) and superseded preview-trial runs.

**What this does not change.** A ci.yml push run on `main` that is still waiting when a newer push
arrives is replaced under the `ci-refs/heads/main` group: 18 such runs on 2026-11-04. ci.yml lines
76 to 95 record that as a deliberate trade against runner capacity. These are the full suite on a
commit the merge queue has already validated on the exact merge (the merge group run, which is
never cancelled), not a PR run and not the queue's verification; whether every exact merged
revision should get full validation is cf16's question. It is reported here because it is the one
kind of cancelled run on `main`.

## 4. Verification

| Criterion | Result | How |
| --- | --- | --- |
| (a) a candidate from the ranking lands | pending | this PR, when its before side holds 12 `none` merges |
| (a) M1 or M3 lower beyond the spread, no M2 or M4 regression | open, not claimed | read after the after side fills (section 2) |
| (a) rank 1 tried in order | recorded | section 1; the capacity gate's verdict reproduced locally (WARN) |
| The lanes shorten the Build step on Actions | one run: 402 to 268.6 s | section 2.1 |
| The lanes run concurrently, keep every failure and the first failing status | pass | `scripts/build-lanes.test.mjs` (5 tests; concurrency shown by each lane waiting for the other's file, not by timing) |
| The build line still starts the build tier and ends with the after-build tier | pass | `node scripts/gates.mjs audit`; `scripts/gates.test.mjs` with the new exact prefix |
| Targeted gates | pass | `npm run gates -- run --changed origin/main`: 49 pass, 0 fail |
| Full build on CI | pass | PR run 41950548989: CI gate green, configured selection the whole set (70 specs, 4 stacks) |
| Local production build | not passed here, unrelated | queued job j-0001: the typecheck and lint lane passed; the gates lane failed 13 `executorSandbox` tests, which fail the same way when `test:ai-gateway` runs alone on this machine's Node 22 (CI runs Node 24 and passed them) |
| (b) every PR workflow cancels a superseded run | pass | section 3: ci.yml and toolkit-distribution.yml cite their lines; preview-trial.yml changed, and its superseded run 41950488091 was cancelled on this PR |
| (b) no merge-queue or exact-merge run cancelled by concurrency | pass on `main` so far; re-read after landing | section 3 |
| The side reader reproduces cf03 | pass | section 2, reading cf03's records |

## 5. Phase notes

- **Previous verified main SHA:** acf26dbe (#2170), the branch base.
- **Revert:** `git revert -m 1 <this merge's SHA>` restores the sequential build line and removes
  preview-trial.yml's concurrency; the evidence files can stay.
- **Decisions.**
  - Rank 1 not landed although the capacity gate passes it: the backend tier is in an open breach.
  - Rank 2 as lanes in one job, not new jobs: the overhead tier is in an open breach too, and lanes
    cost nothing extra.
  - The landing waits for 12 `none` merges on the before side.
  - The cf03 scripts take `CF03_FROM` and `CF03_UNTIL` so a later window can be collected; unset,
    they read cf03's own window, unchanged.
- **Traps met.**
  - A production build on a cloud machine must go through `node scripts/jobs.mjs add`: a direct
    `npm run build` is refused by the build admission guard.
  - `phase-cf03-baseline.mjs` runs its command line when imported, so another script cannot import
    it; `phase-cf13-sides.mjs` copies the two helpers it needs.

## 6. Issues

- #2172: the E2E capacity gate does not price a change to the configured stack count (section 1).
