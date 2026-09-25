---
v: 1
scope: scripts/hooks/guard-question.mjs, .agent-workflows/orchestrator.md, .agent-workflows/orchestrator/**, .claude/agents/**
kind: invariant
fires: hook:guard-question
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-question-owner-names-reason-own-text.md
---
Sort a question before asking it. Decide operational matters yourself - branch order, sequencing, whether necessary work gets done, anything the repo can answer. Ask the owner before building only when his choice changes the outcome - intent, direction, UX or taste, scope, money - one question at a time, with your recommendation and any better alternative. In an orchestrator or night wave, ask nothing: decide, record it where he can revert it, and keep working.
