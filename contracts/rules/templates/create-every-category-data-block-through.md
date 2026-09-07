---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-create-every-category-data-block-through.md
---
Create every category with a `NOACG_ANIM` data block through `convertToDataRegion`, using `CategorySpec.dataRegion` for standard assembly and a direct call for self-assembled categories. Convert only the marked animation region, preserving design-owned runtime outside it and retaining valid legacy output if conversion fails.
