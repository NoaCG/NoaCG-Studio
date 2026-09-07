# ai/drive-matrix-brief-bank-through-application

Rule: `ai/drive-matrix-brief-bank-through-application`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 85 (zero-based blank-line inventory). Checked against code: scripts/video-bench.mjs drives the application's video project store, UI and validation through browser imports; benchmarks/video/v1 stores the versioned corpus. Source prose (historical evidence; only the rule above is authoritative): The versioned video matrix and brief bank live in `benchmarks/video/v1`; its runner must drive `src/ai/video` through the application, never call a model with a benchmark-only prompt pipeline. The binding experiment and artifact contract is `docs/VIDEO_MODEL_BENCHMARK.md`.
