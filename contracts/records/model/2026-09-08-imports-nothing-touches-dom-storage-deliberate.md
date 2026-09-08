# model/imports-nothing-touches-dom-storage-deliberate

Rule: `model/imports-nothing-touches-dom-storage-deliberate`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`, which cites docs/PRODUCTION_DATA_PLAN.md and the Phase 2 hosted ingress.

First written with `fires: test:scripts/production-data.test.mjs`, which made the compiler treat the rule as carried by that script and print it only in `contracts/index.md`. The script asserts the three data rules; it does not carry this sentence about the module's isolation. Declared `contract` so it loads beside the module.
