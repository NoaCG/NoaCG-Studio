---
v: 1
scope: src/blocks/animEval.ts
kind: trap
fires: contract
status: active
since: 2026-09-28
supersedes: blocks/deliberately-only-logic-duplicated-runtime-interpreter
record: contracts/records/blocks/2026-09-28-duplicates-only-interpreter-timeline-semantics-first.md
---
`animEval` duplicates only the interpreter's TIMELINE semantics - the first keyframe holds backward to the step start, a missing track inherits an earlier step's last value, a looping track folds its time - and takes every CURVE from the shared ease source `templates/shared/easeRuntime.ts`, the text the interpreter emits, so its eased in-between is the rendered value and opacity stays in 0..1 as the renderer keeps it. Never port a curve into TypeScript: add it to the shared source, where `scripts/ease-runtime.test.mjs` pins it to the bundled GSAP.
