---
v: 1
scope: src/templates/shared/animRuntime.ts, src/templates/shared/standard.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-check-before-placing-machine-bearing-data.md
---
Check `hasMachineRuntime(js)` before placing machine-bearing data into a saved template. Re-emit the whole animation region if the frozen interpreter predates the machine engine; do not rely on literal-only `spliceAnimData`, and treat a data/runtime mismatch as export-blocking.
