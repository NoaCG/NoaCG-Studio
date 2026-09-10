---
name: orchestrator
description: Orchestrate the day's work - turn finished sessions' handoffs and build feedback into ordered, pasteable prompts
---

Read `.agent-workflows/orchestrator.md` (relative to the repo root) now and follow it in full -
that file is the canonical procedure, shared with the Claude Code command of the same name.
Nothing here overrides it; what follows only names mechanisms it assumes and this harness lacks.
Any text the user typed after `$orchestrator` in the invoking message is the pasted input the
workflow refers to: handoff blocks from finished sessions, owner feedback from testing the newest
build, or both. If there was none, plan from repository state alone and say so.

**The four it assumes**, measured 2026-09-10 (`docs/metrics/2026-09-10-orchestrator-in-codex.md`).
Do everything around each, and say which one bit in the section the procedure puts it in.

- **No Agent tool.** This session cannot launch a row, so the core's "this session LAUNCHES its own
  rows" has no arm here: section 5's prompts are what the USER pastes into sessions he opens.
- **No Monitor.** No watch loop, no refill, no follow-on rows (`orchestrator/night.md`), and the
  morning report comes from re-invoking this workflow (`orchestrator/report.md`).
- **No network.** `gh` cannot run, so a landing refusal and the morning CI verdict are reported
  UNCHECKED rather than asserted from a local file.
- **Writes reach only the directory this session started in.** The wave-state store lives under the
  primary checkout's `.git`, so from a worktree the plan file cannot be written and
  `wave-plan-check.mjs` cannot run. Say so, and give the user the plan text itself.
