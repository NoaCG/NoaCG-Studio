---
serves: NOW
size: small
touches: scripts/wave-tick.mjs, scripts/wave-tick.test.mjs
needs-owner: none
---
# The tick's FINISHED-LOOKING alarm needs a CI leg, because a row reading its CI looks finished

**Filed:** 2026-09-09. **Source:** measurement, the night wave of 2026-09-08 - three alarms, three
wrong, the run ids and pull requests below.

## Why

`scripts/wave-tick.mjs` raises `FINISHED-LOOKING AND UNQUEUED` for a branch that is ahead of main,
has a clean worktree, has had no commit for `QUIET_MINUTES` (30) and has nothing in the queue. On
2026-09-08 it fired three times and was wrong three times. Every one of those rows was alive and
inside the last step its own QUEUE contract asks for: push, wait for the CI run on the tip, read
which jobs ran, then queue. From outside, that step is exactly the alarm's shape - the tree is clean
because the work is committed, no commit arrives because the row is waiting, and nothing is queued
because queueing is what it is about to do. A signal that is wrong three times out of three trains
the loop to ignore it, and the one night it is right (a session that ended believing a watcher
would queue it, the 2026-08-30 failure the check exists for) is the night that matters.

The wording now says what the tick did not check (landed with this file). That stops the line
reading as a verdict; it does not make the line right.

## What it would take

One more leg in the classifier, measured only for branches that already pass every other leg (the
same shape as the clean-tree `git status`, which the tick spawns only where the answer is consumed):

- `gh run list --branch <name> --limit 1 --json status,conclusion,headSha,updatedAt` for the
  branch. A run on the TIP that is `queued` or `in_progress` means the row is in its CI read: not
  finished-looking, no event.
- A run on the tip that has completed starts the quiet clock from its completion, not from the
  last commit. "CI finished 40 min ago and nothing queued" is the real abandoned shape, and it is a
  sharper sentence than "no commit for 40 min".
- When `gh` cannot answer, fire the alarm as today and say "CI not checked" in the line, rather than
  suppressing it: the alarm is advisory, and a gh outage must not silence the one check that
  catches a stranded branch.
- The agent `.output` file's mtime is NOT a substitute signal. The orchestrator read it as the
  transcript mtime and it was live to the second for row O and frozen for 95 minutes for row V
  while V committed and pushed twice. That sentence belongs in `night.md` beside the three-signal
  test.

Tests in `scripts/wave-tick.test.mjs`: a branch with an in-progress run on its tip does not fire; a
branch whose run completed inside the quiet window does not fire; one whose run completed before the
window fires with the CI time in the line; a gh failure fires with "CI not checked".

## Evidence

- Row O, 23:44Z: alarm at 31 quiet minutes. Its CI run `34289568206` was `completed success`; the
  row was reading which jobs ran and queued itself minutes later (PR #170).
- Row V, 23:46Z: alarm at 30 quiet minutes. Its CI run `34289872217` was `queued` (the retry after
  a `Frame was detached` flake). V pushed `e9a3a367` ten minutes after the alarm.
- Row V, 00:2xZ: recorded as stranded at 33 quiet minutes with CI `completed success` at 23:53:06Z;
  V queued itself minutes after the record was written (PR #174).
- The gate half of landing latency is p90 15.6 min over 324 jobs (`landingLatency` on the job
  store, 2026-09-09), so a row's CI read alone sits at half the quiet bar, and a row that commits
  the "which CI jobs ran" record and waits for that commit's run pays it twice. Raising
  `QUIET_MINUTES` would be a guess; the CI leg measures the thing the guess is about.
