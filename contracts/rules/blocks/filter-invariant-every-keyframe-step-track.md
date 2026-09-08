---
v: 1
scope: src/blocks/filterTrack.ts, src/blocks/animEdit.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-filter-invariant-every-keyframe-step-track.md
---
THE FILTER INVARIANT: every keyframe in a step's `filter` track must list the SAME functions in the SAME order, which is what lets the runtime tween `filter` as a plain string with NO interpreter special-case. `normalizeFilterTrack` enforces it, filling a keyframe's missing functions with their identity. Write through animEdit's `setFilterComponent`, never `setKeyframe('filter', ...)` directly.
