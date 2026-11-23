# Template Library: coverage and names

Maintainer files for the SVG Template Library plan (`docs/work-specs/svg-template-library/spec.md`).

## coverage.json

One row per id in scope (D9): every registered graphic type, the untyped kinds (end credits by
form, versus, frames, the production Picture), every behaviour recipe and every feature contract.
Each row records:

- `templates`: the SVG files that serve it.
- `mechanism`: plain fields, picture slot, existing recipe, recipe extension, new runtime kind or
  feature contract (D7).
- `status`: `covered`. (`planned`, with the `phase` that would cover it, was allowed until TL7;
  the gate now refuses it.)
- `proof`: what a test observes (`observes`, only what its case asserts), and for a covered row
  the test file, the case (text of a `test(` title in it) and, where the test loops over an
  inventory, that inventory. The inventory must list each template with the recipe the row states
  for it (`recipe`, or `recipeBySlug` per template; `null` for none). `selects: "recipe"` marks a
  loop that runs only entries with a recipe, so a template without one cannot claim it.
- `extensions` on a covered row: what the route still owed, each with its phase and the proof it
  would need. None is open, and the gate now refuses one.
- `recognition` on recipe rows: `automatic` (an untouched file is detected) or `author choice`.
- `variants` on the end credits rows, and `looks` for every other untyped catalog design: a look
  is a capability of a family row (count-up, dial, crawl), not a file of its own.

The rows come from the registries. After adding a type, recipe or untyped design:

    node scripts/template-coverage.mjs --write

adds the row as `planned` with an unassigned mechanism, and the gate keeps failing until the row is
`covered`: its mechanism, its template files and a passing proof, in the same change that registers
the id. `node scripts/template-coverage.mjs` checks without writing;
the build runs the same check in `scripts/template-coverage.test.mjs`. It fails when a registered id
has no row, a row's id is gone, a covered row loses a template, its proof case, its inventory entry
or its recipe, its proof spec is quarantined, or an untyped design maps to no row. `coveredFloor` is the ratchet: every row once covered stays
listed there (regeneration keeps it), and a listed row that is no longer `covered` fails, so
coverage never goes back by an ordinary edit. Where the checkout has `origin/main`, the test also
refuses a row covered there and not covered here, so removing the floor entry with it fails too.
Since TL7 the check is complete: every `planned` row and every open extension fails it, in the
command and in the build. A proof spec cannot be quarantined while it proves covered rows (the
quarantine change runs the build and fails), so a flaky proof is fixed, not set aside.

## names.json

One name per concept (D5, AC-8): the recipe, type and kind label that carry each name, and the
labels it retired. `scripts/concept-names.test.mjs` checks the registries and kind labels against
it and refuses a retired label on the listed user-facing surfaces (comments in TypeScript are not
copy). Ids, role words, field titles and persisted keys never change: only labels do.

## The library itself

The templates are in `docs/tutorials/template-library/`, with one inventory, `library.json`: per
template its id (`slug`, also its file name), name, `style` (`studio` for the Manrope house style,
`navy` for the Oswald set that was the SVG examples), recipe or contract, the `packages` it sits in
(`SVG_PACKAGES` in `scripts/svg-files.mjs`), its default preview and named `states`, and `formerly`,
the set and slug it had before TL3. A proof whose loop runs one style names it (`proof.style`).

Nothing is committed as output: the build makes every download from that folder (each SVG and
picture under `/downloads/svg/`, the whole library's zip and one zip per package), and the page
shows each template's built-in alternatives from the `builtIns` that `template-coverage.mjs`
writes onto each type row from the catalog.

## old-addresses.json

Every address the two sets were served at before TL3, with the sha256 of what it served and where
that content lives now. `vercel.json` redirects each one; `scripts/svg-files.test.mjs` follows the
redirects and checks the bytes, and that each old zip's files are in the library zip. Written once;
never regenerate it.
