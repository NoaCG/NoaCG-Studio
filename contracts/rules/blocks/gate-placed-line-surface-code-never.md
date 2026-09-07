---
v: 1
scope: src/blocks/designLayout.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-gate-placed-line-surface-code-never.md
---
Gate the placed-line surface on the CODE, never the category: a line is PLACED when its parent carries an id whose rule holds readable `left`+`top` px values, so a hand-written template with that shape opts in and catalog templates (mask divs without ids) never match. `placedLines(html, css)` derives the map on every call and is never stored. The canvas drag for a placed line goes through `placeLine` (placement), and that line is excluded from the position-KEYFRAME drag and from the keyframe scale and rotate handles.
