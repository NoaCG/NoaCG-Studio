---
v: 2
source: owner
kind: ask
raised: 2026-09-21
state: advanced
note: the system below landed on branch claude/l-one-naming-system (examples, docs page, wizard defaults); what stands is his read of the chosen words, which he said he may rename, and docs/svg-samples/ which says it is a gallery rather than following the system
asked: "We just need to have a system and stick by it. This goes for all the different graphics." The reading stays as flexible as possible so people do not make mistakes, and the examples are strictly consistent. Pick the easiest and most logical scheme; he may rename later.
---
# One layer-naming system for every graphic

**Filed:** 2026-09-21. **Source:** owner, with Illustrator screenshots of three quiz examples
that carried three structures and three spellings. "We just need to have a system and stick by
it. This goes for all the different graphics." Students build the layers from the docs on Friday
with nobody helping.

This is the receipt for the system that was chosen. The owner said he may rename later; every
name below is the TAUGHT spelling, and the importer goes on reading every name it read before,
so a rename is a docs and examples change, never a migration.

## The system

**Three layers, in this order from the top of the Layers panel: Text, Moments, Board.**

- `Text` holds what the operator types: every live text object, named for what it is.
- `Moments` holds what NoaCG shows, hides or moves: a hidden group per moment (`Selected A`,
  `Flash 1`, `Full time`) and a bar drawn at full length (`Bar 1`, `Timer bar`).
- `Board` holds what stays as drawn: the panel, the row plates, the letters and labels.

**A name is a word and a row.** The word says what the layer is. The row is one letter or one
number, LAST, after a space: `Answer A`, `Score 1`, `Winner 2`. Layers with the same row belong
to the same answer, team or option. A quiz counts in letters because the letters are drawn on the
board; every other type counts in numbers.

**A moment is a hidden group.** A layer that shows only at one moment is a group, switched off in
the design app. Text inside it is drawing.

**A label is `static:`.** A text object that stays as drawn carries `static:` at the front:
`static:Letter A`, `static:Director`. A text that is a single letter starts unticked in the
wizard whatever it is called, so the A to D on a quiz row never become fields by accident.

**Spelling does not matter, the words do.** The importer reads `Answer A`, `answer_a`,
`ANSWER-A` and `Vastaus A` as the same layer: capitals, spaces, underscores and dashes are all
one separator, and the accepted words and their synonyms are in `src/templates/behaviours/words.json`.
The examples and the docs use one spelling so that a student copying them cannot go wrong; the
reading stays loose so that a student who does not copy them still gets there.

## What changed to make it so

- `words.json`: the quiz moments are taught as `Selected A`, `Correct A`, `Wrong A` (the row last,
  like every other type) instead of `A selected`. The matcher already read both.
- `public/docs/examples/`: one file per type, each with the three layers in the same order and
  every plate and label named. The two lower-third variants were removed: they were a second
  structure for the same type, which is the thing the owner objected to.
- `docs.html`, Layer names: opens with the system, one full tree, and a table of every name the
  importer reads, generated from `words.json` by `scripts/behaviour-docs.mjs` so the page cannot
  drift from the matcher. Each type page shows its tree in the same shape.
- The wizard: a single-letter text starts unticked; a group whose name a text took is not offered
  as a drawn moment; unticking a field asks nothing; the box headings carry a dot, not a square
  that looks like a checkbox; a file recognised as a type with no hidden layer at all is told
  that Export As leaves hidden layers out.

## What the owner can still change

The words themselves (`Moments` could be `States`; `Flash 1` could be `Goal 1`), the row rule for
the quiz (letters), and whether the three top-level layers should be two. Each is an edit to the
examples, the docs page and the `teach` field in `words.json`. What holds them together:
`npm run build` fails when the table on the Layer names page disagrees with `words.json`;
`node scripts/docs-shots.mjs` fails when an example stops importing as the type its page
promises; `e2e/docs.spec.ts` pins the tree shape on every type page and the names each page
lists. The drawn trees themselves are checked by eye against Illustrator, as row F did.
