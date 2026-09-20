---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-19
record: contracts/records/templates/2026-09-19-run-factory-gate-before-queueing-catalog.md
---
Run the factory gate before queueing a catalog branch: enqueue `node scripts/factory.mjs` with the rest of the battery `npm run catalog:affected` prints. It is CI's own Factory gates job and checks what no sweep does, so a green battery without it can still be refused at the merge.
