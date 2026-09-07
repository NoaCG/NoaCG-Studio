---
v: 1
scope: src/blocks/animEval.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-strings-interpolate-too-both-keyframes-have.md
---
STRINGS interpolate too when both keyframes have the same shape - the numbers inside them lerp in place, which is what GSAP does at runtime - so the Inspector tracks the preview instead of stepping, and it is written generically so clipPath mask-wipes benefit identically. Differently-shaped strings hold the previous keyframe; a step without the track inherits the last keyframe value from an earlier step; null means the layer's design CSS state. A LOOPING track folds the query time back into one pass through `loopedTime`.
