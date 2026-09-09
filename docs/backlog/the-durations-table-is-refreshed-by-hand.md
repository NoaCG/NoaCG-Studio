# The shard durations table is refreshed by hand, and nobody remembers

**Filed:** 2026-09-04. **Source:** measured while making the timing model honest
(`git show 12ce8f55:docs/handoffs/2026-09-04-u-honest-timings-and-selection.md`).

## Why

`scripts/e2e-durations.json` decides how CI spreads the suite across nine runners and, since
2026-09-04, whether a plan is predicted to fit its 20-minute job cap at all. It is refreshed by a
person typing `npm run record:e2e-durations`.

That has already failed once, expensively. `check:e2e-durations` correctly reported drift every week
for **15 days** while the suite grew 49% and 16 of 147 spec files had no entry at all - including
the two heaviest in the repo. Nothing acted on it, because it is a report inside a weekly report.
The cost then was only wall clock. It is more now: the table carries the per-job overhead as well,
and a stale overhead reading is what makes the planner warn about a cap the run would actually have
cleared, or stay quiet about one it would not.

This is the same shape as every other thing in the repo that got a mechanism instead of a reminder.

## What it would take

A scheduled job that re-records from the newest green FULL run on `main` and opens a pull request
when the numbers moved by more than a threshold. The recording command already does the whole thing
in one call, already refuses a run that measured a subset, and already stamps which run it came
from, so the job is mostly plumbing plus the "did this move enough to be worth a PR" test.

Deliberately a PR rather than a push: the table is an input to a safety gate, and a silent
auto-commit to it would be a gate editing its own budget.

The alternative considered and rejected while writing this: make `check:e2e-durations` a build gate.
It would fail every branch that adds a spec file, for a fault that belongs to nobody in particular,
which is how a gate gets routed around.

## Evidence

- `git show ba427e57:docs/handoffs/2026-09-04-t-shard-cap-poisons-every-gate.md`: the 15-day stale table, the 49%
  growth, and the two heaviest specs missing from it.
- `git show 12ce8f55:docs/handoffs/2026-09-04-u-honest-timings-and-selection.md`: the overhead term, and why a stale
  reading now costs a wrong verdict about fitting rather than only a slow run.
