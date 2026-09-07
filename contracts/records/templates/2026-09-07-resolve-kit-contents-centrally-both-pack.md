# templates/resolve-kit-contents-centrally-both-pack

Rule: `templates/resolve-kit-contents-centrally-both-pack`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 75-89. **kit.ts** - what a kit CONTAINS, resolved once for every consumer: the pack's types through the (type x family) matrix PLUS its `extras`. Both halves are the kit - a caller reading only `resolvePack` builds a kit missing its extras while still counting them, which is exactly the bug the wizard's kit step shipped with. It lives here rather than in packs.ts because that module deliberately does not import the catalog it is a view over. Every choice is drawn as a CARD with a settled MiniPreview of the real design (wizard/steps/KitPicker.tsx) - a kit's contents are looked at, not read off a list of names. `kitChoices(pack, family)` widens that into what the picker OFFERS - the pack's contents, then every other graphic type whose cell resolves ("start from a genre preset, then edit the set") - and `kitSelection` resolves a ticked set back to `KitItem[]`. Every offered row is asked through `resolvePack`, the same resolver create runs, because the matrix is not full and the widening is exactly where a row that throws on Create could appear. A choice's KEY is the graphic TYPE id (or `extra:<designId>`), never the resolved design id and never an index: the design changes when the look does, so either of those would silently re-tick the set the moment the user changed the look.
