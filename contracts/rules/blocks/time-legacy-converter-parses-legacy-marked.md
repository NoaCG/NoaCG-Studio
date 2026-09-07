---
v: 1
scope: src/blocks/animImport.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-time-legacy-converter-parses-legacy-marked.md
---
`importAnimData` is the ONE-TIME legacy converter: it parses a legacy marked region through timelineModel's `parseTimeline` and converts the choreography into `AnimData`, taking a `to()`'s from-values from the settled `DESIGN_STATE` table. It serves read-only rendering of legacy templates on the new timeline AND the explicit, undoable convert-on-first-motion-edit; a template the old parser cannot read stays hand-crafted.
