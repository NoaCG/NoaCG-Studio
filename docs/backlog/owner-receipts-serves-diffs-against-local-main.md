# `owner-receipts.mjs --serves` diffs against the local `main` ref, not `origin/main`

**Filed:** 2026-09-09. **Source:** measurement (branch `claude/x-capability-reprobe`).

## Why

`changedBacklogFiles` in `scripts/owner-receipts.mjs` runs
`git diff --name-status main...<branch> -- docs/backlog`, hardcoding the local `main` ref with no
`origin/main` fallback. In a worktree whose local `main` has fallen behind `origin/main` - which
happens whenever another worktree lands PRs and this one never fetches - that diff picks up every
backlog file every OTHER branch has touched since this worktree's local `main` was last updated,
not just this branch's own changes.

Measured directly: this worktree's local `main` was 61 commits behind `origin/main` (`git branch
--list main -vv` reported `behind 61`). `node scripts/owner-receipts.mjs --serves
claude/x-capability-reprobe` reported the branch closing two receipts it never touched and editing
21 more it never claimed. `git diff --name-status origin/main...claude/x-capability-reprobe --
docs/backlog` shows the truth: this branch adds exactly one new backlog file and touches nothing
else.

This is the same class of trap `.agent-workflows/check.md`'s scope step already documents for its
own diff (`git diff $(git merge-base main HEAD)`) - a worktree's local `main` going stale silently
turns "this branch's scope" into "everything since this worktree was created." `--serves` runs at
the last moment before a branch queues (`.agent-workflows/queue-merge.md`, "Which receipt does
this branch serve?"), so a wrong answer here can misattribute a receipt close, or miss a close a
branch genuinely earned, right before landing.

## What it would take

Change `changedBacklogFiles` (and anywhere else in `owner-receipts.mjs` that diffs against `main`
literally) to resolve the base the way `check.md`'s own scope step recommends: prefer
`origin/main` when it exists and is ahead of the local `main` ref, or fetch before diffing. Line
509 of the same file already has a `main` / `origin/main` fallback pattern
(`gitRead([...args, 'main'], root) ?? gitRead([...args, 'origin/main'], root)`) - though note that
pattern only falls back when `main` fails to resolve at all, not when it merely resolves to
something stale, so it would need the same fix if it has the same exposure.

## Evidence

`node scripts/owner-receipts.mjs --serves claude/x-capability-reprobe` vs.
`git diff --name-status origin/main...claude/x-capability-reprobe -- docs/backlog`, both run from
this worktree on 2026-09-09.
