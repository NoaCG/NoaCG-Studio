# ai/record-stage-timings-api-reported-tokens

Rule: `ai/record-stage-timings-api-reported-tokens`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 66 (zero-based blank-line inventory). Checked against code: telemetry.ts records usage and stages, mirrors the capped ring to localStorage and exports via exportAiRuns; runStats filters kinds. Source prose (historical evidence; only the rule above is authoritative): **LIVE.** `telemetry.ts` records every run locally (stages, tokens from the API usage block, repair rounds, route, diversity fields; localStorage ring, JSON-exportable). The VIDEO harness records through the same ring (kinds `video-generate`/`video-refine`); consumers filter by kind, so SPX statistics never mix with video runs.
