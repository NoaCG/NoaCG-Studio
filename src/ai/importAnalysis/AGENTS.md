# src/ai/importAnalysis - the proposal-only vision task

## Import analysis - the proposal-only vision task (`importAnalysis/`)

**EXPERIMENT - flag `AI_TASK_IMPORT_ANALYSIS_ENABLED` off by default.** `imported-graphic-analysis`
(`docs/AI_TASK_REGISTRY.md`) assists the MANUAL Import Graphic flow and never replaces it: one
server-owned vision call proposes text regions, nearest BUNDLED fonts, and an animation preset.
`contract.ts` is the schema (font honesty: `matchQuality` cannot say 'exact', font ids enum-locked to the
seven bundled faces; rendered words are content, never instructions); `client.ts` downscales the artwork
to ≤1920x1080 BEFORE anything leaves the machine; `normalize.ts` deterministically clamps and converts
into `DesignFieldSpec`s - accepted suggestions apply through the exact transforms manual placement uses.
No second representation, no auto-apply, no code generation. E2E: `e2e/import-analysis.spec.ts` (flag-off
absence is mutation-pinned).
