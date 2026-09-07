---
v: 1
scope: api/_lib/aiGateway.ts, api/_lib/aiLiteProfile.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-pin-managed-calls-preserve-task-requires.md
---
Pin `disallowPromptTraining` on for managed calls and preserve `zeroDataRetention` when the task requires it; fail closed with `zdr_unavailable` rather than silently weakening retention. Bound funded costs through approved-catalog pricing and task booking because the gateway has no per-request price cap.
