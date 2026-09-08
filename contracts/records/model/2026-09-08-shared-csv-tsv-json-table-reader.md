# model/shared-csv-tsv-json-table-reader

Rule: `model/shared-csv-tsv-json-table-reader`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`, which cites docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 7. A semicolon export must not become one fat column, which is what the separator detection is for.

The accepted JSON is an array of rows - arrays or objects - and a top-level object with exactly one array property is unwrapped into that array first; anything else is refused with `Expected a list of rows - an array of objects, or an array of arrays.` The contract said 'the two shapes people actually have', which is the intent but one shape short of the code.

First written with `fires: test:scripts/csv.test.mjs`, which made the compiler treat the rule as carried and drop it from every loaded surface. Declared `contract` so it loads beside the module.
