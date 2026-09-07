# templates/measure-staged-designs-across-full-text

Rule: `templates/measure-staged-designs-across-full-text`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 477-482.   columns instead of reflowing (`e2e/catalog/multicol-containment.spec.ts`). **The TEXT-SIZE LADDER   is an axis, not a constant**: `stage-fit-sweep`, `type-floor` and `overflow-sweep` all take   `--type-scale s|m|l`, because only `font-size` reads `--type-scale` and a box sized off the other   knob changes SHAPE as the operator moves it. The design measurements are in   `docs/FOOTPRINT_STABILITY.md`, section "The text-size ladder is an AXIS, and every instrument   measured one step of it".
