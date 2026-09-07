---
v: 1
scope: src/templates/shared/stageFit.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-measure-stage-reserves-layout-dimensions-never.md
---
Measure stage reserves from layout dimensions, never visual bounding rects. Keep the shipped inline `height` and `min-height` reserves stable across recalibration and webfont changes, and verify with `e2e/stage-fit-determinism.spec.ts`.
