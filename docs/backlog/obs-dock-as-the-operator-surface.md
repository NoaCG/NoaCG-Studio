---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "In OBS 32.2.1 a Custom Browser Dock shares storage with a browser source on the same http address, so the exported control panel in a dock drives the graphic with no relay, and the relay controller in a dock runs a whole show; but the exported GETTING-ON-AIR.md and the export contract say the panel can never reach a graphic inside OBS, and nothing tells an OBS operator to add the dock (docs/OBS_ON_A_REAL_HOST.md §5, §7)"
serves: NOW
size: small
touches: src/export/onAirGuide.ts, src/export/common.ts, src/export/AGENTS.md, src/control/controlPanelHtml.ts
needs-owner: none
---

# Tell OBS operators to run the NoaCG panel in a Custom Browser Dock

**Filed:** 2026-09-30. **Source:** the OBS real-host walk,
[`OBS_ON_A_REAL_HOST.md`](../OBS_ON_A_REAL_HOST.md) §5 and §7.

## Why

GOALS outcome 5 wants OBS to stay green, and an OBS operator wants to run the show from inside
OBS. The walk measured that this already works with no new code: the relay's `controller.html` in
a Custom Browser Dock took, updated and took out two graphics, and the plain `controlpanel.html`
in a dock paired with a browser source on the same address with no relay at all. But what ships
with every export says the opposite. `onAirGuide.ts` tells the reader the panel "can never reach a
graphic loaded by OBS/vMix/CasparCG itself", the SPX package README in `common.ts` says it
cannot reach a graphic inside OBS and mentions a dock only as an aside, `src/export/AGENTS.md`
records "never into OBS/vMix/CasparCG's own engine" as the panel's
connectivity truth and calls the relay "the only route" into OBS, and the panel's own no-listener
banner mentions a dock only in passing. `docs/PLAYOUT_INTEGRATION.md` §4 was corrected on
2026-09-30; the exported text and the contract were not, because they sit in `src/export/`.

## What it would take

- `onAirGuide.ts` (the OBS lines of GETTING-ON-AIR.md): with the relay, add a Custom Browser Dock
  at `http://localhost:<port>/controller.html` (or the panel) to operate from inside OBS; without
  it, a dock showing the panel from the same http address as the browser source pairs too. Keep
  "vMix and CasparCG: their own engine, use the relay" as it is.
- The same correction in the SPX README text in `common.ts` and in `src/export/AGENTS.md`'s
  onAirGuide and local-relay entries (the relay is the route for vMix and CasparCG and for any
  panel outside OBS, not the only route into OBS).
- The panel's no-listener banner (`controlPanelHtml.ts`): say that an OBS dock works when it
  loads the panel from the same address as the source.
- The e2e that pins GETTING-ON-AIR.md's wording, if one does, updated to the new lines.

Not in scope: an OBS script or native plugin (research §3.4 and the walk's §7), and the
obs-websocket route, which is `bridge-obs-adapter.md`.

## Evidence

[`OBS_ON_A_REAL_HOST.md`](../OBS_ON_A_REAL_HOST.md) §5: the dock and source probes exchanged
BroadcastChannel messages and localStorage writes for the whole walk, and the panel in a dock read
"connected: spx-control-house_strap" and put the graphic on air
([picture](../research/obs-real-host-2026-09-30/03-plain-dock-take.png)).
