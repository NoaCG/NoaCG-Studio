# Codex Cloud runtime qualification — 2026-10-16

Scope: existing prepared NoaCG cloud environment; no new subscription, environment,
credential or paid API agent. Source implementation: PR #1284, reviewed tip
`110d0a5e1acee2162e9e4e413ee692ecc77d5e7e`. This evidence branch started at
`687c6b52a8668d8bf48247a1d96bd3ce11fc5c35` before that landing.

## Prior work and current documentation

Read AGENTS.md, docs/ARCHITECTURE.md, docs/work-specs/README.md, and the canonical
check, verify, queue-merge, plan-run and orchestrator procedures before editing.
Ran `npm run rules -- <touched paths> --loaded AGENTS.md`; used owned worktrees.
Existing PRs #392/#394 already recovered stale Reviewed and reserved auto-merge
for the session. #859/#860 left real fixer qualification open. #1087 documented
cloud wake mechanics. Those paths were reused, not replaced.

Official sources read live on 2026-10-16:

- https://developers.openai.com/codex/cloud/ (redirects to ChatGPT Learn): prepared
  cloud environments provide project tools; selecting one is not a permission test.
- https://code.claude.com/docs/en/claude-code-on-the-web: GitHub credentials are
  attached server-side by the proxy; Auto-fix does not react to a conflict created
  solely by advancing the base branch, because no webhook arrives.
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow:
  workflow-token events have exceptions and approval semantics; dispatch and a
  passing check are distinct observations.
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
  and https://cli.github.com/manual/gh_pr_merge: required checks and merge-group
  CI still gate queue entry and landing.

## Measured capabilities

- gh 2.46.0 and Node v24.19.0 are installed. git fetch/push, PR creation, GraphQL
  PR reads, Actions run/jobs reads, dispatch/rerun and guarded auto-merge executed.
- `gh api repos/NoaCG/NoaCG-Studio` reported ADMIN/push permissions. Nevertheless a
  commit-status POST returned `403 Resource not accessible by integration`.
  Matching environment variables and broad repository permissions are insufficient.
- A REST PR read returned 401 while GraphQL `gh pr view` and the connected GitHub
  fetch_pr worked. No token replacement or credential inspection was used.
- `gh run view --log-failed` could not retrieve the redirected archive. The
  connected GitHub `fetch_workflow_job_logs` retrieved whole decoded job logs.
  Signed redirect URLs and credentials are deliberately absent from this receipt.
- Initial default-sandbox network calls could not reach the session proxy. Commands
  succeeded with the supported per-command network permission; proxy/TLS were kept.

## Failed-log reproduction and unchanged assertions

