# model/moment-graphic-closed-vocabulary-show-own

Rule: `model/moment-graphic-closed-vocabulary-show-own`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From `src/model/AGENTS.md`: OCCASIONS is FACET I, section 21 of docs/TEMPLATE_TAXONOMY_PROPOSAL.md, shipped 2026-09-06 with five values - pre-show, coming-up, break, technical-problem and sign-off.

The contract said the rule for admitting a new one is written next to the list and gated by `validateTaxonomy`. The list and the prose are in `taxonomy.ts`, but the gate is not: `MAX_OCCASIONS` (8), `MIN_DESIGNS_PER_OCCASION` (3) and the check that every declared phrase resolves all live in `src/templates/templateMeta.ts`. A reader who went looking for the ceiling in this module would not find it, so the rule names where it is.
