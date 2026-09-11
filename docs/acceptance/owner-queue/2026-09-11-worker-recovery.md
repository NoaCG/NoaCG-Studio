---
kind: agent
date: 2026-09-11
---
# Recover a worker without duplicating its work

Route: read `.agent-workflows/orchestrator/hosts.md`, then run
`node --test scripts/claude-run.test.mjs` in this feature worktree.

Status now distinguishes the supervisor from its worker and treats a missing recorded worker
PID as unknown. Presence never proves ownership or releases an unconfirmed termination lock.
The old boolean field remains compatible. Each PID is sampled once per status read.

Antigravity Gemini wrote the regression and implementation using its existing worktree grants.
The regression failed before the fix. Its Sonnet pool reviewed the three changed source/doc
files against `675b118332c2ad79ab9b9b0ee934345211625d95`; scope matched. The coordinator corrected
one lint error and a reproduced duplicate PID sample, and simplified repeated wording.
An unproven timeout-race proposal was not implemented: pipe closure cannot prove descendants dead.
Final review and simplification were inline over all four changed files. `npm run build`
passed: 1,614 script tests passed, one skipped; typecheck, lint, production build and secret
scan passed. Shared-instruction and owner-queue checks passed. No graphic appearance changed.

Live Claude CLI 2.1.268 probes completed a read-only review and background task using Claude Max.
Background `95e65c41` resumed under the same identity only after the old process exited;
resuming sooner created copies `4587eca4` and `657ee2e2`. All owned probes were stopped.
Antigravity also completed a read-only code review and these scoped writes from Codex.

Next acceptance: one small production assignment, one refill and coordinator recovery with a
fixed deadline. This change does not claim an entire unattended shift or exhaust either pool.
