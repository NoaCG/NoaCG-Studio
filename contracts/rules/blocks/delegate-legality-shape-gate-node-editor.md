---
v: 1
scope: src/blocks/machineEdit.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-delegate-legality-shape-gate-node-editor.md
---
Delegate legality to the ONE shape gate `isAnimData`, so the node editor can never write a machine the parser would refuse - which is how event uniqueness, reserved names and the single-timer rule are enforced without a second rulebook - plus `validateMachine` where shape cannot see the problem: `removeTransition` refuses an edit that ADDS validation errors.
