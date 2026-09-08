# A fourth data holder renders in every credits design here, and not in the baseline

**Filed:** 2026-09-08. **Source:** measurement, while verifying
`claude/l-panel-that-never-grows` against `main` at `04c8864c`.

## Why

`e2e/catalog-baseline.spec.ts`, "every catalog variant renders identically", fails on this laptop
for nine credits variants (cr01, cr02, cr03, cr04, cr06, cr08, cr11, cr12, cr13) with the same two
elements each time: `#count` and `div.noacg-data-source[4]`. The recorded baseline
(`e2e/catalog-render-baseline.json`, `platform: win32`) has cr01 at **37 elements with three**
`noacg-data-source` holders; the render here has **four**, so every count moves by one.

CI is green on the identical sha (`main` at `04c8864c`, run 2026-09-08T22:16Z), so either the
laptop renders one holder more than CI does, or the gate only catches it under a condition CI does
not meet. Both readings matter: the message the spec prints is "The rendered look moved. A token
substitution cannot do this - investigate before re-recording", and the honest answer today is
that nobody knows which side is right. A hidden data holder appearing on the canvas is the exact
defect `91964cf3` set out to remove, so this may be a survivor of it.

**It is not the SVG growth work.** Reproduced with `src/templates/importedDesign/svg.ts` stashed:
same nine variants, same two elements.

## What it would take

Render one credits variant on both machines and diff the holders: dump the four
`div.noacg-data-source` nodes with their inline styles and their owning field, and find what makes
the fourth exist here. If it is a real extra holder, it is a product defect and the baseline is
right; if the baseline is stale, re-record it with `UPDATE_RENDER_BASELINE=1` and say in the commit
which of the two was wrong.

## Evidence

The per-element records the failing run writes:
`test-results/catalog-baseline-every-catalog-variant-renders-identically-chromium/rendered/cr01.txt`
(75 lines, four holders) against `e2e/catalog-render-baseline.json` `variants.cr01` (`#count: 37`,
three holders).
