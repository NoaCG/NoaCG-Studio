---
v: 1
scope: src/model/contentHash.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-fnv-content-hash-template-three-sources.md
---
`sourceHash({html, css, js})` is the FNV content hash of a template's three sources, recorded in a dual package's `v_noacg.sourceHash` so a generated OGraf half can be told STALE from fresh (`export/targets/ografImport.ts`). `importTemplate.ts` peeks the same block on a zip import: the shallowest `*.ograf.json`'s `v_noacg.type` restores the graphic TYPE, falling back to `blank`, and its stale flag rides on the result.
