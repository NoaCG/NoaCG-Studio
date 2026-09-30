---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "NoaCG OGraf graphics render distorted in SPX 1.4.1 because they inherit the renderer page's font size (SPX sets html and body to 3em, 144 px at the body); the scorebug bar grows to four times its height (docs/SPX_ON_A_REAL_SERVER.md §3)"
serves: NOW
size: small
touches: src/export/targets/ograf.ts
needs-owner: none
---

# An OGraf graphic takes its font size from the renderer's page

**Filed:** 2026-09-30. **Source:** measurement on a real SPX 1.4.1 server,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §3.

## Why

In SPX every NoaCG OGraf graphic airs visibly wrong: the scorebug's bar is about four times its
height with its text pushed down, the lower third's name and title sit 200 px apart. Any renderer
that sets a font size on its own page will do the same, so this is a portability defect of the
OGraf export, not an SPX quirk. The export's scoping protects the host from the graphic
(`docs/OGRAF.md`); nothing protects the graphic from the host.

## Reproduction

The record's probe page loads a package on a bare page and adds SPX's renderer rules one at a
time. Scorebug text top, in px from the top of a 1920x1080 page, as the probe printed them
(they were not saved to a file; the probe's screenshots agree):

| Host rules | y |
|---|---|
| none | 113 |
| SPX's `.ografRenderTarget` sizing | 113 |
| SPX's `*` reset | 113 |
| `html { font-size: 3em }` alone | 137 |
| `body, html { font-size: 3em }` (SPX's rule) | 294 |

In the live SPX renderer, an injected rule setting `font-size: 16px` on the graphic element (with
`color: initial`, and in a second run also `box-sizing: content-box; overflow: visible` on its
descendants) brought the lower third's name to within 8 px of the bare page (858 against 866; 866
in the second run), but moved the scorebug only from 294 to 262. So more than the element's own
font size leaks in, and font size alone was not isolated; the fixer finds which properties.

To rebuild the probe: a page at 1920x1080 that imports the package's `graphic.mjs`, defines the
element, gives it the class `ografRenderTarget`, calls `load`, `updateAction` and `playAction`, and
adds the rules above in `<style>` blocks. One was left at SPX 1.4.1's
`ASSETS/templates/noacg_round/probe.html` on the machine that ran the round.

## What it would take

- In `GRAPHIC_BOX_CSS` (`src/export/targets/ograf.ts`), reset the inherited text properties on the
  element to what the studio's own page gives the template (font size, line height, letter and
  word spacing, colour, font family and style, text alignment and transform, white space), at the
  same zero specificity so a renderer can still size the box.
- Check the six OGraf starters and the three graphics of the record on the probe page with SPX's
  rules on: positions within a pixel of the bare page.
- Then the SPX walk in the record again.

## Evidence

`docs/images/spx-real-server/ograf-141-three-layers-distorted.jpg`;
`docs/SPX_ON_A_REAL_SERVER.md` §3; SPX 1.4.1 `views/view-renderer.handlebars` (`body, html`).
