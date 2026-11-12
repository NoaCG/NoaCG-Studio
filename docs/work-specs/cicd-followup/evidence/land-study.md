# Landing first: full runs, heads per pull request, suite size (2026-11)

Plan run #1967 (cicd-followup), the owner's top-priority instruction of 2026-11-12, steps 3 to 5.
A study: it changes no workflow, test, gate or limit. Each proposal below is a later change, each
its own revertible pull request, and every coverage change in it is a separate owner decision.

Window: 14 days, 2026-10-29T00:00Z to 2026-11-12T00:00Z, from `main` at `b645889f9`. Data:
GitHub Actions run lists (`ci.yml` push, merge group and pull request; `configured-suite.yml`
push; `nightly.yml`); jobs, every attempt, for a sample of runs and for every push run that was
cancelled or re-run; one nightly's merged Playwright report.

Rebuild, from a full clone (a shallow one lists too few landings):

    node landing-first-2026-11-collect.mjs --cache <dir> --jobs-sample 25    # until it prints complete
    gh run download 42973088710 --name nightly-report-json --dir <report-dir>
    node landing-first-2026-11-analyze.mjs --cache <dir> --report <report-dir>/nightly-report.json

The collector made five passes (100, 21, 55, 37 and 12 calls). Only the PR #2408 example and the
2026-11-04 nightly's issue were read by hand.

## Summary

| Step | Answer |
| --- | --- |
| 3 | **Recommend:** the push run stays the one full-suite carrier. The nightly skips its E2E shards when `main`'s head already has a push run with a full-suite verdict, and keeps its catalog jobs. Saves about 182 runner-minutes a day and a 12 to 15 job burst every morning. Gives up a daily run of the whole suite with no retry: in 14 nights it caught one flaky test the push run had passed. Bad-merge window unchanged: median 19 minutes, p95 44, measured maximum 74; by the job caps, at most about two runs' job time (one in progress ahead of it, then its own, about 75 minutes each) plus waiting for runners. **Fallback:** the nightly runs its E2E shards once a week instead of every day. Saves about 156 a day and keeps a weekly no-retry sample. |
| 4 | Per landed pull request (n = 313): CI runs median 1, p90 7, mean 3.0, max 45; heads the same (one run per head). 46% of pull request runs were cancelled. 450 of 671 follow-up heads (67%) were pushed while the previous head's run was still going. **Proposal:** the review loop collects a round's findings and pushes them as one head. Up to 2,310 runner-minutes a day (103 per landing), about 1,620 if 70% of those heads are absorbed, with no coverage cost and no ready fix held back. A draft-only CI rule is a second step, only if the first falls short, because it adds latency. |
| 5 | The full suite is 2,550 tests, 247 files, 185.7 test-minutes (nightly of 2026-11-11). **Target:** at most 150 test-minutes by 2026-12-15 (minus 19%); 6.6 of the 35.7 are measured as a cut and about 10 more estimated. **First cut:** the editor authoring journeys at their smallest screen size only, 6.6 test-minutes on every full run. The 68 header and footer pictures cost 0.11 minutes a run: cutting them saves nothing. |

## 0. What the owner's background says, checked

| Owner's statement | Measured here | Verdict |
| --- | --- | --- |
| Full offline suite 171 minutes | Push run E2E jobs 179.2 runner-minutes (n = 24, 15 shards); nightly test time 185.7 minutes | close; slightly larger |
| 240 specs, 1 worker per shard | 247 spec files; `playwright.config.ts` `workers: isCi ? 1` | true |
| About 220 runner-minutes per landing on the push, a third of the total | 206 (full push run 196.0 on 250 of 289 push runs, 13.1 on the 39 cancelled, of which 29 never started a job; configured suite 52.9 on all 289) = **29%** of all CI in the window | close |
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
| Push, cancelled | 39 | 13.1 (n = 39) | 500 | 0% |
| Configured suite on push | 289 | 52.9 (n = 25) | 15,300 | 7% |
| Nightly | 15 | 206.2 (n = 13) | 3,100 | 1% |
| **All** | | | **226,700** | 16,200 a day, 722 per landing |

