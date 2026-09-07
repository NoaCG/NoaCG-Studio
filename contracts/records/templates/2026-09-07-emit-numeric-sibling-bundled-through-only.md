# templates/emit-numeric-sibling-bundled-through-only

Rule: `templates/emit-numeric-sibling-bundled-through-only`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 505-509. A sibling means a SECOND bundled `@font-face`, like a family's label face. `rootVarsCss` emits it, and only when the token was actually declared - a design that shows no live number gets neither the variable nor the extra font file (measured: sb01 bundles saira + oswald, gt01 bundles inter alone). The export writers need no change: they collect fonts by scanning the CSS for `url("fonts/…")`.
