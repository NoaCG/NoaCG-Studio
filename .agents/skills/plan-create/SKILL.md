---
name: plan-create
description: Set up a plan run from a spec - project, owner authorization, run kit with brief templates, run issue, heartbeat and check-in - then hand over to /plan-run
---

Read `.agent-workflows/plan-create.md` (relative to the repo root) now and follow it in full;
it is the canonical procedure, shared with the Claude Code command of the same name. Text after
`$plan-create` names the plan and, when given, the owner's finite deadline. It records the owner's
authorization and standing permissions verbatim, launches no phase, and hands over to `$plan-run`.
