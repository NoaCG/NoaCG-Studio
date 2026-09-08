---
v: 1
scope: src/blocks/timelineLens.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-strips-way-they-ordered-walk-mechanics.md
---
`lensWrite` STRIPS `reveals` and `hides` on the way in - they are the ordered walk's mechanics and `isAnimStepShape(_, false)` refuses them on an inline timeline. The timeline target lives in `templateStore`, never in a component: the Inspector resolves values against the same projection.
