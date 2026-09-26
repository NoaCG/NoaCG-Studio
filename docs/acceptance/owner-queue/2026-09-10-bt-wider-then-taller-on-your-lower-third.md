---
kind: desktop
date: 2026-09-10
because: taste
serves: now
---
# A long text on your own artwork: does the box grow the way you drew it?

You reported three times that a longer text shrank instead of making room: *"we need to ensure that
all our shapes can grow when we want them to grow vertically as well."* A box can now get wider,
then taller; each box answers on its own; a dashed line on the preview sets how far a box may get
taller; and a long quiz question wraps in the band it was drawn in. The question wrap and the
slanted-plate growth are pinned by `e2e/import-svg-behaviour.spec.ts`; the per-box growth tests
are among the specs being moved off the old editor
(`docs/backlog/specs-that-still-open-the-old-editor.md`). Whether the result still looks like the
graphic you drew is your eye.

## The route, about five minutes

1. /app, **Import graphic**, drop `e2e/fixtures/svg-corpus/effects-gradient-shadow-lower-third.svg`.
   On the Fields step set the name's box to **gets wider, then taller** and type about twenty words.
2. Drop `e2e/fixtures/svg-corpus/illustrator-question-timer-board.svg` instead. Set the amber band
   to **gets wider** and the dark panel to **gets taller**, then drag the dashed limit line.
3. Drop `quiz.svg` from the docs examples, finish into a production, take it, type a question three
   times the drawn length and press **Update**.

**What to look at.** The lower-third plate widens first (1040 px out to 1640), then grows upwards
(190 px to 257), with the name kept at its drawn 56 px and "Chief Correspondent" standing still.
The two timer boxes answer differently without disturbing each other. The quiz question wraps above
the answer rows at its drawn size. Say where any of it stops looking like your drawing. One open
taste call: on a thin lower-third quiz, two lines cost about a third of the type size; say if you
would rather that board grew instead.
