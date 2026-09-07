# templates/omit-imported-designs-through-let-each

Rule: `templates/omit-imported-designs-through-let-each`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 510-512. EXCEPTION: an imported design declares NO `--type-scale` (`rootVarsCss(..., { typeScale: false })`) - each placed line sizes itself from its own rule, and the Style panel keys its "Text size" section on the var's presence, so declaring it would show a dead knob.
