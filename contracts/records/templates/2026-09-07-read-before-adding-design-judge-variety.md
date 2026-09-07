# templates/read-before-adding-design-judge-variety

Rule: `templates/read-before-adding-design-judge-variety`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 106-112. **Before adding a design, read `docs/CATALOG_VARIETY.md`.** It measures what the catalog already repeats, off the EMITTED code rather than the declared axes: the style family predicts three of the fourteen decisions a viewer can see (blur, skew, radius) and the graphic CATEGORY predicts the rest, so a design that varies only its family is a re-skin. `node scripts/catalog-sameness.mjs` prints a design's distance to its nearest catalog neighbour; under 0.25 is a near-duplicate. `node scripts/palette-freedom.mjs` answers the other half - whether a design can take a palette it was not drawn in.
