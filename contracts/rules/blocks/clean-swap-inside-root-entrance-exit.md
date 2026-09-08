---
v: 1
scope: src/blocks/motionPresets.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-clean-swap-inside-root-entrance-exit.md
---
`applyMotionPreset` is a clean swap of the INSIDE-THE-ROOT entrance and exit only: it KEEPS `calls`, `dynamics`, `reveals`, `hides`, every layer whose element lives OUTSIDE the root, and every `loops` track on a property the motion does not write - the written track owns its property, so a loop there goes. It paces the step to the motion or to the kept content's reach, never shorter, and it CLEARS a styled lifecycle arrow, because a styled play or stop would play INSTEAD of the keyframes.
