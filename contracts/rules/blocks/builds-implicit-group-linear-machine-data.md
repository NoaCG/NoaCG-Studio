---
v: 1
scope: src/blocks/animMachine.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-builds-implicit-group-linear-machine-data.md
---
`deriveMachine` builds the implicit ONE-GROUP linear machine for data with no `machine` key - states named after the steps, a synthesized pose-only `off`, a `next` arrow along the path, and the walk's entrance and exit MATERIALISED as `lifecycle` transitions. It is derived on read and NEVER persisted. `lifecyclePair` and `rehomeLifecycleEdges` are the canonical-seat rule and the re-seater the step mutators call, so a styled stop edge survives path edits.
