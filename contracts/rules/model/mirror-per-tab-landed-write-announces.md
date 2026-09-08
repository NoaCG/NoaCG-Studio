---
v: 1
scope: src/model/durableStore.ts
kind: trap
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-mirror-per-tab-landed-write-announces.md
---
The mirror is PER TAB, so a landed write ANNOUNCES its key over `BroadcastChannel` and the other tabs re-read that one key and dispatch `spx-data-changed`. Every mutator in this directory is a read-modify-WHOLE-RECORD write, so a tab holding a mirror from before another tab's write puts that old record straight back. It CLOSES the hazard rather than eliminating it: the re-read is async. `e2e/cross-tab.spec.ts` pins it, and reads back from a THIRD, fresh tab.
