---
v: 1
scope: src/model/fonts.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-any-face-variable-points-has-ship.md
---
Any face a variable points at has to SHIP. `ensureFontFace` is that guarantee, and every path that RETARGETS a typeface after the build calls it: `ensureNumericFontFace` on a typeface swap or a look applied to a graphic, the wizard's `buildDraftTemplate` for `cssVarOverrides`, and the editor's `setVar`. The build covers its own faces by emitting `fontFaceCss` from `templates/shared/base.ts`. Skip it and the export references bytes nobody wrote, which `font-display: swap` hides until playout. `fontByStack` reads a `font-family` value back to its bundled record.
