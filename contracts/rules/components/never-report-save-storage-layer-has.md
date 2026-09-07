---
v: 1
scope: src/components/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-never-report-save-storage-layer-has.md
---
NEVER report a save the storage layer has not agreed to. The saved documents live in IndexedDB behind a synchronous mirror (`model/durableStore.ts`) which ACCEPTS a write and confirms it a moment later, so the value a model mutator returns means accepted, not landed. A surface that tells the reader anything about the outcome must `await commitDurableWrites()` first and CLAIM the message, and a flow that CONTINUES on success must await BEFORE the next step or it builds half a thing on a save that did not happen.
