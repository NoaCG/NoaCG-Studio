---
kind: walk
date: 2026-09-08
serves: now
---
# "The panel gets taller" now makes the panel taller, and nothing stands outside its plate

Branch `claude/l-panel-that-never-grows`.

## What changed

On your own quiz board, a long question under "the panel gets taller" wrapped to eight lines at
full size inside a plate that never moved, and left the words 42px outside it. That is the fault
behind *"the answer texts don't get contained in their boxes"*, and it was two disagreeing
measurements rather than one bug.

The **offer** - how much room the fit is told it may wrap into - measured the question plate's own
distance to its margin: 384px. But the four answer plates travel with that plate, and the lowest
of them had 49px before it would have crossed the same margin. So the fit wrapped into 384px of
height that could only have been delivered by pushing the bottom answer off the board.

The **apply** - how much the panel actually grows - asked how far the block ran past the bottom of
its room. Your question is centred in its plate, so a block too big for its room hangs over the
top and the bottom equally: it never crossed that floor, and it reported that it needed nothing.
The panel grew by zero.

Both now read the same board. Room is measured from the far edge of everything that travels, and a
block asks for the height it is over by, whichever edge it is composed against. The question plate
now grows from 259px to 285px, the type settles at 29.2px over seven lines, and nothing spills.

## The route (under a minute)

1. `/app` -> **Import graphic** -> drop
   `e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg`.
2. Press **Next** to the mapping step and paste a long question into the row that starts
   "Question 1" - about 600 characters, three or four sentences.
3. Walk the four options in the "when text is too long" control, watching the live preview.

**What to look at:** under **the panel gets taller** the question plate is visibly deeper than the
one you drew, the four answers have moved down with it, and every word is inside the plate. Under
**the panel gets wider** and **the panel stays the size you drew** nothing spills either, exactly
as before. Under **wider, then taller** the plate widens and the text now fits without needing the
height at all.

Then shorten the question back to something ordinary and check the board comes back to the artwork
you drew - the panel should return to its drawn height, not stay stretched.

## The call that is yours

**A taller question plate pushes your answers down the board.** That is what the follower list on
that row says should happen, and the growth stops where the lowest answer would cross the same
margin the question keeps at the top - 29px on your board, so the composition stays mirrored. It
means a long question moves the whole stack a little rather than covering anything. If you would
rather the answers never moved at all, that is a different answer and it is yours to give: the
plate would then only ever grow into the gap above the first answer, which on this board is
roughly the same 49px, so in practice you would see the same picture with the answers standing
still.

## What this did NOT fix

Where several lines share one growing panel, each one is still offered the panel's whole remaining
height rather than a share of it. No corpus file wraps two lines in one panel today, so nothing
measured differently, but a board that did could ask for more room than exists between them. It is
in the code where the offer is written (`svgOfferHeights`), not filed as its own row.
