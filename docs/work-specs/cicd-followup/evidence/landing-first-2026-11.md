# Landing first: full runs, heads per pull request, suite size (2026-11)

Plan run #1967 (cicd-followup), the owner's top-priority instruction of 2026-11-12, steps 3 to 5.
A study: it changes no workflow, test, gate or limit. Each proposal below is a later change, each
its own revertible pull request, and every coverage change in it is a separate owner decision.

Window: 14 days, 2026-10-29T00:00Z to 2026-11-12T00:00Z, from `main` at `b645889f9`. Data:
GitHub Actions run lists (`ci.yml` push, merge group and pull request; `configured-suite.yml`
push; `nightly.yml`), jobs for a sample of runs, and one nightly's merged Playwright report.
Rebuild: `node landing-first-2026-11-collect.mjs --cache <dir> --jobs-sample 25` until it prints `complete` (three
passes of at most 100 calls), then `node landing-first-2026-11-analyze.mjs --cache <dir>`. Both
need a full clone; a shallow one lists too few landings.

## Summary

| Step | Answer |
| --- | --- |
| 3 | **Recommend:** the push run stays the one full-suite carrier; the nightly stops re-running the E2E suite whenever `main`'s head already has a completed full push run, and keeps its unique jobs. A watcher re-requests a full run when a push run is cancelled with nothing newer on `main`. Saves about 182 runner-minutes and a 12 to 15 job burst every morning; gives up only a second run of an identical tree. Bad-merge window: 90 minutes at most while GitHub delivers events (today median 19, p95 45, max 230). **Fallback:** keep both runs, move the nightly's cron so it starts in the quietest hours. Saves no minutes, gives up nothing. |
| 4 | Per landed pull request (n = 313): CI runs median 1, p90 7, mean 3.0, max 45; heads the same (one run per head). 46% of pull request runs were cancelled. 450 of 671 follow-up heads (67%) were pushed while the previous head's run was still going. **Proposal:** draft until reviewed, one push per review round. Expected saving 1,600 to 2,300 runner-minutes a day, about 103 per landing at most, and most of the 21-job bursts that a cancelled run starts. |
| 5 | The full suite is 2,550 tests, 247 files, 185.7 test-minutes (nightly of 2026-11-11). **Target:** at most 150 test-minutes by 2026-12-15 (minus 19%). **First cut:** the editor authoring journeys run at one screen size instead of three, about 6.5 test-minutes on every full run. The 68 header and footer pictures cost 0.11 minutes a run: cutting them saves nothing. |

## 0. What the owner's background says, checked

| Owner's statement | Measured here | Verdict |
| --- | --- | --- |
| Full offline suite 171 minutes | Push run E2E jobs 179.2 runner-minutes (n = 24, 15 shards); nightly test time 185.7 minutes | close; slightly larger |
| 240 specs, 1 worker per shard | 247 spec files; `playwright.config.ts` `workers: isCi ? 1` | true |
| About 220 runner-minutes per landing on the push, a third of the total | 205 (full push run 196.0 on 250 of 289 push runs, configured suite 52.9 on all 289; cancelled push runs cost about 0) = **28%** of all CI in the window | close |
| Nightly 216.6 runner-minutes a day | 206.2 mean (n = 13 green scheduled runs), 182.4 of it E2E | close |
| Nightly fills 90% of the offline per-day ceiling | not re-derived: no file in the repo carries the figure | unverified |
| Cron 00:20 UTC, last ten started 06:03 to 07:23 | last ten scheduled: 06:03 to 07:23; all fourteen: 05:49 to 07:23 | true |
| cf16: merge group carries no full E2E and no configured suite on any landing | cf16 section 2 (184 landings); the merge group still exempts the configured suite and plans a selection (`ci.yml` plan step) | true |
| Live publishing phase 4: 7 CI runs in 3 hours, 3 cancelled, 8 review sessions | PR #2408: 7 heads, 7 runs from 03:04 to 09:08 UTC on 2026-11-12, 4 cancelled, 2 red, 1 green; 6 runs and 3 cancellations in its first 3 hours | true; review sessions not visible in Actions |
| 126 miscellaneous specs, 60 minutes | not reproduced: no grouping definition. By header: 12 critical specs 8.0, 58 shared-set 45.5, 4 `covers: none` 0.5, 173 others 143.3 (p80 durations table) | not checkable |
| 68 pixel baselines of the marketing header and footer | 68 PNGs, but 34 are `-win32` (local only); CI compares 34 in 18 tests costing **0.11** minutes a run | true count, negligible time |

Where all CI went in the window (runner-minutes, job start to end; sampled unit costs times run counts):

