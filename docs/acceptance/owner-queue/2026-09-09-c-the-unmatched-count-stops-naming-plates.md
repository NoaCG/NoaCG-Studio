---
kind: walk
date: 2026-09-09
serves: now
answered: false
---
# The mapping step's unmatched notice stops calling background plates spare layers

**Date:** 2026-09-09 · **Branch:** `claude/c-vote-notice-plates`

## What changed

The notice on the mapping step says "N boxes below are still empty, and the file has M layers
nothing is using", and it is gated at three empty boxes precisely so it fires when the reader will
act on it. On a vote board M was wrong. The vote's **Bar** role is a gauge, and a gauge is filled
from any drawing at all, so while its boxes are empty every rectangle in the file is pooled - the
full-bleed plate the board is drawn on included. The notice was sending authors off to rename
their backdrop. The defect was filed on the shelf as
`the-vote-notice-counts-plates-as-spare-layers` and deleted in the change that served it, as the
shelf's own rule says.

The count now leaves out a drawing that covers the artwork's whole ink. Nothing else moved: the
sentence, the three-box gate, the names under each box and **Fill them in** are all as they were.

**The number is measured, not guessed.** `scripts/svg-plate-share-spike.mjs` walks the 77 artwork
files in `e2e/fixtures/svg-corpus/`, `docs/svg-samples/` and `e2e/fixtures/svg-shows/` through the
real importer and a real render, and prints how much of the artwork each of the 653 drawings the
step offers covers. Of the 485 visible ones, 132 sit at 95% of the artwork's ink or above and
**every one of them is a backplate, a panel, or the group wrapped round the whole graphic**. The
band from 95% to 99.8% is empty. The first drawing that is not a plate appears at 73.7%, and from
70% down the two are mixed - a scorebug's plate at 71.7% sits beside a group of words at 71.6%. So
95% is the round number inside the gap, and the slack matters: your own rotated quiz board draws
its backdrop at 99.8%, not 100%.

Size alone is not the whole rule. A plate also has to have **something else drawn on it**, because
a file whose one drawing is a bar with the figure written across it would otherwise be 100% of an
artwork it is the whole of - and the single layer that author most needs to name would be the one
the notice stopped naming. Over the corpus that costs exactly one exclusion: the shipped rule calls
131 of the 132 a plate, and the one it declines is `logo-small-favicon`, whose corner mark is the
only drawing in its file. The spike now runs the shipped rule and prints its verdict per file, so
re-deriving the number exercises the code rather than a copy of it.

The measurement also changed the fix. The backlog proposed a share of the artwork's FRAME; the
corpus refuses it. The same plate is 7.6% of the frame on a nameplate drawn into a 1920x1080
artboard and 100% on a full-bleed board, and the live vote band's own plate is 31.5% - a frame rule
at 70% would miss 75 of the 132 plates, that one included. The denominator is the ink: the union of
every layer the step could measure, which is what a reader points at when they say "the artwork".

## The route, under a minute

1. `/app` -> **Import graphic** -> drop a vote board whose layers are not named for the roles.
   `e2e/fixtures/svg-corpus/illustrator-live-vote-band.svg` will NOT show this: its names all
   match, so no box is empty. Use the board the e2e walk writes (search
   `e2e/import-svg-behaviour.spec.ts` for "vote-board-with-a-plate"), or take any board of your own
   and rename its bar layers to something else.
2. In **What it does**, pick **Live vote** from the behaviour dropdown.
3. Read the amber notice. It counts everything drawn on the board and not the board.

Measured on that board through the real step, before and after: **"11 boxes … and the file has 15
layers nothing is using"** became **"11 boxes … and the file has 14 layers nothing is using"**. The
one that went is the plate.

## What to look at

- **Is 95% the line you would draw?** The distribution is in the comment beside
  `PLATE_SHARE_OF_ARTWORK` in `src/components/wizard/import/fieldAutoMap.ts`, and
  `node scripts/svg-plate-share-spike.mjs` re-derives it (it opens Chromium, so queue it).
- **The rules and row furniture are still counted, deliberately.** A track drawn behind a bar
  really could be the bar the author meant to name, and the corpus says nothing separates the two
  by size. If you would rather the notice said nothing about those either, that is a copy change
  and the backlog argues against it - say so and it can be revisited.
- **A hidden layer is never a plate**, however big. A designer does not hide the base look, so an
  exported-hidden full-board layer is a moment they drew, and a moment nothing is using is exactly
  what this notice exists to name. Two live in the corpus: a "Time up" state over 67% of its board
  and a "Goal" over 75%.
- **The step still carries an older, different answer to "what is a backplate"** -
  `BACKPLATE_SHARE_OF_FRAME = 0.7`, which decides the checklist's grouping and the growth
  proposal. The new measurement says that one is weak (a frame rule at 70% misses 57% of the
  corpus's plates), but moving those two onto the ink would change what the checklist and the
  growth control do on every lower third, and nobody has measured that. Filed as
  `docs/backlog/one-rule-for-what-a-backplate-is.md` rather than changed here.
- **This was built without a browser open on the app** (the wave's browser slot was elsewhere).
  The numbers were re-derived through a queued Playwright walk that reads the notice's own text,
  and through `scripts/field-auto-map.test.mjs`; nobody has looked at the notice on screen. If the
  sentence reads oddly with the new number in it, say so.
