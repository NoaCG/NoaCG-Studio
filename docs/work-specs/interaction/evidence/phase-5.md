# Phase 5 evidence: More results and home-made graphics

Status: partial. Built: the imported half of AC-13 (bars at their share, the `QR` layer, the
import docs). Not built: AC-12, the CLI half of AC-13 (a CLI-made result graphic and the CLI
docs), bars up and pie or donut for imported artwork, and the AC-15 walk with this phase's
additions.

## AC-13, imported result artwork

- Change: `Vote count` is now a name for the vote's total layer (`behaviours/words.json`, docs
  regenerated), the words the field contract already uses.
- Proof: `e2e/audience-pack.spec.ts` "an imported SVG vote board draws each bar at its share
  within one pixel": artwork outside the sample sets (four 600-unit bars across, layers Question,
  Option 1 to 4, Bar 1 to 4, Vote count) is proposed as a live vote with four rows, passes the
  export gate, carries Question, Options and Vote count fields, and with counts 10, 20, 30 and 40
  of 100 draws each bar within one pixel of its share of the drawn length on screen.

## AC-13, `QR` layer

- Change: `src/templates/importedDesign/svgQr.ts`, wired in `svg.ts` and `svgBind.ts`.
- Proof: `e2e/audience-pack.spec.ts` "an imported SVG with a layer named QR draws its Join link
  as a code that decodes": artwork outside the sample sets with a transformed `QR` group imports,
  gains a last field `Join link`; empty draws nothing and the stand-in is hidden; filled, the code
  sits on the layer's box within one pixel and decodes (jsQR, from pixels) to the link; an update
  redraws one code that decodes to the new link; emptied, the code goes.
- Contract: `docs/SVG_AUTHORING.md`, "A QR code - a layer named `QR`".
