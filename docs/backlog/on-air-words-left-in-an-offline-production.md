---
v: 2
source: derived
kind: finding
raised: 2026-10-03
state: unstarted
found: "after the rundown row and the verbs line learned UP for an offline take, the folder header, the monitor's name list and two panel headings still say ON AIR for that same take"
serves: now
size: small
touches: src/components/home/FolderRow.tsx, src/control/folderAir.ts, src/components/home/PlayoutMonitors.tsx, src/components/home/ProductionPage.tsx
covered-by: e2e/playout-folders.spec.ts, e2e/playout-baseline.spec.ts
---
# ON AIR words left in a production that is not started

**Filed:** 2026-10-03. **Source:** the session that closed on-air-words-in-an-offline-production.

## Why

A production that is not started plays a graphic's Take on its own page only. The rundown row now
reads UP in grey and the line under the verbs "up, not live" (studio-day-playout D16), but four
places on the same screen still call that take on air, so an operator reading any of them can still
believe a graphic went out:

- the folder header's tag: `ON AIR`, `1 ON AIR`, `2 OF 3 ON AIR` for a folder of graphics
  (`FolderRow.tsx` over `control/folderAir.ts`), above rows that each say UP;
- the program monitor's name list: with a server clip up the monitor rightly reads
  PROGRAM · ON AIR, and then names the local graphic beside the clip as if it aired too;
- the GRAPHIC ACTIONS and LIVE NUMBERS headings: "act on air" (`ProductionPage.tsx`).

## What it would take

- `folderAir` counts graphics and server cues apart, and the header says ON AIR only for what
  airs: a graphics-only folder reads UP, a mixed one names both. The specs in
  `e2e/playout-folders.spec.ts` assert the header's words (`folder-air`) and carry the change.
- The monitor names only what airs after "ON AIR", and the local graphics in the grey.
- The two headings say "act on the graphic that is up" (or similar) while not started.

## Evidence

Reproduce: the folders baseline in `e2e/playout-baseline.spec.ts` (an All-together folder of a
lower third and an audio file, taken in an offline production): the rundown row reads UP and the
verbs line "up, not live: House Strap", while the folder header reads ON AIR and the monitor reads
PROGRAM · ON AIR House Strap. The graphics-only baseline shows "GRAPHIC ACTIONS act on air" beside
PREVIEW · NOT LIVE.
