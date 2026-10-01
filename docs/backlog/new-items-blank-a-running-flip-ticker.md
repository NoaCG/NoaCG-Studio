---
v: 2
source: derived
kind: finding
raised: 2026-10-01
state: unstarted
found: "new items sent to a running flip ticker blank the strip until the next take; measured on
  tk03 in Chromium, 1 item visible before the update and 0 in the 4 s after it"
size: small
touches: src/templates/tickers/shared.ts, src/templates/tickers/tickerMotion.ts
---
# New items blank a running flip ticker

**Filed:** 2026-10-01. **Source:** measurement, while fixing the live speed press on the tickers.

## Why

An operator editing the stories on a flip ticker that is on air expects the new list to start
showing. Today the strip goes blank and stays blank until someone takes it again, which is a
graphic failing on air in front of an audience, from the most ordinary edit there is.

`update()` re-renders `#ticker-track` from `#f0`, which replaces the item nodes. The flip cycle
`tickerFlipCycle()` built at `play()` holds the OLD nodes as its targets, so it keeps fading
detached items and nothing new is ever animated in. The speed press no longer does this:
`update()` now re-renders only when the items changed, so it is only a real change of items that
still hits it.

The marquee has a quieter version of the same gap: its travel is one set width measured at
`play()`, so a new list of a different length keeps sliding the old width and the loop seam
shows. Not measured yet.

## What it would take

When the items change with a strip running, rebuild the live motion rather than leaving it on
the old nodes: for a flip, rebuild the cycle and start it at the item boundary that is next; for
a marquee, re-measure the set and carry the current x across as a fraction of the new width. Both
belong next to `tickerApplySpeed()` in `tickerMotion.ts`, called from `update()` where it
already re-renders. Pin it in `scripts/ticker-speed.test.mjs` on the real vendored GSAP.

## Evidence

tk03, generated with `node scripts/catalog-emit.mjs --only tk03 --json`, loaded in Chromium with
the vendored GSAP: `play()`, then 1.5 s in `update({ f0: <the same items plus one> })`. Visible
`.ticker-item` nodes: 1 before, and at most 0 in any 100 ms sample over the next 4 s.
