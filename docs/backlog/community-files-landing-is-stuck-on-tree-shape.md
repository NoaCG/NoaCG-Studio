# Decide whether the community files belong at the repo root, so PR 102 can land

**Filed:** 2026-09-07. **Source:** measurement, reading the job queue while it was starved.

## Why

`claude/oss-community-files` has been queued since 08:30 UTC and cannot land: `check:tree-shape`
refuses three unlisted root entries, and its session has not touched the branch in eleven hours.
Its landing watcher polls for an hour, retries once, and holds 0.15 of the queue's single
suite-equivalent the whole time - which makes every 1.0-weight job on this machine unschedulable
behind it. So a stalled landing is not just its own problem; it starves the queue.

It is filed rather than fixed because the gate is asking a question that is not a session's to
answer alone: whether an AGPL-3.0 project that has decided it wants contributors should carry
`CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` and `SECURITY.md` at its root. The gate exists to make that
deliberate.

## What it would take

If the answer is yes: add the three names to `ALLOWED_ROOT_ENTRIES` in
`scripts/check-tree-shape.mjs` - the gate's own message says so - and push it to the branch so its
queued landing re-runs. If the answer is no, or they belong under `docs/`, close the pull request
and move the files. Either way the queued landing must be resolved rather than left to burn its
retry, because the watcher costs the machine a slot until it does.

## Evidence

`gh run view --job 101674983945 --log-failed`, on PR
https://github.com/NoaCG/NoaCG-Studio/pull/102, head `8476907c`:

```
[gates] check:tree-shape: node scripts/check-tree-shape.mjs
  x unexpected top-level entry "CODE_OF_CONDUCT.md" (1 tracked file(s))
  x unexpected top-level entry "CONTRIBUTING.md" (1 tracked file(s))
  x unexpected top-level entry "SECURITY.md" (1 tracked file(s))
3 problem(s). Either the files should not be committed ... or the entry is a deliberate new part
of the repo, in which case add it to ALLOWED_ROOT_ENTRIES in scripts/check-tree-shape.mjs.
```

Auto-merge is still on and `mergeStateStatus` is `BLOCKED`, so the watcher reads it as waiting and
keeps its slot rather than exiting.

## Resolved 2026-09-08

Yes, at the root. `ALLOWED_ROOT_ENTRIES` in `scripts/check-tree-shape.mjs` now lists the three
names with a comment saying why no other location works: GitHub reads community health files from
the repository root or from `.github/`, and this repo keeps `.github/` for workflows. PR 102 is
unchanged and re-queues once this lands.
