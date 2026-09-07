---
v: 1
scope: src/ai/structuralIntent.ts, src/ai/claudeProvider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-honor-explicit-values-let-choose-create.md
---
Honor explicit `GenerateOptions.mode` values; let `auto` choose CREATE from evidenced originality, unresolved structure, low confidence or `intent.beyondScope`. Narrow the tool with `narrowFitTool` when routing requires it and retain the decision in `AiTemplateChange.routing`, `intent` and telemetry.
