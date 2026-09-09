# Read the lower-third type floor from its module instead of a copied literal

**Filed:** 2026-09-08. **Source:** measurement, from the `/check` review of `claude/b-red-alarms`,
which landed as PR #148 (merge `7242c3f0`); the type-floor half of it is `ef0950ac`.

## Why

`e2e/lite-type-floor.spec.ts:21` is `const FLOOR_PX = 20; // lower-third, from
src/validation/typeFloor.ts`. After that branch it is the **last** second reading of the type floor
anywhere in the repo, and the repo has just paid for the class.

The numbers moved once already: `src/validation/typeFloor.ts` became a re-export and `TYPE_FLOOR_PX`
went to `src/model/designRules.ts`. That move broke `scripts/type-floor.mjs`, which was regex-parsing
the declaration, and reddened `nightly.yml` and `catalog-gates.yml` for a night. Every other reader
imports the value — `src/ai/designAdjust.ts` and `src/bridge/bridgeApi.ts` both call `typeFloorFor`,
and the script now imports it through the dev server.

**This one would not break loudly, which is why it is worth closing.** Move the lower-third floor and
the spec keeps asserting 20 against a floor that is no longer 20, and passes. `typeFloor.ts`'s own
header forbids exactly this ("a second copy is how the gate and the thing it gates come to
disagree"), and `docs/CI_STABILITY.md` class 1 now carries the doctrine.

## What it would take

Small. The spec already imports from `src/`, so there is no new dependency: import `typeFloorFor`
from `src/validation/typeFloor` and derive the floor with `typeFloorFor('lower-third')` instead of
the literal. Keep the comment's intent — say which category the floor is for. Verify with
`npm run build` and by running that spec.

## Evidence

```
e2e/lite-type-floor.spec.ts:21:const FLOOR_PX = 20; // lower-third, from src/validation/typeFloor.ts
e2e/lite-type-floor.spec.ts:68:    expect(Math.min(...written)).toBeGreaterThanOrEqual(FLOOR_PX);
src/ai/designAdjust.ts:110:      const floor = Math.min(typeFloorFor(spec.category), ceiling);
src/bridge/bridgeApi.ts:394:      typeFloorPx: typeFloorFor(categoryFor(template)),
```

A grep of `scripts/` for a constant's value pulled out of `src/` by regex returned exactly one hit,
`scripts/type-floor.mjs`, which is the bug that branch fixed. This spec is the remainder.
