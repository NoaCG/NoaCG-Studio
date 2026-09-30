---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "vMix accepts no third-party plugins; the nearest real equivalent is a NoaCG Bridge adapter over vMix's HTTP and TCP API, which is also the only way a vMix operator's own Overlay press can play a NoaCG entrance (docs/PLAYOUT_TARGETS_RESEARCH.md)"
serves: NOW
size: large
touches: cli/src/playout/adapters/, cli/src/playout/protocol.ts, src/control/playoutProtocol.ts, src/control/hostedControl.ts, src/control/playoutSystems.ts, src/components/PlayoutSettingsPanel.tsx
needs-owner: none
---

# A NoaCG Bridge adapter for vMix: overlay presses in vMix take and out NoaCG cues

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §1 and §4 (vMix route 1). **Route
chosen:** [`research/vmix-inside-vmix.md`](../research/vmix-inside-vmix.md), 2026-09-30, which
replaced this item's first plan (below).

## Why

vMix has no plugin or SDK mechanism for graphics (research §1.1), and it tells a browser page
nothing: no event on overlay in or out, no function that runs script in a browser input (§1.3,
§1.6). So a NoaCG graphic in vMix today either plays its entrance on page load, long before the
operator presses Overlay, or is driven from NoaCG's own page while the operator's hands are on vMix.
Both fall short of what a vMix operator expects, and `docs/GOALS.md` outcome 5 wants vMix to run a
production-realistic walk with take, update, out and several layers.

## The route

From `research/vmix-inside-vmix.md` §3: **the NoaCG output stays on one overlay channel all show,
and each cue has a small transparent input in vMix named after it. The Bridge subscribes to vMix's
TCP activators; an overlay press on a cue input takes that cue through the production's command
log, and pressing it off plays the cue out.** The exit is seen because the output input never
leaves the air, and every vMix control that presses an overlay (shortcuts, controllers, triggers,
the Web Controller) drives NoaCG with no extra work.

The first plan here (the Bridge putting the NoaCG input on and off an overlay around each take,
and reading a press on that input as a take) is dropped: a press on the output input cannot say
which cue, and a press off in vMix removes the picture before any exit can play (research §2.7).

## Slices

1. **First build step: an overlay press on a cue input takes or outs its cue.**
   - The Bridge holds, per production, the production's control link (the capability the hosted
     control page uses; the Data API key cannot take, by design) and a map from vMix input to cue.
     For this slice both come from a CLI command, for example
     `noacg vmix link --input "NoaCG: Anna, host=<cue id>" ...`, which reads the control link on
     standard input, never as an argument, and keeps it in the Bridge's config file beside its
     token. This is a new thing for the Bridge to hold; research §3 records the decision and the
     alternative (the Bridge only reports presses and a paired page sends the take).
   - `cli/src/playout/adapters/vmix.ts` takes a vMix target (`host`, default `127.0.0.1`, HTTP port
     8088, TCP port 8099, since vMix may run on another machine on the LAN), opens the TCP API,
     sends `SUBSCRIBE ACTS`, reads `XML` to resolve input numbers to keys and names, and reconnects
     if vMix restarts. It resolves the published production from the control slug (`control_show_by_slug`) for each
     cue's graphic and prepared values.
   - On an overlay event for a mapped cue input: on means Take of that cue. Off means Out of its
     layer only if that cue is still the layer's live cue, and nothing otherwise, so a swap on the
     same channel is a replace in whatever order vMix reports the two inputs. When the NoaCG
     output input leaves its overlay, the Bridge clears every layer (All out with no exit), so
     putting the output back up brings nothing back.
   - The batches are the ones the hosted control page sends for Take and Out
     (`takeCueItems` and `clearCueItems` in `src/control/hostedControl.ts`). That file imports
     supabase-js and browser modules, so the builders move into a dependency-free module, mirrored
     into the CLI with a drift test the way `cli/src/playout/protocol.ts` is.
   - Proof: a fake vMix TCP server in an e2e spec, as `e2e/bridge-ograf.spec.ts` does for OGraf,
     emits overlay events; the spec sees the cue go live on the production's output page against
     the local stack. Then one round in real vMix.
   - Done when: in real vMix, pressing Overlay 2 on a cue input animates that cue in on the NoaCG
     output, and pressing it again animates it out, with the output input on another overlay the
     whole time.
2. **Set up in vMix.** The production page hands the Bridge the control link over the paired
   channel; the Bridge adds the output input (or finds it by name if AddInput cannot make a browser
   input) and one transparent image input per cue with AddInput and SetInputName, and records the
   map. A vMix entry in `PLAYOUT_SYSTEMS` and its settings panel.
3. **State mirrored back.** When a cue is taken or taken out from any other surface (the production
   page, a phone), the Bridge follows the log and puts the matching cue input on or off its
   overlay, so vMix's lit buttons always say what is on air; its own echoes are ignored.

**Before slice 1:** walk checks 1 to 5 of research §5 (the ACTS line for an overlay, whether input
keys survive a preset reload, a transparent image input on an overlay, the TCP API under enhanced
security, and the press-to-animation delay) decide its details. They take minutes in the vMix
trial walk (`vmix-trial-walk-and-local-docker.md`); slice 1 can start without them if the walk
slips, with those points kept behind small functions.

## Evidence

- [`research/vmix-inside-vmix.md`](../research/vmix-inside-vmix.md): each vMix door weighed with
  its help page, the route, the operator's steps, and the walk checks.
- [`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §1: the API functions, the TCP
  subscription, the security option and the absence of any page hook.
- `docs/BRIDGE.md` §3a and its milestone 3, which already names `adapters/vmix.ts` and a Bridge
  that follows the command log.
