# A full E2E run's shard dies at the cap on an unmeasured spec

**Filed:** 2026-10-03. **Source:** the flaky-tests row, reading runs 37096120413 and 37118148332.

## Why

Shard 6 of both red full runs on 2026-10-03 was killed at its 20-minute cap with 256 of 257 tests
done. The cause is the durations table, not a test: `e2e/playout-folders.spec.ts` (added
2026-09-28, 51 tests, about 7.3 minutes on CI) is not in `scripts/e2e-durations.json` (recorded
2026-09-26), so the planner packs it at the median, about 0.1 minutes. Every full run puts
roughly 7 extra minutes on whichever shard draws it. The retry job now re-runs a dead shard's
files (ci.yml `e2e-retry`), which turns this from a red main into a slower green one, but the
shard still dies and each full run pays about 20 extra minutes.

Two related gaps the retry change left alone, because they are outside the retry job:

- A run where a shard only DIED and none failed reaches the retry as `cancelled`, and the retry
  runs only on `failure`, so it is still "no verdict" and red. Running the retry on `cancelled`
  too, and letting the gate pass on cancelled-then-retry-success, would close it.
- When only the dead shard's files fail in the retry, `red-main-issue.mjs` says "the retry job
  re-ran nothing", which is no longer accurate. The decision (no revert) is right.

## What it would take

Re-record the table from a recent green full run (`npm run record:e2e-durations -- 37116813858`)
and land it; the weekly proposal PR #501 is from 2026-09-28 and predates the spec. Then the two
small ci.yml and red-main-issue.mjs changes above, each landed alone as gate changes.

## Evidence

- Run 37118148332 shard 6: `playout-folders.spec.ts` ran from 11:10:01 to 11:17:23; the job was
  cancelled at 11:24:22 on test 256 of 257.
- The plan step warns about unmeasured specs on every run (`plan.unmeasured`).

## Measured repair, 2026-10-03

Scope: restore duration coverage and balance against the existing 20-minute cap. Acceptance is
a complete full CI run whose nine shard jobs each finish with at least the planner's three-minute
safety margin. Preserve retries, quarantine, coverage and the CI gate. No local full browser
battery, new shard runners or timeout increase is needed if the refreshed balance holds.

Main `5b91be155` is green: [full CI](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37143991356)
and [deployment verification](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37144151130)
are distinct runs. [Issue #676](https://github.com/NoaCG/NoaCG-Studio/issues/676) was closed
at 18:42:58 UTC; this repair does not reopen it. A green full run alone did not establish
headroom: shard 2 finished in 19.12 minutes, leaving only 0.88 minutes.

The ten newest runs with full shard jobs were selected from the 120 newest `ci.yml` runs
using `gh run list` and `gh run view <id> --json jobs`. Both main and merge-group candidates
were inspected; all recent merge-group candidates in this sample were subset or no-E2E runs
and cannot prove full-suite headroom. The ten full runs are main pushes. Elapsed minutes below
are job `completedAt - startedAt`, including setup and uploads. C means cancelled, F failed;
those censored measurements are retained, not treated as successful completion.

| Full run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| [37143991356](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37143991356) | 14.32 | 19.12 | 14.30 | 14.57 | 16.32 | 12.72 | 12.03 | 13.80 | 11.37 |
| [37135935833](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37135935833) | 14.63 | 13.32 | 15.92 | 13.27 | 13.78 | 20.25 C | 10.68 | 14.10 | 19.85 |
| [37123368087](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37123368087) | 14.60 | 16.83 | 10.77 | 13.97 | 13.82 | 20.25 C | 14.85 | 15.05 | 20.05 C |
| [37122597362](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37122597362) | 10.75 | 15.20 | 17.70 | 9.20 | 13.78 | 11.72 | 20.27 C | 13.07 | 14.85 |
| [37120055560](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37120055560) | 13.73 | 17.55 | 12.90 | 14.02 | 14.90 | 12.20 | 20.28 C | 11.33 | 14.90 |
| [37119574884](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37119574884) | 10.57 | 14.43 | 11.92 | 13.77 | 12.25 | 20.27 C | 16.15 | 15.40 | 12.25 |
| [37118148332](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37118148332) | 10.78 | 15.17 F | 17.30 | 13.93 | 13.38 | 20.25 C | 15.55 | 15.50 | 13.77 |
| [37116813858](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37116813858) | 12.12 | 14.05 | 14.70 | 13.85 | 13.47 | 16.70 | 16.28 | 15.35 | 16.47 |
| [37110685889](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37110685889) | 8.88 | 13.95 | 17.27 | 14.37 | 9.02 | 20.27 C | 11.05 | 10.75 | 16.73 |
| [37110098252](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37110098252) | 9.02 | 12.02 | 17.42 | 13.97 | 10.27 | 15.22 | 16.12 | 15.75 | 16.55 |

The September 26 table measured 166 files and 86.5 test-minutes, missing 34 of today's 200
specs. Seven of these ten runs had a shard cancelled near the cap. The newest complete green
full run supplies all 200 measured files and 123.6 test-minutes, including 4.816 minutes for
`playout-folders.spec.ts`. `npm run record:e2e-durations -- 37143991356` generated the repair;
overhead remains 0.43 minutes at p90, with a 1.01 test factor. The older open proposal #501
records September 28 and does not cover the current suite.

Replaying the old assignment against these new measurements predicts a slowest job of 19.09
minutes and a 7.62-minute spread. Refreshed packing gives 13.735-13.736 test-minutes per shard,
predicting 14.30-minute jobs and 5.70 minutes of headroom on all nine.

Full-run acceptance: pending dispatch on the repaired branch; predicted balance is not the verdict.
