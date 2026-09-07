---
v: 1
scope: src/blocks/stepAssign.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-appears-press-transition-shared-timeline-layer.md
---
`changePartPress` is the ONE appears-on-press transition, shared by the timeline's layer-block drag in `StepTimeline`, the Inspector's appears control, and the canvas chip. A press is just data - a step's `reveals` - so there is ONE path, routed through animEdit's `setLayerActivation` plus the SPX steps re-sync; it returns null on a legacy region, which has no editable press chain at all.
