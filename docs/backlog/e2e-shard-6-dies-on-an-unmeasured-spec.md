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
