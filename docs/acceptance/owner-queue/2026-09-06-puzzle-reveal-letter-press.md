---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# The puzzle board: one press reveals a letter, one takes it back

**Date:** 2026-09-06 · **Branch:** `claude/add-control-row-set-field-d1d013`

## What changed

The puzzle board walk you have in this queue (`2026-09-06-puzzle-board-letters.md`) asked whether
typing each letter and pressing Update was acceptable, or whether the "add a value to a list"
control should be built. It is built. The board now has a **Guess** box and two buttons, **Reveal
letter** and **Take back a letter**, and the Revealed letters box moves with every press - on the
production page, on the hosted page, on the exported CasparCG panel and in the OGraf manifest,
which all resolve the same rule. Typing letters straight into the Revealed letters box still works.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/puzzle-board.svg`.
2. Next, Next, name it, add it to a production.
3. Type `SURVEY SAYS` into **Puzzle**, Take: eleven white tiles, no letters.
4. Type `R` into **Guess**, press **Reveal letter**: the R appears. Type `S`, press it again:
   both S tiles appear, and the Revealed letters box reads `R` and `S` on two lines.
5. Press **Take back a letter** with `S` still in Guess: the two S tiles go dark again.
6. Press **Solve**.

## What to look at

- The press is one motion for the operator: type, press, next letter. Say whether Guess should
  clear itself after a press (it does not; the box keeps the letter so Take back can undo it).
- The hint on the button reads "moves Guess into Revealed letters with it". Say whether that
  wording is the operator's.
- Nothing about the artwork changed; the same file walks as before.
