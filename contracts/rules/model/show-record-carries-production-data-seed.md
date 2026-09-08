---
v: 1
scope: src/model/shows.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-show-record-carries-production-data-seed.md
---
A show record carries the production-data SEED (`data`) and the field BINDINGS (`bindings`), both additive optional. The LIVE tree is deliberately NOT on this record - see `productionState.ts` for why - and `data` is written by one deliberate authoring act, never per tick.
