---
v: 1
scope: src/templates/**
kind: rule
fires: gate:catalog-affected
status: active
since: 2026-09-07
supersedes: templates/adding-designs-add-only-their-new
record: contracts/records/templates/2026-09-07-update-adding-design-keeping-existing-designs.md
---
Update `scripts/overflow-baseline.json`, `e2e/catalog-baseline.json`, and `e2e/catalog-render-baseline.json` when adding a design, keeping existing designs unchanged. In `scripts/overflow-baseline.json` add only the new rows by hand and confirm them with `node scripts/overflow-sweep.mjs --baseline`, never a full re-record. Record the other two baselines through `e2e/catalog-baseline.spec.ts` with `UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1`.
