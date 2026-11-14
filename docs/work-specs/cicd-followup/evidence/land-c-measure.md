# Land C: would a pre-push "direct set" run have caught PR CI browser failures? (2026-11)

Plan run #1967 (cicd-followup), measurement row `land-c-measure`, owner go of 2026-11-12. A study:
it changes no code, test, check or limit. The rule it recommends is a later, separate change.

Question: if a cloud worker ran only the "direct" browser selection for its changed files before
pushing, how many PR CI browser failures would it have caught, at what wall time, against the CI
round trip and the measured bounce cost (cf22: median 30.4 minutes lost per bounce, p90 123.5)?

## Summary

| Measure | Result |
| --- | --- |
| Window | PRs merged 2026-10-29T00:00Z to 2026-11-12T19:00Z: 356 PRs, 1,051 completed `ci.yml` pull_request runs |
| Failed PR browser jobs (offline E2E shards and configured suite, failure or timeout, not cancelled) | 39 jobs, 40 records (one per failing spec, or one per job when no spec failed) |
| Of those, the PR's own failures | **22 spec failures in 19 runs on 12 PRs** (5% of landings had one) |
| Not the PR's own | 8 infrastructure (7 `configured-stack` setup, 1 shard that stopped without a test verdict), 5 flakes (green again on the same commit), 3 `production-controls.spec.ts` failures shared by 4 PRs, 2 failures (one run, two attempts) fixed only by merging main |
| Own failures caught by the direct set | **19 of 19 runs (100%)**; 20 of 22 spec failures. The 2 misses sat in runs that another direct-set spec already failed |
| Direct set at the failing heads | median 99 specs, p90 193; full selection median 192 (offline plus configured) |
| Direct-set wall time at the failing heads (2 workers, this 4-CPU cloud machine) | **median 70.8 minutes, p90 118.6** |
| CI round trip of those runs (run created to its last job finished, first attempts) | median 16.1 minutes, p90 19.4 (all 39 failing jobs' runs: 15.9 and 18.7) |
| Own-failure runs whose direct set fits verify.md's 5-minute cap | 3 of 19 (all on PR #2173, one spec, 2.5 minutes); 12-minute cap: the same 3 |
| Best rule | **Keep the 5-minute cap; run the direct set before a push only when it fits.** Net saving about 0.1 minute per landing at a 3-minute cap and roughly zero at 5. No larger cap pays: at 12 minutes the net is minus 0.7 (first push) or minus 2.4 (every push) minutes per landing |

The direct set does catch the failures. It does not pay, because it is large (the files' own
`// covers:` headers, readers and traced map already name 50 to 190 specs for a product change)
and own failures are rare (19 bounces in 356 landings, about 1.6 minutes of bounce cost per
landing at the cf22 median). CI runs the same set on 15 parallel shards in about 16 minutes; the
4-CPU worker needs 40 to 120.

## 1. Data and rebuild

Run from a clone with `main` history back to 2026-10-15
(`git fetch --shallow-since=2026-10-15 origin main`; the session clone was shallow to 2026-11-10):

    node docs/work-specs/cicd-followup/evidence/land-c-measure-collect.mjs --cache <dir>        # until it prints complete
    node docs/work-specs/cicd-followup/evidence/land-c-measure-plan.mjs --cache <dir> --work <scratch> [--shard i/n]
    gh run download 43174131708 --name nightly-report-json --dir <report-dir>
    node docs/work-specs/cicd-followup/evidence/land-c-measure-analyze.mjs --cache <dir> --speed 0.70 --report <report-dir>/nightly-report.json

- **Collector** (`land-c-measure-collect.mjs`): read-only, at most 100 API calls a pass, every
  immutable read cached. Lists closed PRs, every `ci.yml` pull_request run by day from 2026-10-22,
  the jobs (every attempt) of each failed or re-run run of a merged PR, and the log of each failed
  browser job. Of a log only lines naming a spec or a runner error are kept, without timestamps or
  signed URLs. Changed files come from local git, not the API. Passes: 100, 100, 100, 100, 71
  calls, then short passes (2 to 5 calls) that only re-list unsettled days, until `complete`.
  426 runs read, 39 failed browser job logs. Four runs of 2026-11-11 stayed `queued` for over 22
  hours; as in cf22, a day still open after three listings is settled with them recorded as stuck
  (none is a failed browser job).
- **Changed files**: a failing run's head against its merge base with `main` as `main` stood when
  the run was created (first parent: landings are merge commits, so a PR commit is itself on
  `main` afterwards). A landed head (the cost sample) against the first parent of its landing
  merge commit.
- **Durations**: per-spec test minutes summed from the latest nightly's merged Playwright report
  (run 43174131708, 2026-11-12: 247 files, 194.9 test-minutes, one worker per shard).

## 2. The direct set, and how it is computed

There is no supported switch: `BROAD_ESCALATES` is a constant in `scripts/e2e-traced.mjs`, and
`--no-focus` turns an escalation into the whole suite. The planner (`land-c-measure-plan.mjs`)
therefore uses the selector of each head itself, in a detached scratch worktree (never this
checkout), so the headers, CORE list, traced map and selector are the ones that worker had:

1. **Full selection**: `node scripts/e2e-affected.mjs --json --files <changed>` as committed.
   Size: the offline specs (the whole suite when the mode is `full`) plus the configured specs.
2. **Direct set**: the same CLI with `BROAD_ESCALATES = false` written into the scratch copy only,
   run once per changed file. A file's direct specs are its plan minus `critical.added` (the
   critical journeys every product change adds, a rule rather than a mapping). When the file still
   escalated (CORE, unmapped, or an untrusted traced map: the plan then holds every
   non-quarantined FOCUS spec, since the JSON has no `focusApplied`), the plan is the
   shared-change set, and the direct part is the plan minus FOCUS, plus the FOCUS specs whose own
   `// covers:` header names the file. Configured direct specs are the plan's per-file configured
   reasons (`configuredReasons.files[file]`), never the whole configured set an escalation selects.

