---
v: 2
source: derived
kind: finding
raised: 2026-10-02
state: unstarted
found: "on a phone, or any editor narrower than 620 px, a server item's Operator note, Channel and Layer stack in one column, so Channel and Layer are not side by side as AC-1 asks at 390 px"
serves: NOW
size: small
touches: src/styles/playout-dashboard.css
covered-by: e2e/playout-cues.spec.ts
---
# A server item's Channel and Layer stack on a narrow editor

## Why

AC-1 of `docs/work-specs/studio-day-playout` asks that every server item show Channel and Layer side
by side, judged at 1366 and 390 px, so moving a clip to another channel is as easy as moving it to
another layer. At 1366 they are (`.pd-cue-meta--slot`: note, 170 px Channel, 96 px Layer in one row).
Below 620 px of editor width the container rule `@container (max-width: 620px) { .pd-cue-meta {
grid-template-columns: minmax(0, 1fr); } }` puts all three in one column. Landing 1 recorded that at
390 x 844 "the editor stacks note, Channel and Layer full width", which is visible and needs nothing
opened, but is not side by side. A 1366 window with the rundown dragged wide reaches the same rule.

## What it would take

Under 620 px, keep the note full width on its own row and Channel and Layer on the next row as two
columns (for example `grid-template-columns: minmax(0, 1fr) 96px` with the note spanning both). Scope
it to `.pd-cue-meta--slot` inside the container rule: the shared `.pd-cue-meta` also holds a graphic
cue's lone note, which must stay full width. Then judge it rendered at 390 px and pin it in
`e2e/playout-cues.spec.ts`.

## Evidence

`docs/work-specs/studio-day-playout/evidence/landing-1.md` (the 390 px reading);
`src/styles/playout-dashboard.css`, the `.pd-editor` container rule; the convergence review in the
same `evidence/` folder.
