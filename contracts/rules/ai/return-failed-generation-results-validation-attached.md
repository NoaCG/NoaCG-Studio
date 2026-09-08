---
v: 1
scope: src/ai/claudeProvider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-return-failed-generation-results-validation-attached.md
---
Return failed generation results with validation attached and keep grounded assembly failures out of model repair. Use `GenerateOptions.validate` through `validateWith` for the general harness and surface a failing `groundedResult` as a platform defect.
