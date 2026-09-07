---
v: 1
scope: src/templates/shared/animRuntime.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-process-events-through-serial-queue-apply.md
---
Process `noacgDispatch` events through one serial queue and apply a flat field payload only after its structural guard accepts. Make `noacgSnap(assignments, opts?)` replay the canonical path instantly with callbacks suppressed, using `null` to restore every group's initial visual state while leaving data reset to `update()`, and expose state through `noacgMachineState()`.
