---
v: 1
scope: src/ai/claudeProvider.ts, src/ai/designSpec.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-pass-assembly-policy-arguments-never-infer.md
---
Pass `keepChassisZone` and `sizeScaleRange` as assembly policy arguments to `groundedResult`, never infer Lite from `profile` inside it. Keep compilation clamps aligned with the caller's declared schema.
