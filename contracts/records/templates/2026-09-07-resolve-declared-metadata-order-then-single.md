# templates/resolve-declared-metadata-order-then-single

Rule: `templates/resolve-declared-metadata-order-then-single`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 133-144. - **meta.ts** - the DECLARED sliver: per-type and per-variant graphic category / subtype /   structures / field semantics, with a SINGLE-VALUED per-old-category fallback. Resolution   order: `VARIANT_META[id]` → `TYPE_META[typeId]` → `CATEGORY_DEFAULT_META[category]`.   **`TYPE_OCCASIONS` / `VARIANT_OCCASIONS` are declared SEPARATELY from `DeclaredTemplateMeta`**   (facet I - what a design is FOR): that resolution is winner-takes-all, so folding the occasion   into it would force a design to restate its category, structures and semantics just to gain one   word. An occasion resolves on its own - variant, else type, else NONE, with no category fallback,   because half a shelf being a front door and half a sign-off is the confusion the facet ends.   **Undeclared is the default and costs nothing**; a guess is worse than a gap.   `AssemblerId` (contract.ts, renamed from `TemplateCategory` 2026-08-11) stays the   ASSEMBLER/routing id, never rendered in UI; the graphic category is presentation metadata   on top - no file moves, no value renames.
