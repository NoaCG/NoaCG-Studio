---
v: 1
scope: src/model/videoTypes.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-picks-which-source-field-live-single.md
---
`engine` picks which source field is LIVE - a single-file React module or a standalone HyperFrames composition - and it is chosen at creation and NEVER converted. Read and write the active source through `videoSource(p)` and `withVideoSource(p, code)`, never by reaching for a field directly; a record stored before the field existed loads as the default engine. `VIDEO_ENGINES` carries the wizard-card metadata for the choice.