What this leaves out, and its direction: a CORE file's readers that are also FOCUS specs and do not
name it in a header are dropped (the direct set is slightly smaller than it could be, so the catch
rate is a floor and the cost a floor too).

## 3. The failures (step 3)

Cause rules follow cf22: green again on the same commit is a flake; a spec quarantined at the head
is a flake; otherwise the next green run of the PR decides. If the PR's own commits between the two
heads (first parent, merges skipped) changed nothing, the failure was fixed by merging main and is
not the PR's (`main`); if they changed files, it is the PR's own (`defect`). A spec failing on three
or more PRs is not one PR's (`shared`). A job with a failed setup step, no failed step, or no
failing test named is infrastructure (cf03 M5).

| PR | Run (attempt) | Job | Failing spec | Cause | Where | Direct n | Direct wall min | Round trip min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1870 | 41234237254 (1) | E2E 9/15 | production-controls | shared | full only | 14 | 14.5 | 9.3 |
| 1878 | 41243232652 (1) | E2E 9/15 | production-controls | shared | full only | 72 | 45.7 | 12.0 |
| 1919 | 41320269865 (1) | E2E 3/15 | production-controls | shared | full only | 70 | 44.2 | 15.6 |
| 1943 | 41364022731 (1) | E2E 6/15 | production-controls | flake | neither | 0 | 0 | 11.9 |
| 1966 | 41431355698 (1) | E2E 9/15 | import-svg | flake | direct | 63 | 45.1 | 10.5 |
| 1985 | 41525636815 (1) | E2E 12/15 | import-svg-behaviour | **own** | direct | 116 | 74.2 | 17.0 |
| 1985 | 41525636815 (1) | E2E 12/15 | editor-transform-qualification | **own** | neither | 116 | 74.2 | 17.0 |
| 1985 | 41530678874 (1) | E2E 12/15 | import-svg-behaviour | **own** | direct | 116 | 74.2 | 17.2 |
| 1985 | 41533750147 (1) | E2E 12/15 | import-svg-behaviour | **own** | direct | 116 | 74.2 | 14.9 |
| 1985 | 41542753257 (1) | E2E 11/15 | import-svg-credits | flake | direct | 116 | 74.2 | 14.4 |
| 2122 | 41866854833 (1) | E2E 14/15 | import-svg-credits | **own** | direct | 68 | 49.5 | 18.3 |
| 2124 | 41896608999 (1) | E2E 4/15 | docs | **own** | direct | 67 | 44.1 | 12.5 |
| 2134 | 41907705562 (1) | E2E 12/15 | public-chrome-baseline | **own** | direct | 30 | 17.9 | 16.9 |
| 2134 | 41907705562 (1) | E2E 7/15 | imported-credits-live-data | **own** | neither | 30 | 17.9 | 16.9 |
| 2173 | 41951664680 (1) | E2E 1/1 | output-debate-clock | **own** | direct | 1 | 2.5 | 5.2 |
| 2173 | 41952469113 (1) | E2E 1/1 | output-debate-clock | **own** | direct | 1 | 2.5 | 4.1 |
| 2173 | 41953020084 (1) | E2E 1/1 | output-debate-clock | **own** | direct | 1 | 2.5 | 5.3 |
| 2173 | 41986830364 (1) | E2E 6/15 | output-debate-clock | **own** | direct | 51 | 34.4 | 15.4 |
| 2210 | 42201897413 (1) | E2E 5/15 | output-debate-clock | flake | neither | 61 | 40.5 | 18.7 |
| 2215 | 42031696823 (1) | E2E 6/15 | editor-foundation | flake | direct | 79 | 52.7 | 48.5 |
| 2227 | 42052718464 (1, 2) | E2E 11/15 | new-graphic-guard | main | neither | 64 | 41.7 | 17.1 |
| 2293 | 42494801721 (1) | E2E 1/15 | production-persistence | **own** | direct | 56 | 39.3 | 16.0 |
| 2343 | 42798977212 (1) | E2E 5/15, 1/15 | audience-pack, catalog-baseline | **own** | direct | 146 | 100.2 | 16.6 |
| 2369 | 42938883051 (1) | E2E 5/15 | editor-canvas-transforms | **own** | direct | 146 | 105.0 | 15.9 |
| 2374 | 42964189955 (1) | E2E 5/15 | editor-base-edits | **own** | direct | 156 | 107.8 | 16.2 |
| 2380 | 43025578382 (1) | E2E 10/15 | playout-air-contract | **own** | direct | 99 | 70.8 | 16.1 |
| 2380 | 43028208244 (1) | E2E 6/15 | studio-evening-reliability | **own** | direct | 99 | 70.8 | 15.9 |
| 2389 | 43068851204 (1) | E2E 12/15 | publish-output-setup | **own** | direct | 88 | 65.7 | 16.2 |
| 2408 | 43146925371 (1) | E2E 5/15 | shows | **own** | direct | 193 | 118.6 | 21.8 |
| 2408 | 43152782988 (1) | E2E 14/15 | production-data | **own** | direct | 193 | 118.6 | 19.4 |

