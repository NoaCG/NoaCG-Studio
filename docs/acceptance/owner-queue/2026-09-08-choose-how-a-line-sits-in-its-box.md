---
kind: walk
date: 2026-09-08
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
