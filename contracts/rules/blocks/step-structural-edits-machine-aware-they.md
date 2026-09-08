---
v: 1
scope: src/blocks/animMachine.ts, src/blocks/animEdit.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-step-structural-edits-machine-aware-they.md
---
Step-structural edits - `addStep`, `deleteStep`, `duplicateStep`, `setLayerActivation`, `renameStep` - are MACHINE-AWARE: they move the bound waypoint with the step and CARRY the walk's arrows across the change, and they are the ONLY way waypoints are added or removed. `reconnectPath` mints a plain `next` only for genuinely new pairs, and `syncWaypointNames` syncs names one way.
