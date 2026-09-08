---
v: 1
scope: src/ai/structuralIntent.ts, src/ai/retrieval.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-use-shared-vocabulary-variant-satisfaction-keep.md
---
Use `src/templates/structuralAnchor.ts` as the shared vocabulary for `resolveAnchor`, `structuralFit`, `intentCoversFrame` and variant satisfaction; keep `GraphicType.structuralScope` authoritative for excluded structures. Do not create an AI-owned copy that validation would need to import.
