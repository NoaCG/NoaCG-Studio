---
v: 2
source: derived
kind: finding
raised: 2026-10-02
state: unstarted
found: "an offline production's rundown chip and the line under the verbs say ON AIR for a take that only plays on the page, beside a monitor that now says PREVIEW · NOT LIVE"
serves: now
size: standard
touches: src/components/home/CueRundown.tsx, src/components/home/ProductionPage.tsx, src/styles/playout-dashboard.css
---
# ON AIR words in a production that is not started

## Why

The studio day asked for live state that cannot be misunderstood (docs/work-specs/studio-day-playout
AC-7 to AC-9). Landing 2 made the header's status read Offline and the monitor read PREVIEW · NOT
LIVE while a production is not started, because a Take there plays on the page only. Two other
places on the same screen still say ON AIR for that same local take:

- the rundown row's red ON AIR chip (`CueRundown.tsx`), and
- the "on air: ● House Strap" line under the verbs (`ProductionPage.tsx`).

The re-recorded baselines show all three side by side (`e2e/playout-baseline.spec.ts-snapshots/
graphics-only-*`): a grey "PREVIEW · NOT LIVE" monitor above a row marked ON AIR. An operator who
reads the rundown rather than the monitor can still believe the take went out.

Server media is different and must keep saying ON AIR: it plays through NoaCG Bridge whether or not
the production is started (spec D16).

## What it would take

- In an offline production, a NoaCG graphic's chip and the verbs line say what is true, for example
  "UP" or "IN PROGRAM" with the grey treatment the monitor uses, and ON AIR stays for a started
  production and for server media.
- Most offline e2e specs run unpublished and assert the chip's words, so the change carries their
  update; the configured suite covers the started case.
