---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# A bingo caller board: every number lights as it is called

**Date:** 2026-09-06 · **Branch:** `claude/add-control-row-set-field-d1d013`

## What changed

A seventh show graphic, drawn to prove the plan's `row-set` field kind on artwork: twenty-five
numbers on a grid, a hidden amber plate and a hidden white ring per number, a big readout and a
count. The import proposes the **Bingo caller** recipe. What has been called is one list, a
number per line; the plate lights while its number is on the list, the ring sits on the newest
call, and the readouts follow. **Call it** is the same one-press control the puzzle got, **Take
back** undoes a wrong call, **New game** clears the board.

The numerals on the tiles are named `Number 1` to `Number 25` in the file, so they stay drawing
instead of arriving as twenty-five fields to untick - the trap the top ten walked into is filed as
`docs/backlog/decorative-numerals-arrive-as-fields.md`.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/bingo-board.svg`.
2. Next, Next, name it, add it to a production. Take.
3. Type `7` into **Number to call**, press **Call it**: tile 7 lights and wears the ring, the big
   number reads 7, the count reads 1. Type `12`, press again: 12 lights and takes the ring.
4. Press **Take back** with 12 still in the box: 12 goes dark, the ring returns to 7.
5. Press **New game**: every tile dark, the big number hidden, the count at 0.

## What to look at

- Whether a bingo night would run from this box, or wants the numbers as a clickable grid on the
  control page (thirty buttons is the shape the Jeopardy board also wants - recorded, not built).
- The big number is hidden until the first call and hidden again after New game. Say whether it
  should read a dash instead.
- The tile numerals are white on the amber plate once called. Say whether they should go dark.
