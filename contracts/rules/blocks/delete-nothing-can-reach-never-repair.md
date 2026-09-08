---
v: 1
scope: src/blocks/registry.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-delete-nothing-can-reach-never-repair.md
---
Delete a `BuildingBlock` nothing can reach; never repair one, and never add a second implementation of playout logic beside an existing one. A countdown wanted here again is `templates/shared/clock.ts`'s deadline runtime, not a second copy of the idea. Reachability is whatever `src/ai/stubProvider.ts` actually passes to `block(...)`, so read that file before calling an entry dead.
