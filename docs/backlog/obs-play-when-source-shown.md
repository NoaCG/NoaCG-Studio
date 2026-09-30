---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "The exported HTML overlay plays its entrance on page load, so in OBS it has already run by the time the operator shows the scene; OBS tells the page when its source is shown (obsSourceVisibleChanged), and NoaCG does not listen (docs/PLAYOUT_TARGETS_RESEARCH.md)"
serves: NOW
size: small
touches: src/export/targets/htmlOverlay.ts
needs-owner: none
---

# Play an exported overlay's entrance when OBS shows it, not when the page loads

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §3.1 and §4 (OBS route 1).

## Why

The HTML overlay export autoplays on the page's `load` event (the autoplay block in
`src/export/targets/htmlOverlay.ts`). OBS keeps a browser source running while its scene is hidden,
so the entrance plays once, off air, and the operator who switches to the scene gets a graphic that
is simply there. The only workaround today is OBS's "Refresh browser when scene becomes active",
which reloads the whole page. OBS gives the page `obsSourceVisibleChanged` and
`obsSourceActiveChanged` through `window.obsstudio`, which is the signal a graphic needs to animate
in on air and reset when hidden. It is small, and it makes the plain export behave the way an OBS
user expects.

## What it would take

- In the autoplay block: when `window.obsstudio` exists, wait for the source to be shown before
  `play()`, and when it is hidden reset to the start so the next show plays the entrance again.
  Outside OBS, plain autoplay is unchanged. A stream-addressed (managed) instance keeps ignoring
  autoplay, as it does now.
- Decide at build time whether "active" (on program) or "visible" (in any shown scene) is the
  trigger; active suits an operator with studio mode, visible suits a streamer without it.
- First check that the events reach a page at OBS's default "Page permissions" level; the research
  could not verify it.
- An e2e that stubs `window.obsstudio` and fires the events, plus one look in real OBS.
- One line in the overlay README and in `docs/PLAYOUT_INTEGRATION.md` §4.

## Evidence

- obs-browser README, the events list (<https://github.com/obsproject/obs-browser/blob/master/README.md>).
- `src/export/targets/htmlOverlay.ts`: `window.addEventListener('load', ...)`, then `play()`.
