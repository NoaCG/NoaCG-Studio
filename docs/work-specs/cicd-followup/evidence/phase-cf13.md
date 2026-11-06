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
| Rank 1, 8 configured stacks | second try unmeasured (before 12, after 3; section 7.7), reverted; the owner chose a re-run as the third and last try (section 7.8) |
| Rank 2, Build step in parallel | first of the three tries; landed in #2171 (a235a93d) on cost grounds, expected unmeasured (section 2.2) |
| Rank 3, ESLint and tsc caches | untried, superseded by rank 2 (section 7.5); goes to cf20(c) |
| Rank 4 | not built: no M1 or M3 effect alone, so building it would be filler (section 7.5) |
| Ranks 5 to 8 | untried; they go to cf20(c) |
| (b) | landed in #2171: preview-trial.yml was the one PR workflow without cancellation (section 3) |

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
is skipped for cost. It never ran, so it is an untried candidate: it does not count toward the
three, and it goes to cf20(c) as a measured next step for when the backend tier has room. The gap is filed as #2172.

**Superseded on 2026-11-06:** the owner approved rank 1 as a 14-day trial (section 7), so it was
tried after all and counts toward the three (sections 7.7 and 7.8).

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
- **Landing condition.** Replaced by section 2.2: no group can reach cf03's minimum within the
  bound, so the PR lands on cost grounds without waiting.
- **After side.** `none` merges whose final head's PR run was created after this PR's
  `merged_at`, up to the next landing whose `ends` include `none`, or 7 days after the candidate's
  start, whichever is first.
- **Candidate start and the 7-day bound.** The candidate started when this PR opened on
  2026-11-05. If either side has not reached the minimum by 2026-11-12, the candidate is recorded
  unmeasured with the n it reached, counts toward the three and goes to cf20(c).
