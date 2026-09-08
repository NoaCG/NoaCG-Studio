---
v: 1
scope: src/model/durableStore.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-saved-documents-live-indexeddb-behind-synchronous.md
---
The saved documents live in IndexedDB behind a synchronous in-memory mirror, and this module is the one place that decides it. `DURABLE_KEYS` is the EXPLICIT list of what moved - it is a list rather than an `spx-gfx-` prefix rule so moving a key stays a decision with its hydration-order consequence thought through. Everything else (prefs, layout, doc kind, brand, AI settings, sync metadata) stays in localStorage: it is read before hydration by design and seeded by E2E init scripts that cannot reach IndexedDB.
