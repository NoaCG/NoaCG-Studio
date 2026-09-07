---
v: 1
scope: src/ai/lite/types.ts, src/ai/pro/types.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-keep-dependency-light-browser-api-typescript.md
---
Keep `lite/types.ts` and `pro/types.ts` dependency-light so browser and API TypeScript trees can share the wire vocabulary; do not import catalog or DOM-bearing model modules into them.
