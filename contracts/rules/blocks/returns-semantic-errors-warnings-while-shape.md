---
v: 1
scope: src/blocks/animMachine.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-returns-semantic-errors-warnings-while-shape.md
---
`validateMachine` returns the semantic errors and warnings for `validateTemplate` while the SHAPE gate stays in animData's `isAnimData`, and `stateProblems` returns the subset belonging to ONE state - unreachable, or a timer on a timeline that never ends - STRUCTURALLY as `{groupId, stateId, severity, message}` so the node editor can mark the box it is about. `validateMachine` folds them back into its own lists.
