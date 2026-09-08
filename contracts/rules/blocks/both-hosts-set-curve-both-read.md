---
v: 1
scope: src/blocks/motionPresets.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-both-hosts-set-curve-both-read.md
---
Both hosts SET the curve and both read it back FROM THE CODE: `easesForChoice(easingId)` is the `{easeIn, easeOut}` override handed to `applyMotionPreset` - 'auto' overrides nothing, so each motion keeps its tuned pair - and `currentMotionEasing` is its inverse, mapping the ease stamped on every phase's landing keyframes back to an `EasingId`, where all phases must agree and anything the list cannot name reads 'auto'. A motion that cannot SHOW the held curve drops it to Auto (`easingLegalForMotions`).
