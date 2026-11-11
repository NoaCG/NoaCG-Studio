# Phase cf22: measure and rank the repair loop

Plan run #1967 (cicd-followup), phase cf22, added by the owner on 2026-11-11
([owner-decision-2026-11-11-cf22.md](owner-decision-2026-11-11-cf22.md)). Builder session on
branch `claude/plan-cicd-followup-cf22-build`, from `main` at ada1c781. This is a measurement and a
ranking only. It changes no test, check, limit, workflow or script outside this folder. It adds
this file, the bounce records ([phase-cf22-records.json](phase-cf22-records.json)) and two
read-only scripts that rebuild them ([phase-cf22-collect.mjs](phase-cf22-collect.mjs),
[phase-cf22-analyze.mjs](phase-cf22-analyze.mjs)).

## Acceptance, verbatim

(a) From GitHub history over the 14 days before the phase starts, every PR whose CI or merge-queue
run failed after it was ready is counted, with the number of rounds per PR, the time lost per bounce
(from the failure to the next green run on that PR) and its cause classed as real defect, flake,
gate refusal (for example budget or the review stamp) or infrastructure, with sample sizes, using
cf03's measurement rules. (b) Candidate fixes, including re-running only the failed part, agents
running the affected tests before pushing, and gate refusals that an agent cannot fix going to the
owner alarm at once instead of looping, are ranked by the time each would save, estimated from the
measurements in (a), each with its basis. (c) The phase changes no test, check or limit; the
numbers and the ranked list go to the owner before anything is built, and building any fix needs
the owner's decision. (d) cf20 reports the result.

## Summary

- **42 PRs bounced after they were ready, 60 times.** That is 14% of the 309 PRs with a PR run in
  the window. Rounds per PR: median 1, p90 3, at most 4.
- **A bounce costs 30.4 minutes median and 123.5 at p90** (n = 55 resolved), from the failure to
  the next green. In total 5,290 minutes, or 4,616 once overlapping bounces on one PR are counted
  once.
- **Most of that time nothing runs.** 72% (3,830 minutes) passes between a failure and the PR's
  next attempt, whatever that attempt's result: the agent noticing, repairing and pushing, or
  nobody working on the PR. The rest is CI rounds, red ones included. Idle time per bounce has a
  median of only 4.4 minutes; four idle stretches of 4 to 24 hours make up 62% of all time lost.
- **Causes:** 18 real defects, 16 flakes, 21 gate refusals, 4 infrastructure, 1 unresolved. 16
  of the 21 gate refusals were the E2E capacity (growth) line, not the review stamp or a budget.
- **Ranked fixes** (section 4): a red PR waking its repair owner at once (up to 3,244 minutes), then
  sending gate refusals an agent cannot fix to the owner (215), then a local capacity check before
  pushing (115). Re-running only the failed part saves 52 minutes, because agents already did that
  in 11 of 20 cases. Agents running the affected tests before every push would save 675 minutes
  gross. As a blanket rule it costs more than that, since it breaks even at 0.7 minutes per push.
- **Nothing is built** (c). The numbers and the list went to the coordinator for the owner before
  this PR's reviews. Every fix needs the owner's decision.

## 1. Window and data

**Window.** The 14 days before the phase started (18:31Z on 2026-11-11): 2026-10-28T18:30:00Z to
2026-11-11T18:30:00Z. A bounce belongs to the window when its failure ends in it.

**Data.** GitHub history only, read with `gh api` in bounded passes of at most 100 calls (section
6). The data covers:

