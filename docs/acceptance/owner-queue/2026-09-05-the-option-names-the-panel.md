---
kind: walk
date: 2026-09-05
serves: now
answered: true
---
# Every too-long option now names the panel, because the panel is what changes

**Date:** 2026-09-05 · **Branch:** `claude/new-session-54bf87`

## What changed

Your report: *"I can change how the text should react, but nothing happens in the preview."*

Measured on your own board - one question at three lengths, all four options at each length. At
147 and 295 characters **the four options give byte-identical text**: same size, same line count.
Only the panel's width moves. So switching between "the text gets smaller" and "the text wraps onto
more lines" showed you the text doing exactly the same thing, twice.

The fit was right every time; the labels were not. The ladder wraps into the room the design
already has before it reaches any rung an option names, so on copy that fits by wrapping it never
gets further - and two of the four labels named a rung rather than the choice. The paragraph above
the control had always said the true thing.

So every option now names the PANEL, which is the only thing that differs:

- The panel gets wider
- The panel gets wider, then taller
- The panel gets taller
- The panel stays the size you drew

…and the prose says plainly that the text wraps under all four and shrinks if it still will not
fit.

## The route, under a minute

`/app` -> **Import graphic** -> drop `e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg`
-> **Next**. Read the **Too-long text** control and its ⓘ.

## What to look at

- **Do the four options now say something you can act on?** That is the whole change. They describe
  the panel because the panel is the only thing your choice moves.
- Whether "The panel stays the size you drew" is the right name for what used to be "The text gets
  smaller". It is the honest one - the text always gets smaller when it has to - but it is a
  wording call and one line changes it.

## What this did NOT fix, and you should know before you test it

Measuring this turned up a real defect on the same board: **"the panel gets taller" never grows the
panel.** At 591 characters it wraps to eight lines at full size against a plate that stays exactly
the height it was drawn, and the words end up standing about 40px outside it. The two options that
keep their panel height are correct - they shrink, and nothing spills.

That is almost certainly the same fault as the preview-versus-program disagreement you reported on
2026-09-04 (*"the answer texts don't get contained in their boxes"*). It is filed with the full
table, and the gate PINS the broken behaviour on purpose so the fix is visible when it lands
rather than silent.

**Fixed on 2026-09-08** - `docs/acceptance/owner-queue/2026-09-08-the-panel-that-gets-taller.md`
carries the measurement and the route.

## Also worth a look while you are here: text that is too long now SHRINKS, never condenses

The legibility fix from earlier today was corrected after CI measured it. Stopping the condensing
and leaving the words where they fell put a corpus endboard 354px outside its plate. Your own
sentence settles it more precisely: too small is the user’s own fault, dense is never allowed. So
the type keeps SHRINKING past the 55% warning threshold - down to 30% of the drawn size - and
condensing is now a last resort that almost never fires.

Type an absurdly long question into any imported board. It should get small, stay inside its
plate, keep its letterforms, and still raise "too long for the design" on the operator surface.
What you should NOT see is a band of grey texture, or words standing outside the shape.
