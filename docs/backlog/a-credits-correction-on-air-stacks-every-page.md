---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "a text correction sent with a page-swap credits design on air draws every page at once,
  stacked, because update() replaces the page nodes the running swap is fading"
size: small
touches: src/templates/endCredits/shared.ts, src/templates/endCredits/creditsMotion.ts
---
# A credits correction on air stacks every page

**Filed:** 2026-09-30. **Source:** measurement, while making the live speed reach a running roll.

## Why

An operator who corrects a name with a page-swap credits design (cr03, the `credits-pages`
preset) on air sees every page drawn on top of each other until Out. `update()` rebuilds the rows
by assigning `innerHTML`, which replaces each `.credits-page`; the running swap keeps fading the
old, detached nodes, and the new ones have no inline opacity, so all of them show. A correction
on air is the ordinary case for a credit list, and this is a broken frame, not a cosmetic one.

The same rebuild throws away a reel's (`credits-loop`) clones on a text change, so the seam of a
running reel shows blank until the next take. That half is read from the code, not measured.

The speed press no longer does this: `update()` now leaves the rows alone when their markup is
unchanged (`rebuildCredits(true)`), which is what let the live speed reach a page swap. Only a
change to what the rows draw still replaces them.

## What it would take

A correction has to reach a running page swap without replacing the nodes it animates, or the
running swap has to be rebuilt at the matching point. Two shapes, not yet chosen:

- carry each old page's inline pose onto the new page of the same index and rebuild the swap's
  timeline at the same local time (the page count or a page's row count may have changed, so
  "the same point" needs a rule);
- or patch the rows inside the existing pages rather than replacing the pages, where the section
  count is unchanged, and fall back to the first shape when it is not.

The roll and the crawl are unaffected: they move the track, which survives the rebuild.

## Evidence

Measured in Chromium on the generated cr03 with the vendored GSAP, `play()` then an `update()`
of `f0` with one name appended at 1.5 s: page opacities went from `1, 0, 0, 0` to `1, 1, 1, 1`
within 30 ms and no page faded out in the next 8 s. With the rows' markup unchanged (a speed press)
the same run keeps `1, 0, 0, 0` and the pages hand over as built.
