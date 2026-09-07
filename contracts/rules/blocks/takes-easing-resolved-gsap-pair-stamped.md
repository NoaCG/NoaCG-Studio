---
v: 1
scope: src/blocks/presetApply.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-takes-easing-resolved-gsap-pair-stamped.md
---
`applyPresetData` takes an easing resolved to a GSAP pair and stamped onto the written keyframes so it never disturbs a shared step, plus an optional per-direction duration that sets the target step's length and scales the donor keyframes to fit. 'in' is layer-relative and targets the step where THAT layer becomes active, 'out' always targets the final step, and 'both' writes both, independently editable after.
