---
v: 1
scope: src/ai/claudeProvider.ts, src/ai/structuralIntent.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-run-before-design-call-using-fast.md
---
Run `intentAndRoute` before the design call in `generate` and `generateAlternatives`, using `emit_structural_intent` on the fast model and deterministic `normalizeIntent`/`routeIntent`. Skip that stage for explicit `adapt`, Lite, raw and modify.
