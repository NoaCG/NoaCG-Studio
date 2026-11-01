# Phase 16: Define imported credits content and style bindings

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 16: "Keep fixed artwork and legacy imports compatible. Identify repeatable role/name
  styling and stable source anchors; declare unsupported patterns without converting to a native
  preset."

This row defines the model. Rows 17 and 18 bind and preview the list; rows 19 to 23 render each
layout and playback. Nothing here renders or changes what any saved graphic builds.

## Pinned main

Worktree from `e680acd1889a2d4d70a754fecebcb6b87f369787` (PR #1933). Previous verified main:
that SHA. CI (push and merge group), configured-suite, Post-landing, Quarantine and Push on main
all succeeded on it.

## Rules

Observable through `analyseCreditsStyle`, `validateCreditsBinding` and `creditsEngine`
(`src/templates/importedDesign/creditsRoll.ts`); `scripts/imported-credits-model.test.mjs`
names each.

- C1 Saved credits build as before. A binding without `credits` builds byte for byte what it
  built on main: the editable roll, the original-artwork roll (`options.artwork`), and plain
  imports of the credits drawings.
- C2 One engine per design. `creditsEngine` answers styled, artwork, editable or none. A styled
  binding with `options.artwork` is refused (`conflicting-engine`), never combined; the engine
  answer for it is the artwork roll, which is what the assembler builds.
- C3 The content is one list. The styled binding keeps the recipe's one `credits` field; any
  other anchor bound as its own field is refused (`field-per-name`). The sample becomes that
  list in the native format (`parseCredits` reads it back), keeping row order and zero, one or
  several names per role.
- C4 Anchors are source layers. Each anchor is a text candidate id in the markup, read in reading
  order (top to bottom, then left to right) with its kind, role or name. Unknown, duplicate,
  reordered or re-kinded anchors refuse the whole binding (`unknown-anchor`, `duplicate-anchor`,
  `stale-anchors`); a stored layout the markup no longer shows refuses too (`stale-layout`).
  Layers are compared as the text each draws, so a run's own id inside an anchor counts as that
  anchor. Reading never rewrites the markup.
- C5 The style is read off the drawing. Exactly two looks; the first layer read is the role look.
  A line holding a role and then a name is role beside; a first name on a lower line is role
  above. Above, all layers share one aligned edge; beside, roles share one and names another.
  Alignment is read from the stated anchor, or from drawn widths where the text is laid out.
  Laid out, looks and the anchor are the browser's computed style, so stylesheet classes count
  and two class spellings of one look are one look; parsed, the class names are compared;
  where a layer is drawn is its first character's position: laid out, the browser's own
  (`getStartPositionOfChar(0)`, with the anchor point found along the drawn advance); parsed,
  each of x, y, dx and dy is the nearest element's value (the run's where it states one, else the
  text's), never a sum, in units or ems; the two readings must agree. A layer's runs are its
  character runs at any depth, and laid out, its lines are the browser's baselines under its
  characters. Validation lays the markup out whenever a page exists.
  Steps (role to name, name to name, group gap, column) are measured where the sample shows them.
- C6 A whole block turned or scaled as one reads as drawn; layers at different angles or scales
  are refused (`mixed-angles`).
- C7 Unsupported is declared, never converted. Each refusal names a code, a plain message, the
  layers concerned and `fallback: 'artwork'`, the original artwork (its roll or fixed). It never
  names a catalog design. Codes: `unknown-anchor`, `too-few`, `several-lines`, `mixed-angles`,
  `one-look`, `many-looks`, `side-by-side`, `mixed-layout`, `misaligned`, `not-list-format`.
- C8 Playback is the author's: static, roll or cards. Cards default to the operator's Next; a
  timed card holds 2 to 60 seconds, and only cards take a time (`invalid-advance`).
- C9 Overflow is defined per playback (`CREDITS_OVERFLOW`). Too wide: shrink, report past 55%,
  stop at the 30% floor. Too tall: a roll runs through; static shrinks the whole list to the
  floor, then refuses the take with the overflow reported; cards keep a group whole when it fits
  and otherwise continue at a name boundary under the repeated role. Nothing is dropped, clipped
  or moved to another layout.
- C10 Layout and playback are spelt as the proposal contract's credits intent spells them.

## What landed

- `designTypes.ts`: `DesignSvgCredits` (version, layout, playback, optional card seconds, anchors)
  as an additive `credits` member of `DesignSvgRecipeBehaviour`. Only the author's choices and the
  anchors are stored; looks, alignment and spacing are read off the markup at every build, so
  they cannot drift from the artwork.
- `behaviours/credits.ts`: `CREDITS_LAYOUTS`, `CREDITS_PLAYBACKS`, `CREDITS_CARD_SECONDS`.
- `creditsRoll.ts`: `readCreditsAnchors`, `analyseCreditsStyle`, `creditsEngine`,
  `CREDITS_OVERFLOW`, `validateCreditsBinding`. The existing engines are unchanged.
- `scripts/imported-credits-model.test.mjs` (new, Node with one blank Chromium page, no dev
  server).

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Role above, multiple names | credits-1: kinds role, name, name, role, name; centred; steps 65 / 55 / 150; the list reads back as the fixture's expected content. Parsed and laid out agree |
| Role beside | credits-2 (French): role column and name column, both start; column 350; content as expected |
| Static, roll, cards | Binding accepts each; cards with and without a time; time bounds 2 and 60 pass, 1.9, 61, NaN and a timed roll refused |
| Defined overflow | `CREDITS_OVERFLOW` pinned per playback (C9) |
| Source identity | Anchors are the chosen candidate ids in reading order; unknown, duplicate, reordered, re-kinded and stale layout refused |
| Animation identity | One engine per design; the anchors are the layers an engine copies from. Rendering and motion targets are rows 19 to 23 (see Follow-ups) |
| Repeatable styling | Two looks, alignment and steps read off the drawing; a whole turned block reads; Illustrator-style centring read from drawn widths |
| Unsupported declared, no native preset | credits-3 (islands at different angles) and nine synthetic patterns refused by code with `fallback: 'artwork'` and no other key |
| Fixed artwork and legacy compatible | Pins of the editable roll, the artwork roll and the three credits drawings imported plain, taken on main and equal on this branch; `check:catalog-emit` PASS (528); `jev-svg-baseline` 19/19 |

## Verification on this worker

- `node --test scripts/imported-credits-model.test.mjs`: 19/19. The same file with
  `CREDITS_SRC` set to an export of main `e680acd1` gives identical pins (the model tests fail
  there, as they must). Mutations: a changed byte in the editable roll's runtime string, or in the
  artwork roll's, fails the pin test; reading the text's x before its run's fails the run-position
  test; summing the text's and the run's `dy` in the parsed reading fails the relative-steps test,
  which holds it against the browser's laid-out reading; reading only direct child runs fails the
  refusals test on a wrapper run that hides a second line.
- `npx tsc --noEmit -p .`, `npx eslint` on the four files: pass.
- `npm run gates -- run --changed origin/main`: pass. `npm run check:catalog-emit`: PASS.
- `scripts/jev-svg-baseline.test.mjs` 19/19, `scripts/credits-parser.test.mjs` 16/16,
  `scripts/credits-live-speed.test.mjs` 7/7.
- `scripts/svg-import-passes.test.mjs`: 18 pass, 4 fail here, and fail identically on an
  unmodified export of main (same diff, same hash). This machine's Chromium is build 1243 linked
  in for the pinned 1228; the corpus records' html and measured runtime move between the builds.
  CI on the PR is the authority for `scripts/fixtures/svg-corpus-passes.json`; no record was
  regenerated.
- Not run here: e2e (no spec changed), the configured suite (CI selects it).

## Decisions

- **Separate layers, not one sample text.** The dev fixtures draw each role and name as its own
  text layer with its own source anchor, so the model reads that shape. A single text drawing
  several lines is the editable roll's sample and is refused here (`several-lines`); it keeps the
  existing artwork roll.
- **The first layer read is the role look.** Credits open with a role. Reading the looks any
  other way needs a guess, and a guess is what the spec forbids.
- **Store choices and anchors, derive the rest.** Steps and alignment are not stored, so a
  binding cannot disagree with its artwork; a stale one fails whole (C4).
- **Pins compare the html as a tree.** Chromium builds order SVG namespace declarations
  differently when serializing; the pins sort attributes and leave namespace declarations out,
  and compare css, js and fields byte for byte.
- **The pins cover the whole emitted template**, not only the credits engine, because the brief
  asks that saved credits and fixed artwork not move at all. A later row that changes the shared
  emit re-takes them the same way: on main before the change and on its branch.
- **The role-length limit (48) is a third copy** beside the parser and `control/contentFormats.ts`,
  whose constant is not exported and lies outside this row's files.
- **Repeated family, positional reading.** the automated PR review on `a428cd7f` found `dx`/`dy` ignored; the fix
  summed the text's and the run's step, and `/so` on `7c066818` (grade B) found that SVG uses only
  the nearest one (checked in Chromium). Two rounds on one rule, so the rule was corrected rather
  than patched again: the browser's reading is the authority when laid out, the parsed reading
  follows SVG's nearest-value rule, and the test holds the two against each other. the automated PR review on
  `7ee670f3` then found lines hidden in a wrapper run; the same correction covers it, since lines
  are now the browser's baselines when laid out and the parsed walk takes runs at any depth.
- **Looks compare paint too** (the automated PR review on `7c066818`): `fill-opacity`, `stroke-opacity` and
  `stroke-width` join the look, so roles set apart by opacity alone read as two looks.
- **Ordinary review scenario.** This row adds a declaration and a pure reader with no runtime
  state, transitions, retries or writers, so the Rules were written in these notes rather than
  challenged before code.

## Known limits

- **A name-first drawing reads with roles and names swapped.** With names in the left column and
  roles on the right, geometry alone cannot tell which look is the role, and the rule "the first
  layer read is the role look" answers wrongly. The stored anchor kinds are the author's to
  confirm in row 18's preview (AC-23); nothing here guesses further.
- **A parsed-only reading is a fallback; the laid-out one is the authority.** Without a page,
  class-set sizes and anchors are not resolved (classes still separate the looks); a percentage
  position reads as a plain number; and loose text before the first run with its own `dx` is read
  from that run. Every in-product caller has a page, and validation lays the markup out there.
- **Nested `<svg>` offsets and CSS `transform` styles are not part of a layer's frame** in either
  reading. Spacing between layers stays right unless they sit in different nested viewports.
- **Drawn widths depend on the loaded fonts.** Centring with no stated anchor is read from
  measured widths; measured before the design's faces load, a fallback face can turn a binding
  the wizard accepted into `misaligned`. Nothing calls validation yet; the row that does (19)
  validates after `document.fonts.ready`.
- **The laid-out copy shares the page's styles for the moment it is measured.** Nothing paints
  in between, so nothing shows; page-wide font rules could change widths, which only matters for
  the limit above. An isolated frame is the fix if row 19 needs it.

Rendering details for rows 19 to 23 (#1937): a centred line drawn as several pieces on one line is
measured against the whole text's width; role beside drops a small baseline offset between a role
and its first name; with a role that has no names, `groupGap` measures role to role.

## Follow-ups

- #1937: rows 19 to 23 list only `creditsRoll.ts` among the importer files, but the engine is
  chosen in `svg.ts` and the layers are classed in `svgBind.ts`. The coordinator reconciles the
  boundary before row 19. `components/wizard/import/draft.ts` belongs to the same gap: it marks
  every new credits import `options.artwork`, so the wizard cannot write a styled binding yet.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-16-build')"

Additive types, functions and a test; a revert changes no graphic.
