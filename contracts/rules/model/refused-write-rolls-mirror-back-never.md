---
v: 1
scope: src/model/durableStore.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-refused-write-rolls-mirror-back-never.md
---
A refused write ROLLS THE MIRROR BACK and never latches. The library must not go on serving an edit no reload would reproduce, and a store-is-full flag that short-circuits the next write deadlocks exactly the write that would clear it.
