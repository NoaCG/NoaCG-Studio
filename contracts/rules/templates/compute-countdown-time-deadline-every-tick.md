---
v: 1
scope: src/templates/shared/clock.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-compute-countdown-time-deadline-every-tick.md
---
Compute countdown time from a deadline and `Date.now()` on every tick rather than decrementing an interval counter. Keep painting DOM-ready-safe and null-safe, display minutes and seconds with hours when needed, and apply `{prefix}-done` at zero.