- every pull request updated since 2026-10-21 (600);
- every ci.yml run created from 2026-10-21 to the window's end (2,459 runs);
- the issue events of the 204 PRs with a red or re-run ci.yml run in the window (a run's listed
  conclusion is its latest attempt's, so a red attempt that a re-run turned green shows as success);
- the jobs of all attempts of every non-cancelled ci.yml run those PRs had in the window (604 runs);
- 126 job logs, one for each failed job whose failed step does not decide the cause by its name.

Only lines that name an error, a failed check, a failing spec or a refusal were kept from the logs,
and no log URL. The clone was unshallowed (cf16's trap: a shallow clone lists only some landings),
and each repair push was read with `git log`.

**Which runs count.** The required checks are ci.yml's `CI gate` and `Reviewed`; other workflows
are not part of a PR's loop. So a PR's runs are its ci.yml `pull_request` runs, the
`workflow_dispatch` runs on its head branch, and its `merge_group` runs (branch
`gh-readonly-queue/main/pr-<n>-…`). A run cancelled as a whole was superseded by a newer push
(cf03) and is not a bounce. Pushes to `main` belong to post-landing, which cf21 counts.

**cf03's rules, unchanged.** These apply as cf03 wrote them:

- A re-run attempt lists copies of the jobs it did not re-run, with their original times. Each job
  counts once, in the attempt that ran it.
- A failed, cancelled or timed-out job followed by a pass on the same commit is a fail-then-pass.
- Quantiles are nearest-rank.
- cf17's rule holds: a `Reviewed` failure before the review stamp is review wait, not a
  fail-then-pass.

## 2. Rules: what is a bounce, its time and its cause

**A bounce** is one of:

1. A PR-run attempt whose `CI gate` ended `failure` or `timed_out`. The attempt must be created
   while the PR was ready: its last `ready_for_review` before then, or its creation when it was
   never a draft. A PR run is judged by `CI gate` alone, so a red `Reviewed` beside a green gate is
   review wait, counted apart (340 such attempts on these PRs).
2. A merge-group attempt whose `CI gate` or `Reviewed` failed.
3. A dequeue: a `removed_from_merge_queue` event.
   - A removal within a minute of the PR's `merged` event is GitHub recording the landing, so it is
     not counted.
   - A removal from 2 minutes before to 10 minutes after a red merge-group run of the same PR
     belongs to that run's bounce.
   - A removal by the queue bot near another PR's red group takes that group's cause.

Two attempts on one head are folded into one bounce when the second was created before the first
ended. These are concurrent runs, such as a `pull_request` run beside a dispatch. An attempt that
re-ran only `Reviewed` lists a copy of the old gate and gives no new verdict.

**Rounds per PR** are its bounces.

**Time lost** runs from the failure to the next green on that PR.

- The failure time is the end of the red gate, or of the red `Reviewed` in the merge group.
- After a PR-run bounce, the next green is the next green `CI gate` on a PR run.
- After a merge-group bounce or a dequeue, the next green is the next green merge-group run, or the
  merge if that comes first.
- **Idle** runs from the failure to the creation of the PR's next attempt of the same kind,
  whatever its result: the time nothing ran. **Wait** runs from the failure to the creation of the
  attempt that went green, so it can hold red rounds in between. **CI** runs from that creation to
  green.
- A PR's red time is the union of its bounces' intervals, so overlapping bounces count once.
- A bounce with no green by the end of the listing is unresolved and has no time.

**Cause.** Each failing job is classed by its failed step and, where the step name does not decide,
by its log:

| Class | Evidence |
| --- | --- |
| gate | `Reviewed` red in the merge group (review stamp); the `E2E protection check` step; a Build log whose only failed gates are `check:goals-budget`, `check:file-budgets` or `check:function-budget` (budget); the `CI gate` log's `E2E capacity line - …` error (capacity, the growth gate) |
| infra | a setup step (set up job, checkout, setup-node, a local action such as `configured-stack`), a job with no failed step (runner lost), or a log error line naming a network, runner, disk or registry failure with no failing test |
| hang | a job cancelled or timed out inside a run that was not superseded |
| code | anything else: `[gates] tests failed`, a failed `check:` that is not a budget, failing specs (the log's `N) [chromium] › e2e/….spec.ts` lines), a configured verdict |

The configured verdict restates its shards, so when a shard failed too, the shard decides.

Before the rules below, cf03's fail-then-pass is applied job by job. A failing job that passed in a
later attempt on the same commit, even an attempt that stayed red for another reason, is set aside,
and the rules read the parts that did not pass again. When every failing job passed again, the
bounce is infrastructure if each failed in setup or on a runner, and a flake otherwise. The
bounce's cause is then decided in this order:

1. **Gate refusal.** A gate part with no code part beside it. An infrastructure part beside a
   refusal does not change the cause, because a re-run passes the infrastructure part but never
   the refusal.
2. **Infrastructure.** Every part is infra.
3. **Flake.** The next green ran on the same commit, which is cf03's fail-then-pass; for a
   merge-group bounce, the PR's head is compared. Also a flake, marked ambiguous: every failing part
   is a spec, every failing spec is a known quarantined spec (current or released in
   `e2e/quarantine.json` at ada1c781), and the repair did not touch it.
4. **Real defect.** The PR's own commits between the failed head and the green head changed code or
   tests: a path outside `docs/` that is not `*.md`. Merges of `main` are left out
   (`git log --first-parent --no-merges`).
5. **Ambiguous**, each placed by one rule:
   - a hang with no same-commit pass is infrastructure;
   - no green by the end is unresolved;
   - unreadable repair commits are a defect;
   - a green after a push with no own code change, such as a merge of `main` only, is a flake.

   Ambiguous bounces are counted in their class and shown separately: 12 of 60.

A bounce with a gate part and a code part that did not pass again is a defect, recorded
`with_gate`, because the code had to change anyway. One bounce is like this, and one more is
unresolved.

## 3. (a) Results

### 3.1 Counts and rounds

| | n |
| --- | ---: |
| PRs with a PR run in the window | 309 |
| PRs merged in the window | 315 |
| PRs that bounced after they were ready | **42** (37 later merged) |
| Bounces | **60**: 55 PR-run CI gate, 2 merge group, 3 dequeues |
| Rounds per PR | median 1, p90 3, max 4: 31 PRs one round, 6 two, 3 three, 2 four |
| Unresolved bounces (no green by the end) | 5: #2229 closed, #2332 and #2364 still open |
| Review wait, not bounces (PR attempts with a green gate and a red `Reviewed`) | 340 |

### 3.2 Time lost per bounce, in minutes

| | n | median | p90 | sum |
| --- | ---: | ---: | ---: | ---: |
| Time lost (failure to next green) | 55 | **30.4** | **123.5** | 5,290 |
| Idle: failure to the next attempt (nothing ran) | 55 | 4.4 | 49.0 | 3,830 (72%) |
| Wait: failure to the attempt that went green (can hold red rounds) | 55 | 16.0 | 117.1 | 4,545 |
| CI time of the green attempt | 55 | 14.3 | 17.5 | 745 (14%) |
| Red time per PR (overlaps once) | 42 | 20.9 | 152.7 | 4,616 |
| For reference: a first-attempt green PR run of these PRs | 347 | 13.7 | 29.2 | |

### 3.3 By cause

| Cause | Bounces (ambiguous) | PRs | Lost: median / p90 / sum | Wait: median | CI: median |
| --- | --- | ---: | --- | ---: | ---: |
| Real defect | 18 (1) | 16 | 20.5 / 300.0 / 2,264 | 6.1 | 15.6 |
| Flake | 16 (6) | 13 | 15.2 / 135.1 / 827 | 3.4 | 12.9 |
| Gate refusal | 21 (3) | 12 | 49.1 / 106.1 / 903 (n 17) | 32.9 | 10.1 |
| Infrastructure | 4 (1) | 4 | 14.8 / 1,240.3 / 1,296 | 0.7 | 14.1 |
| Unresolved | 1 (1) | 1 | none | | |

**Gate refusals by kind (21).**

- 16 capacity (growth) line refusals:
  - 7 overhead tier over its per-landing budget;
  - 4 backend tier over its budget;
  - 4 the change itself over the line;
  - 1 the durations table 9 days old, over its 8-day bound (#2364). That is a bad report: the
    owner's request of 2026-11-11 (#2379, #2381) changes how the gate treats one.
- 2 E2E protection check refusals (#2229, #2321).
- 3 dequeues by the queue bot with no red group run (#2021, #2095, #2220), ambiguous.

No budget check (`goals-budget`, `file-budgets`, `function-budget`) and no merge-queue review stamp
refused a PR in the window.

**Real defects by what failed (17 unambiguous).**

- 6 Build (unit tests, `check:workflows`);
- 6 offline E2E specs;
- 5 configured specs.

In 6 of them the failing spec file was one the repair changed.

**Flakes (16).**

- 9 passed on a re-run of the same run, and 1 on a new run of the same head.
- The other 6 are ambiguous:
  - 5 failed only in known quarantined specs, such as `import-svg-behaviour` 3 times on #1985;
  - 1 went green after a push with no own code change (#2227, a merge of `main`).

#2134's first bounce shows the job-level rule at work. Two E2E shards failed there and passed in
the next attempt on the same commit, while the capacity line kept refusing, so the bounce is a gate
refusal.

**Infrastructure (4).** 3 configured stacks failed to start (`configured-stack`), and 1 Factory
gates job was cancelled in checkout (#2218).

**Which jobs fail.** Of the failing jobs counted across all bounces, offline E2E shards are 27 (10 in
defects, 13 in flakes, 2 in a gate refusal where they passed again, 2 unresolved), `CI gate`'s
capacity line 18, Build 11 (2 of them the E2E protection step) and configured jobs 12.

### 3.4 The long idle stretches

Four non-gate bounces sat idle for over an hour, with nothing running before the PR's next attempt.
Together they are 3,262 minutes, 62% of all time lost:

| PR | Failure | Idle (min) | Cause | What happened |
| --- | --- | ---: | --- | --- |
| #1840 | 2026-10-31 06:13 | 1,463 | defect (ambiguous) | a bot PR (`bot/e2e-traced`) red in the merge group; the next nightly refresh replaced it a day later |
| #2218 | 2026-11-05 13:50 | 1,226 | infra (ambiguous) | Factory gates cancelled in checkout; green the next morning |
| #2227 | 2026-11-05 15:30 | 313 | flake (ambiguous) | an E2E spec failed; green after a merge of `main` 5 hours later |
| #2374 | 2026-11-11 05:28 | 261 | defect | an E2E spec failed at night; the fix came in the morning |

#1985's 121-minute wait is not idle time: it held three repair pushes, each red. That is E's
loop.

## 4. (b) Candidate fixes, ranked by estimated time saved

All estimates cover the same 14 days and are computed by `phase-cf22-analyze.mjs` from the
records. "Removing" a bounce saves its red time without double counting: per PR, the union of all
its bounces' intervals minus the union of those that stay. The required three are A, B and C; D, E
and F come from the data.

| Rank | Fix | Saved (min) | Bounces it acts on | Basis and arithmetic |
| ---: | --- | ---: | ---: | --- |
| 1 | **F. A red PR wakes its repair owner at once** | **≤ 3,244** | 4 | Each non-gate idle stretch over an hour, less the 4.4-minute median idle time a woken owner is assumed to match: (1,463 + 1,226 + 313 + 261) − 4 × 4.4. This is an upper bound: part of an idle stretch can be repair work done before the push, and #1840 is a bot PR whose fix was the next nightly. #2374 is also one of B's defect bounces, so F and B overlap there. |
| 2 | **C. Gate refusals an agent cannot fix go to the owner alarm at once** | **215** (floor 49) | 14 refusals on 8 PRs; 3 PRs looped | This counts only the refusals that need the owner: a tier budget, a stale report or the protection check. The 4 refusals for "the change over the line" are left out (#2321 twice, #2332, #2364's first), because an agent clears those by making its change cheaper; their loop was 30 minutes. On 3 PRs the same refusal came back 6 more times: #2005 three times, #2134 twice, #2194 once. Saved: the red time from each PR's second refusal of a kind to its green, which the agent spent looping after it had already seen the refusal. It assumes the owner answers an alarm within the first refusal's own round. Floor: only the 6 repeats removed, 49 minutes. The first refusals waited 267 minutes in all, and a quick owner answer could save part of that too. |
| 3 | **D. Agents check the capacity line before pushing and ask the owner then** | **115** | 16 capacity refusals | The capacity line is decided before any test runs, from the plan and the newest growth report. Known-traps already runs it locally (`scripts/e2e-capacity.mjs`). Checking it before pushing replaces the first CI round of each refusal: the sum of the first capacity refusal's CI minutes per PR. The repeats are C's. Cost: one run of that script per push of an E2E or ceiling change, not measured here. It reads the plan and one growth report and runs no test. |
| 4 | **E. Name a known-flaky spec in the failure** | **102** | 5 (1 PR looped) | On #1985 the agent pushed code twice more for `import-svg-behaviour.spec.ts`, which is already in quarantine's history. Saved: the red time from its second such bounce to green. Ambiguous by rule 3, and one PR. |
| 5 | **A1. Re-run only the failed jobs** | **52** | 20 flake and infra | For each flake or infra bounce whose green was a new full run: its CI minutes minus the longest failed job. In 11 of 20 the green was already a re-run of only the failed jobs, so most of the saving is already taken. ci.yml also retries failed specs and failed Build or Factory jobs inside the run. |
| 6 | **A2. CI re-runs an infrastructure failure's failed jobs once, at once** | **28** | 3 | For each unambiguous infra bounce: its wait plus A1. Known-traps allows one re-run for an infrastructure death. For flakes the rules forbid added retries, and they go to quarantine. |
| 7 | **B. Agents run the affected tests before pushing** | gross **675**; as a blanket rule it costs more than it saves | 17 defect | Removing every unambiguous defect bounce saves 675 minutes: offline E2E 451, build and unit tests 132, configured 72. That assumes the local run catches what CI caught. The cost lands on every push. 983 heads were pushed in the window, so B breaks even at 675 / 983 = 0.7 minutes of local running per push, and a targeted build alone takes 5 to 10 minutes on a worker (verify.md caps). verify.md already asks for targeted local checks, so these 17 are what got past them. A narrow version could pay: for example, running the spec files the change edits, where the failing spec was edited in 6 of 17. Its cost per push has to be measured before it is chosen. |

**Reading the ranking.**

- CI speed is not where the loop's time goes. For 72% of the time lost nothing runs, and the green
  attempt's CI is 14%. Re-running less (A1, A2) saves 80 minutes in 14 days.
- The savings overlap, so they do not add up: F and B share #2374.
- The loss sits in idle time, and above all in four long stretches (F).
- The second place it sits is in the agent looping on a refusal it cannot fix: capacity refusals,
  16 of the 21 gate refusals (C and D).
- F's 3,244 is an upper bound resting on four cases, and C's 215 on three PRs. Both are small
  samples. cf20 should re-measure them before and after any fix that is chosen.

## 5. (c) Nothing built

This phase changes no test, check, limit, workflow or script outside its evidence folder; the diff
is four new files here. On 2026-11-11 the coordinator was sent the headline numbers and the ranked
list, for the owner, before this PR's reviews. Building any of A to F needs the owner's decision.
(d) cf20 reads this file.

## 6. Reproducing the numbers

From the records alone (no API):

    node docs/work-specs/cicd-followup/evidence/phase-cf22-analyze.mjs report --records docs/work-specs/cicd-followup/evidence/phase-cf22-records.json

prints every table above as JSON. To rebuild the records from GitHub:

    git fetch --unshallow origin    # a full clone: the repair-change rule reads each push
    node docs/work-specs/cicd-followup/evidence/phase-cf22-collect.mjs --cache <dir>     # repeat until it prints "complete"
    node docs/work-specs/cicd-followup/evidence/phase-cf22-analyze.mjs derive --cache <dir> --out <records.json>

Each collector run is one pass of at most 100 calls (`--max-calls`), and each completed read is
cached once. This collection took at most about 1,190 calls:

- 17 complete passes: 4 of 100 calls, then 78, 1, 1, 2, 12, 12, 47 and 74, after the fixes listed
  in section 7, and 3 of 100, then 56 and 2, after the review widened the read to re-run PRs;
- 1 pass that ended on a GitHub server error before writing anything;
- 2 passes stopped by hand part way, each still capped at 100 calls. One of them was started by
  mistake while another was running: importing the collector ran it, which is now guarded.

`derive` also fetches the head refs of PRs whose repair commits are not on `main`
(`refs/pull/<n>/head`). That is a git fetch, not an API call. Four commits were unreadable
(force-pushed) and are placed by rule 5.

## 7. Phase notes

- **Previous verified main SHA:** ada1c781 (PR #2390), the branch base.
- **Revert:** `git revert -m 1 <this merge's SHA>` removes the four files. Nothing depends on them.
- **Decisions.**
  - The loop is measured on ci.yml's required checks only (`CI gate`, `Reviewed`), because those
    are what send a PR back. A configured-suite dispatch or a CodeQL scan does not block landing.
  - A red `Reviewed` on a PR run is review wait (cf17) and is counted apart. A missing stamp that
    refuses the merge queue would be a gate refusal; none happened in the window.
  - The capacity refusal fails `CI gate` with every input green, so the gate's own log is read.
    Without it, 15 refusals would have looked like gate failures with no cause.
  - A merge-group bounce compares the PR's heads, not GitHub's group commits.
  - Savings remove bounces by the union of red time, so overlapping bounces never count twice. C
    and E use the time after the second bounce, because removing a repeat that overlaps the first
    saves almost nothing while the loop itself is real. Both floors are given.
  - B is ranked last despite the largest gross figure: its cost lands on every push, and the
    break-even is shown.
- **Review round 1** (fresh read-only /so on b3da0cc7b, grade B, class: faulty measurement rules).
  All four findings were fixed in one checkpoint:
  - Fail-then-pass is now applied job by job. #2134's shards passed again on the same commit, so
    that bounce is a gate refusal, not a defect.
  - The quarantine clause now needs every failing part to be a quarantined spec, so #2124 (Build
    red too) is a defect.
  - Idle time is separated from wait, and F is based on idle time; #1985 left F.
  - C counts only the refusals that need the owner.
  The ranking order did not change.
- **Traps met.**
  - GitHub records `removed_from_merge_queue` at the moment the queue merges a PR. Read without
    the `merged` event beside it, every landing looks like a dequeue (97 of 100 removals here).
  - An attempt that re-ran only `Reviewed` lists the earlier `CI gate` as a copy. Judged by that
    copy, one red gate counts twice.
  - A run's listed conclusion is its latest attempt's. Selecting PRs by red runs alone missed 93
    PRs with a re-run, 4 of which had a bounce (found in this phase's own review).
  - Free-text log matching misleads. A Build log names every gate it runs (`check:goals-budget ok`)
    and its test titles contain "rate limit" and "failed". Only the `[gates] … FAILED`,
    `[gates] tests failed`, `##[error]` and Playwright `N) [chromium] › …` lines decide.
  - A job list fetched at 100 per page returned 502 for one run every pass, and works at 50. This
    is cf03's trap again.
  - Job logs fetched in parallel through the proxy failed on 12 of 47. Logs are fetched one at a
    time, and a failed fetch is not cached.
  - `pkill -f <pattern>` in a command line that contains the pattern can end that command's own
    shell (cf03's trap). It did not here, but the loop was restarted to be sure.
- **Follow-ups.** None filed. Every candidate is an owner decision on this ranking, not a defect.
  The bad-report capacity refusal is already the subject of #2379 and #2381.

## 8. Verification

| Criterion | Result | How |
| --- | --- | --- |
| (a) every PR that bounced after ready, counted from 14 days of history | met | section 3.1; rules in section 2; every PR with a red or re-run run was read in full (204) |
| (a) rounds per PR | met | section 3.1, histogram |
| (a) time lost per bounce, failure to next green, median and p90 with n | met | section 3.2; idle, wait and CI split |
| (a) cause classed as defect, flake, gate refusal or infrastructure, with sample sizes, how decided and how ambiguous ones count | met | sections 2 and 3.3; 12 ambiguous, each by a named rule |
| (a) cf03's measurement rules | met | section 1: copied jobs once, fail-then-pass on one commit, nearest-rank, review wait apart |
| (b) the three named candidates and others the data shows, ranked by time saved, each with basis and arithmetic | met | section 4: A1, A2, B, C, D, E, F |
| (c) no test, check or limit changed; numbers to the owner first; building needs the owner | met | section 5; the diff is four new files in this folder |
| (d) cf20 reports the result | handed on | cf20 reads this file |
| Reproducible from the committed records | met | `report` on the committed file prints the numbers above |
| Spot checks against the API | met | #1801 run 40765654275: attempt 1 gate red at 21:04:24 after `E2E 3/15` was cancelled at 20 minutes, and attempt 2 re-ran only it and `Reviewed`, green at 21:14:44 (10.3 minutes, a flake). #2005: `CI gate` red at 07:26:56 with only `Reviewed` red beside it, and its log names the overhead tier refusal. |
