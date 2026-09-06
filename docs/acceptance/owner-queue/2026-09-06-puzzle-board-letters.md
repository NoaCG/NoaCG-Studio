---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# A puzzle board: letters appear as they are called, Solve shows the rest

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-game-shows-518d88`

## What changed

The Wheel of Fortune board. Fourteen tiles, a letter drawn on each as it looks revealed, a hidden
white "Used 1..14" face per tile and a hidden "Solved" glow. The import proposes the **Puzzle
board** recipe. The operator types the phrase, takes the board, and adds each called letter to
the Revealed letters box; Solve shows every letter.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/puzzle-board.svg`.
2. Next, Next, name it, add it to a production.
3. Type `SURVEY SAYS` into **Puzzle**, Take: eleven white tiles, no letters.
4. Type `RSTLNE` into **Revealed letters**, Update. Then press **Solve**.

## What to look at

- Revealing a letter is typing it and pressing Update, because no button can add to a field yet
  (recorded in `docs/SVG_BEHAVIOUR_PLAN.md` §13). Say whether that is acceptable for the show or
  whether the "add a value to a list" control should be built next.
- A student lays the phrase over the tiles with spaces; multi-line boards need the tiles numbered
  across then down.
