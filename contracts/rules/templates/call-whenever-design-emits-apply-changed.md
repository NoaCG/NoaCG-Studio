---
v: 1
scope: src/templates/shared/clock.ts, src/templates/startingSoon/shared.ts, src/templates/gameTimers/shared.ts, src/templates/importedDesign/svg.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-call-whenever-design-emits-apply-changed.md
---
Call `clockDataUpdated()` from `update()` whenever a design emits `clockRuntimeJs`. Apply changed clock data immediately while running, paused, or idle without changing graphic state, and re-arm only when the clock's own fields changed.
