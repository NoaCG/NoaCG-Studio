---
name: orchestrator
description: Orchestrate the day's work - turn finished sessions' handoffs and build feedback into ordered, pasteable prompts
---

Read `.agent-workflows/orchestrator.md` (relative to the repo root) now and follow it in full -
that file is the canonical procedure, shared with the Claude Code command of the same name, and
nothing here overrides it. Any text the user typed after `$orchestrator` is the pasted input the
workflow refers to: handoffs from finished sessions, owner feedback on the newest build, or both.
With none, plan from repository state alone and say so.

Load `.agent-workflows/orchestrator/hosts.md` before grounding. It distinguishes a native Codex
coordinator from a Codex worker launched through Claude's plugin; the worker's measured sandbox
does not describe the coordinator. Probe the current session instead of assuming capabilities.

Use available native subagents for Codex rows, the Claude CLI bridge for Claude rows, and the
existing Antigravity wrapper with grants covering the assigned worktree. Every implementation
row owns a separate feature worktree. A native subagent shares its parent's directory unless
explicitly directed to that worktree; do not assume automatic isolation.

An unattended request uses the same bounded candidate/refill procedure on either host. Native
waits keep an active turn running; a supported thread heartbeat can resume between turns from
the durable plan. Never promise a wake-up without arming and recording its actual mechanism.
