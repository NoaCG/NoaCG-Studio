---
v: 1
scope: src/blocks/animEdit.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-steps-clips-preserve-mode-keeps-keyframe.md
---
Steps are CLIPS: `resizeStep` in 'preserve' mode keeps keyframe timing - extending leaves settled air, shrinking clamps at the last keyframe so motion never silently truncates - and 'stretch' (Alt) scales times proportionally. `setLayerHide` is the early-exit twin, writing or clearing a step's `hides` for a layer, clamped after its activation and cleared when hiding at Out, driven by the timeline block's RIGHT edge.
