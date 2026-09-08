# model/look-carries-shape-well-colour-radius

Rule: `model/look-carries-shape-well-colour-radius`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From `src/model/AGENTS.md`: colour and typeface alone never made one design read as another's sibling - a glass card and a sport slab share a palette and still look like two products, because what separates them is the shape. The tokens ride on `ProjectBrand.tokens`, additive optional, so no version bump and no migration. The variables named are `--font-numeric`, which would push the source's numeric face onto a target whose own face needs a different answer, and `--font-label`. `setIf` prevents the same dead-knob failure `tokenVarsCss` exists to prevent.
