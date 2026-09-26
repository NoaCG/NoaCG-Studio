---
v: 2
source: derived
kind: finding
raised: 2026-09-27
state: unstarted
found: "Exported through the SPX starter door, the proof case loses its combined control, bindings and tree with no word in the package, and an SPX Update after the votes board's reveal clears the marks while the board stays revealed."
serves: NOW
size: small
touches: src/export/showExport.ts, src/export/onAirGuide.ts
needs-owner: none
---
# The SPX package drops the profile without saying so

**Filed:** 2026-09-27, from the walk in `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6h, which answered the
question this shelf used to hold (which door into SPX the proof case uses: the output embed, with
the starter package as the offline fallback).

## Why

The starter package is the fallback the room reaches for when the network or the real-SPX check
fails, so what it costs has to be visible to whoever opens it. Two things measured in §6h are not:

1. **Nothing says what was dropped.** A production with combined controls, bindings or a tree
   exports to SPX (`buildShowZip`, `src/export/showExport.ts`) with no trace of any of them: no
   line in `README.md` or `GETTING-ON-AIR.md`, and §6f's "combined controls run from its hosted
   control page" line exists only in the overlay flavour's `controller.html`. The fix is one
   honest line in the package's README and guide when the published profile has combined controls
   or the show has bindings, naming what the SPX operator has to do by hand instead. Pin it with
   the production-export spec that already reads the package.
2. **An Update after the reveal clears it.** The votes board reads its reveal back from the hidden
   Shown field on every `update()`. An SPX item keeps Shown at `votes`, so an Update after Continue
   leaves the board in `revealed` with every mark gone (measured in §6h). The package's
   `FIELDS.md` or guide should carry the SPX rule (finish the picks before Continue, and Stop,
   Play, Continue to recover). Whether the export should instead offer a reported field to SPX as
   a dropdown of its values is a contract question for `cli/skill/noacg-graphic/references/contract.md`
   §5c, and belongs there if anyone takes it up.

## Done means

Exporting the proof case with the §6h profile through the SPX door yields a package whose README
and guide name the dropped combined control and bindings and the Shown rule, and a production with
no profile gets neither line.
