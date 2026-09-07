---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-declare-fixed-footprints-through-emit-them.md
---
Declare fixed footprints through `stageWidth` and emit them through `stageBoxCss` and `stageExtraJs`, including the `--stage-width` marker. Measure width and height through `scripts/footprint-stability-sweep.mjs` and its marker-selected gate; do not substitute a `min-width` floor for a stable stage.
