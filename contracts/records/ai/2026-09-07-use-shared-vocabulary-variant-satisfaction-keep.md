# ai/use-shared-vocabulary-variant-satisfaction-keep

Rule: `ai/use-shared-vocabulary-variant-satisfaction-keep`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 36 (zero-based blank-line inventory). Checked against code: structuralIntent reexports structuralFit and uses structuralVocabulary; retrieval imports anchor functions; validation imports the templates-layer table. Source prose (historical evidence; only the rule above is authoritative): **The anchor vocabulary is ONE table** (`templates/structuralAnchor.ts`): the family words, `resolveAnchor`, `structuralFit`, `intentCoversFrame`, and what a variant satisfies. It lives in `templates/` because the router and the satisfaction check need the same answer and `validation` may not import `ai`. A second copy is how the two come to disagree - the router sending a brief down the catalog path while the check has no idea what was promised.
