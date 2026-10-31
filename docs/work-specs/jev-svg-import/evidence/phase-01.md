# Phase 1: prerequisites and execution route

Run `plan-jev-svg-import-2026-10-31` (issue #1850), PR #1851. Acceptance subset: AC-1. Builder: Claude Code
cloud worker `session_017SdbwMfxvT98sAbe3qp9XU`, created by coordinator
`session_017SdbwQ6d3pRaakjohGfCcC`, environment `env_017nuiDZBW9smUNLdWVQK8cf`. Recorded
2026-10-31 UTC. No product file changed.

## Pinned main

Previous verified main: `139a9724ebb1a2522750008dcb5a6a8b72adeac0` (PR #1848). On that SHA:
merge-group CI, push CI, configured-suite, Post-landing, Quarantine and Push on main all
succeeded; deploy-verify runs were skipped by their own conditions. The worktree was created from
this SHA after a fresh fetch.

## Prerequisites

| Item | Evidence | Status |
|---|---|---|
| Sanitizer | PR #1452 merged 2026-10-30T21:52Z as `e3337d7a`, an ancestor of the pin. On `e3337d7a`: merge-group CI, push CI, configured-suite, Post-landing, Quarantine and one deploy-verify succeeded | landed |
| Production row 45 | Heartbeat comment 6301497867 on #1553: row 45 passed on `05baf75` (PR #1800), the last cloud phase; the production-page run waits on owner phases | checked |
| Readiness PR | PR #1843 merged 2026-10-31T08:43Z as `ee73212a`, including the browser alias fix (#1647 closed) and the stamp dispatch allow rule | landed |

## Ownership

Open PRs at start: #1840 and #1503 (bot refreshes of e2e data), #1834 (quarantine of
`e2e/import-svg-corpus.spec.ts`), #1641 and #1642 (Vercel drafts). None is from svg-import-engine,
cicd-improvement or production-page, and none touches this phase's files. cicd-improvement is
executing (its ci01 phase landed as #1848) and owns `ci.yml`, configured-suite, selectors,
Playwright configs and quarantine handling; this phase touches none of them. The one workflow file
changed here, `jev-svg-qualification.yml`, belongs to this plan. Open SVG items that rows 1 and 3
read and do not fix: #1833 and #1834.

## Fresh worker qualification

- `node scripts/plan-run-preflight.mjs --context worker --until 2026-11-01T12:30:00+02:00`, run as
  separate invocations: ok each time (workspace child, Git origin/main, Actions API). Reported
  gaps, unchanged from readiness: native Codex child mapping (not used by this run) and an observed
  wake after host loss (covered by the supervisor's recovery checkpoint).
- Browser: `e2e/import-svg-behaviour.spec.ts` through the job queue on this worker:
  38 passed (2.5 min), job j-0001, exit 0. The Chromium 1228 alias from #1647 was already in place at session start.
- Actions: this PR's CI and the configured-suite run dispatched on its reviewed head; their
  results are in the PR and the builder's receipt.
- Coordinator qualification is the coordinator's own preflight, recorded in its ledger.

## Workflow-file route

Readiness proved pushes of a workflow file to a disposable branch and coordinator auto-merge on
PR #1843, which changed no workflow file. This PR closes that gap: the cloud worker pushed a
comment-only change to `.github/workflows/jev-svg-qualification.yml` (workflow_dispatch only, so
it runs nothing on push or merge). The coordinator stamps this reviewed PR and enables auto-merge
on it; its landing through the merge queue is the proof row 32 needs. If GitHub refuses that
landing, workflow landing becomes an explicit owner step before row 32.

## Decisions and traps

- The phase lists "acceptance records only" as its files, while its verification requires a real
  workflow-file push on the reviewed PR. A comment in the plan's own dispatch-only workflow
  satisfies both with no behavior change and no overlap with cicd-improvement.
- `plan-run-preflight` refuses `--until` beyond 24 hours (the run deadline fails); a worker passes
  the current block's end.
- Wait for queued e2e jobs with `node scripts/jobs.mjs wait <id>` as a background job; the guard
  hook refuses foreground polling.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='Merge pull request #1851 ')"

It removes only this file and the workflow comment.
