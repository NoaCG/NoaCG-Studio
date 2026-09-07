# templates/update-adding-design-keeping-existing-designs

Rule: `templates/update-adding-design-keeping-existing-designs`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 22-33. **ADDING A DESIGN MOVES THREE BASELINES, and the five catalog gates only cover one of them.** `scripts/overflow-baseline.json` is re-recorded by the overflow sweep; `e2e/catalog-baseline.json` and `e2e/catalog-render-baseline.json` are re-recorded by their own spec:  ```bash UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1 npx playwright test e2e/catalog-baseline.spec.ts ```  **`e2e/catalog-baseline.spec.ts` is not in `playwright.catalog.config.ts`**, so every local catalog gate can pass while CI's full plan goes red on it - which is exactly what happened on 2026-08-19 to a nine-design branch with four green catalog runs behind it. The healthy diff is purely additive: ids added, nothing existing changed. Details: docs/VERIFICATION.md.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The baseline spec runs outside the catalog-only Playwright configuration; this incident explains why a green local catalog battery is insufficient. Source: src/templates/AGENTS.md, lines 30-33. **`e2e/catalog-baseline.spec.ts` is not in `playwright.catalog.config.ts`**, so every local catalog gate can pass while CI's full plan goes red on it - which is exactly what happened on 2026-08-19 to a nine-design branch with four green catalog runs behind it. The healthy diff is purely additive: ids added, nothing existing changed. Details: docs/VERIFICATION.md.
