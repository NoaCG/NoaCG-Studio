---
v: 1
scope: e2e/**, scripts/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-after-graphic-settles-capture-runner-temporarily.md
---
After a graphic settles in a capture runner, temporarily override permanent `will-change` hints with `addStyleTag('*{will-change:auto !important}')`, wait two animation frames, remove the override, and wait two more frames before capturing.
