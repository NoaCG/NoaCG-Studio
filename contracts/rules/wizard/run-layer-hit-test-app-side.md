---
v: 1
scope: src/components/wizard/WizardPreview.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-run-layer-hit-test-app-side.md
---
Run the layer hit-test APP-SIDE against the pushed rects, because the iframe has no allow-same-origin, and tie-break as the editor canvas does: innermost by depth, then smallest box. Hold both handlers in a REF, never in state.
