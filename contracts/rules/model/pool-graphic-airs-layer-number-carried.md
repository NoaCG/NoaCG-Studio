---
v: 1
scope: src/model/shows.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-pool-graphic-airs-layer-number-carried.md
---
A pool graphic airs on a LAYER NUMBER carried on its own entry and read through `graphicLayer`, NEVER on one derived from its position in the pool: the hosted control page, the show export, the graphics pack and the production page all read that number. Two entries sharing a layer replace each other on air, which is why the production page warns about a clash rather than silently reordering.
