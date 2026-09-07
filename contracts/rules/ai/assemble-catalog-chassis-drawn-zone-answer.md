---
v: 1
scope: src/ai/retrieval.ts, src/ai/designSpec.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-assemble-catalog-chassis-drawn-zone-answer.md
---
Assemble a catalog chassis at its drawn zone with `AssembleOptions.keepChassisZone`; answer side requests through `variant.defaultZone` in retrieval rather than design-name text. Use a differently anchored catalog member when the requested side changes.
