# templates/give-every-new-category-own-thin

Rule: `templates/give-every-new-category-own-thin`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 346-351. **Every category carries its own `AGENTS.md`** beside its code (with the thin `CLAUDE.md`), loaded only when you work in that directory. This list is the index and nothing more: a category's rules live in its own contract, and a new design writes its lesson there, never back into this file - which is what keeps every session's instruction chain affordable (`npm run check:shared-instructions` prints the headroom). A NEW category mints the pair on its first commit rather than starting as a paragraph here.
