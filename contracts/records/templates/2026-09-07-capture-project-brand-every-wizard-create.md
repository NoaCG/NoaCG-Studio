# templates/capture-project-brand-every-wizard-create

Rule: `templates/capture-project-brand-every-wizard-create`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 621-626. Graphics made in one project must read as siblings - DESIGN_LANGUAGE §8 holds the per-family cross-category tokens (minimal / sport / glass / **noacg house** shape, type, and motion values; noacg is the product's own on-air look, rebuilt from the brand-kit overlays). Two mechanisms enforce it: the **project brand** (model/brand.ts, captured on every wizard Create; the wizard's "Use current project's colors & typeface" toggle - off by default - re-applies palette + font via `brandPatch`) and **sibling judging** (every new category variant is judged against its


Corrected the same day it was written, before it landed. The passage this came from named the wizard's "Use current project's colors & typeface" toggle, off by default. That control no longer exists: `src/components/wizard/AGENTS.md` records that THE BRAND CHOOSER replaced it, because the checkbox copied a look off a graphic nobody chose. The templates contract had not been updated, so the extraction turned stale prose into a rule that read as current - which is the one way a migration can leave the tree worse than the prose did. The rule now states what is true (capture on Create, re-apply through `brandPatch`, sibling judging) and the chooser's own contract stays authoritative on how a brand is picked.
