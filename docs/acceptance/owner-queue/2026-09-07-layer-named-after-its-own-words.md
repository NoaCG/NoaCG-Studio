---
kind: walk
date: 2026-09-07
serves: now
answered: false
---
# A slot named after its own placeholder keeps its name

**Date:** 2026-09-07 · **Branch:** `claude/two-row-set-recipe-fcbe5e`

## What changed

Figma auto-names every text layer after the words in it, so the importer read a name equal to the
content as no name at all and climbed to the group above. Right for Figma, and wrong for a designer
who deliberately named a slot after its placeholder: the bracket's `Champion` slot, reading
"Champion", arrived labelled after the group it sat in
(`docs/backlog/text-layer-named-after-its-own-copy-loses-its-name.md`).

The climb is now evidence-led. It happens only where the group holds **that one text layer** - which
is exactly the Figma shape, a wrapper per slot. A group holding several text layers cannot be the
name of one of them, so the layer keeps the name its author typed. Where the group's name was used,
the mapping step says so under the box, instead of leaving the reader to wonder.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/bracket.svg`.
2. On the mapping step, find the row whose text reads **Champion**. Its field name is now
   **Champion**, not **Words**.
3. Drop `e2e/fixtures/svg-corpus/figma-nested-frames-quiz-board.svg` instead. The four answer rows
   still read **Answer A** to **Answer D**, not "Amsterdam", "Helsinki", "Melbourne", "Reykjavik" -
   and each row now says *named after its own text, so the group's name was used* underneath.

## What to look at

- Whether that sentence is worth the line on four rows of a Figma board, or whether it should only
  appear on hover.
- Whether the rule reads right the third way round: a Figma frame holding one text layer AND one
  rectangle still counts as naming the text alone, because only text layers are counted.
