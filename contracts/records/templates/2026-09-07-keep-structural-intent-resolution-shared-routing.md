# templates/keep-structural-intent-resolution-shared-routing

Rule: `templates/keep-structural-intent-resolution-shared-routing`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 65-73. **structuralAnchor.ts** - the one table answering "does a catalog structure carry this intent, and which one": the family words, `resolveAnchor`, `structuralFit`, and `anchorsSatisfiedBy` / `variantSatisfiesAnchor` (what a VARIANT is, for the satisfaction check). It lives here, not in src/ai, because TWO layers need the same answer and neither may import the other - the AI's ROUTER asks before the design call (adapt vs create) and `validation/structuralIntentCheck.ts` asks afterwards (is this the graphic that was asked for). A second copy is how those two come to disagree. Everything resolves LIVE against the registry and catalog, so catalog growth updates routing and satisfaction by itself: adding a design can CHANGE a route, which is why e2e/creative-routing.spec.ts runs on changes here.
