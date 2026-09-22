---
kind: walk
date: 2026-09-22
because: direction
serves: now
---
# The monitors and the rundown no longer move when you scroll the controls

Your production test found that PREVIEW, PROGRAM and the cue rundown still moved or bounced when
you scrolled the controls under them. The cause was that the whole page scrolled, and the
monitors and the rundown were only held in place on top of it. A trackpad's bounce at the end of
the page dragged everything, and scrolling the rundown to its last cue carried on into the page.
In a measured run the page itself scrolled 611px at 1366x768, 687px at 1280x720 and 238px at
1920x1080.

Now the page never scrolls. The header, the monitors with the TAKE block beside them, and the
rundown are fixed. The area under the monitors (the cue editor, graphic actions, live numbers,
controls and the activity log) is the only thing that scrolls, and it has a thin scrollbar of its
own at its right edge. The rundown still scrolls inside its own column, and reaching its end stops
there. Nothing else about the page changed: the same controls, sizes and positions.

On a phone the page still stacks into one column that scrolls as a whole, with TAKE, Next and Out
pinned to the bottom. That is on purpose, because a phone has no room to hold the monitors still
beside a scrolling editor. The phone header also lost the Playout / Data / Audience tabs, which
had pushed All out off the right edge of the screen.

## The route, under a minute

1. Open any production with a graphic that has many fields, such as the Friday Quiz, on the
   laptop you demo from.
2. Select the quiz cue, put the pointer over the editor and scroll down to the bottom and back,
   with the trackpad and then with a mouse wheel. Push past the end a few times.
3. Scroll the cue rundown to its last cue and keep scrolling.
4. Optional: open the same production on your phone and check All out is on screen in the header.

## What to look at

The two monitors, the TAKE block and the rundown should not move by a single pixel at any point,
including the bounce at either end. Only the editor area moves. Also check that nothing at the
bottom of the editor area is cut off when it is scrolled to the end.
