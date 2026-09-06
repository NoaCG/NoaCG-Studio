---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# One less question on import: everything moves out of the way

**Date:** 2026-09-06 · **Branch:** `claude/f-growth-question`

## What changed

Your words on 2026-09-05:

> I feel like this option seems unnecessary. I think it might even just be more confusing to get
> these options ... when the question becomes long and the box gets bigger, everything else should
> just move out of the way.

**The option is gone.** Under "What else moves", each layer used to carry a picker - *Moves out of
the way* / *Grows by the same amount*. Now each row says what it does and there is nothing to
decide. The list still belongs to you: you can still drop a layer that should stay where you drew
it, and still add one by clicking it on the artwork.

**It was settled with your corpus, not by taste.** Every fixture in `e2e/fixtures/svg-corpus/` was
marked up by the real importer and swept over every panel that could grow, both directions - 172
combinations. The question was carried by **79** rows; **35** of them offered the second answer at
all; it was the right answer on **0** of them. That is not luck: a row in that list is a layer drawn
*past* the growing edge, and a layer that must stretch is one drawn *to both* of the panel's edges.
They cannot be the same layer.

**And stretching still happens where your artwork asks for it** - 31 such layers across 23 of the 46
importable fixtures. A rail down a plate's side or a band behind it grows with the panel by itself,
measured, with nobody asked. That was already true, with one hole: it stopped working the moment you
touched the travel list at all. So a lower third whose strap you dropped from the list silently lost
its growing rail. Fixed in the same change, and pinned by a spec that fails without the fix.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop any lower third, e.g.
   `e2e/fixtures/svg-corpus/illustrator-internal-css-lower-third.svg`. Next.
2. Under **When the text is too long**, choose *The panel gets taller* so something is drawn past
   the growing edge, and open **What else moves**. Each row is a name, the words "Moves out of the
   way", and a ✕. No dropdown.
3. Open the ⓘ beside it: two lines - what will happen in pixels, and the fact that a stripe drawn
   down the panel's whole height grows with it by itself rather than appearing in this list.
4. Drop a row with ✕ if you want, create the graphic, and type a long value: the layers on the list
   move, the layer you dropped stays, and the rail on the plate still grows.

## What to look at

- **Whether the row still says enough.** "Moves out of the way" now sits on each row as a
  statement, the same way an unticked text row says "stays as drawn". If a list of five layers all
  saying the same three words reads as noise, the alternative is to say it once above the list -
  one line to change.
- **Whether losing the option ever bites you.** It is still reachable, deliberately not at equal
  weight: the generated code's `NOACG_LAYOUT` table has a `mode` on every follower, and the comment
  above it now says when to write `'grow'`. If you ever find artwork that wants stretching and does
  not get it, that file is worth having - it is the case the measurement could not see.
