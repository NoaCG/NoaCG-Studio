---
v: 1
scope: src/assets/svgImport.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-three-rules-svg-reader-load.md
---
Keep three rules in the SVG reader load-bearing: a `<tspan>` is a LINE or a KERNED RUN and only the measured GAP tells them apart; hidden layers and `<defs>` or `<symbol>` text are never offered; and outline rows are RANKED by whether the shapes read as type, never filtered out.