| Runs | Count | Unit | Total | Share |
| --- | ---: | ---: | ---: | ---: |
| Pull request, completed | 529 | 201.2 (n = 25) | 106,400 | 47% |
| Pull request, cancelled | 451 | 71.8 (n = 24) | 32,400 | 14% |
| Merge group | 322 | 62.0 (n = 25) | 20,000 | 9% |
| Push, full suite | 250 | 196.0 (n = 24) | 49,000 | 22% |
| Configured suite on push | 289 | 52.9 (n = 25) | 15,300 | 7% |
| Nightly | 15 | 206.2 (n = 13) | 3,100 | 1% |
| **All** | | | **226,200** | 16,200 a day, 720 per landing |

Pull request units are sampled from 25 runs each, so their totals carry the most error. The
nightly is 1% of all CI; the cancelled pull request runs are 14%.

## 1. Step 3: one full-coverage scheme

### 1.1 What is true today

- 314 landings, 22.4 a day, all through the merge queue. The queue moves `main` to the commit it
  tested; the merge-queue run is pull-request-sized (cf16 section 2).
- Each landing's own push run: 239 green, 11 red, 39 cancelled as superseded, 25 with no push run
  of their own (landed in one push with the next). **So 80% of landings get a full verdict on
  their own commit; the rest are covered by a later commit's run.** Configured suite: 284 green,
  5 red, 25 none.
- One full push run: 196.0 runner-minutes, 15 shards, 18 jobs at once (max 21), 16.2 minutes wall;
  the configured suite adds 4 jobs and 15.0 minutes.
