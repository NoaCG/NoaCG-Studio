---
v: 1
scope: src/model/shows.ts
kind: invariant
fires: contract
status: active
since: 2026-11-10
supersedes: model/pool-graphic-airs-layer-number-carried
record: contracts/records/model/2026-11-10-air-pool-graphic-layer-number-carried.md
---
Air a pool graphic on a LAYER NUMBER carried on its own entry and read through `graphicLayer`, NEVER on one derived from its position in the pool: the production page, the show export and the graphics pack all read that number. Two entries sharing a layer replace each other on air, which is why the production page warns about a clash rather than silently reordering.
