---
v: 1
scope: src/model/durableStore.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-browser-indexeddb-holding-database-written-newer.md
---
A browser with no IndexedDB, or one holding a database written by a NEWER build, degrades to localStorage with the old ceiling rather than crashing or downgrading anybody's data. The durable store does not replace the Supabase backend either - that is the server layer an account unlocks, and the product wants both.
