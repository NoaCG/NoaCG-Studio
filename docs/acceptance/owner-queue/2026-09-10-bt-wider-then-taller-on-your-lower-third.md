---
kind: walk
date: 2026-09-10
serves: now
---
# The plate you walked now gets wider and then taller

On 2026-09-03 you walked `effects-gradient-shadow-lower-third.svg` and found the plate widens, the
text wraps, and then the plate does not get taller - so the second line printed over the row
beneath it:

> we need to ensure that all our shapes can grow when we want them to grow vertically as well

It does both now. This is the walk that proves it, and the walk that found the thing which was
genuinely still broken underneath.

## The route, under a minute

1. `/app` -> Import graphic, and drop
   `e2e/fixtures/svg-corpus/effects-gradient-shadow-lower-third.svg`.
2. On the mapping step, set the too-long answer to **The panel gets wider, then taller**.
3. In the **Name** box, type a long name - about twenty words. The sample the gate uses is
   *"Which of these famous chess openings begins with the moves one e four, e five, two knight f
   three, and is named after an Italian player?"*, and anything of that length does it.

## What to look at

The dark plate gets **wider first** - 1040 px out to 1640, which is as far as the margin you drew
on the left allows it to reach on the right. Only then, when one line will not fit even at that
width, does it get **taller**: 190 px up to 257, growing upwards into the empty screen so the
bottom edge you composed against the frame never moves. The name wraps onto a second line at the
56 px it was drawn at - it does not shrink, because both of the rungs above shrinking could still
pay. And "Chief Correspondent" underneath stays exactly where it was drawn.

Try it with the other three answers for contrast. **The panel gets wider** alone gives you the
same plate width and a name shrunk to 35 px on one line, which is what the wrapped-line case used
to look like.

## The thing that was actually broken

Widening and growing taller together already worked - the note saying it did not was written on
2026-09-05, three days before the two commits that made vertical growth work. Walking it to check
found a different defect, and it is the one your own limit depends on ("we shouldn't be able to
put one page of text").

Growth is decided in screen pixels and spent by writing the artwork's own units, and the one line
of code that converts between the two was reading every plate as though it were a text box placed
on top of the artwork. On a 1920x1080 drawing those two numbers are identical, so this was
invisible on every graphic anyone has ever looked at. On a drawing whose units are millimetres -
which is what Inkscape gives a volunteer out of the box - the plate grew nearly four times too
far: a scorebug plate 86 px tall grew to 1700 px inside a 720 px frame, standing 1040 px below the
bottom of the screen. A 3840-wide ticker had it the other way and grew half as far as it should.

Both are fixed, and the whole fixture corpus is now swept for it on every build: no plate may end
up outside the frame, whatever units it was drawn in.

## Nothing needs you

This is a walk, not a decision. Delete the file once you have looked.
