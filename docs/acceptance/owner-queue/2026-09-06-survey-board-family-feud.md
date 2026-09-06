---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# A survey board: reveal in any order, three strikes, the total adds itself up

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-game-shows-518d88`

## What changed

The Family Feud board is the first of the "other graphics" you asked for on 2026-09-06. A
student draws the slots with the answers and points AS THEY LOOK REVEALED, hides a "Revealed 1..8"
plate per slot and three "Strike 1..3" X layers, and the import proposes the **Survey board**
recipe with every picker filled. The operator gets Reveal 1..8 (any order), Strike, Take back a
strike, Clear strikes and Reset board; the answers are one box, a line per slot (`Toaster | 32`);
the total is summed from what is revealed.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/survey-board.svg`. The Fields
   step says "Survey board", 8 rows, every box filled.
2. Next, Next, name it, add it to a new production.
3. Type three lines into **Answers** (`Toaster | 32`, `Fridge | 24`, `Kettle | 15`), Take.
4. Press **Reveal 3**, then **Reveal 1**: watch the slots flip and the total read 47.
5. Press **Strike** four times: the fourth is greyed. Press **Reset board**.

## What to look at

- Whether "the answers as they look revealed, hidden until then" is a rule a student can follow.
  It is the vote board's rule for figures, applied to words.
- The reveal has no un-reveal button on purpose (the show never does); the row's own
  "Answer 3 revealed" box on the control page is the correction. Say if that is wrong.
- The Strike button greys itself at three because the machine says so, not the runtime.