- **Reading.** Use a fresh `--cache` folder for every collection: the collector caches its PR
  list and day listings per window, so a reused cache misses newer merges. Collect the window with `CF03_FROM=<before-side start> CF03_UNTIL=<read time>`,
  `phase-cf03-collect.mjs` until it prints `complete`, then `phase-cf03-baseline.mjs derive`, then
  `phase-cf13-sides.mjs --group none --before-from <ISO> --land <ISO> --after-until <ISO>`.
  It prints n, median and p95 per side and metric, the verdicts of cf03 section 5.2 and the M4
  Fisher test (every group, as cf03 defines it). Checked on cf03's own records, with side B as the before side
  and everything after ci01 (cf03's sides D, A and A2 together) as the after side: `none` M1
  median 5.2 on B, as cf03 reports, and M4 7 of 122 against 15 of 79, which is cf03's B (7 of 122)
  against its D, A and A2 added up (10 of 44, 5 of 34, 0 of 1).

### 2.2 Re-plan before landing (2026-11-05)

The coordinator collected 2026-11-05T01:09:30Z to 14:00Z with these scripts: 13 merges, one of
them `none` (M1 7.97). Since cf12 every product change plans the critical journeys, so a change
with no offline shard is now close to docs-only, about one per 13 hours. Neither `none` side can
reach 12 (or the M1 minimum of 8) by 2026-11-12. Checked for every other metric and group,
with cf03's values unchanged:

- **M3, `cap+cfg`.** Builds per merge: about 3.1 PR heads (cf03 side A), one merge group run and
  one push run on `main`, so about 5; at 2.2 runner-minutes saved each, about 11 per merge.
  cf03's spread is 290.26 (minimum 12 per side): the effect is 0.04 spreads. Not measurable.
- **M3, `cap`.** The group ended at ci06 (cf03 section 3.2) and its spread is 709.74. Not
  measurable.
- **M1 and M2 execution, `cap+cfg`.** Build is off the critical path: on cf03's side A it ends at
  6.1 minutes, against the configured verdict at 14.4 on the PR and the catalog gate (11.2) or
  the offline shards (9.7) in the merge group. No effect.
- **`small`, `small+cfg`, `none+cfg`.** cf03 gives no spread or minimum ("no comparison").

So rank 2 cannot be measured within the bound whatever its landing time. It lands now on cost
grounds (no added job, about 11 runner-minutes less per merge, a shorter Build for every change)
and is recorded unmeasured with the n each side reaches, counting as the first of the three tries
and going to cf20(c).

**The same check on the next candidates.** Rank 3 (ESLint and tsc caches) also shortens only the
Build step, so it fails the same check: M3 effect about -10 per merge against 290.26, no M1 or
M2 effect for `cap+cfg`, and `none` too rare. Rank 4 alone moves M2 execution by -0.1 at the median over all 66 merges after ci06
(cf03 section 7); cf03 gives no `cap+cfg` figure for it, and within `cap+cfg`, where the catalog
gate sets the merge group's time more often, the effect could be larger, so rank 4 is checked
against `cap+cfg` M2 execution (spread 0.62, minimum 11) before it is built. Rank 5 moves `cap+cfg` M1 by -0.9 against 1.04. Rank 6 needs over
120 per side for its p95. The one candidate with an effect above a spread on a group that still
flows is rank 1 (`cap+cfg` M1 -2.6 against 1.04, minimum 10 per side, about 20 hours of merges),
which is skipped because the backend tier is in breach (section 1).

### What follows

Rank 2 stays on cost grounds whatever its reading: it lowers runner-minutes and adds no job. The
phase then tries rank 3 (ESLint and tsc caches, keyed on more than file content) in ranked order,
although the check above expects it to be unmeasured too, because the acceptance tries candidates
in ranked order and counts an unmeasured one toward the three; its before side starts at this
PR's landing. Rank 4 is the third try, after the check named above.

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
| (a) a candidate from the ranking lands | pending | this PR, on cost grounds, expected unmeasured (section 2.2) |
| (a) M1 or M3 lower beyond the spread, no M2 or M4 regression | open, not claimed | read after the after side fills (section 2) |
| (a) candidates taken in ranked order | recorded | section 1; the capacity gate's verdict reproduced locally (WARN) |
| The lanes shorten the Build step on Actions | one run: 402 to 268.6 s | section 2.1 |
| The lanes run concurrently, keep every failure and the first failing status, and a cancel stops every lane's tools | pass | `scripts/build-lanes.test.mjs` (6 tests; concurrency shown by each lane waiting for the other's file, not by timing; the cancel test fails on the earlier shell-only kill) |
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
  - Rank 1 skipped although the capacity gate passes it: the backend tier is in an open breach. It
    never ran, so it does not count toward the three tries (the spec counts candidates that landed).
  - Rank 2 as lanes in one job, not new jobs: the overhead tier is in an open breach too, and lanes
    cost nothing extra.
  - Rank 2 lands without waiting for a before side: no group can reach cf03's minimum within the
    7-day bound (section 2.2), so waiting would cost time and change nothing.
  - The cf03 scripts take `CF03_FROM` and `CF03_UNTIL` so a later window can be collected; unset,
    they read cf03's own window, unchanged.
  - A cancelled build stops each lane's whole process tree (Codex review on 21a18589), read from
    `ps`, and the lanes stay in the caller's process group: a lane leading its own group would
    escape the job queue's group kill (`killTree` in `scripts/jobs.mjs`).
- **Traps met.**
  - Killing a lane's shell does not stop the tool its `&&` chain is running; that tool keeps the
    pipes open, so the runner waits for it.
  - A production build on a cloud machine must go through `node scripts/jobs.mjs add`: a direct
    `npm run build` is refused by the build admission guard.
  - `phase-cf03-baseline.mjs` runs its command line when imported, so another script cannot import
    it; `phase-cf13-sides.mjs` copies the two helpers it needs.

## 6. Issues

- #2172: the E2E capacity gate does not price a change to the configured stack count (section 1).

## 7. Rank 1 trial: 8 stacks for the PR's configured selection (2026-11-06)

