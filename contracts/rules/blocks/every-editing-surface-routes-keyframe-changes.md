---
v: 1
scope: src/blocks/animEdit.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-every-editing-surface-routes-keyframe-changes.md
---
Every editing surface routes keyframe changes through `animEdit`'s pure mutators - `setKeyframe`, `deleteKeyframe`, `moveLayerKeyframes`, `deleteLayerKeyframes`, `moveKeyframe`, `setKeyframeEase`, `setStepEase`, `setLayerActivation` - and then `spliceAnimData` plus one `applyTemplate` makes the edit real, undoable code.
