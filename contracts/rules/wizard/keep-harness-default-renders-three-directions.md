---
v: 1
scope: src/components/wizard/steps/ai/**, e2e/ai.spec.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-harness-default-renders-three-directions.md
---
Keep the harness ON by default. On, it renders three directions as picker cards - a live MiniPreview of each built template plus its design words and a pass or fail mark. Off, it is one shot with static validation and no bench. Conversion of an imported template always runs the validated flow regardless of the checkbox.
