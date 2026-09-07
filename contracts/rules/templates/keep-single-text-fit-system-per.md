---
v: 1
scope: src/templates/shared/textFit.ts, src/templates/importedDesign/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-single-text-fit-system-per.md
---
Keep a single text-fit system per imported graphic. Detect `SVG_TEXT_FIT_MARKER` and leave SVG designs to their fit ladder instead of injecting the raster `ensureTextFitRuntime`.
