---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-read-animation-speed-through-wherever-design.md
---
Read animation speed through `motionSpeed()` wherever design-owned runtime or a wrapper needs it. Resolve data-driven speed first, then legacy speed, then the default; never depend on the bare `animSpeed` global.
