---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "The engine table lists vMix 27+ at Chromium 103 (vMix's release notes say 115 from vMix 27), says SPX renders in the operator's own browser (only its preview does), has no OBS 33 row (Chromium 150), and the guide says an OBS dock pairs with a source over the same-origin channel, which OBS's separate dock context probably prevents (docs/PLAYOUT_TARGETS_RESEARCH.md section 5)"
serves: NOW
size: small
touches: src/validation/engineSupport.ts, docs/PLAYOUT_COMPATIBILITY.md, docs/PLAYOUT_INTEGRATION.md
needs-owner: none
---

# Correct the playout engine table and the vMix, SPX and OBS guide sections

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §5, with the documentation routes
of §4.

## Why

`PLAYOUT_ENGINES` decides what the export screen tells an author about playout compatibility, and
`docs/PLAYOUT_INTEGRATION.md` is what an operator follows. Both carry facts the research
contradicts, and the vMix section is four lines for a target that outcome 5 wants proven. The
research row did not edit them because another row owned those files that night.

## What it would take

Measure first where a real app is at hand (`&debug=1` prints the engine), then:

- **Engine table** (`src/validation/engineSupport.ts`, `docs/PLAYOUT_COMPATIBILITY.md` §1): vMix
  27 to 29 at Chromium 115 (vMix 26 was 103), still below the 117 floor; an OBS 33 row at 150 once
  it leaves beta; SPX's row saying the on-air renderer runs in the host's Chromium (CasparCG, OBS or
  vMix), and only the controller preview runs in the operator's browser.
- **vMix guide section:** the HTML overlay plays its entrance on page load, so use the cloud output
  or the relay for a live show, or a vMix trigger that reloads the input on overlay in if the walk
  proves it; "enhanced security" stops scripts in browser inputs from reaching the API; enabling the
  keyboard takes vMix's shortcuts away; the custom CSS field exists.
- **SPX guide section:** which route for which setup. Through CasparCG AMCP, use the native SPX
  export (SPX has no OGraf path to CasparCG); OGraf needs SPX's web renderer; Solo has five layers
  and a mostly closed API.
- **OBS guide section:** "Refresh browser when scene becomes active" as the workaround for an
  entrance that played off air (until `obs-play-when-source-shown.md` lands); test the claim that a
  Custom Browser Dock pairs with a source without the relay, and remove it if it fails. The export
  contract (`src/export/AGENTS.md`, the `onAirGuide.ts` entry) already says the panel never pairs
  into OBS's own engine, so the guide line disagrees with the repository as well as with OBS.

## Evidence

[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §1.6 (vMix release notes), §2.2
(SPX renderer), §3.1 and §3.2 (OBS), each with its source link.