- **Bad-merge window today**, from the moment `main` moved (the push run's creation) to the end of
  the first completed full push run, green or red, on that landing or a later one: median 18.9,
  p90 33.8, p95 45.4, p99 68.3, **max 229.7 minutes** (n = 314). The maximum is 92e581a7
  (2026-11-11): its push run was cancelled at 20:01 with nothing newer on `main`, and no full run
  reached it until the next landing at 23:30. The nightly would have reached it at about 06:30
  the next day. Today nothing bounds this hole.
- **The nightly re-tested a tree that already had a green full push run on all 14 nights** (same
  sha, n = 14). It is a duplicate in every case measured. Its start times fall inside the owner's
  working morning (07:49 to 09:23 Helsinki).
- The nightly is not only the duplicate. It is the only carrier of: type floor, overflow sweep,
  field coverage and engine-floor (`catalog-gates` job, 12.1 runner-minutes); the unconditional
  calibration tripwire (10.6); the traced spec map the planner selects from (`e2e-traced.json`,
  refreshed from the nightly's shards); the triage and E2E time-budget report. Deleting it would
  break selection.

### 1.2 Recommendation: the push run carries the full suite, the nightly stops duplicating it

One scheme. Three changes, each its own pull request:

1. **Push run records the trace.** Set `NOACG_E2E_TRACE` on the push run's full-suite shards and
   upload the traces, as the nightly does. The nightly's own comment says the trace adds no
   measurable time. The report job builds the traced map and the merged report from it.
2. **Nightly E2E only when needed.** The nightly plan job looks up `main`'s head. If a completed
   (green or red) full push run exists on that sha, it skips its E2E shards and reads the traced
   map, triage and time budget from that run's artifacts. Otherwise it runs the full suite as
   today. It always runs the catalog jobs. This is also the backstop when GitHub drops push
   events, as on 2026-08-06.
3. **A watcher closes the hole.** On `workflow_run` completion of `ci.yml` (an event, not a
   cron): a push run cancelled while `main` is still at its sha gets one `workflow_dispatch` of
   `ci.yml` on `main`, which already plans the full suite. One such case in 14 days.

| | Today | Recommended |
| --- | ---: | ---: |
| Runner-minutes per landing (push and configured) | 205 | 205 |
| Nightly runner-minutes a day | 206 | about 24 (catalog jobs, plan, report) |
| Watcher re-runs a day | 0 | about 14 (1 in 14 days, 196 each) |
| **Landing-related runner-minutes a day** | **4,800** | **about 4,630** (minus 168) |
| Peak jobs per landing (full push run plus configured) | 22 | 22 |
| Nightly burst at 06:00 to 07:30 UTC | 12 to 15 jobs for 18 minutes | none on a normal day |
| Bad-merge window, normal | median 19, p95 45, max 230 | median 19, p95 45, **at most 90** |
| Bad-merge window, GitHub drops push events | up to the next nightly, about 31 hours | the same |

**The bound, in minutes: 90.** A landing's own push run, or a later one, finishes within 33.8
minutes of creation at p95 (n = 250 completed). If it is cancelled with nothing newer, the
watcher's re-run adds one more, so two runs at p95 is 68 minutes; 90 leaves room for queueing.
The PR that builds the watcher should check the bound on its after side with this study's
analysis script (`badMergeWindowToday`).

**What it gives up:** a second, independent run of the identical tree each day. Over the window
it found nothing the push run had not (14 of 14 nights green on an already green sha). Its only
value is a second sample for flaky tests, and the quarantine and retry tooling already samples
every push and pull request run. Every coverage contract in cf16's table stays where it is:
full E2E on the push run, configured suite on every pushed commit, catalog sweeps and engine-floor
nightly. Exact-commit coverage stays at 80%, as today.

**What it does not change:** cf16's finding that 20% of landings have no full run of their own.
Closing that is cf16's per-commit carrier (at least 64.5 more runner-minutes per landing), which
only matters if catalog narrowing is adopted (decision C). This scheme does not need it.

### 1.3 Fallback: move the nightly out of the morning

If the owner or review rejects step 2, keep both runs and change only the cron. GitHub starts
this schedule 5.5 to 7 hours late (14 of 14 nights), so a cron of `20 21 * * *` should start it
at about 03:00 to 04:30 UTC. In the window the hours 03:00 to 04:59 saw 2 to 4 push runs and 6 to
11 pull request runs each, against 8 to 19 and 25 to 36 at 06:00 to 07:59.

- Runner-minutes: unchanged (206 a day). Peak concurrency: the same 12 to 15 jobs, in the
  quietest hours. GitHub's delay is not guaranteed, so the start may still drift.
- Bad-merge window: as today (median 19, p95 45, no bound; the hole of 229.7 minutes stays
  possible). Adding the watcher (change 3) bounds it at 90 here too.
- Gives up nothing.

## 2. Step 4: fewer runs per pull request

### 2.1 Measured (n = 313 landed pull requests, same window)

| Per landed pull request | Median | p90 | Mean | Max |
| --- | ---: | ---: | ---: | ---: |
| `ci.yml` pull request runs | 1 | 7 | 3.0 | 45 |
| Heads (distinct commits that got a run) | 1 | 7 | 3.0 | 45 |
| Cancelled runs | 0 | 4 | 1.4 | 38 |
| Red runs | 0 | 2 | 0.6 | 9 |
| Merge-group runs | 1 | 1 | 1.0 | 2 |

- **CI runs per landing: 6.0** (pull request 3.0, merge group 1.0, push 0.9, configured 0.9).
- **Runs equal heads**: each head gets one run, and a new head cancels the old one
  (`ci.yml` concurrency). So the count of runs is the count of pushes.
- 928 pull request runs on landed pull requests, **428 (46%) cancelled**. 22% of pull requests
  had 4 or more heads and made 62% of the runs (573).
- Why each follow-up head was pushed (n = 671): **450 (67%) while the previous head's run was still
  going**, 189 after a red run (repairs, cf22's ground), 28 after a green run.
- The next head came a median 7.9 minutes after the previous one, within 15 minutes in 73%.
- A cancelled run still cost **71.8 runner-minutes** (n = 24): it starts about 21 jobs, which run
  for a median 5.6 minutes before the cancel. A completed run cost 201.2 (n = 25).

### 2.2 Proposal: draft until reviewed, one push per round

cf21 already says reviewers name a defect's class and builders fix every instance in one
checkpoint. The waste is not more review rounds; it is that each fix is pushed while CI runs, so
CI starts again on every one. Two changes, each its own pull request:

1. **CI on a draft runs only the cheap gates.** `ci.yml` adds `ready_for_review` to its pull
   request types and, on a draft, runs Build, factory gates and Reviewed (about 14 runner-minutes)
   but not the E2E plan's shards or the configured selection. Marking the pull request ready
   starts the full selected run. The merge queue and push runs are untouched, and a non-draft
   pull request behaves as today. Required checks still come from the ready run, so nothing
   lands on a draft run.
2. **The review loop pushes once per round.** In `plan-run.md`, `check.md` and the brief
   templates: open the pull request as a draft; run `/check`, the Codex review and any `/so` on
   the draft head; apply every finding of a round in one commit and push once; mark ready when
   the round is clean. A repair after red CI collects every failure of that run before pushing
   (cf22's ranked fix 1 still wakes the owner at once).

To check before building: that the Codex review runs on a draft pull request in this repository,
and that the `Reviewed` stamp and auto-merge accept a pull request that was a draft.

**Expected saving.** Upper bound: all cancelled pull request runs, 32,400 runner-minutes in the
window, **2,310 a day, 103 per landing**, 14% of all CI. If 70% of the 450 mid-run heads are review
fixes that batching absorbs, about 1,600 a day. Concurrency: a cancelled run starts about 21
jobs; at 32 cancellations a day, most of those bursts go, which matters most at 12:00 to 14:00
UTC (108 pull request runs an hour in the window). Coverage: none lost; every landing still gets
its selected pull request run, its merge-group run and its push run. Latency: the ready run is
the same run that ends the loop today; it now starts with fewer competing jobs.

Example: PR #2408 had 7 runs; with every review fix in one ready head, it would have needed the
ready run plus one per red run, 3 at best.

## 3. Step 5: a smaller suite

### 3.1 Measured

- Nightly of 2026-11-11 (run 42973088710), merged report: **2,550 tests, 247 files, 185.7
  test-minutes**, one skipped. Per test: median 3.0 seconds, p90 7.2, p99 27.9.
- Growth: the durations table listed 147 spec files on 2026-09-04 and 247 on 2026-11-09. Its
  minute totals are not comparable across that span (it changed to an 80th-percentile table), so
  the owner's 115 to 171 was not re-derived.
- **Screen-size matrices:** 45 tests are repeated at 2 or 3 sizes (102 runs). The repeats beyond
  the first size cost 8.3 test-minutes. 6.5 of that is editor authoring journeys; the rest are
  layout tests whose subject is the size (fixed panes, rail width, docs deep links).
- **Long tests:** 25 tests over 30 seconds take 24.2 test-minutes (13% of the suite). Examples:
  the SVG corpus sweep in one test (2.04), the seven SVG examples (1.93), a real ten-second wait
  and retry (`save-copy-arrival`), counting figures played up from zero on every design.
- **Pixel baselines:** `public-chrome-baseline.spec.ts`, 18 tests, 0.11 test-minutes. Cutting it
  saves nothing measurable, and it is the only check of what the public header and footer look
  like. Not proposed.

### 3.2 Target

**At most 150 test-minutes for the full suite by 2026-12-15** (from 185.7, minus 19%). At one
worker per shard, that is about 30 runner-minutes off every full push run and every nightly that
still runs, and less on every pull request run that selects the cut tests. Measured candidates so
far add up to about 18.5 (6.5 below, and about half of the long tests' 24.2). The rest needs an
audit, per product area, of which specs prove the same thing: that is the next study, and its
cuts go to the owner one at a time.

### 3.3 First cut: editor authoring journeys at one screen size

Run each long editor authoring journey at one size, the smallest (`laptop-125`, 1093 by 614,
where layouts break first), instead of at `desktop`, `laptop` and `laptop-125`. The specs:
`editor-command-task`, `editor-drawing-task`, `editor-cli-round-trip`, `editor-usability` (two
journeys), `editor-keys`, `editor-out`, `editor-fidelity-trim`, `editor-layer-property-qualification`,
`editor-transform-qualification`.

- **Saves:** about 6.5 test-minutes on every full run (3.4 of it `editor-command-task`), and the
  same share on every pull request run that selects these specs.
- **Stops protecting:** a fault that shows only in the middle of one of these journeys at desktop
  or laptop size, for example a control that is reachable at the smallest size but covered or
  moved at a larger one after a reopen, or output that differs by window size.
- **Still protecting it:** each journey, at the size most likely to break; the layout tests that
  stay at every size (`playout-fixed-panes`, `playout-rail-width`, `docs` deep links); the editor
  layout specs that are not journeys.
- **Owner decision:** this is a coverage drop. It needs the owner's yes before it is built, in its
  own pull request, revertible with one revert.

Second candidates, for the audit: the long single-test sweeps (corpus, examples, every counting
design), where most of the work may be checkable below the browser with one browser walk kept,
and real waits a fake clock could replace. Each needs reading before it is proposed.

## 4. Notes

- **Calls:** three collector passes (100, 21, 55 calls), one call for PR #2408's runs, one
  artifact download. Completed runs and jobs are cached; nothing was written to GitHub.
- **Traps met:** the merge commit's committer time is when the queue built the group, a median
  10.2 minutes before `main` moved (p95 30.8). Measuring the window from it would count the
  merge-queue run as time on `main`; the analysis uses the push run's creation (ci13 R1). The
  run list carries no pull request number for this repository, so a pull request's runs are its
  branch's runs before it landed.
- **Limits:** pull request run costs are from 25-run samples. The Actions data does not show
  review sessions, so the owner's "8 review sessions" is not checked.
- **Revert:** `git revert -m 1 <merge commit>` removes these three files; nothing depends on them.
