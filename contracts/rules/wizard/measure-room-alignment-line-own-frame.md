---
v: 1
scope: src/components/wizard/import/**, src/templates/importedDesign/**
kind: trap
fires: contract
status: active
since: 2026-11-10
supersedes: wizard/measure-line-room-alignment-line-own
record: contracts/records/wizard/2026-11-10-measure-room-alignment-line-own-frame.md
allow-numbers: true
---
Measure room and alignment in the LINE's own frame, never the box's: svgAlignOf maps the plate INTO the line's system through svgLocalBox and measures there, so any surface reading the same answer has to use the same frame. On an axis the block is CENTRED on, the gap the designer left is half the centring rather than a margin, so the margin kept there is typographic - half the drawn type sideways, half a line vertically - except that a centred FIGURE (a score, a clock) keeps no sideways margin beyond its own glyphs, so it holds its drawn size while its plate holds it.
