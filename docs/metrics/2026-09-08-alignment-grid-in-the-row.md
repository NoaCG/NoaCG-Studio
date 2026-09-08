# Measured 2026-09-08: the alignment grid in the row, and the nudge it hands back

Numbers read out of the running Fields step while building the alignment control
(docs/TEXT_BOX_BINDING.md step 3), on the owner's board
(`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg`) and the shipped scorebug
(`docs/svg-samples/scorebug.svg`), at 1280x720 unless the row says otherwise. Screen px unless the
column says artwork px.

## The height budget, before and after

The step's checklist has to arrive whole at 1280x720 and 1366x768 (`e2e/import-svg.spec.ts`, "the
mapping step's checklist is on screen"). The grid was put IN the row so that it costs no height; the
two text boxes paid for it in width.

| | Row height | Text boxes | Scorebug rows on screen at 1280x720 | Last row's bottom / port bottom |
|---|---|---|---|---|
| Before (step 2) | 54 | 191 + 191 | 7 | 621 / 651 |
| Grid in the row, row allowed to wrap | 54, clock row **116** | 160 + 160 | **6** | 669 / 651 |
| Grid in the row, no wrap, countdown option shortened | 54, clock row 56 | 160 + 160, clock row 97 + 97 | 7 | 609 / 651 |

The middle row is the one to remember: letting the row wrap so the nudge line could sit inside it
let the clock row's countdown picker wrap too, and that alone lost the step its last row. The nudge
line is now its own element after the row, and the picker's option reads "Countdown" rather than
"Countdown (operator sets minutes)" - a select is as wide as its longest option and never gives the
width back, and at the long wording the clock row's two text boxes were squeezed to 34 and 29 px.

At 1366x768 the seven rows end at 609 against a port bottom of 699.

## The grid itself

| | Value |
|---|---|
| Dots | 3 x 3, 8 px each, 3 px apart - 30 px, inside the 31 px the box leaves |
| Grid box | 33 px tall - the height a text box beside it computes to (6 px padding, 1 px border) |
| Column the row gives it | 52 px, label included |
| Owner's board, five rows, last row's bottom | 613 (with the question's nudge line), port 651 |

## The nudge, as the step says it and as the runtime spends it

The step measures on its own render of the artwork; the runtime measures in the preview, in the
real face after `document.fonts.ready`. The checkbox's sentence reads the step's number and the
runtime moves the block by its own, so the two are compared here.

| Line | Axis | The step's sentence | The runtime (`svgFitAlign.f0`) |
|---|---|---|---|
| Question | sideways | 41 px to the left | `nudge` within 3 units of -41 (asserted in the spec) |
| Question | vertical | 12 px up | `nudgeY` within 4 units of -12 (asserted in the spec) |

The design document's own table records the drawn insets as 209 and 280, which puts the question
35.5 units LEFT of its plate's centre in the box's frame; 41 is the same fact in the LINE's frame,
which is the frame the runtime spends it in (`wizard/measure-line-room-alignment-line-own`). The
2026-09-02 note recorded a vertical snap of 9 units on this plate; the step reads 12, and the
difference is the face the step's stage lays the text out in. The checkbox is worded from the
step's number and honoured from the runtime's, so a reader is never told a number the graphic then
ignores by more than a few units.

## Where the nudge line is offered

Offered where the larger of the two offsets is at least a quarter of the drawn type, and only while
the alignment on both axes is the drawn one.

| Board | Lines with a box | Lines offered the nudge | The largest offset that was NOT offered |
|---|---|---|---|
| Owner's quiz board | 5 | 1 (the question: 41 and 12 at a drawn 36) | the answers' vertical wobble |
| Shipped scorebug | 7 | 0 | a couple of units on 30-38 px figures |

## What a declared answer moves, on the question

Read inside the preview document by the spec, in the artwork's own units, from the block's
`getBBox` centre:

| Grid click | `text-anchor` | Centre moved sideways | Centre moved vertically |
|---|---|---|---|
| left, top | `start` | more than 100 units left | more than 20 units up |
| right, bottom | `end` | more than 100 units right | more than 20 units down |
| centred, middle (the drawn dot) | derived again | back within 0.5 of the drawn snap | - |
| drawn, nudge kept | derived, anchor nudged | exactly the runtime's `nudge` | exactly its `nudgeY` |
