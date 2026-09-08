---
v: 1
scope: src/blocks/animData.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-lifecycle-hooks-where-bare-identifier-naming.md
---
`calls` are lifecycle hooks - `{ time, call }` where `call` is a BARE IDENTIFIER naming a global template function, fired through `window[name]` at its moment on the step's clock, with NO eval, ever, and suppressed by settle like any GSAP callback. `ANIM_CALL_NAME_RE` is the shape gate.
