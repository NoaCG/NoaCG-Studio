# Two duplications a review found in `scripts/`, taken by nobody

**Filed:** 2026-09-09, carried out of `docs/handoffs/2026-09-06-workflow-phases-1c-1d-2a.md` during
the handoff drain, where they were listed under "Not taken from the reviews" and then copied forward
into a successor handoff rather than filed.

## Why

Both are small, both are the kind of thing a `/check` finds and a row declines because it is not
what the row is for, and both keep costing something every time somebody works next to them.

**`queueOnGitHub` in `scripts/jobs.mjs` and `queuePullRequest` in `scripts/queue-pr.mjs` are the
same sequence written twice.** Landing is the path where a divergence is expensive and invisible:
two ways to put a branch on the queue means a fix to one of them is a fix to half the cases, and
which half depends on which entry point the session used.

**Four older checks each spawn their own `git ls-files` where `repositoryFiles()` in
`scripts/gates.mjs` would do.** Four extra process spawns per build, on a gate chain whose speed is
treated as real work by the fast-iteration rule.

The third finding from the same list - eight helpers in `draft/core.ts` made public because they
cross the new boundary, which could collapse into two functions owned by the import slice - belongs
to `docs/backlog/draft-ts-out-of-components.md` and is noted there instead.

## What it would take

One session, both at once, because they are the same shape and the same folder. For the queue pair,
read both callers before merging them: the reason there are two may be that one queues a branch and
the other queues an existing pull request, in which case the fix is one function with the two
entries rather than one entry. For `git ls-files`, `repositoryFiles()` already exists and the change
is mechanical; the check is that no caller depends on a different pathspec.

Neither is worth a row of its own. Both are worth taking the next time somebody is in `scripts/`
with the build in front of them.

## Evidence

- `scripts/jobs.mjs` (`queueOnGitHub`), `scripts/queue-pr.mjs` (`queuePullRequest`).
- `scripts/gates.mjs` (`repositoryFiles()`), with offenders including
  `scripts/check-contract-freshness.mjs` and `scripts/check-retired-names.mjs`.
- Found by the `/check` reviews of the Phase 1c/1d/2a rows, PRs 66-77, 2026-09-06.
