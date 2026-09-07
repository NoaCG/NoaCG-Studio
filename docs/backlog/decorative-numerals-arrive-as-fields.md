---
v: 2
source: derived
kind: finding
raised: 2026-09-06
state: unstarted
serves: NOW
found: "surfaced by the top ten walk (docs/SVG_BEHAVIOUR_SHOWS.md §4b): the rank numerals a
  student types (`10.`, `9.`, ...) arrive as ten fields to untick, because nothing in the file can
  say `this text is not a field`."
touches: src/assets/svgImport.ts, src/components/wizard/import/MapSvgFieldsStep.tsx
covered-by: import-svg.spec.ts, import-svg-behaviour.spec.ts
---
# Decorative numerals arrive as fields to untick

**Found on the top ten walk, 2026-09-06**, importing `e2e/fixtures/svg-shows/top-ten-list.svg`.
Recorded in `docs/SVG_BEHAVIOUR_PLAN.md` §13 as an import trap; filed here as the work.

## What happens

Every visible `<text>` layer is offered as a field, ticked. That is the right default for a
graphic's words and the wrong one for its FURNITURE: the rank numerals on a top ten, the numbers
on a bingo grid, a "1", "2", "3" beside three answer slots. A student who types twenty-five
numerals gets twenty-five ticked rows on the mapping step and twenty-five boxes on every control
page until each is unticked - two clicks each, because unticking asks what should happen to the
words left behind (`untickTextRow`, owner walk 2026-09-02).

The bingo recipe answers it for ITS OWN numerals by naming: a numeral named `Number 7` binds as a
per-row `write` role that derives the row's own key, so it is stamped and written by the board and
never becomes a field (`src/templates/behaviours/bingo.ts`). That is a workaround inside one
recipe, not the import's answer - the top ten's `10.` has no recipe role to bind to, and a file
with no behaviour at all has none either.

## What would settle it

- **A convention the docs teach**, the way `f:` already marks a layer editable: a prefix such as
  `d:` or `static:` that marks a text layer as drawing, offered unticked with its words kept. One
  line in `stripFieldPrefix`'s neighbourhood and one row in `docs/SVG_AUTHORING.md` §3.
- **A bulk untick on the mapping step** for rows the names or the samples make plainly decorative
  (a bare numeral with a trailing dot, a run of consecutive integers), with the same "keep the
  words" answer applied once for all of them. Offered, never applied by itself: a bare `7` on a
  scorebug IS the field.

The first is the smaller change and the one a student can learn from the page; the second helps
the file that was drawn before anyone read it.

## Where it is pinned

`e2e/import-svg.spec.ts` (the `f:` prefix case) is the shape a `static:` case would follow; the
stepped-list walk in `e2e/import-svg-behaviour.spec.ts` reads its entries box as `f11` today
because ten numerals sit in front of it, and would move when this lands.
