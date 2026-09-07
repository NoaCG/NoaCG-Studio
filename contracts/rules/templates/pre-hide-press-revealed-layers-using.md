---
v: 1
scope: src/templates/shared/animRuntime.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-pre-hide-press-revealed-layers-using.md
---
Pre-hide press-revealed layers using their first reveal keyframes, falling back to zero opacity, and show or hide the CSS-hidden root through the lifecycle. Fade press-revealed layers outside the root on exit unless the Out step animates them, run `loops` in a separate repeating timeline, and divide durations and keyframe times by `speed`.
