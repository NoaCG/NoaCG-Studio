# templates/author-dimensions-resolution-folded-multiply-font

Rule: `templates/author-dimensions-resolution-folded-multiply-font`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 491-496. `zoneDecls`, and can import a typeface post-creation. **Two size knobs:** every dimension is authored as `calc(Npx * var(--scale))` (whole-graphic size; resolution is folded into `--scale` by `computeScale`), and font sizes additionally multiply by `var(--type-scale)` (text-only size, a raw multiplier - **S 0.85 · M 1 · L 1.2**, declared once in `model/styleVocabulary.ts` `TYPE_SIZE_STEPS`; the graphic-size ladder beside it is 0.8 · 1 · 1.25). Nothing but `font-size` consumes `--type-scale`.
