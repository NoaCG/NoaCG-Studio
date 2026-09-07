---
v: 1
scope: src/blocks/timelineLens.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-motion-lives-two-places-default-path.md
---
Motion lives in two places - the default path's `steps` and a branch state's own `state.timeline` - and every surface that keyframes at the playhead must read AND write through the lens. `lensRead(data, target)` returns the document itself for the path, or a ONE-STEP `AnimData` carrying that state's timeline with `machine` dropped; `lensWrite` folds the edited step back, taking every TOP-LEVEL field from the edit and `steps` from the original.
