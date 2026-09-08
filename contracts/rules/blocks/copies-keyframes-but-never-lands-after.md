---
v: 1
scope: src/blocks/animEdit.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-copies-keyframes-but-never-lands-after.md
---
`duplicateStep` copies keyframes but NOT `reveals` or `hides` and never lands after Out; `deleteStep` returns the layers it revealed to appearing with Play under the channel's default motion; `addStep` makes an empty content step just before Out, or at an explicit index clamped between the entrance and Out. `setLayerActivation` carries a layer's tuned reveal keyframes when it moves between presses and writes the channel's default motion when it enters or leaves the press world, emptied presses disappearing and default step names renumbering.
