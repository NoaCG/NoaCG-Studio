# ai/check-before-using-retrieval-latter-deliberately

Rule: `ai/check-before-using-retrieval-latter-deliberately`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 24 (zero-based blank-line inventory). Checked against code: shortlistFor explicitly guards anchorResolves, checks bucketUsable and orders unmatched results by catalogIndex. Source prose (historical evidence; only the rule above is authoritative): Everything degrades rather than empties: an over-tight field bucket is dropped, a query matching nothing falls back to catalog order, no resolvable anchor returns `FULL_CATALOG`. **`variantSatisfiesAnchor` answers TRUE for an anchor that no longer resolves** - right for the satisfaction check, meaningless for a shortlist - so retrieval checks `anchorResolves` first.
