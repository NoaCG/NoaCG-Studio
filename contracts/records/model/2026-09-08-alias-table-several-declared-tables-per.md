# model/alias-table-several-declared-tables-per

Rule: `model/alias-table-several-declared-tables-per`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`, corrected against the code. The contract said the merge takes THREE declared tables, `ALIASES_EN`, `ALIASES_SV` and `ALIASES_FI`. It takes four: `ALIASES_OCCASION`, built from every occasion's declared phrases, goes through the same loop - which is the mechanism behind the neighbouring claim that an occasion's phrases reach search automatically. The rule is written without a count so that adding a fifth table cannot make it stale.
