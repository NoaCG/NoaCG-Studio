---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "the four credit-roll designs now preview their closing mark, so cr01, cr02, cr11 and cr13 show the same logo over the same year on the Browse card, the library thumbnail and the operator preview"
---
# A settled credit roll previews the one frame that cannot tell four designs apart

**Filed:** 2026-09-10, during the owner-queue drain against the four reasons. **Source:**
`docs/acceptance/owner-queue/2026-09-06-d-a-credit-roll-that-runs-through.md`, which shipped the
change, spotted the consequence and offered it back to the owner.

## Why

Making a roll run all the way through was right and stays. The side effect is that every surface
which parks a graphic at its settle now parks the four roll designs on their closing mark - a logo
slot and a year. Those four designs differ almost entirely in their typography, so their Browse
cards, library thumbnails and operator previews became four pictures of the same thing.

A picker card exists to tell designs apart. The last frame of a credit roll is precisely the frame
that cannot, which makes this a defect rather than a preference and takes it off the owner's list.
The ending itself is unchanged; only what a still card shows moves.

## What it would take

One change in the preview settle recipe, for every travelling graphic at once rather than per
template - the source item says so and names it as a one-line shape. A travelling graphic previews
mid-flight; a graphic that does not travel is unaffected. The check is the four roll cards side by
side in Browse (cr01, cr02, cr11, cr13) plus the Crawl design, which is the same story sideways.

## Evidence

**The four designs are `cr01`, `cr02`, `cr11` and `cr13`, plus the Crawl**, and the state to look
at is what each shows in Browse without pressing play. The change that produced it landed on
2026-09-06 on branch `claude/d-scroll-speed-and-through`, which made a roll run all the way through
so that its settle is the closing mark rather than a frame of names; the preview settle recipe is
what parks a graphic there. Filed to the owner queue the same day as
`d-a-credit-roll-that-runs-through`, which recorded the consequence and offered it back.

The related live-numbers gap on the same designs is
`docs/backlog/a-live-number-that-does-not-move-a-credit-roll.md`.
