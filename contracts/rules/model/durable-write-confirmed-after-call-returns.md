---
v: 1
scope: src/model/durableStore.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-durable-write-confirmed-after-call-returns.md
---
A durable write is confirmed AFTER the call returns, so a refusal is not that call's return value. A caller that branches on failure awaits `commitDurableWrites()`, which CLAIMS the message - awaiting the chain resumes on a microtask while the generic announcement is scheduled as a macrotask, so a claimer always wins - and reports it in its own words. An unclaimed failure reaches `App.tsx` as `spx-storage-error`.
