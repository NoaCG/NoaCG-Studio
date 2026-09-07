# ai/use-spec-level-only-while-still

Rule: `ai/use-spec-level-only-while-still`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 32 (zero-based blank-line inventory). Checked against code: modify checks options.spec, detectPrefix and parseAnimData; convertImport consumes ImportResult.template and passes parsed template fields into conversion. Source prose (historical evidence; only the rule above is authoritative): `modify` refines a grounded result at SPEC level while it is still house-shaped (the caller passes the result's `spec` back via `GenerateOptions.spec`); anything else refines at code level. `convertImport` = deterministic import first (`model/importTemplate.ts`), then the validated conversion - the AI only ever sees parsed code, never raw bytes.
