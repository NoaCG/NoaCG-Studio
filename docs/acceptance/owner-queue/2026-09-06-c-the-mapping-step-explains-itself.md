---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# The mapping step explains itself, and offers to do the rest

**Date:** 2026-09-06 · **Branch:** `claude/c-mapping-step-explains`

## What changed

Your three asks from 2026-09-05, straight after the sample quiz board worked
(`docs/backlog/the-mapping-step-should-explain-and-offer-to-do-it.md`):

- **Under every empty box, the name that would have filled it**: `name it “C selected”`,
  `name it “Score 2”`, `name it “Timer bar”`. Read off the same word list the import matches
  (`words.json`), through the matcher itself, so a name shown is a name that works. The quiz's
  three boxes are now labelled **Selected / Correct / Wrong**, the words the naming uses, as you
  ratified on 2026-09-03; the countdown's four wear the docs' words too.
- **A notice when a lot did not match**: from three empty boxes up, when the file holds layers
  nothing is using - "13 boxes below are still empty, and the file has 5 layers nothing is using.
  Their names did not say what they are…". A board with nothing hidden shows no notice: its
  boxes are empty because there is nothing to put in them.
- **Fill them in**: one press fills the empty boxes from the names first, then from where each
  hidden drawing sits on the artwork (the drawings across an answer's row are that row's moments;
  a green one is its correct look, a red one its wrong look; the figure beside a team name is its
  score). Every box it fills says why under it; **Undo** puts the whole press back. A box it is
  not sure about it leaves empty.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop the board you tested on 2026-09-05 with its moment
   layers renamed to anything ("Layer 7"), or `e2e/fixtures/svg-corpus/inkscape-hidden-state-layers-quiz.svg`
   after renaming its four hidden layers in Inkscape. (Its answers stay named, so the quiz is
   still proposed; the moments are not.)
2. In **What it does**: read the amber notice and the grey line under any empty box.
3. Press **Fill them in**. Read the line under each filled box. Press **Undo**.

## What to look at

- **Is the line under the box enough, or too quiet?** It is deliberately grey and small, because
  a board with nothing drawn shows twelve of them and twelve amber lines would read as twelve
  faults on a valid board. The notice above carries the loud version.
- **The threshold**: three empty boxes with unused layers. Below that the lines under the boxes
  are the whole answer.
- **The guess's failures, which are meant to be legible**: two hidden drawings on one row with
  no colour between them are taken in file order, and the line says so ("the 1st of 2 hidden
  drawings on row B"). A plate off to the side of every row fills nothing unless it is the one
  drawing left for the one empty box.
- **This was built without a browser** (cloud container): the heuristic was run in node against
  synthetic boards, and the layout - the hint under a box, the row alignment, the letter's
  position - is reasoned, not seen. If the letter or the selects sit off their line, say so.
