# root/question-owner-names-reason-own-text

Rule: `root/question-owner-names-reason-own-text`. Recorded 2026-09-07 on `claude/root-contract-migration` at 39835021.

Ruling 2026-09-05, docs/OWNER_RULINGS.md. In Claude Code scripts/hooks/guard-question.mjs refuses an untagged question; in Codex the rule itself is the guard.

2026-09-25: rewritten for owner-decisions-2026-09-25 (docs/OWNER_RULINGS.md). Three kinds of question: operational ones are decided, owner-level outcome decisions get one Grill-Me question at a time with a recommendation, and waves ask nothing. The hook now carries the rule, so it left the root contract.
