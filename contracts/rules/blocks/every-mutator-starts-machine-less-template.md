---
v: 1
scope: src/blocks/machineEdit.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-every-mutator-starts-machine-less-template.md
---
Every `machineEdit` mutator is `(data) => data | null` and starts from `withExplicitMachine`, so a machine-less template's first graph edit MATERIALIZES the derived machine into the literal - behaviourally a no-op at that moment. The caller makes it real through `writeAnimData` plus ONE `applyTemplate`.
