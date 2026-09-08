---
kind: walk
date: 2026-09-08
---
# The text checklist now says which box each line was drawn in

On your quiz board you said the system "has no idea how the text should behave in relation to the
graphics behind it". Two of the three measured defects behind that are fixed and shipped. This is
the next piece, and it adds no control at all: the step already worked out which shape holds which
line - that is what the per-plate growth answers are keyed on - and it never said so. Your question
and its four answers were being read as **five separate boxes**, and nothing on screen claimed it.

**Route, under a minute.** Open the studio, Import graphic, drop
`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg` (your own board), and click Next
to the Fields step. The checklist now reads as five groups rather than one flat list: **Tan plate**
holding the question, then **Orange plate 1** to **4**, one answer each. Drop
`docs/svg-samples/scorebug.svg` instead and it reads as two: a black plate holding the teams,
scores and clock, and an orange plate holding the competition and the stage.

**What to look at.** The heading names a shape you can find on the artwork, and the square beside
it is that shape's own fill colour - tan for your question plate, orange for the answers. That
swatch is the whole point: it is meant to be checkable against the picture in one glance, without
anybody explaining what a binding is. So the question is whether the grouping matches what YOU see
when you look at your board. If a line is filed under a plate you would not have put it under,
that is the binding being wrong, and it is worth much more to know now than after growth answers
are built on top of it.

**Where the names come from.** Your layers are called `q bg` and similar, which would tell a
student nothing, so a box with no readable layer name is named by its colour and numbered where the
colour repeats. A layer you named "Question plate" keeps that name instead. If you would rather see
your own shorthand even when it is shorthand, say so - it is one predicate
(`isReadableBoxName` in `src/components/wizard/import/MapSvgFieldsStep.tsx`).

**What is deliberately NOT here.** The preview overlay - the tinted shape, the dashed insets, the
alignment caret - is the third part of this step and is not built. Hovering a row still draws the
old amber rectangle, which on your rotated plates sits outside the artwork; that is the next piece,
and `docs/TEXT_BOX_BINDING.md` step 2 carries it. Growth is still answered per plate in the control
lower down rather than on these headings, which is step 4.

**Two rules the corpus forced, worth your eye.** A group is a run of rows that sit next to each
other, so showing a row's box never MOVES that row - collecting every row sharing a box re-sorted
two corpus boards, once putting a question below its own four answers. And a shape covering more
than 70% of the frame is the board's backplate rather than a box: heading the whole list with it
would say nothing. Lines whose only shape is that backplate read "no box of their own, so nothing
grows around them", which is the honest answer for growth but does mean a line CAN sit visibly on
a big plate and be told it has no box. If that reads wrong to you, the threshold is one number.

**One number, so it is on the record.** The step has a measured height budget: the scorebug's seven
rows have to arrive whole on a 1280x720 window. Two headings at comfortable spacing put the last
row 9 px past the fold, so the rows inside a group are 2 px tighter than an ungrouped one and the
first group has no top margin. That buys 30 px of headroom and the budget is unchanged at seven.
If the list looks cramped to you, that is the trade to argue with.
