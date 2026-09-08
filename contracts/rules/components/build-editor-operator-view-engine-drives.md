---
v: 1
scope: src/components/ControlPanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-build-editor-operator-view-engine-drives.md
---
Build the in-editor operator view from the `control/` engine with `live` on: it drives the preview through `store.sendControl`, renders the machine's EVENT BUTTONS from `controlModel` (labels, sections and payloads from `machine.controls`, payload values from sample data through `store.sendEvent`), and greys them with `isEventLegal` against `store.machineGroups` exactly as a hosted control page greys them. An `adjust` press writes its new figure back into the sample data.
