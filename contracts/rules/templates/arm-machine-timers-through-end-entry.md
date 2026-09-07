---
v: 1
scope: src/templates/shared/animRuntime.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-arm-machine-timers-through-end-entry.md
---
Arm machine timers through `gsap.delayedCall` from a `tl.call` at the end of the entry timeline, never through `setTimeout`. Keep timer arming subject to GSAP callback suppression.
