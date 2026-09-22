---
kind: walk
because: taste
date: 2026-09-22
serves: now
---

# The wizard preview no longer goes blank on a step change

## What changed

Row E walked the Friday demo as a student and found the wizard preview blank for three to five
seconds after every step change. The stage dropped the old picture the moment a rebuilt document
was committed, and showed nothing until the new one had parsed its inlined fonts and started its
entrance. Now the old picture stays on the stage until the new document paints its first frame,
and then the new document's entrance plays exactly as it did before.

Measured in `e2e/wizard-preview.spec.ts` by filming the stage at a 12x CPU slowdown: the blank
went from 1.2 to 1.5 seconds down to about 45 ms, which is the entrance's own first frames
starting from nothing, as they always have.

## Route in under a minute

`/app#/new`, Import graphic, drop `quiz.svg` from `/docs#svg-layers`. On the Fields step, press
Next to Animation, then Back to Fields. Do it on the slowest laptop you have, or with DevTools >
Performance > CPU 6x slowdown.

## What to look at

- On each step change the quiz board stays on the stage until the new one takes over. It should
  never show the empty stage with only the dashed safe-margin guide for more than a blink.
- When the new document takes over, the board plays its entrance from nothing, as it did before.
  This is a hard cut from the full board to the start of the entrance. I decided that is the
  honest choice, because the alternative (a cross-fade, or a first-frame pose) changes what the
  entrance looks like, and the boundary for this change was that the animation stays identical.
- Typing on the Fields step rebuilds the preview too; it should no longer flicker to empty
  between keystrokes on a slow machine.
