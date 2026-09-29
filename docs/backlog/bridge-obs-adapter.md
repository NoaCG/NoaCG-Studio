---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "OBS already has a local, documented route into a browser source page that NoaCG does not use: obs-websocket's CallVendorRequest to obs-browser's emit_event, which Companion's OBS module can also send (docs/PLAYOUT_TARGETS_RESEARCH.md)"
serves: NOW
size: standard
touches: cli/src/playout/adapters/, src/control/localReceiver.ts, src/control/receiverScript.ts, src/export/targets/htmlOverlay.ts
needs-owner: none
---

# Drive NoaCG graphics in OBS over obs-websocket, through the Bridge and Companion

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §3.3 and §4 (OBS route 2).

## Why

Offline control of a NoaCG graphic in OBS today needs the bundled localhost relay: a launcher, a
local web server, and the browser source pointed at that address. OBS already ships a local control
channel into every browser source: obs-websocket (bundled since OBS 28) plus the obs-browser vendor
request `emit_event`, which dispatches a named DOM `CustomEvent` into every browser source page.
Using it would let an exported graphic loaded straight from disk be taken, updated and taken out
with no relay and no internet, and Bitfocus Companion's OBS module can already send that request,
so a Stream Deck drives it with no NoaCG module at all.

## What it would take

- **In the page:** the exported overlay (and the cloud output) listens for one NoaCG event name,
  checks that the payload names this graphic (the event reaches every browser source), and runs the
  command through the same path the relay's commands take.
- **A sender:** a Bridge `adapters/obs.ts` over obs-websocket v5 (port 4455, challenge
  authentication) that sends `CallVendorRequest` to `obs-browser` with `emit_event`, and can also
  create the browser source (`CreateInput`, kind `browser_source`), show and hide it
  (`SetSceneItemEnabled`) and refresh it (`PressInputPropertiesButton`, `refreshnocache`).
- The payload shape documented for Companion users, so its "Send Vendor Request" action works the
  day this lands.
- Proof: an e2e that dispatches the event into the exported page as obs-browser would, and a round
  in real OBS.

Not in scope: an OBS plugin or script. They add little over this for delivering graphics and cost a
native build per platform (research §3.4).

## Evidence

- obs-browser README: `emit_event` "emits a custom event to all browser sources"
  (<https://github.com/obsproject/obs-browser/blob/master/README.md>), and the page-side dispatch in
  `browser-app.cpp` in the same repository.
- Companion OBS module help, the custom command and vendor request actions
  (<https://github.com/bitfocus/companion-module-obs-studio/blob/main/companion/HELP.md>).
