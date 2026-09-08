---
kind: walk
date: 2026-09-08
---
# The size floor stopped refusing two thirds of our own catalog

You ruled that the broadcast text floor should be type-aware rather than a universal 50px blocker.
Measured through the instrument itself, the old rule refused **322 of 503** shipped designs; the new
one refuses **8**. It also resolved a contradiction that was already in the tree: `typeFloor.ts` said
a corner bug may render at 16px, while the floor demanded 49.68px of the same element.

**Route, under a minute.** Open the studio, create a corner bug from the catalog (any of `bug05`
onwards) and open the Inspector's legibility warnings. There should be no size warning at all - its
station name at 26px and its supporting line at 16px are what a bug is. Then open any lower third
whose name sits near 30px: still no warning. Then look at a quiz board - previously every one of the
twelve carried a size warning.

**What to look at.** Do the graphics that now pass look right to you at a glance, and does anything
that passes look too small on a TV rather than on this monitor? The three bands are named in
`src/model/designRules.ts` - persistent (a bug, a ticker, a dense board: no prominence floor at
all), card (28px), statement (42px). If a category is in the wrong band, that is the thing to say -
the numbers came from what the catalog already ships, so a band that feels wrong means a category is
grouped wrong rather than that a number is off by two.

**The known residue, so you can judge whether it is worth anything.** Four info cards (`card26`,
`card27`, `card28`, `card29`) are checklist/rundown boards whose lines all sit at 25-27px against
the card band's 28px, so they still warn. They read at leisure like a persistent graphic but live in
a category that also holds headline cards running to 240px. I left them warning rather than tune the
number until they disappeared - if you think a rundown card belongs with the tickers, that is a
one-line change to `PERSISTENT_CATEGORIES`.
