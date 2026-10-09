---
name: plan-run
description: Run a long plan phase by phase until a time limit - each phase built by one fresh session, checked on main by another, and the next phase only after the check passed
---

Read `.agent-workflows/plan-run.md` (relative to the repo root) now and follow it in full;
it is the canonical procedure, shared with the Claude Code command of the same name. Text after
`$plan-run` names the plan and the time limit.

Builders and checkers are native subagents started without your context. A subagent shares your
directory, so give each one its own `git worktree add` worktree and make that absolute path every
command's working directory. Arm a thread heartbeat as the fallback wake before the first launch;
never promise a wake-up you did not arm.
