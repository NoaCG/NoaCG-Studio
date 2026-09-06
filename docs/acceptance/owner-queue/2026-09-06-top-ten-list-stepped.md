---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# A top ten list: Next reveals the entries from ten down to one

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-game-shows-518d88`

## What changed

The late-night top ten. A student draws ten numbered rows with each entry drawn as it looks
revealed and hides a "Mark 1..10" rail per row; the import proposes the **Stepped list** recipe.
The whole behaviour is the default path, one step per entry, so the ordinary Next button (and
SPX's Continue, CasparCG's NEXT) walks it and no extra button exists. The entries are one box, a
line per number. An option flips the order to 1 upwards, for an agenda.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-shows/top-ten-list.svg`. "Stepped
   list", 10 rows, the option "Reveal from the last number down to 1" ticked.
2. Next, Next, name it, add it to a production.
3. Type ten lines into **Entries**, Take, then press **Next** a few times on the verb bar.

## What to look at

- The ten rank numerals ("10.", "9.") arrive as ten fields to untick, because nothing in a file
  can say "this text is decoration". A finding, not a defect of the list.
- Whether "line 1 is number 1" is the right way round for a list that reveals from ten.
