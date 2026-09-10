---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "The session-start hook reports orphaned Playwright workers and browser shells to a person and stays silent about orphaned delegation families, which are the expensive ones; and `poll` writes an ownership record naming no job, which `abandonLaunch` may then throw away."
serves: NOW
size: small
touches: scripts/hooks/session-start.mjs, scripts/codex-rescue.mjs
needs-owner: none
---

# Two edges the delegation reaper left, both small and both recorded only in a handoff

**Filed:** 2026-09-10. **Source:** rows AB and AV, 2026-09-09 -
`git show 4f95444b:docs/handoffs/2026-09-09-ab-reap-codex-delegation-tree.md` ("What is left") and
`…-av-reap-at-delegation-end.md` ("Left undone, and why"). Both re-derived against the working tree
on 2026-09-10.

## Why

Those two rows built the mechanism that closes a Codex delegation's process family when the
delegation ends - about 450 MB per leaked delegation on a 16 GB laptop whose session count is set by
free RAM. It works. These are the two things it does not do yet, and each is small enough that
neither was worth holding a branch open for.

## 1. A person is told about the cheap orphans and not the expensive ones

`scripts/hooks/session-start.mjs:202` reads `const { workers, shells } = orphanProcesses();`. It
passes no `delegations` and never looks at the `codexTrees` the detector returns. So a session opens,
is told about stray Playwright workers and browser shells, and is not told that three delegation
families are sitting on 1.3 GB.

`orphanProcesses` already answers this: `scripts/e2e-runs.mjs:662` takes `{ delegations }` and
`scripts/jobs.mjs:1159` already calls it that way, with `codexDelegations()`, for the starved-queue
reclaimer. The hook is a display change and nothing more.

## 2. `poll` writes a record that names no job, and `abandonLaunch` can then discard it

`poll` creates its ownership recorder without the job id it is watching, so a record first written by
a poll carries `jobs: []`. `abandonLaunch` refuses only when the record names a job, so it would
abandon a record belonging to a real, running delegation. `recorder.add` exists for exactly this case
and is called nowhere.

Row AV reported this rather than fixing it, and the reason still stands: it is pre-existing, it needs
its own reasoning about which job a poll is entitled to claim, and it is not reachable through
anything that branch changed.

## What it would take

Item 1 is one destructure and one report block, plus whatever the hook's existing lines look like -
half an hour including reading how the workers and shells are phrased so the new line matches. Item 2
is a line to call `recorder.add`, and the thinking that goes in front of it: a poll watches one job,
but the family it is recording may already be serving another session's delegation, so "claim the job
I am polling" is right and "claim everything in this workspace" is not.

## Evidence

Row AB's measurement of what a leaked family costs, on this machine: baseline with no delegation is 9
processes and 540 MB; one delegation running is 30 and 1239 MB; after it completes with nobody
polling, still 30 and 1239 MB. The evening that started this work found 47 node processes holding
2.3 GB, three of them abandoned delegation trees.

The third edge AV left - a record whose `workspace` is null is excluded from a scoped reap and from
`busy` - is recorded in `worktree-removal-reads-a-failed-reap-as-an-empty-directory.md` instead,
which is where AV said it belongs.
