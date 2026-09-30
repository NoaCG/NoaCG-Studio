---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: advanced
note: "The OBS facts and the SPX renderer row were measured and corrected on 2026-09-30 (docs/OBS_ON_A_REAL_HOST.md, docs/SPX_ON_A_REAL_SERVER.md §5, branch claude/s-obs-real-host). Left: the vMix facts, which wait for a vMix walk, the OBS 33 row, and the SPX route guidance."
found: "The engine table lists vMix 27+ at Chromium 103 (vMix's release notes say 115 from vMix 27) and has no OBS 33 row (Chromium 150, in beta); the vMix guide section is four lines, and the SPX guide section does not say which route suits which setup (docs/PLAYOUT_TARGETS_RESEARCH.md section 5)"
serves: NOW
size: small
touches: src/validation/engineSupport.ts, docs/PLAYOUT_COMPATIBILITY.md, docs/PLAYOUT_INTEGRATION.md
needs-owner: none
---

# Correct the vMix engine facts and guide, add OBS 33, and say which SPX route suits which setup

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §5, with the documentation routes
of §4.

## Why

`PLAYOUT_ENGINES` decides what the export screen tells an author about playout compatibility, and
`docs/PLAYOUT_INTEGRATION.md` is what an operator follows. Both carried facts the research
contradicted. The OBS and SPX ones were measured and corrected on 2026-09-30:
[`OBS_ON_A_REAL_HOST.md`](../OBS_ON_A_REAL_HOST.md) (OBS 32.2.1 is Chromium 127; a Custom Browser
Dock does pair with a same-address browser source; "Refresh browser when scene becomes active"
plays the entrance on air) and [`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §5 (SPX on
air runs in its host's engine). What remains is below. The vMix facts stay unmeasured until a vMix
walk (`docs/backlog/vmix-trial-walk-and-local-docker.md`).

## What it would take

Measure first where a real app is at hand (`&debug=1` prints the engine), then:

- **Engine table** (`src/validation/engineSupport.ts`, `docs/PLAYOUT_COMPATIBILITY.md` §1): vMix
  27 to 29 at Chromium 115 (vMix 26 was 103), still below the 117 floor, once measured; an OBS 33
  row at 150 once it leaves beta and is measured.
- **vMix guide section:** the HTML overlay plays its entrance on page load, so use the cloud output
  or the relay for a live show, or a vMix trigger that reloads the input on overlay in if the walk
  proves it; "enhanced security" stops scripts in browser inputs from reaching the API; enabling the
  keyboard takes vMix's shortcuts away; the custom CSS field exists.
- **SPX guide section:** which route for which setup, from
  [`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §6. Through CasparCG AMCP, use the native
  SPX export (SPX has no OGraf path to CasparCG); OGraf needs SPX's web renderer; Solo has five
  layers and a mostly closed API.

## Evidence

[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §1.6 (vMix release notes) and §2.2
(SPX renderer), each with its source link.
