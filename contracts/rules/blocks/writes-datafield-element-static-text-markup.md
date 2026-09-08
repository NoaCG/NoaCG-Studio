---
v: 1
scope: src/blocks/edit.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-writes-datafield-element-static-text-markup.md
---
`setFieldDefault` writes the DataField `value` AND the element's static text in the markup, so the pre-play preview and the hidden-source categories stay in sync; `setFieldTitle` changes only the operator-facing label and the layer metadata, never the element id - every binding, rule and keyframe track hangs off that id.
