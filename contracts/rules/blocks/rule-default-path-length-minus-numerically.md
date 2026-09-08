---
v: 1
scope: src/blocks/animMachine.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-rule-default-path-length-minus-numerically.md
---
`spxSteps(data)` is THE `settings.steps` rule - default-path length minus one, numerically identical to the historical `steps.length - 1` by the positional binding - and every re-sync site calls it, so the rule lives once.
