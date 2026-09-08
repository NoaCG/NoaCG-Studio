---
v: 1
scope: src/blocks/machineEdit.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-lifecycle-edge-materialised-play-stop-takes.md
---
A LIFECYCLE edge - the materialised play and stop - takes STYLE edits only: `setTransitionTrigger` and delete return null on it, because play and stop always exist and clearing the style is the removal that means something.
