---
v: 1
scope: src/ai/settings.ts, src/ai/modelCatalog.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-choose-fallback-entries-successful-real-calls.md
---
Choose fallback entries in `AI_MODELS` from successful real calls, not model listings alone; a listed id is no proof that an account can use it. Preserve account-availability failures as actionable errors rather than claiming discovery can filter them away.
