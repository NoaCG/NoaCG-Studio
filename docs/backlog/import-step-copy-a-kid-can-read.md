---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
asked: "the whole import page right now is difficult to read. The info text is confusing ... We need to do an /unslop for this too, so it would read so a kid could understand what's happening"
note: 7e7140ce and b28aca28 rewrote the long-text and behaviour blocks in his own words; the cold read-back by someone who has never seen the step has not happened
---
# The import step explains itself at spec length, not at reading length

**Filed:** 2026-09-03, from the live-vote walk, with a screenshot of the offending block.

## Why

The Fields step's WHEN THE TEXT IS TOO LONG section runs to roughly fifteen lines across four
paragraphs, a "WHAT ELSE MOVES" panel with its own three-paragraph explanation, and several info
buttons whose contents he found no clearer than the labels.

> Everything here is difficult to understand, and the information buttons don't really add that
> much help.

> it needs to be shorter and just what it does. Should it explain anything extra? No one wants to
> read more than a few lines. It should be intuitive.

> There's something that needs to be done so it's more clear what it actually does, and it should
> be just very simple and tested. It's clear for everyone what it does, and it works exactly as it
> claims it should work.

That last clause is the one to hold onto. He is not only asking for shorter words; he is asking
that the control do exactly what its sentence claims. Which is why this row comes AFTER the
fit-ladder bugs rather than before: polishing the description of a control that misbehaves only
produces a confident wrong sentence.

## What it would take

1. One line per control saying what it does. The reasoning behind a rule goes in the info popover
   or nowhere.
2. Cut the paragraphs that explain the mechanism - how far a layer moves, why a rule drawn across
   the panel stays full width. A user needs the outcome, not the model.
3. The "What it does" behaviour box gets the same treatment.
4. Read it back cold against the unslop rules, then have someone who has never seen the step follow
   it end to end.

The `/docs` pages were rewritten this way on 2026-09-02 and he accepted them the same day
(*"The docs are good"*), so the voice to match already exists inside the product.

## Evidence

Owner walk, verbatim in `docs/acceptance/owner-queue/2026-08-30-a-live-vote-on-your-own-artwork.md`.
The step is `src/components/wizard/import/MapSvgFieldsStep.tsx`.
