---
v: 2
source: derived
kind: finding
raised: 2026-09-19
state: unstarted
found: "The three game-show families ship three graphics each, so the wizard's kit flow cannot offer them: a pack has to cover the core six roles, and these cover one."
serves: P7
size: large
touches: src/templates/packs.ts, src/templates/types/
needs-owner: none
---

# Offer the quiz show set as a kit in the three game-show looks

**Filed:** 2026-09-19. **Source:** derived, while adding the sticker, showtime and arcade families.

## Why

A student building a quiz show wants the quiz board, the score and the lower third in ONE look,
created together. Today they pick a style chip in Browse and create three graphics one at a
time. The kit flow does exactly the wanted thing, and it cannot reach these families:
`validatePacks` requires every pack to ship the core six (a lower third, an opener, an info
card, a ticker or bug, a countdown or hold, a closing card), and each new family has a design
for one of those six roles.

## What it would take

Either five more designs per family (an opener, an info card, a bug, a countdown and a sign-off,
fifteen designs in all), after which a `quiz-show` pack is one entry in `packs.ts`. Or a
deliberate second pack class for a SEGMENT kit that is honest about not running a whole show,
which is a change to `docs/PACK_TAXONOMY.md` and to `validatePacks`, not to a design.

## Evidence

`src/templates/packs.ts` `CORE_SIX` and `validatePacks`. `docs/DESIGN_LANGUAGE.md` section 8,
"The three game-show families".
