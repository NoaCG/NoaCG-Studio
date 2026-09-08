---
v: 1
scope: src/blocks/animData.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-names-layers-first-become-visible-step.md
---
`reveals` names the layers that FIRST become visible in a step and `hides` the ones that LEAVE in it - the early-exit twin, ending a layer's existence span there instead of at the final Out. Both are EXPLICIT data, never inferred from keyframes. Durations and keyframe times are speed-relative: playback divides by `speed`.
