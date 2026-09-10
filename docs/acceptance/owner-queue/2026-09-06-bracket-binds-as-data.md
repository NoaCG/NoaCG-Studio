---
kind: walk
date: 2026-09-06
because: scope
serves: now
answered: false
---
# A tournament bracket: no recipe, the slots are typed, a choice and a switch do the rest

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-game-shows-518d88`

## What changed

Nothing was built for it, and that is the finding. An eight-team bracket imports with fifteen
typed slots, `choice:Match/1..7` frames and a `show:Crown`. The winner of a match moves up by
being typed into the next slot. What the model cannot say - "the winner of match 1's name moves
up by itself" - is recorded in `docs/SVG_BEHAVIOUR_PLAN.md` §13: a bracket repeats along two
keys (teams and matches) and a recipe carries one.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/bracket.svg`. Behaviour reads
   "Nothing"; the Switches and choices section shows 1 switch, 1 choice.
2. Next, Next, name it, add it to a production, Take. Press **3**, then **Show Crown**.

## What to look at

- The Champion slot arrives named "Words": a layer named after its own text loses its name to
  the group above it. An import trap worth its own backlog item.
- Whether a bracket that is data all the way is good enough for the students' tournament
  episode, or whether the two-row-set recipe is worth designing.
