---
kind: walk
date: 2026-09-10
because: taste
serves: now
---
## Kept as the owner's, 2026-09-10 - the four reasons drain

This item was re-kinded to `agent` during the drain and put back the same day, because the review
of that drain caught what the re-kind had missed. Its own text says *"Nothing needs you. This is a
walk, not a decision."* - but it now carries three items' worth of one road: this walk, plus the
option naming and the growth fix it absorbed below, both of which were `serves: now` items on his
own lists.

That road is the one he has reported broken three times, most recently in the sentence this walk
was built to answer: *"we need to ensure that all our shapes can grow when we want them to grow
vertically as well."* Whether a plate that goes 1040 to 1640 and then 190 to 257 looks like the
graphic he drew is his eye, and no gate asserts it. `because: taste`.

It is also the wrong shape to re-kind an absorbing item in the commit that deletes what it
absorbed: the re-kinding rule wants the conversion reviewable on its own, and folding three items
into one and moving that one off his lists in a single step is exactly what it refuses.

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

## Consolidated 2026-09-10 - this is now the whole too-long-text walk

Two earlier items opened the same control on the same step and both were overtaken by this one, so
they are folded in here and their files are gone. Git holds them.

**`2026-09-05-the-option-names-the-panel.md`** renamed the four options after the panel, because
measurement on the owner's own board showed all four giving byte-identical text at 147 and 295
characters and only the panel's width moving. Its own text already marked its remaining defect
**Fixed on 2026-09-08**, and its one open question - whether "The panel stays the size you drew" is
the right name for what used to be "The text gets smaller" - is answered by the same measurement
that forced the rename: it is the only one of the four that describes what the reader's choice
actually changes. It stays.

**`2026-09-08-the-panel-that-gets-taller.md`** fixed the growth itself - the offer measured 384 px
of height that could only have come from pushing the bottom answer off the board, and the apply
asked how far a centred block ran past a floor it never crossed. The question plate now grows 259
px to 285 px and nothing spills. The one call it put up was whether a taller question plate should
push the answers down, and its own text settles it: the growth stops where the lowest answer would
cross the same margin the question keeps at the top, so *"in practice you would see the same
picture with the answers standing still"*. Two answers that produce the same picture are not a
choice worth an owner's minute.

What is left across all three is one route and one look: drop the lower third, choose **wider, then
taller**, type twenty words, and check the plate goes 1040 to 1640 and then 190 to 257 with
"Chief Correspondent" standing still. That is a claim an agent drives.

**Still open underneath, and not this item's:** where several lines share one growing panel, each
is offered the panel's whole remaining height rather than a share of it. No corpus file wraps two
lines in one panel today, so nothing has measured differently - it is in `svgOfferHeights`.
