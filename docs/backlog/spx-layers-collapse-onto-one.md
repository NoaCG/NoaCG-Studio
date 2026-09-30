---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "The native SPX export and the output embed land every graphic on one layer: single exports say 7, the production export and the output embed default to 20, and SPX 1.4 Solo caps layers at 5, so each Play evicts the last until the operator re-layers by hand (docs/SPX_ON_A_REAL_SERVER.md §2)"
serves: NOW
size: standard
touches: src/templates/shared/base.ts, src/model/shows.ts, src/export/showExport.ts, src/export/outputEmbed.ts
needs-owner: none
---

# NoaCG graphics all land on one SPX layer

**Filed:** 2026-09-30. **Source:** measurement on real SPX 1.4.1 and 1.2.1 servers,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §2 and §4.

## Why

A lower third over a scorebug is the first thing an SPX operator does, and with NoaCG packages the
second Play takes the first graphic off air. The operator has to know to open project settings,
give each template its own layer and rebuild the rundown. SPX 1.4 Solo, the free edition, has
five layers and caps anything higher to 5 on import, so our higher defaults do not even stay
distinct there.

## Reproduction

1. Export Hairline, Clean Quiz and House Scorebug with the SPX target and add all three to one SPX
   rundown.
2. SPX 1.2.1 imports them all at layer 7; SPX 1.4.1 at layer 5 (`playlayer`/`webplayout` in the
   project's `profile.json`).
3. Play one, then another: the renderer's layer holds only the second.
4. The output embed (default 20) landed on 5 in 1.4.1. The production export (operator layer,
   default 20, `DEFAULT_PLAYOUT_LAYER` in `src/model/shows.ts`) was not run; from the same cap it
   would land on 5 too. (The OGraf route gets no layer at all:
   `ograf-package-does-not-play-in-spx.md`.)

## What it would take

- Decide SPX-facing layer numbers that stay distinct inside 1 to 5 for Solo: the category's own
  convention (tickers low, bugs high, lower thirds between), which `src/templates/*/shared.ts`
  already sets for a few categories while `baseSettings()` in `src/templates/shared/base.ts` says
  7 for the rest.
- In the production export, map the operator's layers onto 1 to 5 when there are five or fewer
  graphics, and say in the README when there are more (Solo cannot hold them all at once).
- The output embed is one item, so any layer inside 1 to 5 works; pick one that leaves room.
- Keep CasparCG's own layer numbers unchanged where the export is for CasparCG.
- A test on the emitted definitions; then the three-graphic walk in the record passes without
  touching project settings.

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §2 (the layer rows of the table) and §4; SPX 1.4.1's `spx.max5()`
in `utils/spx_server_functions.js`.
