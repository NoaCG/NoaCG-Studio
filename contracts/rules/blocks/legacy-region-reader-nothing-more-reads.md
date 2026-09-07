---
v: 1
scope: src/blocks/timelineModel.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-legacy-region-reader-nothing-more-reads.md
---
`timelineModel.ts` is the legacy-region READER and nothing more: `parseTimeline` reads a region and `buildOverview` builds the cue-segmented overview. The literal patchers that used to live beside them went with Phase 8, and a legacy region is now read-only.
