# templates/keep-single-text-fit-system-per

Rule: `templates/keep-single-text-fit-system-per`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 320-323.   **The RASTER import is its only caller now**: an imported SVG fits its placed lines with the   FIT LADDER instead (importedDesign/svg.ts, docs/SVG_IMPORT_PLAN.md §6b), so `ensureTextFitRuntime`   recognises that design by `SVG_TEXT_FIT_MARKER` and leaves it alone - one fit per graphic, and   the ladder is the one that can report a too-long value to the operator.
