# templates/keep-uploaded-asset-references-under-font

Rule: `templates/keep-uploaded-asset-references-under-font`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 607-611. - The preview iframe can't resolve `images/...` paths set at runtime - preview/composeDocument.ts   injects a MutationObserver shim that swaps known relative paths for their in-memory data URLs.   Exported packages never include the shim. - Asset path convention (uploads at `images/<file>`, fonts at `fonts/<file>`, one-folder zip   layout): see src/export/AGENTS.md.
