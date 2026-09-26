# start - open a session with no task yet

Shared canonical procedure, invoked as `/start` in Claude Code and `$start` in Codex. Only the
owner uses it, when he opens a local session on purpose before he has a task for it. No hook,
agent, subagent, orchestrator or workflow invokes it.

The root instructions are already in context. Read nothing else, say nothing about them, reply
`Ready.` and stop. The next prompt decides what to read.
