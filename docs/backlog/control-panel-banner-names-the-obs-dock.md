---
v: 2
source: derived
kind: finding
raised: 2026-10-01
state: unstarted
found: "The exported control panel's no-listener banner says a graphic loaded inside OBS/vMix/CasparCG runs its own browser and mentions an OBS Custom Browser Dock only in brackets, while OBS 32.2.1 measured that a dock on the same address as the browser source pairs with it (docs/OBS_ON_A_REAL_HOST.md §5); the exported guides were corrected on 2026-10-01, the banner sits in src/control and was left for the playout session"
serves: NOW
size: small
touches: src/control/controlPanelHtml.ts
needs-owner: none
---

# Make the control panel's no-listener banner tell an OBS operator about the dock

**Filed:** 2026-10-01. **Source:** the OBS dock item (`obs-dock-as-the-operator-surface.md`,
closed by the branch that corrected GETTING-ON-AIR.md, the SPX README and `src/export/AGENTS.md`),
whose `controlPanelHtml.ts` part was moved here because `src/control` belonged to a live session.

## Why

GOALS outcome 5, "OBS stays green". The banner is what an operator reads at the moment the panel
cannot find the graphic, so it is the one line most likely to be read. It still groups OBS with
vMix and CasparCG as a host whose graphic the panel cannot reach, and names the dock only in
brackets, while every exported guide now says the opposite for OBS.

## What it would take

- In the `nolisten` banner of `src/control/controlPanelHtml.ts`: say that a graphic inside vMix or
  CasparCG runs its own browser, and that in OBS the panel works as a Custom Browser Dock
  (**Docks → Custom Browser Docks**) when the dock loads the panel from the same http address as
  the browser source. Keep "See GETTING-ON-AIR.md".
- The header comment near the top of the file says the same thing and wants the same change.
- Any e2e that pins the banner's wording, updated.

## Evidence

- [`OBS_ON_A_REAL_HOST.md`](../OBS_ON_A_REAL_HOST.md) §5: the plain panel in a dock read
  "connected: spx-control-house_strap" and took, stopped and played the graphic with no relay.
- `src/export/onAirGuide.ts`: the corrected GETTING-ON-AIR.md lines for OBS.
