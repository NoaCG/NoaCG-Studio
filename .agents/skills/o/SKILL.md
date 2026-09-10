---
name: o
description: Alias for orchestrator - turn finished sessions' handoffs and build feedback into ordered, pasteable prompts
---

Short alias for `$orchestrator`. Read `.agent-workflows/orchestrator.md` (relative to the repo
root) now and follow it in full - that file is the canonical procedure, shared with the Claude
Code command `/orchestrator`. Nothing here overrides it. Any text the user typed after `$o` in the
invoking message is the pasted input the workflow refers to: handoff blocks from finished
sessions, owner feedback from testing the newest build, or both. If there was none, plan from
repository state alone and say so.

Then read `.agents/skills/orchestrator/SKILL.md` for the four mechanisms that procedure assumes
and this harness lacks. They live in that one file rather than being copied here, so `$o` and
`$orchestrator` can never drift into describing two different harnesses.
