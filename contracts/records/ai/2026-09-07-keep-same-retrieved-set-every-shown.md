# ai/keep-same-retrieved-set-every-shown

Rule: `ai/keep-same-retrieved-set-every-shown`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 25 (zero-based blank-line inventory). Checked against code: shortlistTool/specSystemPrompt consume the same Shortlist; retrieveShortlist returns FULL_CATALOG unless route is adapt; stubProvider imports shortlistFor. Source prose (historical evidence; only the rule above is authoritative): `catalogDigest(only?)` and `narrowVariantTool` are the two seams: the prompt shows the shortlist and the schema accepts exactly that set. **Shown-but-illegal is a chassis the model picks and `resolveVariant` silently swaps - the wrong graphic delivered as a success.** A CREATE route keeps the full digest. The offline stub picks from the same shortlist deterministically, which makes the path e2e-testable without tokens (`e2e/adapt-first.spec.ts`, `e2e/ai-retrieval.spec.ts`).
