---
v: 1
scope: src/templates/**, src/blocks/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-never-let-data-update-cause-transition.md
---
Never let a data update cause a transition: `update()` writes fields, and state changes come only from events or timers. Parameterize with DATA rather than with states - one Selected state plus a field, never four near-identical states. The default path is the ordered walk `next` follows, and `steps[i]` IS that path positionally.
