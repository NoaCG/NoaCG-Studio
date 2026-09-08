---
kind: walk
date: 2026-09-07
serves: now
answered: false
---
# `static:` on a layer name: text that is drawing, not a field

**Date:** 2026-09-07 · **Branch:** `claude/two-row-set-recipe-fcbe5e`

## What changed

A text layer whose name starts with `static:` is offered **unticked**, with its words left exactly
as drawn. It is the opposite of the `f:` prefix and the answer to the trap the top ten walked into
(`docs/backlog/decorative-numerals-arrive-as-fields.md`): every visible `<text>` used to arrive as
a ticked field, which is right for a graphic's words and wrong for its furniture. A student who
typed `10.` `9.` `8.` down the side of a top ten got ten rows to untick at two clicks each, and a
bingo grid would have handed them twenty-five.

The row is still offered rather than hidden, because a bare `7` on a scorebug IS the field - the
prefix moves the default, it does not take the choice away. `docs/SVG_AUTHORING.md` §3 teaches it
beside `f:`, and the top ten show fixture now uses it, so its entries box is the graphic's second
field rather than its twelfth.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/top-ten-list.svg`.
2. On the mapping step: the ten `Rank` rows are **off**, each saying *stays as drawn*, and only
   **Title** is ticked. Before this they were ten ticked fields.
3. Next, Next, name it, add it to a production. Take.
4. The operator's boxes are **Title** and **Entries** - two, not twelve. Paste ten lines into
   Entries and press **Next** twice.
5. The `10.` and `9.` numerals are still painted on the artwork beside the entries that arrived.

## What to look at

- Whether `static:` is the word. `d:` was the other candidate; `static:` says what it means to a
  designer and cannot be confused with `f:` at a glance.
- Whether the unticked row should say more than *stays as drawn* - it currently reads the same as
  a row the reader unticked themselves and answered "keep".
- The file that was drawn before anyone read the page still gets ten ticked rows. The other half of
  the backlog item - offering a bulk untick for a run of plain numerals - is not built, on purpose:
  it guesses, and this does not.
