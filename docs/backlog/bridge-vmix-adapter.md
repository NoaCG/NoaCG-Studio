---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "vMix accepts no third-party plugins; the nearest real equivalent is a NoaCG Bridge adapter over vMix's HTTP and TCP API, which is also the only way a vMix operator's own Overlay press can play a NoaCG entrance (docs/PLAYOUT_TARGETS_RESEARCH.md)"
serves: NOW
size: large
touches: cli/src/playout/adapters/, cli/src/playout/protocol.ts, src/control/playoutProtocol.ts, src/control/playoutSystems.ts, src/components/PlayoutSettingsPanel.tsx
needs-owner: none
---

# A NoaCG Bridge adapter for vMix: the vMix plugin that vMix does not allow

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §1 and §4 (vMix route 1).

## Why

vMix has no plugin or SDK mechanism for graphics (research §1.1), and it tells a browser page
nothing: no event on overlay in or out, no function that runs script in a browser input (§1.3,
§1.6). So a NoaCG graphic in vMix today either plays its entrance on page load, long before the
operator presses Overlay, or is driven from NoaCG's own page while the operator's hands are on vMix.
Both fall short of what a vMix operator expects, and `docs/GOALS.md` outcome 5 wants vMix to run a
production-realistic walk with take, update, out and several layers. The Bridge already runs on
the operator's machine, already speaks a playout protocol built to take more adapters
(`docs/BRIDGE.md` §3a), and is a separate process, so vMix's "enhanced security" option, which
stops scripts in browser inputs from reaching the API, does not affect it.

## What it would take

- `cli/src/playout/adapters/vmix.ts` beside the CasparCG and OGraf adapters, with a vMix target
  (`host`, default `127.0.0.1`, HTTP port 8088, TCP port 8099) and a slot that names an overlay
  channel (1 to 8) and a browser input by name or key.
- **Take and out through the overlay channel.** Take: OverlayInputN In on the NoaCG input, then the
  graphic's own take. Out: the graphic's out, then OverlayInputN Out once the out animation has
  had time to play, so the exit is seen.
- **vMix's own press becomes a NoaCG take.** SUBSCRIBE ACTS over TCP; when Overlay N goes on with a
  NoaCG input, the Bridge sends the take to the page through the verbs the page already dispatches.
  This is what makes Companion's vMix module, vMix shortcuts and the vMix interface drive NoaCG.
- **Adding the input.** The documented AddInput kinds do not include Browser (research §1.3), so the
  first slice asks the operator to add the Web Browser input once, and the adapter finds it by name
  in the XML state. `Value=Browser|<url>` can follow if the walk proves it.
- A vMix entry in `PLAYOUT_SYSTEMS` and its settings panel.
- Proof: a fake vMix HTTP and TCP server in an e2e spec, as `e2e/bridge-ograf.spec.ts` does for
  OGraf, then a round in real vMix.

It should start after the vMix trial walk (`vmix-trial-walk-and-local-docker.md`) has recorded how
real vMix behaves with a NoaCG input.

## Evidence

- [`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §1: the API functions, the TCP
  subscription, the security option and the absence of any page hook, each with its vMix help link.
- `docs/BRIDGE.md` §3a and its milestone 3, which already names `adapters/vmix.ts`.
