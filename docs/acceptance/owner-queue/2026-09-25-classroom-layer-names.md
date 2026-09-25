---
kind: walk
because: taste
date: 2026-09-25
serves: now
---

# The classroom README explains the layer names

## What changed

README.pdf in the classroom package is now two pages. Page 1 is the do-this sheet as before.
Page 2, "Layer names", explains the three layers (Text, Moments, Board) and the rules behind
the names, then gives one table row per graphic: the show intro (title), the name tag (lower
third), the quiz, the score tracker (scoreboard) and the end credits. Every row lists the exact
names that graphic's Text, Moments and Board layers hold, taken from the SVGs in the package.
Under the table, two lines say when each quiz and score moment shows.

It did not fit on one page. The section adds about 11 cm, so the pack script now prints two
pages, with a `---` in README.md as the page break, and it refuses anything else.

## Route

1. Open `public/downloads/NoaCG-classroom-package.zip` in this branch, or
   https://noacg.studio/downloads/NoaCG-classroom-package.zip after it lands.
2. Open `NoaCG-classroom-package/README.pdf` and go to page 2.

## What to look at

- Whether the table answers "what do I name my layers" for each of the five graphics without
  opening the SVGs.
- Whether the table is readable when printed, since its type is smaller than page 1's.
