---
kind: desktop
date: 2026-10-02
serves: now
---
# The one playout status, in your studio

The production page's header now has one playout status where the SHOW chip, Output links, the
READY line and the CasparCG dot used to be (docs/work-specs/studio-day-playout, landing 2). It is
grey when the production is offline, amber when something needs attention, green when an output is
on air and has reported ready, and red when something that should work is broken, always with a
few words beside the colour. Pressing it opens the Playout panel: the check behind the colour
first, then the outputs, the actions, the setup and the links. The monitor now reads "PREVIEW · NOT
LIVE" until the production is started. Every ⟳ Publish changes also asks the open outputs to load
the new version.

All of it was walked on a scratch CasparCG 2.5 (docs/work-specs/studio-day-playout/evidence/
landing-2.md). What a machine here cannot judge is whether it reads at a glance in your studio,
with your two channels and the ATEM.

## The route, about ten minutes

1. Open a production that is not started. Read the status: grey "Offline", and the right monitor
   "PREVIEW · NOT LIVE".
2. Press ▶ Start production. With the Bridge paired, the status should go red "Output not on air"
   (or "Another production on 1-20" if an earlier one is still up). Press it and use **Put on air**
   in the panel. It goes amber "Loading on 1-20", then green "Ready · on air 1-20" within about
   10 to 30 seconds.
3. Change a graphic and press ⟳ Publish changes in the panel. Watch CasparCG: with nothing taken it
   should move to the new version by itself, the status amber while it loads, then green.
4. Stop NoaCG Bridge for a moment: red "Bridge not running". Start it again.

**What to look at.** Whether you can tell from the header alone, before a Take, if the Take will
air; whether any colour or word misled you; and whether the panel's order (checks, outputs,
actions, setup, links) is the order you reach for things.
