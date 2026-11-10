# Phase 5 evidence: More results and home-made graphics

Status: partial. Built: the `QR` layer of AC-13. Not built: AC-12, the rest of AC-13 (imported
and CLI result bars at their share within one pixel, bars up and pie for imported artwork, the
CLI docs), and the AC-15 walk with this phase's additions.

## AC-13, `QR` layer

- Change: `src/templates/importedDesign/svgQr.ts`, wired in `svg.ts` and `svgBind.ts`.
- Proof: `e2e/audience-pack.spec.ts` "an imported SVG with a layer named QR draws its Join link
  as a code that decodes": artwork outside the sample sets with a transformed `QR` group imports,
  gains a last field `Join link`; empty draws nothing and the stand-in is hidden; filled, the code
  sits on the layer's box within one pixel and decodes (jsQR, from pixels) to the link; an update
  redraws one code that decodes to the new link; emptied, the code goes.
- Contract: `docs/SVG_AUTHORING.md`, "A QR code - a layer named `QR`".
