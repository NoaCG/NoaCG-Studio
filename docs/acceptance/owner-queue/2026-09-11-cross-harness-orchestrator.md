---
kind: agent
date: 2026-09-11
---
# The same useful shift from either coordinator

## Route, under a minute

Open `.agent-workflows/orchestrator/hosts.md` and
`docs/metrics/2026-09-11-cross-harness-orchestrator.md` in this branch. From its worktree run:

```
npm run check:shared-instructions
claude auth status
```

The first command checks the shared Claude/Codex workflow; the second is only an auth preflight.
Once authentication is available, use one useful bounded Claude review from Codex and verify its
actual result, then a requested `$o` shift with an explicit ten-hour window. Claude `/o` keeps its
Agent/Monitor path. The implementation task does not start a ten-hour development wave by itself.

## What to verify

- The coordinator launches the selected pools without asking the owner to paste each prompt.
- Every implementation row has its own branch/worktree and a recorded worker identity.
- Unknown ownership or expired login is reported; neither becomes duplicate work or a false success.
- The saved start/end survive resumption. Refill serves current goals and stops when useful work,
  capacity or time is exhausted. The report distinguishes new outcomes, repair work and landing wait.
- Every finished row uses the existing GitHub merge queue; no worker pushes main directly.

Local tests cover scheduling bounds, path refusals and the foreground worker lifecycle. Native
Claude reached an expired login in the initial live probe. A successful authenticated review,
background resume, and an entire unattended shift are still acceptance work, not claimed complete.
