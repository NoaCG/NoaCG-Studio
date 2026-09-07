---
v: 1
scope: src/blocks/designLayout.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-pure-transform-emitting-mask-wrapper-plus.md
---
`addPlacedLine` is ONE pure transform emitting the mask wrapper plus span, the placement and type rules in the assembler's exact idiom, and the SPX DataField - no JS change, because `update()` binds by id. The element lands after the unit's last mask or the artwork's END, after `</svg>` for an inlined SVG and never inside it; new lines stack under the lowest existing line, inherit its look, and default to `shrink` with the room to the artwork's right edge.
