---
v: 1
scope: src/components/wizard/ViewingControls.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-legibility-settings-shared-control-viewing.md
---
Keep the legibility settings ONE shared control, `ViewingControls`: the viewing target, and the size floors drawn as three radios over the one tri-state `LegibilityFloors`. Render it on the AI step, NOT on the catalog walk. It is PROJECT METADATA riding `draft.legibility`, never the `:root` contract, and every AI generation resolves it into the request while the result card stamps what its request carried.
