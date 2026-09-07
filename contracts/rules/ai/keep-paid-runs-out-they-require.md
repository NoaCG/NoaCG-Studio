---
v: 1
scope: src/ai/claudeProvider.ts, src/ai/telemetry.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-keep-paid-runs-out-they-require.md
---
Keep paid `scripts/ai-compare.mjs` and `scripts/ai-bench.mjs` runs out of CI; they require a dev server and real credentials and spend model tokens.
