---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: >-
  a landing charges 0.15 against the queue's 1.0 day budget while it runs, so no browser job can
  start until it finishes - the opposite of what the code beside it says it does (2026-09-09)
serves: NOW
size: small
touches: scripts/jobs-store.mjs
covered-by: scripts/jobs-store.test.mjs
needs-owner: none
---
# A live landing starves every browser job for its whole life

**Filed:** 2026-09-09. **Source:** measured while queueing a one-page repro from session M
(`claude/m-wizard-says-it-itself`), which sat at `#1` for the whole of a landing's stay in the
merge queue.

## Why

`schedule()` in `scripts/jobs-store.mjs` states its own intent at the exemption, line 473:

> A LANDING IS NOT CHARGED AGAINST THE SUITE BUDGET. The budget protects RAM and CPU, and a
> landing uses neither meaningfully - it is a couple of git commands and then ten minutes in
> `gh run watch`.

The code does half of that. Line 479 exempts a merge from being BLOCKED by the budget
(`if (job.kind !== 'merge' && used + cost > slots)`), but nothing exempts it from CONSUMING the
budget: `used` starts at `running.reduce((sum, j) => sum + costOf(j), 0)` (line 413) and every
started job adds its cost at line 488, merges included.

The day budget is `byDay: 1` and a browser job costs `COST.browser: 1`. So while any landing is
live, `used` is 0.15 and `used + 1 > 1` for every suite, sweep and e2e run on the machine. Not
delayed by the landing's RAM - by 0.15 of an accounting slot. Measured today: job j-0864, a
single-page Playwright repro, waited out a 15-minute stay in GitHub's merge queue with nothing
browser-driving running anywhere and 4.2 GB free.

This is not cosmetic. Landings are in flight for most of a working wave, so the practical day
budget for browser work is zero whenever the queue is doing its main job. Every wave prompt in
`docs/waves/` that says "start the browser leg early, a queued job starves once landings are in
flight" is describing this line.

## What it would take

One line, plus the test that pins it. In `schedule()`, exclude merges from the running total and
from the `used +=` after a start - the same `job.kind !== 'merge'` predicate the block already
uses. `scripts/jobs-store.test.mjs` gets a case: a running merge plus a waiting browser job on a
day budget of 1 starts the browser job.

Worth checking in the same pass whether `capacity()`'s `outsideRuns` subtraction should also skip
a landing that runs outside the queue; it reads `activeRuns`, which only reports Playwright CLIs
and sweeps, so probably not.

**The other half of why browser work waits is being fixed on `claude/ay-per-job-cost` (pull request
216), so do not file it again.** `costOf()`'s doc comment says a job records its cost when it is
queued and `addJob()` never wrote one, so a single-page browser walk was charged the same
suite-equivalent - and the same 4 GB memory floor - as a nine-shard Playwright suite. That is what
cost row AG its evening on 2026-09-09: about three hours at 2.0-3.2 GB free with six sessions
landing, and no way for a small job to say it was small. Traced here on 2026-09-10 out of
`git show 4f95444b:docs/handoffs/2026-09-09-ag-ograf-external-renderer.md`, "A mechanism that is
missing, and cost this row its evening", because that handoff is deleted and the branch holding the
fix had not landed yet.

## Evidence

- `scripts/jobs-store.mjs` lines 413, 473-488 - the comment and the two places the cost is
  actually counted.
- `COST = { browser: 1, merge: 0.15, other: 0.4 }` (line 51) and `POLICY.byDay: 1` (line 58):
  the arithmetic that makes 0.15 fatal rather than tight.
- The queue listing at 12:36 UTC on 2026-09-09: `budget 0.15/1 suite-equivalents in use`, one
  running `land-watch`, one waiting sweep whose stated reason was `budget 0.15/1 used`.
