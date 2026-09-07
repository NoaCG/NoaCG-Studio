---
v: 1
scope: src/blocks/timelineLens.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-preview-addressing-rule-every-caller-scrub.md
---
`scrubPhase(target, pathPhase)` is the one preview-addressing rule for every caller: the scrub protocol addresses the walk's phases ('in', 'out', 'step-N') and a branch is on none of them, so a branch answers `state:<groupId>:<stateId>`, read back by `parseStatePhase` and resolved by `PlayoutSimulator` through the runtime's own `noacgEnterTimeline`.
