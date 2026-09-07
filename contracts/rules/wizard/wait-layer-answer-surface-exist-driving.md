---
v: 1
scope: src/components/wizard/WizardPreview.tsx, e2e/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-wait-layer-answer-surface-exist-driving.md
---
Wait for a LAYER to answer through `awaitPickable`, not for the surface to exist, when driving the artwork canvas. A pointer is a ONE-SHOT and the rects arrive a frame after the document commits.
