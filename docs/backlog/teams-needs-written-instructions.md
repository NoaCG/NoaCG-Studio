---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: unstarted
asked: >-
  "we need to add it to our instructions. There should be instructions on how to do it as well.
  Of course, it should be so intuitive that you can just use it without reading anything."
serves: NOW
size: small
touches: docs.html, src/docs/
covered-by: e2e/docs.spec.ts
needs-owner: none
---
# Teams needs written instructions, and the guide is the fallback

**Filed:** 2026-09-09, carried out of `docs-guides-to-write.md` when that file's four-item list was
finished and deleted. **Source:** the owner, reading the register on 2026-09-03.

## Why

Sharing a production with a team is a feature nothing on `/docs` explains. He asked for the
instructions and, in the same breath, named the standard they should be held to:

> Of course, it should be so intuitive that you can just use it without reading anything.

So the guide is the fallback, not the design. Anything the guide has to explain twice is a defect
in the dialog, not a gap in the page. That makes this item worth two things at once: the page a
teacher can read, and the list of places a sentence was needed.

It is also the last unserved half of an ask that has otherwise been delivered. The four `/docs`
guides that shared its receipt are all on the page, the last of them on 2026-09-09
(`#first-graphic`), so this is what remains of it.

## What it would take

Write it the way the guides before it were written: walk the flow, note every place a sentence was
needed, and hold `src/docs/AGENTS.md`'s voice and the owner's binding constraint on the shelf,
"only the most important information on the left". Pin the load-bearing lines in
`e2e/docs.spec.ts`. Roughly an afternoon.

The walk's own by-product is the second deliverable: the list of moments the dialog did not carry
its own explanation. The import road's walk produced exactly three of those, and all three were
then fixed on the screen rather than in the guide. **That round trip is the shape to copy**: the
walk filed a backlog item listing the three hesitations, a later row answered all three in the
wizard itself, and that row deleted the item in the same commit as the last fix. The three answers
are pinned by their own cases in `e2e/import-svg.spec.ts` - "the drop says why the walk just got a
step shorter", "every alignment grid writes its own answer beside the heading" and "an unnamed
production is not named after the graphic" - which is where to read what a walk's by-product turns
into.

## Evidence

- The owner's words above, 2026-09-03, reading the register.
- `docs/backlog/teams-invite-join-code-and-what-a-new-member-sees.md` is the FEATURE side of
  Teams, from his 2026-09-04 walk: no email invitation and a join code with no door. That file and
  this one do not overlap, and the order matters. Two of its three findings are still open, so a
  guide written today would have to document a code that can only be redeemed from a link.
- `src/docs/AGENTS.md` holds the voice and the structure rules any new guide has to satisfy.