Infrastructure, not in the table: `Configured E2E` setup step `Run ./.github/actions/configured-stack`
failed on PRs 1880, 1896, 1899, 1974, 1985, 1996 and 2005; PR 2380 run 43050146650 `E2E 11/15`
stopped with no test verdict. These are the largest single cluster (7 of 39 jobs) and no pre-push
run can catch them.

Why CI can select a spec the PR's own direct set or full selection does not: CI plans the PR
merged with current `main` (`--integration`), so `main`'s newer headers and changes take part. The
two `main` records (PR 2227) are that case: the PR's own head did not select `new-graphic-guard`,
and merging main fixed it.

## 4. Wall time (step 4)

Measured, not assumed: one bounded queue job on this cloud worker (4 CPUs, 13.4 GiB, 2 browser
workers), `node scripts/jobs.mjs add "npm run test:e2e -- <six specs>" --cap 5`: creative-pilot,
editor-arrangement, editor-canvas-transforms, editor-cli-round-trip, editor-cross-cue,
editor-drawing-persistence. 100 tests passed in 3.9 minutes; the nightly report gives those six
5.59 test-minutes, so this machine runs **0.70 wall-minutes per nightly test-minute** at 2 workers
(not the 0.5 that two perfectly split workers would give). Estimate per run: 0.70 x test-minutes
plus 1 minute for dev-server boot and Playwright start. One sample, run while the collector made
API calls beside it, so it is indicative, not exact.

