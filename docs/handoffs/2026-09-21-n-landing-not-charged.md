# Handoff: row N, a landing is not charged against the budget (2026-09-21)

Branch `claude/n-landing-not-charged`. Commit `58662733` holds the change, and this handoff sits
on top of it.

## What changed

A running landing no longer holds browser jobs out of the job queue.

- **The bug.** `schedule()` in `scripts/jobs-store.mjs` skipped the budget check for a landing
  being admitted. It still seeded its running total with every running job's cost, landings
  included. With a day budget of 1 and a browser job costing 1, one running `land-watch` (0.15)
  meant `0.15 + 1 > 1`, so no suite, sweep or e2e run started while any landing was in flight.
  That is the "budget 0.15/1 used" with five browser jobs waiting that was measured at about
  21:00Z tonight.
- **The fix.** A new exported `budgetShareOf(job)` returns 0 for a landing and `costOf(job)` for
  anything else. `schedule()` uses it for the running total and for jobs admitted earlier in the
  same pass. `costOf` still prices the RAM floor, so every non-merge job is still checked against
  free memory exactly as before. Two merges still never overlap, and a landing still never runs
  beside anything in the same checkout.
- **The display.** The `npm run jobs` header now sums `budgetShareOf`, so it prints the figure
  admission actually tests. A running landing's own row still shows `[0.15]`, because that number
  is its RAM price. I left it alone on purpose.
- **The test.** `scripts/jobs-store.test.mjs` gains "a RUNNING landing does not hold a browser
  job out of the budget". It pins four cases. A running landing plus a waiting browser job starts
  the browser job. A landing admitted in the same pass does not block the browser job behind it.
  The RAM floor still refuses the browser job at 1 GB free. A second browser job still waits on
  the first. I watched it fail on the old code before fixing it.
- **Paperwork.** `docs/backlog/a-live-landing-starves-every-browser-job.md` described this exact
  bug on 2026-09-09. It is deleted, as the backlog README says a landed item is.
  `docs/JOB_RUNNER_PLAN.md` now says a landing takes no budget share.

The away floor needed nothing. It moves the RAM floor only and never touched the budget.

## How the runner picks it up

The live runner has the old module loaded in memory, and nothing here restarted it. It keeps
starving browser jobs behind landings until it is restarted on a checkout that holds this commit.
Once this lands, restart the runner on `main` the usual way, or let the next natural restart
(reboot, crash reap) pick it up. Nothing in the job store needs migrating. The change is pure
scheduling arithmetic.

## Verification

- `node --test scripts/jobs-store.test.mjs`: 100 of 100 pass.
- `npm run build`: exit 0, read directly rather than through a pipe.
- eslint is clean on the three changed scripts.
- `/check`: review `delegated`, with the scope matching the base `da821d84` and the same four
  files. It found nothing. Simplify ran `inline` and found nothing. Verify ran `inline`.
  Taste is not applicable, because nothing here can change how a graphic looks.

There is no owner-queue item, because nothing in the product changed. The effect shows only in
the job queue.
