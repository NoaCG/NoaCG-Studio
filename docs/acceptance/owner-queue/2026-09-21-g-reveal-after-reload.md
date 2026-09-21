---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# A hosted Take airs the answer you just picked, and a reload keeps the quiz where it was

Yesterday's note said a Reveal pressed from a hosted control tab that had just been reloaded did
not reach air. The reload was not the cause. The trace showed the Reveal reaching the renderer
and the verdict lighting. It lit on answer A, because air had key A, not the C the operator
picked. On the hosted control page, a picked or typed value only counted after a debounce and a
round trip to the server, about a second. A Take pressed inside that second aired the cue's old
value. The page now counts your own edits at once, so the key you pick is the key that airs.

A second fault sat behind it. After a reload, the hosted page rebuilt its PROGRAM monitor from
the graphic's entrance. About a second later its state chip dropped "Locked in" and Reveal
correct went grey. The page now restores the state the renderer last reported, as the dashboard
already did.

The workaround in yesterday's note is no longer needed.

## The route, under a minute

1. Open a published production that holds the quiz board (import `docs/svg-samples/quiz-board.svg`
   and add it to a production, then press Publish). Open Links and open the hosted control page
   in a new tab, and open the output URL in a third tab.
2. On the hosted page, select Quiz board. Pick C as the correct answer and B as the contestant's
   answer, then press TAKE straight away, without pausing. Press Select answer, then Lock it in.
3. Reload the hosted tab, wait a few seconds, and press Reveal correct.

## What to look at

- **The output tab lights C as correct**, not A, and the dashboard's PROGRAM monitor agrees.
- **The hosted page's state chip still reads "Locked in"** a few seconds after the reload, and
  Reveal correct is not greyed.
- **Reload the dashboard.** Both graphics come back on PROGRAM, the quiz still showing C as the
  correct answer and B as the pick. The quiz is not replayed from its entrance.
