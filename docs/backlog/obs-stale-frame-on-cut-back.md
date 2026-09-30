---
v: 2
source: derived
kind: finding
raised: 2026-10-01
state: unstarted
found: "On a Cut back to a scene, OBS 32.2.1 with browser hardware acceleration showed an exported overlay's last on-air frame for 10 to 40 ms before the replayed entrance started; the page cannot paint while hidden, so it cannot clear that texture (docs/OBS_ON_A_REAL_HOST.md §10)"
serves: NOW
size: small
needs-owner: none
---

# Measure and, if possible, avoid the stale frame OBS shows on a Cut back to an overlay

**Filed:** 2026-10-01. **Source:** the look at the overlay's entrance on program,
[`OBS_ON_A_REAL_HOST.md`](../OBS_ON_A_REAL_HOST.md) §10.

## Why

GOALS outcome 5, "OBS stays green", and premium graphics: an operator who cuts back to a scene
sees the settled lower third for about one frame, then it vanishes and animates in. It is short,
but it reads as a flicker on air. Studio mode did not show it, because the scene is painted at
rest on preview before the take.

## What it would take

- Measure on the same OBS, driven over obs-websocket as the walk was: the same Cut with browser
  hardware acceleration off (an OBS setting that needs a restart, so restore it afterwards), and a
  Fade, taking the screenshot of the program output rather than the scene where that is possible.
- If a page-side fix exists (for example a way to have the last painted frame be the rest state),
  it goes in the autoplay block of `src/export/targets/htmlOverlay.ts` and its e2e.
- Otherwise the outcome is one measured line in `docs/PLAYOUT_INTEGRATION.md` §4 telling an
  operator which setting or transition avoids it.

## Evidence

- `OBS_ON_A_REAL_HOST.md` §10: three rounds of back-to-back screenshots after a Cut; the text
  region read white for the first 10 to 40 ms, then grey as the entrance started.
