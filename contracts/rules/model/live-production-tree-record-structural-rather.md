---
v: 1
scope: src/model/productionState.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-live-production-tree-record-structural-rather.md
---
The live production tree is NOT on the `Show` record, and this is structural rather than remembered: that record syncs record-level last-write-wins with conflict copies that DROP the production's slugs, so per-tick writes would unpublish a live production. The tree is plain localStorage keyed by show id, never synced, and deliberately NOT in the durable IndexedDB queue. `Show.data` is the authored SEED only, written by one deliberate act - there is no other door onto the record.
