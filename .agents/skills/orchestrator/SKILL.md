---
name: orchestrator
description: Run a wave of autonomous work through a time window - the prompt's work, then the backlog in GOALS rank, each row landed through the merge queue, with a short report
---

Read `.agent-workflows/orchestrator.md` (relative to the repo root) now and follow it in full;
it is the canonical procedure, shared with the Claude Code command of the same name. Text after
`$orchestrator` is the owner's prompt and time window.

Rows are native subagents. A subagent shares your directory, so give each row its own
`git worktree add` worktree and make that absolute path every command's working directory. For
an unattended wave, arm a thread heartbeat as the fallback wake before the first launch; never
promise a wake-up you did not arm.
