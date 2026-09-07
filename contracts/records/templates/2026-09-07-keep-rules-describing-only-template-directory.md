# templates/keep-rules-describing-only-template-directory

Rule: `templates/keep-rules-describing-only-template-directory`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 7-10. **Twenty-two subdirectories own their own contract** - `types/`, `pack4/` and the twenty categories listed under "Categories" below - each an `AGENTS.md` with a thin `CLAUDE.md` importing it, loaded only when you work in that directory. A section that describes ONE directory belongs there, not here: this file is read in full by every session touching any template.
