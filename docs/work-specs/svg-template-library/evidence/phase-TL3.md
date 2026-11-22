# Phase TL3 evidence: one library

Base: `main` at `304adc72902f468d3d6b711b2e342f17ff9565d4`. Acceptance for this phase, verbatim:
"AC-1: One Template Library page and one downloads card; no user-facing "Examples" set; every old
URL, file and anchor still delivers." and "AC-11: The import workflow's steps are unchanged apart
from names and new recipe options." Spec sections met: Tests and budget, Old addresses,
Consumers. Row class: not Ordinary (it changes the build, `vercel.json` and the deploy filter),
not Risky (it sets no state rule of the kinds the traps file lists); the Rules it does set (A1 to
A4 in the phase notes) were written after coding, so the final `/so` challenges them.

## What was built

- One folder, `docs/tutorials/template-library/`, and one inventory, `library.json` (37
  templates: 15 `studio`, 22 `navy`). 115 files moved by pure rename (git R100); the four slugs
  both sets used gained `-navy` on the navy side. Two inventories, two READMEs and two PDFs were
  replaced by one each (the README is eight printed pages and names both fonts and their licence).
- `/svg-templates` is the Template Library page: the whole library's zip, then five packages
  (Audience, Games and scores, Titles and information, Clocks and holding screens, End credits),
  each with its zip and its templates, each template with its default preview, its named states
  and, where the catalog has designs of its type, up to four built-in alternatives.
- `/downloads` has one SVG templates card with one zip, "All templates (.zip)".
- Every download is made at build from the folder (`scripts/svg-files.mjs`, the
  `template-library-downloads` plugin in `vite.config.ts`); `public/downloads/` is gone from git.
- `vercel.json` redirects every old address; `docs/template-library/old-addresses.json` records
  each with what it served (sha256) and where it lives now.
- The Import step's link reads "SVG templates" and goes to `/svg-templates`.

## AC-1, per part

| Part | Proof | Result |
| --- | --- | --- |
| One Template Library page | `scripts/svg-files.test.mjs` "each package shows each of its templates..." and `e2e/downloads.spec.ts` "the Template Library page shows every template by package and serves each file and package zip": every template is in a package, each tile's SVG is the source file, each package zip holds exactly its templates, every preview loads | RESULT_PAGE |
| One downloads card | `e2e/downloads.spec.ts` "one SVG templates card holds the library zip, and the zip matches the repo": one `download-svg*` card, one download link, the library zip's every text file, picture, PDF and `.ai` byte-equal to the repo | RESULT_CARD |
| No user-facing Examples set | the page and its generated body contain no "example" (Node and browser), the card contains no "example" | RESULT_EXAMPLES |
| Every old URL and file still delivers | `scripts/svg-files.test.mjs` "every old address still delivers": all 124 addresses resolved through `vercel.json`'s redirects to a file the build serves, each SVG and PNG with the sha256 it had on the base; both old zips resolve to the library zip, which holds every SVG, picture, `.ai` and guide they held (121 files) byte for byte; only the old READMEs, PDFs and inventories were replaced | pass (8/8 in the file) |
| Every old anchor still delivers | `#templates` and `#examples` exist on the library page; `#svg-examples` on `/downloads` sits inside the card (both specs) | RESULT_ANCHORS |

## AC-11

The Import step is untouched except one link: its text "Example files" became "SVG templates" and
its target `/svg-templates#examples` became `/svg-templates` (`ImportDesignStep.tsx`; asserted in
`e2e/import-svg.spec.ts`). No recipe, step, field or option changed. RESULT_IMPORT

## Tests and budget

- No browser test was removed or added: the e2e protection check counts every spec (324) and
  passes with no maintenance entry. The three changed spec files keep their counts
  (`downloads.spec.ts` replaced its two SVG tests by two; `svg-templates.spec.ts` and
  `svg-examples.spec.ts` loop over the same templates, now filtered by `style` from one inventory).
- Minutes before, from `scripts/e2e-durations.json` (main, p80, recorded 2026-11-16): downloads
  0.125, svg-templates 0.997, svg-examples 1.301. After: AFTER_MINUTES.
- The batched sweep that replaces one browser test per template is not built here (phase notes:
  it removes tests, so it needs a maintenance entry; TL4 adds its templates to a batched sweep).

## Bytes (D3)

| | Base | Now |
| --- | --- | --- |
| Committed download output (`public/downloads/`) | 5,321,054 bytes (two zips, 80 copies) | none |
| Built downloads in the deploy | the same 5.3 MB, copied from `public/` | 10,608,070 bytes: library zip 4,675,414, five package zips 5,089,257, 103 single files 843,399 |

The package zips are what grows the deploy (they repeat files of the library zip); the old zip
addresses redirect instead of keeping two more copies.

## Verification run

- Node: `svg-files` 8/8, `template-coverage` 11/11, `concept-names` 5/5, `e2e-affected` 126/126,
  `deploy-affecting-paths` 16/16, `check-svg-example-coverage` 4/4, `illustrator-exports` 2/2,
  `check-example-layers` 20/20, `check-tree-shape` 3/3, `svg-figure-fit` 4/4; `check-copy`,
  `check-vercel-config`, `check-e2e-protection --changed origin/main`, `tsc`, `eslint` on the
  changed files: pass.
- `vite build --mode e2e`: writes the six zips and 103 files under `downloads/`.
- Browser (job queue, this cloud worker, on the e2e build): BROWSER_RESULT.
