---
v: 1
scope: src/blocks/machineEdit.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-deliberately-creates-pose-off-hold-legitimate.md
---
`addState` deliberately creates a POSE - Off and a hold are legitimate states - and attaching content is an explicit act through `setStateTimeline`, which gives an off-path state its own inline timeline or takes it away. `addState`/`deleteState` are OFF-PATH only and the initial state never goes; `addGroup`/`removeGroup` never remove main; `setStatePosition` writes the additive `at` field.
