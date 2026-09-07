# templates/write-runtime-field-values-through-shared

Rule: `templates/write-runtime-field-values-through-shared`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 576-579. - Every runtime writes fields through the shared `setFieldValue` helper (base.ts   `setFieldValueJs`): text -> textContent, `<img id="fN">` -> src (an empty value hides the img   and toggles `.has-image` on its parent so CSS can show a placeholder). Data-driven categories   may instead keep the path in a hidden source div (credits' #f2 logo).
