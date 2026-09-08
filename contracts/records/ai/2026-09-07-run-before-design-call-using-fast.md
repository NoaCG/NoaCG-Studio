# ai/run-before-design-call-using-fast

Rule: `ai/run-before-design-call-using-fast`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 34 (zero-based blank-line inventory). Checked against code: claudeProvider calls intentAndRoute on general generate paths, short-circuits Lite, and returns early in intentAndRoute for adapt. Source prose (historical evidence; only the rule above is authoritative): **LIVE.** `GenerateOptions.mode` (`adapt` | `create` | `auto`, default auto) plus `structuralIntent` run BEFORE the design call in `generate` and `generateAlternatives` (never for Lite, raw, or modify): one small forced `emit_structural_intent` call on the provider's `role:'fast'` model -> `normalizeIntent` -> `routeIntent` (deterministic; `structuralFit` checks the type registry + catalog LIVE, so catalog growth updates routing by itself).
