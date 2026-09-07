---
v: 1
scope: src/ai/spec/**, src/ai/claudeProvider.ts, src/ai/provider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-carry-through-typed-data-preserving-model.md
---
Carry `GenerationSpec` through `GenerateContext.spec` as typed data, preserving its model-layer persistence as `aiSpec`. Let `specIsEmpty` make empty setup inject nothing through `specSections`, so prompt-only callers retain the same prompt.
