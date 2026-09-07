---
v: 1
scope: src/components/PreviewFrame.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-capture-stage-pan-zoom-before-overlay.md
---
Capture stage pan and zoom BEFORE the overlay, so a gesture can only ever move the VIEW and never a document element. The iframe and its overlays live in a `.canvas-world` translated by `pan` and scaled by fit times `zoom`, clamped 0.2-8x; because the overlay is sized `stageW × (fit×zoom)` and the gesture layer reads its live bounding rect, zoom and pan need NO coordinate changes there.