Disposable draft [#1283](https://github.com/NoaCG/NoaCG-Studio/pull/1283) has no land
label or auto-merge and never entered the queue.

- [Red run 38859315443](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38859315443),
  SHA `03cede3474105a61589ad9bfc7145dbc9fc04382`: 10 passed, 2 failed with
  `Missing expected exception`. A denied/malformed Actions read silently dispatched CI.
- `node scripts/cloud-queue.test.mjs` reproduced both failures in cloud.
- Repair changed only the queue helper. [Green run 38859419791](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38859419791),
  SHA `bde058b7a89353447656ba5b5294eb282e85dc67`: 12/12 passed. The old SHA's
  rerun remained red, a negative control rather than a flake or weakened assertion.
- Late failure [38859992515](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38859992515),
  SHA `3abc78dfaf0e085477896a2146bc6e44bc9a3289`, restored the faulty helper after
  the first worker result. A hosted one-time wake resumed the same owning chat.
  It read the entire 201-line failed job log (job 116839857201), reproduced 10/12,
  applied the verified repair and reran 12/12, then pushed only the helper as
  `48bb2b5a672c904111244f5d084b108accb8039a` (one repair attempt).
- Test file SHA-256 before and after delayed repair:
  `67d5737df76d61e3571a4c48706fabde465c4b3a6d0e6379e1f0277f6b42f4c4`.
  No assertions, gates, limits, quarantine rules or review requirements changed.

## Ownership and limits

The scheduled qualification first delivered a harmless read-only wake into this
same coding chat and workspace; the later repair wake delivered after the initial
successful worker result and after CI completed red. Both used the prepared cloud
workspace, not a laptop daemon. Only this chat wrote the repair. A scheduling
acknowledgement was not counted until actual delivery and tool execution.

The immediate-run scheduling endpoint returned 404 even though eventual scheduled
delivery worked. The first one-time qualification was paused; one-time repair is
not a recurring-monitor proof. We did not test restart after cloud-environment
expiry or a wake after this chat's final answer; do not infer those guarantees.
The active chat retained ownership through live landing and post-land results.

## Focused checks and browser evidence

- `npm run gates -- run --changed origin/main`: 16 build gates, 3 selected Node
  files, 29 tests passed. Full builds/suites stayed in GitHub Actions.
- Review CLI could not initialize its app-server in the read-only runtime; review
  and simplify ran inline over review-request.mjs's exact 12-file/base scope.
- `npm run queue -- "npm run test:e2e -- e2e/landing.spec.ts --grep 'root shows' --trace on"`:
  1 Chromium test passed in 4.8s. Earlier preview-error selection skipped both
  retired cases and was not counted as browser verification.
- Queued browser walk on http://localhost:5198/: rendered hero/nav/Start creating
  inspected in `/tmp/noacg-cloud-browser-complete.png`; zero page errors and zero
  HTTP responses >=400. Screenshot stays in cloud, not Git. Direct GitHub browser
  navigation hit the cloud CA trust boundary; no TLS bypass was used. First local
  screenshot attempt used 127.0.0.1 while dev:worktree bound localhost; corrected
  host succeeded. This is browser-runtime evidence, not a product-change claim.

## SHA refusal and reconciliation

- [Dispatch 38859710477](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38859710477)
  named #1283's old SHA after its branch moved. Main's workflow refused before
  stamping or labeling: origin was bde058b7a893, not reviewed 03cede347410.
- An erroneous full SHA in the first #1284 stamp dispatch was also refused; it was
  corrected with `git rev-parse HEAD`. [Correct dispatch 38860271996](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38860271996)
  passed and the PR's own Reviewed job passed on the exact 110d0a5e tip.
- A disposable local Git fixture advanced its own main after a worker edit, produced
  an actual textual merge conflict, reconciled both intents, and verified the new
  main was an ancestor and the reviewed SHA changed. This synthetic conflict is
  not evidence that repository main advanced during #1284.

Live merge, post-land and newer-main evidence will be appended before this receipt lands.

## Late repair and live queue receipts

The actual delayed-repair Actions run
[38860508595](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38860508595)
on `48bb2b5a672c904111244f5d084b108accb8039a` completed success (12/12).
The one-time scheduler used hosted `automations.create/update` with relative
`dtstart_offset_json`; its delivered prompt executed in this same chat. Immediate
`run_now` was unavailable (404), so only real scheduled delivery counted.

For #1284, GraphQL confirmed the session actor `miwco`, exact head
`110d0a5e1acee2162e9e4e413ee692ecc77d5e7e`, and `AddedToMergeQueueEvent` at
2026-10-16T06:19:27Z. Queue entry was position 1, AWAITING_CHECKS.
[PR CI 38860189762](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38860189762)
passed. [Merge-group CI 38860581439](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38860581439)
tests merge SHA `6e05d78ea46ffc23e2eb83c29e1b8bfbc3b816bd`.
Both ran Build, Factory gates, Reviewed and E2E plan; the planner selected no E2E
specs for these instruction/script changes. Skipped E2E/catalog jobs are not being
represented as executed browser suites.

`gh pr edit` 2.46.0 also rejected a disposable PR base edit through the retired
`projectCards` field. Connected GitHub `update_pull_request` performed the edit.
The disposable #1283 base `scratch/cloud-base-proof` is a simulation, not repository
main. GitHub observed `mergeable=CONFLICTING`, `mergeStateStatus=DIRTY` at worker
`f2db37c7ef992debe1401350fea9e6867b726917` versus base
`d1d864612` (full base SHA available in the branch history). Its scheduled repair
will be recorded below; the draft has no land label, auto-merge or queue entry.
