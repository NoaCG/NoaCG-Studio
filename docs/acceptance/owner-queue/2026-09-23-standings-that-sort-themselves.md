---
kind: walk
date: 2026-09-23
because: taste
---
# A ranking that sorts itself: change the points and the rows trade places

**Date:** 2026-09-23 · **Branch:** `claude/noacg-work-suggestions-ibb9ak`

## What changed

The results board you walked on 2026-09-03 now behaves like a ranking - level 1 of
`docs/backlog/graphics-need-their-own-logic.md`, the "reorder the names and the position number
just by adding or subtracting points" you called the future. A new **Standings** behaviour: each
competitor gets a +1 and a −1 on the control page (and their points box still takes a typed
figure), and when the points change every row glides into the place its points give it, carrying
its name and its points with it. The position numbers stay in their slots and are renumbered on a
tie (1, 2, 2, 4). **Lowest first**, a tick in the Fields step, ranks times and golf scores the
other way. **Reset points** puts every figure to zero.

The import proposes it by itself for any table whose rows name a position layer
(`Row 1 position`, `Rank 1`, `Place 1`); `docs/SVG_AUTHORING.md` §5b has the names.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `docs/svg-samples/results-board.svg`.
2. The Fields step says **Standings**. Next, Next, name it, add it to a production. Take.
3. Press **+1** under *Row 3 name* seven times: Noel Kivi (81) draws level with Eli North on 88,
   and the third slot's number turns to **2**. Press once more: Noel overtakes and glides into
   second place, Eli sliding down into third.
4. Press **−1** twice: they swap back. Press **Reset points**: everyone on 0, rows in drawn order,
   every position number reads 1.

## What to look at

- **Whether the glide reads.** Two rows crossing take 0.6 s at normal speed, eased at both ends.
  Say if it should be quicker, or if the overtaking row should sit in front while they cross.
- **The section headings on the control page** are the layer names (*Row 3 name*), exactly as the
  score tracker's are (*Team 3*). Rename a field in the Fields step and the heading follows.

## Decided, so you can overrule a thing that exists

- **The rows move; the words never swap slots.** Swapping names between slots would leave every
  box on the control page naming someone else after the first overtake.
- **Position numbers belong to the slots**, not to the competitors: `Position 1` always says who
  is first. A tie shares a place and the drawn order breaks it, so the same figures always give
  the same table on every screen.
- **A stripe drawn for a slot stays; a plate drawn for a row moves** (name it `Row 1`). The sample's
  alternating stripes are slot furniture, so they stay put.
- **Reset points goes to zero**, not back to the sample figures - the score tracker's New game
  rule.
