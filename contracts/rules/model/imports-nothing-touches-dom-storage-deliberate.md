---
v: 1
scope: src/model/productionData.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-imports-nothing-touches-dom-storage-deliberate.md
---
`productionData.ts` imports NOTHING, touches no DOM and no storage, and that is deliberate twice over: `scripts/production-data.test.mjs` transpiles this ONE file to assert the rules directly, and the hosted ingress compiles the same source rather than growing a second opinion about what a write means.
