---
kind: walk
date: 2026-09-08
because: taste
---
# You can now choose how a line sits in its box, and take back the nudge you drew

Two pieces this week put the box binding on screen: the checklist says which box each line was
drawn in, and hovering a row draws that box and its room on your board. This is the first piece
that lets you CHANGE something about it. It is the feature you called "quite an advanced" one on
2026-09-02 and sent to the backlog; it was built ahead of growth-per-box because it is the one-click
fix for a drawing the system reads wrong, and the reasoning is written up in
`docs/TEXT_BOX_BINDING.md` under "Alignment" where you can overrule it.

**Route, under a minute.** Open the studio, Import graphic, drop
`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg` - your quiz board - and click
Next to the Fields step. Every row now ends in a small three-by-three of dots under the word
ALIGNED.

**What to look at.**

- **The ringed dot is what the system read off your drawing.** On the question it is the centre
  dot: centred, middle. On the answers it is the left-middle dot. Hover the row and the caret on
  the preview says the same words.
- **Click any other dot** - say the top-left one on the question. The dot fills solid, the caret
  under the block on the preview changes to "left, top", and the question moves to the left inside
  edge of the tan plate and up to its top. Type a long question in the Text box and it wraps from
  there. Click the ringed dot to hand the row back to your drawing.
- **The line under the question row:** "keep the nudge you drew: 41 px to the left, 12 px up".
  Your question was composed a little left of its plate's centre and a little above it, and the
  snap you ruled for on 2026-09-02 moved it onto the centre. Tick the box and it goes back to where
  you drew it - and stays there as the value wraps, because the offset rides the anchor rather than
  the words. The four answers show no such line: their offsets are the hand's wobble, not a
  composition, and the line appears only where the offset is at least a quarter of the type.

**Two things worth arguing with.**

- **Where the grid sits.** The design mock put it in a strip that opened under each row with a
  summary line. The step has a height budget - the scorebug's seven rows have to arrive whole on a
  1280x720 window - and a summary line per row would have cost it. So the grid is in the row, and
  the two text boxes each gave up about 30 px to make room. If the Text box now feels tight when
  you type a long value, say so; the alternative is the strip, paid for out of the budget.
- **The quarter-of-the-type rule** for offering the nudge line. Any threshold is a judgement. If
  you want the line on every centred row, or never, it is one number.
- **How far from the edge a moved line stands.** Your question was drawn centred, with 209 px on
  one side and 280 on the other. Sent to the left, it keeps half its type size (18 px) from the
  plate's inside edge, because the gaps you drew were centring rather than margins - and it reads
  tight against the edge on your plate. A line you drew against a side keeps the gap you drew when
  it is sent to the other side. If a moved line should keep a bigger margin, say which.

**What is deliberately NOT here.** Growth is still answered in the control lower down, not on the
box headings - that is the next piece. And line alignment inside a wrapped block (every line
centred versus flush left) is unchanged from the side-by-side you approved: centring a block still
centres its lines.

## Consolidated 2026-09-10 - this is now the whole box-binding walk

Three items were waiting on the same board, the same step and the same trip: this one, plus
`2026-09-08-the-checklist-says-which-box-each-line-is-in.md` (step 1 of
`docs/TEXT_BOX_BINDING.md`) and `2026-09-08-the-artwork-shows-you-the-box-and-the-room.md`
(step 2). They are one sitting - open the studio, drop your rotated quiz board, press Next - so
walking them apart costs three trips through one screen for one board's worth of judgement.
Nothing is dropped: both questions are quoted below and git holds the originals. The precedent is
`2026-09-10-the-first-weekly-alignment-session.md`, which consolidated four items on the same
grounds the same day.

**From step 1, the checklist.** Your board reads as five groups - Tan plate holding the question,
Orange plate 1 to 4, one answer each - and the swatch beside each heading is that shape's own fill.

> the question is whether the grouping matches what YOU see when you look at your board. If a line
> is filed under a plate you would not have put it under, that is the binding being wrong, and it
> is worth much more to know now than after growth answers are built on top of it.

That one is yours because nobody but the person who drew the board knows what they meant by it.

**From step 2, the overlay.** Hovering a row washes the box amber, dashes the room it has, hugs the
words as they stand and drops a caret saying "centred, middle".

> Those figures are NOT the margins you drew - your question sits 209 px in from one end of its
> plate and 280 from the other. They are the margins the system will actually work to. **If you
> would rather see the margins you drew,** say so - it is one line, and I would want to know,
> because the two readings answer different questions and only one of them can be on screen.

Also from step 2, and cheaper to answer: the wash is twelve percent, which is subtle on a tan
plate. If you cannot find it with your eye, say so and the number goes up.

**What was decided rather than asked, out of all three.** The name a box falls back to - its colour
plus a number where the colour repeats - stays, because `q bg` teaches a student nothing. The 70%
backplate threshold stays where it is until somebody measures what moving it does to the checklist
and the growth control, which is filed as `docs/backlog/one-rule-for-what-a-backplate-is.md`. And
the step's seven-row height budget is unchanged, so the three numbers this item offered up - where
the grid sits, the quarter-of-the-type rule, the margin a moved line keeps - stay as shipped: each
is argued from the corpus in the text above, and a threshold with an argument behind it is a
default, not a taste call.
