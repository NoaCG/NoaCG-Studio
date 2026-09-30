---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "SPX 1.4 imports an OGraf manifest's fields as plain text fields and checkboxes unless a per-property v_spx hint names the SPX field type; NoaCG's OGraf export writes v_noacg but no v_spx, although every field starts as an SPX DataField (docs/PLAYOUT_TARGETS_RESEARCH.md)"
serves: NOW
size: small
touches: src/export/targets/ograf.ts
needs-owner: none
---

# Write `v_spx` hints into the OGraf manifest so SPX shows the right controls

**Filed:** 2026-09-30. **Source:** the playout target research,
[`PLAYOUT_TARGETS_RESEARCH.md`](../PLAYOUT_TARGETS_RESEARCH.md) §2.3 and §4 (SPX route 1).

## Why

SPX 1.4 reads OGraf packages from `ASSETS/templates/` and builds the operator's form from the
manifest schema. Without a hint, a boolean becomes a checkbox, a number a number, and everything
else a text field; a per-property `v_spx` object picks the SPX field type, and a manifest-level
`v_spx` sets the layer and out mode (SPX-GC source, `routes/routes-application.js`,
`addOgrafTemplateToProfile`). NoaCG's fields are SPX DataFields to begin with, so today a NoaCG
dropdown, colour, text area or file list arrives in SPX as a bare text box, losing information we
already hold. SPX is the most widely deployed open controller, and outcome 5 wants it proven.

## What it would take

- In `src/export/targets/ograf.ts`, beside the existing per-property `v_noacg`, write `v_spx` with
  the field's own `ftype` and the keys that type needs (`items` for a dropdown, `assetfolder` and
  `extension` for a filelist). Button fields stay custom actions, which SPX already turns into
  buttons.
- A manifest-level `v_spx` with the layer the SPX export would use, and `out: manual`.
- Vendor keys are the spec's own extension door and other renderers ignore them. Check that the
  OGraf validator and `docs/OGRAF.md` accept the extra keys.
- A unit test that reads the manifest the way SPX's importer does; the real check is the SPX round
  (`spx-gc-ograf-round.md`).

## Evidence

- SPX-GC source, <https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/routes/routes-application.js>
- SPX OGraf docs, <https://docs.spxgraphics.com/Documentation/Graphic+Templates/Formats/OGraf>
- `src/export/targets/ograf.ts`: the schema built from DataFields, and the `v_noacg` precedent.
