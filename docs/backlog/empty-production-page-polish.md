---
v: 2
source: derived
kind: finding
raised: 2026-09-28
state: unstarted
found: "on the empty production that the wizard's New production opens, the 'No cues yet' line has no left padding, and 'Start production' shows lit amber with nothing to run"
serves: NOW
size: small
touches: src/components/home/CueRundown.tsx, src/components/home/ProductionPage.tsx, src/styles/playout-dashboard.css
covered-by: e2e/wizard-entry-fit.spec.ts, e2e/productions.spec.ts, e2e/production-controls.spec.ts
needs-owner: none
---
# The empty production page looks unfinished: unpadded empty line, lit Start with nothing to run

**Filed:** 2026-09-28. **Source:** wave finding, seen by the wizard entry follow-up row on the
production that the Entry step's "New production" opens. Playout was reserved for day work that
night, so this is filed for a Playout session rather than fixed there.

## Why

"New production" on the wizard's first screen now lands a first-time user straight on an empty
production (outcome 5, Production, rundown and playout). That page is the first impression of the
playout half of the product, and two details make it read as unfinished: the "No cues yet" line
sits flush against the panel edge with no left padding, and "Start production" is lit amber, the
step's recommended action, when there is nothing to run.

## What it would take

- Give the empty-rundown line the same left inset as a cue row (CueRundown.tsx and its styles in
  playout-dashboard.css).
- Decide what "Start production" looks like with an empty rundown: secondary or disabled with a
  reason, so the amber call to action appears only once there is a cue to take. Check what
  starting an empty production actually does before choosing.
- A spec assertion on the empty production: the empty line's inset, and the start control's
  state with zero cues.

## Evidence

Seen on the rendered page after pressing "New production" on the Entry step (fresh context, no
saved work). Strings: "No cues yet" in `src/components/home/CueRundown.tsx`, "Start production"
in `src/components/home/ProductionPage.tsx`.
