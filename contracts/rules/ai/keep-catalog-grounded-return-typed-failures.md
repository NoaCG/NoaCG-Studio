---
v: 1
scope: src/ai/claudeProvider.ts, src/ai/lite/contract.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-keep-catalog-grounded-return-typed-failures.md
---
Keep `profile: 'lite'` catalog-grounded and return typed `LiteRequestError` failures for unsupported raw generation, import conversion or code repair; never silently fall back to a more expensive coder. Keep `normalizeLiteSpec` pinned to catalog fit with no `flourish`.
