---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "A NoaCG OGraf package imported into SPX 1.4.1 gets layer \"NaN\" and Play shows nothing, with no error, because the manifest has no v_spx layer; with layers set by hand it plays (docs/SPX_ON_A_REAL_SERVER.md §3)"
serves: NOW
size: small
touches: src/export/targets/ograf.ts
needs-owner: none
---

# A NoaCG OGraf package does not play in SPX as imported

**Filed:** 2026-09-30. **Source:** measurement on a real SPX 1.4.1 server,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §3.

## Why

"Plays in SPX 1.4" is the sentence the OGraf route exists to earn. As imported, a NoaCG package
plays nothing and says nothing, and an operator has no way to guess that the fix is a layer number
in project settings. This raises the manifest-level half of
[`ograf-manifest-v-spx-hints.md`](ograf-manifest-v-spx-hints.md) from nice-to-have to required.

## Reproduction

1. Put any NoaCG OGraf package under SPX 1.4.1's `ASSETS/templates/`, make an OGRAF-format project
   and add the package.
2. The project's `profile.json` shows `"playlayer": "NaN"` and `"webplayout": "NaN"`.
3. Add it to a rundown and press Play: the renderer stays empty and logs nothing.

## Cause

SPX's importer writes `spx.max5(ografJson.v_spx?.webplayout) || "1"`. `max5(undefined)` returns
the string `"NaN"`, which is truthy, so the default never applies, and the renderer drops a layer
that is not a number. It is SPX's defect; we avoid it by always writing the layer.

## What it would take

- Write a manifest-level `v_spx` with `playlayer` and `webplayout` (inside 1 to 5, see
  [`spx-layers-collapse-onto-one.md`](spx-layers-collapse-onto-one.md)) and `out: "manual"`, as
  `ograf-manifest-v-spx-hints.md` describes; the per-property field types can land in the same
  change or after.
- A unit test that runs SPX's import expression on our manifest and gets a number from 1 to 5.

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §3; SPX 1.4.1 `routes/routes-application.js`
`addOgrafTemplateToProfile` and `utils/spx_server_functions.js` `max5`.
