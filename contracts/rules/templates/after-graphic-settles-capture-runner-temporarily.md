---
v: 1
scope: scripts/*shots*.mjs, scripts/*sweep*.mjs, scripts/*bench*.mjs, scripts/*spike*.mjs, scripts/*capture*.mjs, scripts/taste-frame-review.mjs, e2e/editor-*.spec.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-after-graphic-settles-capture-runner-temporarily.md
---
After a graphic settles in a capture runner, temporarily override permanent `will-change` hints with `addStyleTag('*{will-change:auto !important}')`, wait two animation frames, remove the override, and wait two more frames before capturing.
