---
name: orchestrator
description: Run a wave of autonomous work through a time window - the prompt's work, then the backlog in GOALS rank, each row landed through the merge queue, with a short report
---

Read `.agent-workflows/orchestrator.md` (relative to the repo root) now and follow it in full;
it is the canonical procedure, shared with the Claude Code command of the same name. Text after
`$orchestrator` is the owner's prompt and time window.

Use the canonical cloud-delegate procedure for available native session/worktree tools,
completion events and qualified wake/fallback selection. Native subagents share a machine;
each row needs its own worktree and absolute command working directory.
