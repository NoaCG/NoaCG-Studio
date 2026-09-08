---
v: 1
scope: src/blocks/animEval.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-deliberately-only-logic-duplicated-runtime-interpreter.md
---
`animEval` is DELIBERATELY the only logic duplicated from the runtime interpreter - the preview runs the real one - so keep it tiny and keep it in parity. Within a step the first keyframe holds backward to the step start; between keyframes numbers interpolate LINEARLY, since the eased in-between is the preview's job and at keyframe times the two agree exactly.
