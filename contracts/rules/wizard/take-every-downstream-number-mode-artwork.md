---
v: 1
scope: src/components/wizard/import/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-take-every-downstream-number-mode-artwork.md
---
Take every downstream number in `design` mode from the artwork INTRINSIC pixel size. Offer Create from the Design step on, so every later step is an optional stop. Field specs live in `draft.designFields` in DESIGN pixels and become real placed fields at build through `withDesignFieldSpecs`, so wizard placement, editor, preview and export agree by construction.
