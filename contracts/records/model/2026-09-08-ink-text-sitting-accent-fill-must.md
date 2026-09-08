# model/ink-text-sitting-accent-fill-must

Rule: `model/ink-text-sitting-accent-fill-must`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From `src/model/AGENTS.md`: it shipped that way in qz03's answer chip.

The contract said `accentInk` is `var(--panel-bg)` in THREE families and a literal dark in glass. That count was already stale when this rule was extracted: `FAMILY_TOKENS` carries six families and five of them use `var(--panel-bg)` (minimal, sport, editorial, cinematic, noacg), with glass the one literal. The stale count is in the source comment too (`themeTokens.ts`, above the glass family), and the contract's neighbouring claim of four `StyleTag` families was stale the same way. The rule is written without a count so it cannot go stale again.
