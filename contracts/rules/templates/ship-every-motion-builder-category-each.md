---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-ship-every-motion-builder-category-each.md
---
Ship every motion builder for a category in each of its templates so changing a preset only changes the data's `build` name. Accept `(target, opts)` with defaulted `{speed, ease}` options for legacy callers and allow builders to compose other builders.
