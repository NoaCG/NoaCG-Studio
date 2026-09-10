---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "the room rule gives a line sitting on its box's middle exactly the width it already occupies - 453, 701 and 319 units against drawn widths of 453, 702 and 319 - so a centred line never fills and goes straight to wrapping"
---
# A centred line is handed its own width as room, so it can never fill

**Filed:** 2026-09-10, during the owner-queue drain against the four reasons. **Source:**
`docs/acceptance/owner-queue/2026-09-04-a-stated-anchor-is-not-an-opt-out.md`, which measured it
and offered it to the owner as "a number and a taste call". It is neither.

## Why

The shipped rule is: the room a line gets is the margin the design keeps on its tighter side, kept
on both sides of the anchor. For a line drawn against one edge that is a real measurement. For a
line sitting on its box's middle the two gaps are the centring, not margins, so half of each is
returned as the answer and the arithmetic hands the line back exactly the width it already has.
The title card measures 453, 701 and 319 units of room against drawn widths of 453, 702 and 319.

A rule that returns its own input has computed nothing. It is the same accident the badge fix
already caught one level down, where a centred word in a 260-unit pill was offered 143 units
because the space either side of it was half the leftover rather than a margin anybody chose
(`docs/acceptance/owner-queue/2026-09-05-the-badge-fills-its-pill.md`).

It is also the likeliest surviving cause of the owner's standing complaint, *"when I add a longer
text it gets smaller"* - a centred line goes straight past filling to wrapping, and past wrapping
to shrinking, on the very first value longer than the one that was drawn.

**Decided 2026-09-10, in the queue item and repeated here so the revert has an address: a centred
line gets the same room as any other line - its box, less the margin the design keeps on its
tighter side - measured symmetrically about the anchor.** Three arguments: consistency (a
left-anchored line already fills to a drawn margin, and centring changes only which way the line
grows); the measurement already exists in the corpus; and the failure is asymmetric, because the
worst case of the new rule is a centred line filling its plate to the drawn margin, which is what
a designer drawing a centred line into a plate expects.

## What it would take

One rule in the fit ladder's room calculation, plus the corpus sweep that already exists for the
growth work. The centred case has to keep two properties the current rule gets right by accident:
the line stays centred on the anchor it was drawn on, and it never crosses the plate's inside
margin on either side. The regression to watch is the title card, whose three lines are the
measurement above, and any centred score in a plate.

## Evidence

`docs/acceptance/owner-queue/2026-09-04-a-stated-anchor-is-not-an-opt-out.md`, "How much room a
CENTRED line gets - and the arithmetic says 'none'", which carries the three measured pairs. The
plate-share distribution that settles the neighbouring threshold is in
`docs/acceptance/owner-queue/2026-09-09-c-the-unmatched-count-stops-naming-plates.md`.
