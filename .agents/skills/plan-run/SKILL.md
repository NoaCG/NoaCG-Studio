---
name: plan-run
description: Run a long plan phase by phase until a time limit - each phase built by one fresh session, checked on main by another, and the next phase only after the check passed
---

Read `.agent-workflows/plan-run.md` (relative to the repo root) now and follow it in full;
it is the canonical procedure, shared with the Claude Code command of the same name. Text after
`$plan-run` names the plan and the finite owner-authorized project deadline.
Preserve its continuing identity across bounded work blocks; use the canonical supervisor
authority for phase admission, pause and resume. Never renew scope or deadline on restart.

Qualify coordinator and fresh worker execution with the canonical preflight before substantive
work. Follow cloud-delegate for provider-native launches; same-VM subagents share a machine and
are not cloud workers. Give each worker its own worktree and absolute command working directory.
An armed heartbeat is a fallback check-in; claim durable recovery only after a supported wake
actually resumes the coding context with the required access.
