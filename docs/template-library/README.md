# Template Library: coverage and names

Maintainer files for the SVG Template Library plan (`docs/work-specs/svg-template-library/spec.md`).

## coverage.json

One row per id in scope (D9): every registered graphic type, the untyped kinds (end credits by
form, versus, frames, the production Picture), every behaviour recipe and every feature contract.
Each row records:

- `templates`: the SVG files that serve it.
- `mechanism`: plain fields, picture slot, existing recipe, recipe extension, new runtime kind or
  feature contract (D7).
- `status`: `covered`, or `planned` with the `phase` that covers it.
- `proof`: what a test observes (`observes`), and for a covered row the test file, the case in it
  and, where the test loops over an inventory, that inventory. The inventory must list each
  template, with the row's `recipe` when it names one.
- `recognition` on recipe rows: `automatic` (an untouched file is detected) or `author choice`.
- `variants` on the end credits rows, and `looks` for every other untyped catalog design: a look
  is a capability of a family row (count-up, dial, crawl), not a file of its own.

The rows come from the registries. After adding a type, recipe or untyped design:

    node scripts/template-coverage.mjs --write

adds the row as `planned` with an unassigned mechanism, and the gate keeps failing until the row
names its mechanism, proof and phase. `node scripts/template-coverage.mjs` checks without writing;
the build runs the same check in `scripts/template-coverage.test.mjs`. It fails when a registered id
has no row, a row's id is gone, a covered row loses a template, its proof case, its inventory entry
or its recipe, its proof spec is quarantined, or an untyped design maps to no row. `--complete`
also refuses every `planned` row; it becomes the gate when the last gap closes (phase TL7).

## names.json

One name per concept (D5, AC-8): the recipe, type and kind label that carry each name, and the
labels it retired. `scripts/concept-names.test.mjs` checks the registries and kind labels against
it and refuses a retired label on the listed user-facing surfaces (comments in TypeScript are not
copy). Ids, role words, field titles and persisted keys never change: only labels do.
