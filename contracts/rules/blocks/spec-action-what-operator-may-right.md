---
v: 1
scope: src/blocks/animMachine.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-spec-action-what-operator-may-right.md
---
`operatorEvents(group, stateId)` is the spec's Action - what an operator may do RIGHT NOW - and it IS the structural guard; `allOperatorEvents` is the whole machine's set and `timerTransition` the timer edge. `machineControls` is THE one button-list merge every control surface renders, dressing declared `machine.controls` entries over the authored events, and it SKIPS an undeclared `next` because the lifecycle button already fires it.
