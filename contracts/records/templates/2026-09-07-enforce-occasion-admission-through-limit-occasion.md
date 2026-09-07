# templates/enforce-occasion-admission-through-limit-occasion

Rule: `templates/enforce-occasion-admission-through-limit-occasion`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 178-184.   **The gate is `npm run test:use-case-search`** (`scripts/use-case-search.test.mjs`): it runs the   real engine over the real catalog in a blank Chromium page, and carries `validateTaxonomy()`,   which enforces facet I's admission rule - the ceiling of 8, the floor of 3 designs per occasion,   a declared id that names no real variant, and every phrase resolving to its occasion. Outside   `npm run build` for the same reason `check:catalog-emit` is: it needs a browser (the search   index is built out of CREATED designs, and creating one parses the html it just emitted).   It runs in CI in the **Factory gates** job, which needs no plan flag to fire.
