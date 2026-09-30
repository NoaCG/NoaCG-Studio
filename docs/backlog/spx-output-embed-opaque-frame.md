---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "The output embed puts an opaque dark frame over SPX's whole picture, on 1.4.1 and 1.2.1, and it stays after Stop. Moving color-scheme from the page to the iframe element made it transparent in a hand-edited copy (docs/SPX_ON_A_REAL_SERVER.md §4)"
serves: NOW
size: small
touches: src/export/outputEmbed.ts
needs-owner: none
---

# The output embed covers SPX's picture with a dark frame

**Filed:** 2026-09-30. **Source:** measurement on real SPX 1.4.1 and 1.2.1 servers,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §4.

## Why

The output embed is how an SPX user puts a NoaCG production on air with cues run from NoaCG. In
SPX it hides the video behind an opaque dark 1920x1080 frame from the first Play until the layer is
cleared, Stop included. The route is unusable on air as shipped, and this is a likely reason the
owner's own attempt failed after the framing refusal was removed.

## Reproduction

1. Build the file with `outputEmbedHtml()` (or download "Template file" from a production page)
   and put it in SPX's `ASSETS/templates/`.
2. Add it to a rundown, open `http://localhost:5656/renderer` over any background, press Play and
   then Stop.
3. The renderer shows a solid dark grey everywhere, with or without the output page's content.

## Cause

The embed declares `<meta name="color-scheme" content="dark">` so its own iframe matches the output
page (`docs/CLOUD_PLAYOUT.md` §3 rule 2). SPX loads the template inside an iframe of its renderer,
whose page declares no scheme, so Chromium paints that outer iframe opaque. Adding
`:root { color-scheme: dark }` to SPX's renderer page made it transparent, which confirms it.

## What it would take

- In `outputEmbedHtml()`, drop the page-level `meta` and put `color-scheme: dark` on
  `#noacg-frame` (the iframe element) instead. A hand-edited copy with exactly that change was
  transparent on both servers, in play and after Stop, with the output page still showing.
- Rewrite rule 2 in the file's header and in `docs/CLOUD_PLAYOUT.md` §3 to say where the scheme
  must sit: on the iframe element, so the embed matches both its host and the output page.
- Check that the file stays transparent as a top document too: an OBS browser source on the file
  and a CasparCG 2.3 template folder (Chromium 71 ignores `color-scheme`).
- A test that pins the scheme to the iframe element and keeps the page itself without one.

## Evidence

`docs/images/spx-real-server/embed-141-dark-frame-after-stop.jpg` and
`embed-141-scheme-on-iframe-fix.jpg`; `docs/SPX_ON_A_REAL_SERVER.md` §4.