The owner approved rank 1 as a 14-day trial on #2172
(https://github.com/NoaCG/NoaCG-Studio/issues/2172#issuecomment-6679576372): "not 30 days but 2
weeks (14 days). Then we'll see if the merges got faster. We have a lot going on and more code
lands on main every day, so this needs to be taking in to account."

### 7.1 What changes

`scripts/configured-shards.mjs`: a pull request's selection gets one stack per 5 measured
test-minutes (was 10), at most `SELECTED_SHARDS` = 8 (was `CONFIGURED_SHARDS` = 4). The landing's
full configured run keeps `CONFIGURED_SHARDS` = 4: separating the two keeps the per-landing full
run, its verdict and its cost exactly as they are, so the trial changes only what it measures.
ci.yml reads the count from this script and needs no edit. Which specs are selected does not
change, so this does not restart cf18's audit.

Packing checked before the change, on main's three newest configured-suite reports (runs
42108102501, 42106944552, 42106560712): the whole set is 70 specs and 44.8 test-minutes, the
longest spec 2.9 minutes; on 4 stacks each gets 11.2, on 8 each gets 5.6. cf03's caveat (a spec
over about 5 minutes would stop an even split) does not apply today.

### 7.2 Expected effect and cost

`cap+cfg` M1 median 14.6 to about 12.0 (cf03 section 7): the configured jobs end at about
0.4 + 2.0 + 5.6 = 8.0 minutes instead of 14.4, so the gate waits for the next input, the catalog
gate (11.2) or the offline shards (9.7). That is 2.6 against cf03's spread of 1.04. Cost: four more
stack starts of about 2.3 minutes on each large pull request run, about +29 backend runner-minutes
per merge (cf03), 18% of the tier's 164.7 per landing measured on 2026-11-03. No per-day cost:
scheduled runs use the full suite's count, which is unchanged.

**First run, on this PR** (run 42182470024, head bec6d3d8): "all: 70 configured spec(s) on 8
local stack(s)"; the eight configured jobs took 7.0 to 8.7 minutes each and the verdict passed
8.9 minutes after the run started, against the 14.4 cf03 measured for four stacks. This change has
no offline shard (`none+cfg`), so its gate went green at 9.6 minutes; a `cap+cfg` change still
waits for its offline shards or catalog gate. One run, not a measurement.

### 7.3 The exception, and why it is not in the ledger

