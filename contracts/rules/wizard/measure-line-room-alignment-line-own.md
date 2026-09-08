---
v: 1
scope: src/components/wizard/import/**, src/templates/importedDesign/**
kind: trap
fires: contract
status: active
since: 2026-09-08
record: contracts/records/wizard/2026-09-08-measure-line-room-alignment-line-own.md
---
Measure a line's room and its alignment in the LINE's own frame, never the box's: svgAlignOf maps the plate INTO the line's system through svgLocalBox and measures there, so any surface reading the same answer has to use the same frame. And on an axis the block is CENTRED on, the gap the designer left is half the centring rather than a margin, so the margin kept there is typographic - half the drawn type sideways, half a line vertically.
