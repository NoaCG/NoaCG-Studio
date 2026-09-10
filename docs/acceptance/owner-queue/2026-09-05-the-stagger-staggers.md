---
kind: walk
date: 2026-09-05
because: taste
serves: now
answered: true
---
# The layer stagger staggers, and the words take their turn

**Date:** 2026-09-05 · **Branch:** `claude/new-session-54bf87`

## What changed

Your report: *"it staggers the background graphic, but they're not one at a time… The text is also
visible from the start… the effect should stagger the text also."*

Three faults, all measured on the quiz-board sample you walked:

1. **Most of the beats were empty.** The stagger walked every top-level layer, and on that board
   **13 of 19 are the drawn moments a quiz keeps hidden** - the picks, the verdicts, the lock. The
   cascade was six visible things spread across nineteen slots, which is why it read as noise
   rather than as one-after-another. Hidden layers no longer get a beat.
2. **The words could never take part.** The layer reader rejects any id shaped like a field, so
   your text was excluded by construction and sat at full opacity while the artwork arrived behind
   it. Fields are now members of the cascade in their own right.
3. **The gap was a constant.** 0.09 s, whatever the design. It is now shared out of a fixed
   cascade budget, so a three-layer badge and a twelve-member board both read as a cascade.

Measured after the fix, on your board: **12 members, 0.14 s apart, a 2.03 s entrance** - the six
visible layers rise, then the five words fade in one at a time. The words take opacity only,
because their rise belongs to the plate they sit on and tweening both would move a word twice as
far as the panel under it.

## The route, about a minute

1. `/app` -> **Import graphic** -> drop `docs/svg-samples/quiz-board.svg` -> **Next** -> **Next**.
2. On the Animation step pick **Layer stagger** and watch the preview.

## What to look at

- **Does it read as one at a time now?** That is the whole question, and it is the one thing I
  could not judge from here: a browser pane that is not being composited throttles animation, so
  what I verified is the choreography data (which member moves when), not the feel.
- **Is 2 seconds too long for an entrance?** It is the honest consequence of eleven members having
  their own beat. Two numbers set it - the 1.4 s cascade budget and the 0.5 s each member takes -
  and either is a one-line change. If it drags, the budget is the one to cut.
- The words arriving after their plates, rather than with them. That was the deliberate call; the
  alternative is every word landing with its own row.

Gated by `e2e/motion-presets.spec.ts`, which asserts no hidden layer gets a beat, that every field
is a member and opens hidden, and that the gaps are big enough to read as separate.

## Also in this change

**"Grows by the same amount" was doing nothing on a text layer.** Growing writes a width, and a
text layer has none, so choosing it silently switched that layer's following OFF - which is what
you saw as the text not following the box. Two halves: the wizard no longer offers the option to a
layer that cannot stretch (your own rule, twice given), and a template saved while it did now
travels instead of standing still.

## The timing is RULED, before the walk - owner, 2026-09-05

> Keep the stagger as is. I will let you know if we want to change it at some point.

So the two numbers this item offered up for judgement - the 1.4 s cascade budget and the 0.5 s
each member takes - are SETTLED, and a session that finds the 2 s entrance long should leave it
alone. He has the item; he will say so if he wants it shorter.

What stays open here is only what he has not seen: whether the cascade READS as one-at-a-time on
a screen. That is a look, not a number, and nothing in the repo can answer it.