| | median | p90 |
| --- | --- | --- |
| Direct set at the 19 own-failure heads | 70.8 min | 118.6 min |
| Direct set at a landed head (sample of 75: every fifth PR number) | 0 (39 of 75 select nothing) | 44.5 min |
| Landed heads with a non-empty direct set | 36 of 75; of those, 6 fit 5 minutes and 13 fit 12 | |
| CI round trip of an own-failure run (all failing runs) | 16.1 min (15.9) | 19.4 min (18.7) |
| Bounce cost (cf22) | 30.4 min | 123.5 min |
| Pushes per landing (distinct PR heads with a run) | median 1, mean 3.0 | |

## 5. Rule (step 5)

Per landing, at each cap, a worker runs the direct set before a push only when its estimate fits
the cap. Cost: the sample's mean wall time spent running it (once, or once per pushed head). Saving:
own bounces caught x 30.4 minutes / 356 landings.

| Cap (min) | Landings that run it | First push only: cost / caught / saved / net | Every push: cost / caught / saved / net |
| --- | --- | --- | --- |
| 3 | 5/75 | 0.1 / 1 / 0.1 / 0.0 | 0.2 / 3 / 0.3 / **+0.1** |
| 5 | 6/75 | 0.2 / 1 / 0.1 / -0.1 | 0.4 / 3 / 0.3 / -0.2 |
| 8 | 12/75 | 0.7 / 1 / 0.1 / -0.6 | 2.5 / 3 / 0.3 / -2.2 |
| 12 | 13/75 | 0.8 / 1 / 0.1 / -0.7 | 2.6 / 3 / 0.3 / -2.4 |
| 20 | 17/75 | 1.6 / 1 / 0.1 / -1.5 | 3.8 / 4 / 0.3 / -3.4 |
| 30 | 20/75 | 2.6 / 1 / 0.1 / -2.5 | 5.4 / 4 / 0.3 / -5.1 |
| 45 | 29/75 | 7.4 / 3 / 0.3 / -7.2 | 15.4 / 7 / 0.6 / -14.8 |
| 60 | 33/75 | 10.1 / 4 / 0.3 / -9.7 | 22.0 / 8 / 0.7 / -21.3 |
| 120 | 36/75 | 12.8 / 6 / 0.5 / -12.3 | 50.0 / 19 / 1.6 / -48.3 |

At the cf22 p90 bounce cost (123.5 minutes, four times the median) every saving above is four
times larger and every cap from 8 minutes up still loses (at 12 minutes, every push: 1.0 saved
against 2.6 spent; at 120: 6.6 against 50).

**Recommendation for verify.md**: keep the 5-minute browser cap and state the rule plainly:
"Before a push, run the direct set for your changed files when its estimate (0.70 x the nightly
test-minutes of those specs, plus 1 minute) is at most 5 minutes; above that, push and let CI run
it." Measured saving: about 0.1 minute per landing at a 3-minute cap and roughly zero at 5, so this
is a cheap habit, not a lever. Raising the cap to 12 minutes costs about 0.7 to 2.4 minutes per
landing; running the whole direct set before every push costs about 48 minutes per landing. The
owner's preference for more testing before a push does not pay at this bounce rate, because CI's
15 parallel shards answer in about 16 minutes while the worker would need 40 to 120.

What would change the answer: a bounce rate several times higher (the 19 in 356 here), or direct
sets far smaller than the headers and traced map now produce (a product change's own mapping
names a median of 99 specs). The configured-stack setup failures (7 of 39 failed jobs) are a
larger, separate cost that no pre-push run reaches.

## 6. Limits of this measurement

- The cost side uses each sampled PR's final head for every push; earlier heads may select less.
- One speed sample (section 4).
- Agent attention and tokens spent on a bounce are not in the 30.4-minute cf22 figure and are not
  measured here.
- The PR #2227 two-attempt record's second round trip (320.6 minutes) is a late re-run, not a
  push; round-trip statistics use first attempts only.
