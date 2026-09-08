---
v: 1
scope: src/blocks/designLayout.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-read-write-placed-line-whole-look.md
---
`lineTextStyle`/`setLineTextStyle` read and write a placed line's whole LOOK on the span's `#fN` rule - font-family (a bundled font id, the design font, or 'custom' when hand-written; picking a bundled face also ships its `@font-face`, deduped by the emitted rule), font-size, weight, color, line-height, letter-spacing - plus the anchor as the wrapper's `translateX` shift on `#fwN`. Every write is a `setCssDeclaration` patch in the rule's own idiom, so the canvas gestures and these controls stay one language.
