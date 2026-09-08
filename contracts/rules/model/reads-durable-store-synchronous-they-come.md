---
v: 1
scope: src/model/durableStore.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-reads-durable-store-synchronous-they-come.md
---
Reads from the durable store are SYNCHRONOUS - they come off the mirror - so no signature in this directory changed when the store moved. The ONE async step is boot: `src/main.tsx` must hydrate BEFORE it imports App, because `store/templateStore.ts` reads the autosaved project at module scope.
