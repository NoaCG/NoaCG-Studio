---
v: 1
scope: src/components/wizard/ViewingControls.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-legibility-settings-shared-control-viewing.md
---
Keep the legibility settings ONE shared control - the viewing-target select and the two size-floor toggles are mirrors of one tri-state and interlock in the component. Render it on the AI step and the editor Style panel, NOT on the catalog walk. It is PROJECT METADATA riding `draft.legibility`, never the `:root` contract, and every AI generation resolves it into the request while the result card stamps what its request carried.
