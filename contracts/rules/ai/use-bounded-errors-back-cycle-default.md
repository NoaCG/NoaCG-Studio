---
v: 1
scope: src/ai/shared/repairLoop.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-use-bounded-errors-back-cycle-default.md
---
Use `repairLoop` for the bounded errors-back cycle, with `MAX_REPAIR_ROUNDS` as its default budget and revalidation after every emit. Inject each caller's blocking policy while sending the complete current error list to `reEmit`; return the final validation even when repair fails.
