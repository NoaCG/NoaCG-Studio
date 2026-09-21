---
kind: walk
because: taste
date: 2026-09-21
serves: now
---

# One layer-naming system for every graphic

## What changed

You showed three quiz examples with three structures and three spellings and said "we just need
to have a system and stick by it". This is the system, written down in
`docs/backlog/one-layer-naming-system-for-every-graphic.md` and applied everywhere a student
looks:

- **Three layers in every example, in the same order: Text, Moments, Board.** Text is what the
  operator types, Moments is what NoaCG shows, hides or moves, Board is what stays as drawn.
- **A name is a word and a row, the row last:** `Answer A`, `Selected A`, `Score 1`,
  `Winner 2`. The quiz counts in letters because the letters are on the board; everything else
  counts in numbers. The quiz moments used to put the letter first (`A selected`); they now read
  like every other type (`Selected A`). The importer reads both, so old files still import.
- **One example file per type.** `quiz-lower-third.svg` and `scoreboard-lower-third.svg` are
  gone, with their pictures and links. Every plate and label in the six remaining files has a
  name (`Row A`, `Panel`, `Track 1`), so the Fields step's headings read as the file does.
- **The Layer names page opens with the system:** the three layers, the row rule, one full tree
  (the quiz, as Illustrator shows it), and a table of every name the importer reads with its
  synonyms and Finnish words. The table is generated from `words.json` by the same script that
  writes the internal authoring page, and the build fails if the two drift.
- **The wizard:** a text that is one letter starts unticked in every file, so a student's A to
  D never become fields whether or not they typed `static:`; unticking a field asks nothing
  (the words stay as drawn, and "take it off the artwork" is one press on the row); the box
  headings carry a small round colour dot after the name instead of the square that looked like
  a checkbox; furniture rows are listed after the fields; a group whose name a text took
  ("Question 2") is no longer offered as a drawn moment; and a file recognised as a type with no
  hidden layer at all is told that Export As leaves hidden layers out.
- The drop step's export help now teaches Save a Copy too, its chip is called "Exporting the
  SVG" as the docs call it, and the "Five steps now, not six" sentence says what happens next
  instead.

## Route in under a minute

`/docs#svg-layers`: the three layers, the row rule, the quiz tree and the table. Then
`/docs#quiz` and `/docs#scoreboards` for the trees in the same shape. Download `quiz.svg` from
the Layer names page and open it in Illustrator: the Layers panel shows Text, Moments and Board
(as groups inside Layer 1) with exactly the names on the page. Measured on Illustrator 2026
through its own scripting for all six files: every name, every hidden group and the order match
the drawn trees. Then `/app#/new`, Import graphic, drop `quiz.svg`: the
Fields step lists Question and Answer A to D first, the four `static:Letter` rows last and
unticked, and What it does says Quiz with every moment filled. Untick Answer B: no dialog, the
row says "stays as drawn".

## What to look at

- Decided, and yours to overrule: the quiz moments are spelled `Selected A`, `Correct A`,
  `Wrong A`. The alternative was to keep `A selected` and make every other type put the row
  first, which would have renamed `Flash 1`, `Winner 1` and the rest. To revert, change the
  three `teach` values in `src/templates/behaviours/words.json`, run
  `npm run write:behaviour-docs`, and rename the groups in `quiz.svg` and the two trees on the
  docs page.
- Decided: three top-level layers rather than a flat list, because that is how an Illustrator
  user already works (a Layer holds objects) and one tree shape is easier to copy than nineteen
  top-level rows.
- Decided: the scoreboard's flash layers are `Flash 1` and `Flash 2`, the word the wizard and
  the Clear flash button already use, and the example draws GOAL inside them. `Goal 1` still
  works.
- The Fields step pictures on the docs page (`type-*-fields.png`) were re-shot; row E noted the
  old ones still showed the "Create project" button.
