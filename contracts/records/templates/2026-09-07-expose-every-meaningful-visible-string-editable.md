# templates/expose-every-meaningful-visible-string-editable

Rule: `templates/expose-every-meaningful-visible-string-editable`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 536-542. **EVERY meaningful visible string is a field.** A template exists to be re-used by people who never open the code, so a word baked into the markup is a word nobody downstream can change - and in practice the ones that get baked in are exactly the ones a second broadcaster needs different: a countdown's "BEGINS IN", a poll's "VOTE NOW", a phase chip's "LIVE", a severity flag's "Warning", a sponsor rail's "PARTNERS". Language is the obvious case, but house style is the common one. `node scripts/field-coverage.mjs` is the gate (root AGENTS.md); it drives every field and reports whatever did not move.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

These are the explicitly argued exceptions to making visible words editable. Source: src/templates/AGENTS.md, lines 567-569. The deliberate exceptions are small and argued in the gate: the versus mark (it IS the graphic), and an image field's empty-slot placeholder (that text is the field's own empty state and the picked file replaces it).
