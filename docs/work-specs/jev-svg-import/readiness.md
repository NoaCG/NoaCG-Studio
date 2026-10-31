# SVG plan readiness

Readiness snapshot, 31 October 2026, from the native Claude Code cloud coordinator that will run
the plan (`session_017SdbwQs5EvpW4bKrGAVBnh`, environment `env_017nuiDZBW9smUNLdWVQK8cf`).
Pinned main: `cba1fcf2c5096aca5be9b64fa5eb472ead395d5e`. This supersedes the 29 October Codex
snapshot. Still no project, block, run issue or run trigger exists; those wait for the owner's start.
This checklist is not a live execution ledger.

| Item | Evidence (31 October unless stated) | Status |
|---|---|---|
| Scope and hashes | spec.md SHA-256 `a51bb703…e155bf` equals work.json `specSha256`; phases.json (`29fc9e1c…bea757`) and project.draft.json phases are identical: 40 phases, ids 1 to 40, titles match the spec, all 26 criteria covered, none without acceptance | ready |
| Production prerequisite | Row 45 PASS on `05baf75` / PR 1800 in heartbeat comment 6301497867; the production-page run waits on owner phases 51 and 52 with its wakes paused | ready |
| Sanitizer | PR 1452 merged as `e3337d7a`. On that SHA: merge-group CI, push CI, configured-suite, Post-landing, Quarantine, CodeQL (three languages) and deploy-verify succeeded | ready |
| Ownership | No open PR from svg-import-engine (its review is complete; last change 26 October), cicd-improvement (registered, not executing) or production-page. Security branches #1836 to #1841 are merged. Re-read before each overlapping phase | ready; recheck per phase |
| Coordinator | `plan-run-preflight --context coordinator` passed in two separate shell calls (workspace child, Git origin/main, Actions API); cloud profile 4 CPUs, 2 e2e workers; `e2e/import-svg-behaviour.spec.ts` through the queue: 38 passed | ready |
| Fresh worker | `session_017SdbwQtmgdMeE3o4g17ScS`, created by the coordinator with `create_session` at `cba1fcf` in the same environment (parent recorded): clean HEAD, two separate worker preflights ok, backend key checks pass (Supabase, Sheets 6/6 read and edit), whole failed log read, receipt returned by `send_message`; a nonce follow-up was acknowledged. Its first browser run failed at launch on the Chromium build mismatch (#1647); with the known-trap link, the same spec passed 38/38 | ready |
| Browser build mismatch | The image ships Chromium 1243 in the layout Playwright 1.61.1 expects for 1228, and the session-start alias only handled the older layout. Fixed in `scripts/hooks/cloud-session-setup.mjs` on this branch (closes #1647); the trap stays in known-traps.md for sessions started from an older commit | ready once landed |
| Whole failed log | Coordinator read the whole failed job log of run 41180662493 through the REST jobs/logs path (255 lines, runner start to cleanup). `gh run view --log-failed` is not the working path here | ready |
| Workflow-file push | Coordinator pushed a `.github/workflows` change to disposable branch `claude/jev-ready-wfpush-probe` (`13394c8`); the fresh worker pushed a second workflow change on top (`0919760`). The proxy refuses branch deletion, so that branch remains and must never get a PR | ready |
| Coordinator auto-merge | Enabled by the coordinator with `enable_pr_auto_merge` on PR 1843 at 08:13:43Z, head checked before and after; GitHub accepted it. Posting `noacg/reviewed` on its own PR was refused by the session's auto-mode permission check as self-approval, so the stamp route for the run (coordinator stamps a worker's PR, or the cloud-queue-merge dispatch) is decided by the owner | enable proven; stamp route open |
| Wake and recovery | `send_later` wake `trig_01UzeZCrdN75KUUCwLgvgR4x`, due 08:16:00Z, resumed the coordinator at 08:16:58Z; worker receipts and replies arrived as new turns through `send_message`; PR activity subscription delivers CI and review events. Not observed: a wake after the container is reclaimed (the preflight's listed gap); the supervisor's recovery checkpoint covers that path | ready with that limit |
| Synthetic Sheets | Service-account sign-in now works (the OAuth host reached this environment): read 6/6, editable 6/6. A temporary tab was added, written, read back exactly, deleted and confirmed gone | ready |
| Protected evaluation secrets | `jev-svg-qualification.yml` run 41182891906 on main `cba1fcf` in environment `jev-svg-evaluation`: decoded sealed ZIP SHA-256 equals `93d8531d…53eaf3` without opening it, and the environment's Gateway key authenticated with GET `/v1/credits`. It ran with no review wait. Environment and secret settings APIs are refused to this integration, so the main-only branch rule rests on the owner's report | ready |
| Retention | The repository already keeps a `retention-days: 90` artifact for 90 days (fit-sweep-findings, run 41180662493, expires 2027-01-29) | ready |
| Gateway balance | Non-billable GET `/v1/credits`: balance 6.936136654, lifetime used 48.063863346. The sum (55.00) equals 29 October's, so no top-up happened; about $0.006 went to other consumers. Owner reports automatic top-up off | ready |
| Day/night continuity | Standing blockRenewal for the full 14 days recorded verbatim in start-contract.md | ready |
| Static run handoff | project.draft.json, state.draft.json, run-issue draft, start contract and launch bindings unchanged; runtime IDs are bound only from real receipts after start | ready |

## Known limits carried into the run

- The shared Gateway balance is only about $1.94 above the $5 ceiling. Production use can lower it
  during the run; row 32's receipts count other consumers' spend conservatively, as designed.
- Open SVG-area items that row 1 and row 3 must read, not fix here: #1833 (question fit changes
  after attaching quiz behavior) and quarantine PR #1834 for `e2e/import-svg-corpus.spec.ts`.
- `gh` on this proxy cannot read environment settings, secret names or the repository retention
  setting, and cannot delete branches; the evidence above uses paths that work.

No paid inference occurred. No product acceptance criterion is closed by readiness.

Start sentence, unchanged: **Start the prepared jev-svg-import run.**
