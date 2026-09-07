---
v: 1
scope: src/ai/safety.ts, src/ai/claudeProvider.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-wrap-injected-validator-findings-reach-repair.md
---
Wrap the injected validator with `withSafetyChecks` so findings reach repair, and screen displayed results again with `mergeSafety` because `generateRaw` bypasses that validator. Pass the modify/convert `source` to preserve pre-existing construct categories; fresh generation passes no source.