The owner's approval is the exception: 14 days from the landing date, owner `miwco` (primary) with
the weekly owner session as backup, repayment by revert unless section 7.4 shows M1 faster beyond
the spread (and #2172). It cannot be written to `scripts/growth-ceilings.json` as a valid entry:
the backend tier already holds `jev-svg-import-journey` (2026-11-03 to 2026-12-03), and the ledger
allows one active exception per tier and needs a measured repayment receipt for any later one
(`exceptionProblems` in `scripts/growth-controls.mjs`, rules X3 and X4). An entry written now would
be invalid and cover nothing. The capacity gate does not price this change (#2172), so nothing
refuses it; the approval, its dates and the revert are recorded here and on #2172.

While the trial runs, the frozen pricing estimate `backendStackQuantumMinutes` (10, in
`scripts/growth-ceilings.json` `estimates`) prices a new configured spec's share of stack setup at
half what a pull request now pays for it. Changing it needs a new ceilings version with the
owner's authority, so it is left as it is and belongs with #2172. `docs/plan-runs/known-traps.md`
("The configured suite") also says the PR selection packs one stack per ten measured minutes; that
file is the coordinator's to change.

### 7.4 Measurement within cf03's rule

Group `cap+cfg`, M1 median (spread 1.04, minimum 10 per side), with the no-regression metrics M2
waiting (0.04, 9), M2 execution (0.62, 11) and M4. cf03's values and side rule are unchanged.

**How often a side ends.** `phase-cf03-baseline.mjs rule` on all 111 merges from
2026-11-03T07:24Z to 2026-11-06T07:24Z: 16 ended the `cap+cfg` M1 side, about one every 4.5
hours. They were CI phases (#2012, #2014, #2037, #2142, #2151, #2167, #2171), a dependency bump
(#2025), the durations refresh (#1503), and product changes that touched `vite.config.ts`,
`eslint.config.js`, Playwright configs or the selector (#2085, #2097, #2112, #2124, #2134, #2188,
#2224). The 111 merges were 71 `cap+cfg`, 22 `none`, 10 `small+cfg`, 4 `small` and 4 `none+cfg`
(group read from each merge's final head's first ci.yml PR run), so `cap+cfg` arrives at about 24
a day. Of the 17 stretches between side-ending landings, 2 held 10 or more `cap+cfg` merges (18 in
2.9 hours on 2026-11-04, 12 in 4.1 hours on 2026-11-05); the rest held 0 to 8.

**What that means.** At about 24 a day, 10 `cap+cfg` merges take about 10 hours. A before side
can be waited for, because the landing waits. The after side is only the stretch between this
landing and the next side-ending one, which in recent days lasted about 4.5 hours on average,
long enough for 10 only about one time in eight. Left alone, the after side is likely to end
unmeasured, as the owner warned.

**Keeping the comparison valid without changing the rule.** The rule fixes which merges are on
each side; it says nothing about when other landings happen. So:

1. **Landing condition:** the before side holds at least 10 `cap+cfg` merges (and 11 for M2
   execution if possible) after the last landing whose `rule` ends `cap+cfg` M1.
2. **After the landing, a short hold:** until the after side holds 10 `cap+cfg` merges (about 10
   hours at the recent rate), PRs whose changes end the `cap+cfg` M1 side wait before entering
   the queue. To check a PR, run `sideEnds` on its changed files, for example
   `node --input-type=module -e "const m = await import('./docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs'); console.log(m.sideEnds('HEAD', process.argv.slice(1)).ends)" <files>`;
   it holds when `m1` lists `cap+cfg`. Docs, product code outside
   the rule, specs, `covers:` edits and quarantine entries do not end a side and need no hold.
   **Name these explicitly, because one slipped through on the first try:** any change at all
   to `cli/package.json`, `cli/package-lock.json` or `cli/tsconfig*.json` ends every side, a
   version bump or a script edit alike: `cli` is the package ci.yml installs and builds with
   `npm --prefix` (today the only one among the rule's five runners). The root `package.json`
   ends sides only for a dependency change, the `build` script or a script entry CI runs; the
   root `package-lock.json` always. A release ends sides only when it touches those files.
   When in doubt, run `sideEnds`.
3. **If a side-ending landing cannot wait** (an incident fix), it lands, the after side ends
   there, and the trial is read with the n it reached. Unmeasured counts toward the three.
4. **The bounds:** cf13's 7-day bound from the candidate's start (this PR, opened 2026-11-06)
   is 2026-11-13; the owner's 14 days run from the landing date. The reading happens as soon as
   both sides hold 10, and at the latest at 2026-11-13.
5. **The decision:** keep only if `cap+cfg` M1 median is lower beyond 1.04 with no regression in
   M2 waiting, M2 execution or M4. Otherwise revert through the queue before the 14 days end.

**Reading.** Collect with `CF03_FROM=<last side-ending landing before this one>
CF03_UNTIL=<read time>` in a fresh `--cache` folder, `phase-cf03-collect.mjs` until it prints
`complete`, `phase-cf03-baseline.mjs derive`, then `phase-cf13-sides.mjs --group cap+cfg
--before-from <ISO> --land <this merge's merged_at> --after-until <ISO>`.

### 7.5 Ranks 3 and 4

**Rank 3** (ESLint and tsc caches) is untried, superseded by rank 2. ESLint and tsc now run in the
second lane beside the gates, and on #2171's three full CI runs that lane ended well before the
gates lane: 97.9 against 255.8 seconds (run 41950548989), 77.1 against 222.2 (41954031541) and
116.4 against 301.6 (42047430886). The Build job's end and its runner-minutes are set by the gates
lane, so caching ESLint and tsc changes neither M1 nor M3. It goes to cf20(c) with this reason.

**Rank 4** (split the catalog gate) is not built: alone it has no M1 effect (cf03 section 7, "0
alone"), and its M2 execution effect (-0.1 at the median over all 66 merges after ci06) is a
no-regression metric, so it cannot pass. Building it only to fill the three would be filler.

**A new next step outside cf03's ranking, for cf20(c).** Inside the gates lane, `test:ai-gateway`
(about 80 seconds) runs before the `node --test` pass (about 150 seconds), one after the other.
Running them side by side is the measured next step for the Build job.

### 7.6 Phase notes for this PR

- **Previous verified main SHA:** 800a45ab (#2234), the branch base; #2171 landed as a235a93d.
- **Revert:** `git revert -m 1 <this merge's SHA>` restores 10 test-minutes per stack and a cap of
  four for the selection; the evidence can stay.
- **What this landing ends** (`sideEnds` on its files): M1 of the `+cfg` groups and M3 of every
  group. It does not end M2 sides, so the M2 before sides may reach further back; reading them
  from the M1 boundary only shortens them.
- **Decisions.** The selection cap is separate from the landing's full-run count. No ledger entry
  (section 7.3). The after side is protected by a scheduling hold, not by any change to cf03's rule.
- **Trap.** A second exception in a tier is invalid while the first is active, whatever the owner
  approved: the ledger enforces one active exception per tier.

### 7.7 Rank 1's first try (cf13's second): unmeasured, reverted

#2237 landed at 2026-11-06T14:33:58Z (09077bc2) with 12 `cap+cfg` merges on its before side
(M1 median 16.03). Its after side ended at 3 merges (M1 median 11.1, M2 waiting 0.68, M2
execution 11.67) when #2258 landed at 2026-11-06T18:50:12Z (cac69406). #2258 changed
`cli/package.json`, which `rule` counts as a package ci.yml installs and builds, so it ended every
group's side; the hold did not name that kind of change, and it entered the queue. The first try
is recorded unmeasured with before 12 and after 3; it counts as cf13's second try (rank 2 was the
first) and goes to cf20(c) with these numbers. Three after-side merges are not a result: they say
nothing either way within cf03's minimum of 10.

The code change is reverted (this PR): `scripts/configured-shards.mjs` and its test go back to one
stack per 10 test-minutes and at most four. The evidence above stays. The revert ends the `+cfg`
M1 sides and every M3 side.

### 7.8 Re-run: cf13's third and last try

The owner chose to measure rank 1 again properly (OWNER_DECISION_LINK). The re-run lands the same
change as #2237 from `main` after the revert (#2260) lands, inside the owner's 14-day window, which
still runs from the first landing: 2026-11-06T14:33:58Z to 2026-11-20T14:33Z.

**A departure from the acceptance's wording, explained.** The acceptance moves to the next ranked
candidate when one fails to improve. Rank 1's first try did not fail: it was never measured, cut
at three merges by a landing the hold should have stopped. The other remaining candidates cannot
show an effect beyond a spread (section 2.2), so a properly held re-run of the one candidate that
can is the owner's choice for the third and last try. The 7-day bound counts from the re-run's
start, because the first try's sides were cut and nothing of them carries over; the owner's window
caps it either way.

- **Landing condition:** 10 `cap+cfg` merges on the before side after this revert's merge, with no
  side-ending landing in between (if one lands, the count restarts after it).
- **After the landing:** the hold in section 7.4, with the version-bump rule above, until the after
  side holds 10 `cap+cfg` merges.
- **Bounds:** cf13's 7-day bound from the re-run's start, and the owner's window, whichever ends
  first; the reading happens when both sides hold 10.
- **Decision:** as section 7.4: keep only if `cap+cfg` M1 median is lower by more than 1.04 with no
  regression in M2 waiting, M2 execution or M4; otherwise revert before 2026-11-20T14:33Z. This is
  the last try: whatever it shows, the phase then records its result.

