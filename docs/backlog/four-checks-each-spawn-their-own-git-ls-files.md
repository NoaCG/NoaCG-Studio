# Four build checks each spawn their own `git ls-files` where `repositoryFiles()` would do

**Filed:** 2026-09-09, out of the drained handoff for the workflow phases 1c, 1d and 2a (PRs 66-77),
which listed it under "Not taken from the reviews" and copied it into a successor handoff rather
than filing it.

## Why

`repositoryFiles()` in `scripts/gates.mjs` exists so the gate chain asks git for the file list once.
Four older checks predate it and each spawns its own `git ls-files`, so every build pays for four
extra process spawns to learn the same thing four times.

Small, and it is the kind of small that is never worth a branch and so never gets taken. It matters
because gate speed is treated as real work here - a slow or repeated CI run is a bug to fix, not a
cost to absorb - and because four copies of "how do I list the repo's files" drift: the day one of
them needs a different pathspec, whoever changes it has to find the other three.

## What it would take

Mechanical. Replace each spawn with the shared call and check that no caller depended on a
different pathspec or a different working directory. The offenders include
`scripts/check-contract-freshness.mjs` and `scripts/check-retired-names.mjs`; `git grep ls-files`
over `scripts/` names the rest.

Take it the next time somebody is in `scripts/` with the build in front of them, not as a row of
its own.

## Evidence

- `scripts/gates.mjs` - `repositoryFiles()`.
- Found by the `/check` reviews of the Phase 1c/1d/2a rows, PRs 66-77, 2026-09-06.
- The other finding from the same list, that `queueOnGitHub` and `queuePullRequest` are one
  sequence written twice, is recorded in `docs/backlog/a-stacked-branch-queues-its-parents-commits.md`,
  whose plan assumes they already share one place. The third, eight `draft/core.ts` helpers made
  public, is in `docs/backlog/draft-ts-out-of-components.md`.
