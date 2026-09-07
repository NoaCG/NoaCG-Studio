---
v: 1
scope: src/ai/telemetry.ts, src/ai/runStats.ts, src/ai/video/claudeVideoProvider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-record-stage-timings-api-reported-tokens.md
---
Record stage timings, API-reported tokens, repair rounds, routing and diversity through `startAiRun` in the local `telemetry.ts` ring, retaining JSON export. Separate SPX statistics from `video-generate` and `video-refine` using `AiRunKind`.
