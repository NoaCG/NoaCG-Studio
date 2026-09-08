---
kind: walk
date: 2026-09-08
---
# Hovering a text row now draws its box, its room and its alignment on your board

Last week's piece made the checklist SAY which box each line was drawn in. This one draws the same
sentence on the artwork, so you can check it against the picture instead of taking the list's word
for it. It also retires the amber rectangle that used to appear when you hovered a row: on your
board, where every plate is tilted on purpose, a rectangle square to the screen is a box around the
wrong thing.

**Route, under a minute.** Open the studio, Import graphic, drop
`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg` - your own quiz board - and click
Next to the Fields step. Then run your mouse down the checklist and watch the preview.

**What to look at.** Four things appear on the artwork while a row is hovered, and each answers a
question a student would ask out loud:

- **the box washes amber.** The wash is painted by the shape itself, so it is exactly the plate you
  drew, tilt and rounded corners and all. Hover your question and the tan plate lights; hover an
  answer and one orange band lights.
- **a dashed line shows the room** the text has inside that box, drawn on the same angle as the
  words.
- **a thin line hugs the words** as they stand right now. The gap between that line and the dashed
  one is how much room is left - which is the thing you asked to be able to see.
- **a small caret sits under the block** at the point a longer value will fill from, with the word:
  "centred, middle" on the question, "left, middle" on each answer.

Two figures ride the dashed line, just outside the box: the room at the sides and the room above,
in your artwork's own px. On the question they read **18** and **22**; on an answer, **34** and
**17**.

**The one thing worth arguing with.** Those figures are NOT the margins you drew - your question
sits 209 px in from one end of its plate and 280 from the other. They are the margins the system
will actually work to. On an axis where you CENTRED the text, the gap you left is half the
centring rather than a margin, so measuring it would tell the system your question has no room
left in a plate that will happily give it two more lines. It keeps half a line instead, which is
the rule you already approved on 2026-09-02 for the vertical case. The picture now shows that rule
rather than the composition. **If you would rather see the margins you drew,** say so - it is one
line, and I would want to know, because the two readings answer different questions and only one
of them can be on screen.

**The wash is deliberately faint** - twelve percent, so the plate still reads as its own colour.
On your tan question plate that is subtle. If it is too subtle to find with your eye, the number is
one place in `src/preview/composeDocument.ts` and easy to raise.

**One place the drawing tells the truth and looks slightly wrong.** Your question's text is drawn
level inside a plate turned 88.68 degrees, which is the only line on the board where the words and
their plate are not on the same angle. The room the system measures there is level, so its dashed
line pokes a little past the plate's tilted corners. That is not a drawing error - it is the room
the fit really uses, and it is the first time that approximation has been visible to anybody. It
costs nothing on your four answers, whose text and plates share an angle.

**What is deliberately NOT here.** You still cannot CHANGE the alignment - the nine-dot grid and
the "keep the nudge you drew" checkbox are the next piece, and the nudge your file recorded is
already measured and waiting for them. Growth is still answered in the control lower down rather
than on the box headings. Both are written up in `docs/TEXT_BOX_BINDING.md` as steps 3 and 4.
