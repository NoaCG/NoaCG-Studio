---
v: 1
scope: src/blocks/animData.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-per-track-loop-gsap-values-repeat.md
---
`loops` is `loops[selector][prop] = { repeat, yoyo?, repeatDelay? }`, a PER-TRACK loop in GSAP's values (repeat -1 forever, yoyo breathing back and forth) that the interpreter plays in its own repeating sub-timeline, so an ambient breath lives in the same data as every other track and the `layers` arrays are untouched.
