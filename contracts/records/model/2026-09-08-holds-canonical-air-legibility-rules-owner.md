# model/holds-canonical-air-legibility-rules-owner

Rule: `model/holds-canonical-air-legibility-rules-owner`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`, which cites docs/DESIGN_RULES_PLAN.md. `scripts/design-rules.test.mjs` runs in the build gate.

First written with `fires: gate`-style mechanism declaration (`test:scripts/design-rules.test.mjs`), which made the compiler treat the rule as carried by that script and drop it from every loaded surface. The script asserts the maths; it does not carry the sentence. Declared `contract` so it loads beside the module.
