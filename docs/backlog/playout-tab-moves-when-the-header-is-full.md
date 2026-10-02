---
v: 2
source: derived
kind: finding
raised: 2026-10-02
state: unstarted
found: "at 1280 and 1366 px with a production name of about 25 characters or more, the playout status and the Playout tab move whenever a control in the header's right cluster changes width (Saving…, Not saved, the panel door's state)"
serves: NOW
size: small
touches: src/components/home/ProductionPage.tsx, src/styles/playout-dashboard.css, src/styles/teams.css
covered-by: e2e/configured/teams.spec.ts
---
# The Playout tab moves when the production header is full

## Why

AC-6 of `docs/work-specs/studio-day-playout` (owner, 2026-10-01: operators press these by muscle
memory) says Playout, Export and All out keep their positions in a team production, a personal one,
signed out and while saving, at 1920, 1366 and 1280 px. Export and All out do. Playout and the status
beside it do not once the header is full: the right cluster is right-aligned, so a control there
that grows takes its room from the spacer, and when the spacer is already 0 it takes it from the
production name, which sits LEFT of the status and the tabs and pushes them along.

## Evidence

Measured 2026-10-02 in the convergence review (`docs/work-specs/studio-day-playout/evidence/convergence-review.md`),
this checkout's dev server offline, production named "Saturday Night Regional Championship Final
Broadcast". A 90 px element inserted before the panel door, standing in for a wider right-cluster
control:

| Width | Spacer before | Playout tab x | Status x | Export x, All out x |
|---|---|---|---|---|
| 1280 | 0 | 865 to 769 | 526 to 430 | 1143, 1191 unchanged |
| 1366 | 0 | 939 to 841 | 596 to 498 | 1223, 1273 unchanged |
| 1920 | 205 | 1182 unchanged | 757 unchanged | unchanged |

At 1280 offline (no Share button yet) the spacer was 110 px for a 15-character name, 42 px for 26
characters and 0 for 32. Signed in, Share takes about the same room again. The team door at rest is
an icon under 1440 px, so `e2e/configured/teams.spec.ts` (Share against the team door, default
1280 px viewport, name "Team share walk <timestamp>") passes; it never measures while "Saving…" or
"Not saved" shows, nor at 1366 or 1920.

Separately, the offline production's ▶ Start production button sits between the status and the tabs,
so starting a production moves the tabs left by its width. AC-6 does not list that state.

## What it would take

Keep the spacer from reaching 0 by more than the right cluster's largest swing (a `min-width` on
`.pd-header .spacer`, so the name gives way earlier), or give the variable right controls a fixed
width. Then extend the teams spec to measure while saving and at 1366 and 1920, with a long name.