Pull request units are sampled from 25 runs each, so their totals carry the most error. The
nightly is 1% of all CI; the cancelled pull request runs are 14%.

## 1. Step 3: one full-coverage scheme

### 1.1 What is true today

- 314 landings, 22.4 a day, all through the merge queue. The queue moves `main` to the commit it
  tested; the merge-queue run is pull-request-sized (cf16 section 2).
- **Each landing's own push run**, read from its `CI gate` job in every attempt (a run's
  conclusion is only its last attempt's): 239 green, 10 red, 2 red then green on a re-run, 38
  superseded before a verdict, 25 with no push run of their own (landed in one push with the
  next). **So 80% of landings (251) get a full verdict on their own commit;** the rest are covered
  by a later commit's run. Configured suite: 284 green, 5 red, 25 none.
- One full push run: 196.0 runner-minutes, 15 shards, 18 jobs at once (max 21), 16.2 minutes wall;
  the configured suite adds 4 jobs and 15.0 minutes. From creation to its first verdict: median
  18.0, p95 33.2, max 73.1 minutes (n = 251).
- **Bad-merge window today**, from the moment `main` moved (the push run's creation) to the first
  full-suite verdict, green or red, on that landing or a later one: median 18.9, p90 33.0, p95
  44.3, p99 65.5, **max 74.0 minutes** (n = 314; 8beeab7c, covered by 53e10b66's 73.1-minute run).
- **Why it is bounded.** Push runs on `main` share one concurrency group that never cancels a
  run in progress (`ci.yml` concurrency): one runs, one waits, and a newer push replaces the
  waiting run, which is then cancelled before it starts (29 of the 39 cancelled push runs never
  started a job). The rest cancelled themselves at the plan step because `main` had moved on. So
  a newer run always covers a cancelled one, but a landing's run can wait behind the run in
  progress. Each run's jobs are capped: plan 5, E2E shards 20, the failed-spec retry 45, the gate
  5, about 75 minutes. A landing's verdict therefore comes within about two runs' job time, about
  150 minutes, plus waiting for runners, which no cap bounds; the measured maximum is 74. If
  GitHub drops push events (2026-08-06), nothing runs until the next push or the nightly.
- **The nightly re-tested a tree that already had a green full push run on all 14 nights** (same
  sha, and none of those push runs needed the failed-spec retry). The nightly itself was green on
  13 and red on 2026-11-04: `imported-credits-live-data.spec.ts` failed (issue #2048, closed) on
  134413ba, which the push run had passed on its first try. The same tree passing and failing
  makes it a flaky test, not a product fault. Its starts fall inside the owner's working morning
  (07:49 to 09:23 Helsinki).
- The nightly is not only the duplicate. It is the only carrier of: type floor, overflow sweep,
  field coverage and engine-floor (`catalog-gates` job, 12.1 runner-minutes); the unconditional
  calibration tripwire (10.6); the traced spec map the planner selects from (`e2e-traced.json`,
  built from the nightly's shards); the triage and the E2E time budget, which compares like with
  like across nightlies (`nightly.yml`, the budget step). It is also the only run of the whole
  suite with no retry: the push run re-runs failed specs (`ci.yml`, the `e2e-retry` job).
  Deleting the nightly would break selection.

### 1.2 Recommendation: the push run carries the full suite, the nightly stops duplicating it

One scheme. Two changes, each its own pull request:

1. **Push run records the trace.** Set `NOACG_E2E_TRACE` on the push run's full-suite shards and
   upload the traces, as the nightly does. The nightly's comment says the trace adds no
   measurable time there, but its shards have a 25-minute cap and the push shards run against a
   20-minute cap they sometimes meet (shard 11/15 of run 43092663612, twice). So this change
   first measures the trace's cost on push shards and proceeds only if it fits.
2. **Nightly E2E only when needed.** The nightly plan job looks up `main`'s head. If a push run on
   that sha has a full-suite verdict (its `CI gate` green or red, any attempt), it skips its E2E
   shards and builds the traced map, triage and time budget from that run's reports. The time
   budget then reads reports that include the retry, which the change states. Otherwise it runs
   the full suite as today, which also covers dropped push events. It always runs the catalog jobs.

| | Today | Recommended |
| --- | ---: | ---: |
| Runner-minutes per landing (push and configured) | 206 | 206 |
| Nightly runner-minutes a day | 206 | about 24 (catalog jobs, plan, report) |
| **Landing-related runner-minutes a day** | **4,830** | **about 4,650** (minus 182) |
| Peak jobs per landing (full push run plus configured) | 22 | 22 |
| Nightly burst at 06:00 to 07:30 UTC | 12 to 15 jobs for 18 minutes | none on a normal day |
| Bad-merge window | median 19, p95 44, measured max 74; about 150 by the caps, plus runner wait | the same |
| Window when GitHub drops push events | up to the next nightly, about 31 hours | the same |

**What it gives up:** the daily run of the whole suite with no retry. In 14 nights it found one
flaky test the push run had passed on the same tree (#2048), and no product fault. A flake that
fails a push run's first try and passes its retry is already quarantined by the gate (the retry
job's `specs` output), so the push run keeps sampling flakes on every landing; what goes is the
daily second sample of the same tree. Every coverage contract in cf16's table stays where it is:
full E2E on the push run, configured suite on every pushed commit, catalog sweeps and engine-floor
nightly. Exact-commit coverage stays at 80%, as today.

**What it does not change:** cf16's finding that 20% of landings have no full verdict of their
own. Closing that is cf16's per-commit carrier (at least 64.5 more runner-minutes per landing),
which matters only if catalog narrowing is adopted (decision C). This scheme does not need it.

### 1.3 Fallback: the nightly's E2E once a week

If the owner wants to keep the no-retry sample, the nightly runs its E2E shards on one night a
week, on the night after the quietest day (2026-11-07 and 11-08 had 7 and 8 landings, though
the first weekend had 20 and 25), and its catalog jobs every
night, with change 1 above unchanged.

- Runner-minutes: about 156 a day fewer (six nights of 182 out of seven). The morning burst goes
  on six days of seven.
- Bad-merge window: as today and as the recommendation.
- Gives up: six of seven daily no-retry samples. In this window that would have kept or missed
  #2048 depending on the day chosen.

Moving the cron alone does not work as a fallback: GitHub started this schedule 5.5 to 7 hours
late in the window, while the `nightly.yml` header measured 1 to 3.5 hours at other hours in
August and up to 5 hours 59 minutes for another workflow, so a new cron's start hour is unknown
until measured.

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
- Why each follow-up head was pushed, over all 980 pull request runs including 52 on pull
  requests that had not landed (n = 671): **450 (67%) while the previous head's run was still
  going**, 189 after a red run (repairs, cf22's ground), 28 after a green run, 4 other.
- The next head came a median 7.9 minutes after the previous one, within 15 minutes in 73%.
- A cancelled run still cost **71.8 runner-minutes** (n = 24): it starts about 21 jobs, which run
  for a median 5.6 minutes before the cancel. A completed run cost 201.2 (n = 25).

### 2.2 Proposal: one push per review round

cf21 already says reviewers name a defect's class and builders fix every instance in one
checkpoint. The waste is not more review rounds; it is that fixes are pushed one at a time while
CI runs, so CI starts again on each.

1. **First, the review loop pushes once per round** (`plan-run.md`, `check.md`, the brief
   templates). Collect every finding of a round (`/check`, Codex, `/so`), apply them in one
   commit, run the targeted local checks, push once. A fix that is ready is pushed at once, as
   today; what changes is that a round's findings go out together instead of one by one. A
   repair after red CI collects every failure of the run before pushing. CI still runs on every
   pushed head, so no coverage is lost and no ready fix waits.
   - Saving: each absorbed head saves one cancelled run, 71.8 runner-minutes. Upper bound, all
     451 cancelled pull request runs: 32,400 in the window, **2,310 a day, 103 per landing**, 14% of
     all CI. If 70% are absorbed: about 1,620 a day. Concurrency: a cancelled run starts about 21
     jobs, 32 times a day, most at 12:00 to 14:00 UTC (108 pull request runs in each of those two
     hours over the window, about 7.7 an hour on an average day).
   - Measure after two weeks with this study's script (`followUpHeads`, `perLandedPr`).
2. **Only if the first change does not halve the mid-run heads: CI on a draft runs only the cheap
   gates.** `ci.yml` adds `ready_for_review` and, on a draft, runs Build, factory gates and
   Reviewed (about 14 runner-minutes) but not the E2E shards or the configured selection.
   - Saving: 57.8 per absorbed head (71.8 less the draft run): at most 26,000 in the window,
     1,860 a day, 83 per landing.
   - Cost: today the final review round runs beside the final CI run. Here the selected run
     starts only once review is clean, so each pull request waits for that round in series, and a
     red ready run reopens the loop after review. Reviewers lose E2E evidence on draft rounds.
     Landing outranks money, so this step needs the first step's measurement before it is built.
   - To check before building: that Codex reviews a draft here; that `Reviewed` and auto-merge
     accept a pull request that was a draft; and that a draft run's skipped required jobs cannot
     satisfy branch protection (GitHub counts a skipped job as passing).

Example: PR #2408 had 7 runs; with its review fixes in one head, it would have needed one run plus
one per red run, 3 at best.

## 3. Step 5: a smaller suite

### 3.1 Measured

- Nightly of 2026-11-11 (run 42973088710), merged report: **2,550 tests, 247 files, 185.7
  test-minutes**, one skipped. Per test: median 3.0 seconds, p90 7.2, p99 27.9.
- Growth: the durations table listed 147 spec files on 2026-09-04 and 247 on 2026-11-09. Its
  minute totals are not comparable across that span (it changed to an 80th-percentile table), so
  the owner's 115 to 171 was not re-derived.
- **Screen-size repeats:** 45 tests are repeated at 2 or 3 sizes (102 runs). The repeats beyond
  the first size cost 8.3 test-minutes. Most of it is editor authoring journeys; the rest are
  layout tests whose subject is the size (fixed panes, rail width, docs deep links).
- **Long tests:** 25 tests over 30 seconds take 24.2 test-minutes (13% of the suite). Examples:
  the SVG corpus sweep in one test (2.04), the seven SVG examples (1.93), a real ten-second wait
  and retry (`save-copy-arrival`), counting figures played up from zero on every design.
- **Pixel baselines:** `public-chrome-baseline.spec.ts`, 18 tests, 0.11 test-minutes. Cutting it
  saves nothing measurable, and it is the only check of what the public header and footer look
  like. Not proposed.

### 3.2 Target

**At most 150 test-minutes for the full suite by 2026-12-15** (from 185.7, minus 35.7 or 19%). At
one worker per shard that is about 36 runner-minutes off every full push run and every nightly
that still runs, and less on every pull request run that selects the cut tests. The basis is
partial: 6.6 is measured as a cut (below); halving the other long tests (24.2, less the 3.4 of
this cut that are among them) is an estimate of about 10.4 more, about 17 in all. The rest needs an audit, per product area, of which specs prove the same thing.
That audit is the next study; candidates that keep coverage are reported apart from those that
drop it, and each drop goes to the owner on its own.

### 3.3 First cut: editor authoring journeys at their smallest size

Run each editor authoring journey at the smallest size it runs at today and drop its larger
repeats: `editor-command-task`, `editor-drawing-task` and `editor-cli-round-trip` keep `laptop-125`
(1093 by 614, where layouts break first); `editor-usability`, `editor-keys`, `editor-out` and
`editor-fidelity-trim` keep 1093; `editor-layer-property-qualification` and
`editor-transform-qualification` keep their laptop size (1366).

- **Saves:** 6.6 test-minutes on every full run (18 tests; 3.4 of it `editor-command-task`), and
  the same share on every pull request run that selects these specs.
- **Stops protecting:** a fault that shows only in the middle of one of these journeys at a
  larger window, for example a control that works at the smallest size but is covered or moved
  at desktop size after a reopen, or output that differs by window size.
- **Still protecting it:** each journey at the size most likely to break; the layout tests that
  stay at every size (`playout-fixed-panes`, `playout-rail-width`, `docs` deep links); the editor
  specs that are not journeys.
- **Owner decision:** this is a coverage drop. It needs the owner's yes before it is built, in its
  own pull request, revertible with one revert.

Second candidates, for the audit: the long single-test sweeps (corpus, examples, every counting
design), where most of the work may be checkable below the browser with one browser walk kept,
and real waits a fake clock could replace. Each needs reading before it is proposed.

### 3.4 Built: editor authoring journeys at one size

**Owner decision 2026-11-12: approved.**

The 18 tests of section 3.3 no longer run; each journey runs once, at its smallest size. Nine
spec files, one size list each (`editor-command-task`, `editor-drawing-task` and
`editor-cli-round-trip` at `laptop-125`; `editor-usability` (both journeys), `editor-keys`,
`editor-out` and `editor-fidelity-trim` at 1093; `editor-layer-property-qualification` at 1366;
`editor-transform-qualification` loses its desktop size). The nine files go from 99 tests to 81.

- **Stops protecting:** a fault that shows only in the middle of one of these journeys at a
  larger window (desktop 1920 or laptop 1366): a control covered or moved at that size after a
  reopen, a gesture that lands differently, output that differs by window size.
- **Still protecting it:** every journey at the size where layouts break first; the size-specific
  layout tests that keep every size (`playout-fixed-panes`, `playout-rail-width`, `docs` deep
  links); `editor-transform-qualification` still runs at 1366 and at 1093.
- **Measured saving:** 394 test-seconds (6.6 test-minutes) on every full run, from the nightly of
  2026-11-11: `editor-command-task` 204, `editor-drawing-task` 54, `editor-usability` 43,
  `editor-cli-round-trip` 24, `editor-keys` 22, `editor-out` 18, `editor-fidelity-trim` 16,
  `editor-layer-property-qualification` 7, `editor-transform-qualification` 6. The same share
  comes off every pull request run that selects these specs. The 11 kept tests pass locally.
- **Not cut:** `editor-transform-qualification` at 1366. Its smallest size is the 1093
  `zoom-proxy` test, so "smallest only" would cut a 19th test; the approval named 18.
- **Revert:** `git revert -m 1 <merge commit of this pull request>`.

## 4. Notes

- **Calls:** five collector passes (100, 21, 55, 37, 12), one call for PR #2408's runs, one artifact
  download, two issue searches and one issue read for the 2026-11-04 nightly. Completed runs and
  jobs are cached; nothing was written to GitHub except this pull request.
- **Traps met:**
  - A run's `conclusion` is its last attempt's. Run 43092663612 (92e581a7) reads "cancelled"
    because one shard was stopped at its cap in the last attempt, but its gate was red at 20:23
    and green at 21:51. Read as "no verdict", it made a 230-minute window that did not exist.
    The analysis now reads the `CI gate` job in every attempt (the repo's trap: read which jobs
    ran before believing a run).
  - The merge commit's committer time is when the queue built the group, a median 10.2 minutes
    before `main` moved (p95 30.8). The window is measured from the push run's creation (ci13 R1).
  - The run list carries no pull request number for this repository, so a pull request's runs are
    its branch's runs before it landed.
- **Review:** a fresh read-only `/so` graded the first head B. Its findings are fixed here: the
  230-minute hole and the watcher built on it (removed), the 90-minute bound (replaced by the
  measured maximum and the caps), the nightly's 2026-11-04 red (named, with what the recommendation
  gives up), the step 4 saving and latency (split into a rule first and the draft change second),
  the skipped-checks question, the trace cost on push shards, and figures the script did not
  produce (it now does). A delta `/so` on b707287b graded B+ and found four more, fixed here: the
  full-push unit cost read from a biased sample (now the even sample only), the bound's mechanism
  (main's concurrency group, not supersede chains), a push rule that held ready fixes back (now
  it only batches a round), and a per-hour figure that was a 14-day total.
- **Limits:** pull request run costs are from 25-run samples. The Actions data does not show
  review sessions, so the owner's "8 review sessions" is not checked.
- **Revert:** `git revert -m 1 <merge commit>` removes these three files; nothing depends on them.
