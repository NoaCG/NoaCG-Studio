---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-update-adding-design-keeping-existing-designs.md
---
Update `scripts/overflow-baseline.json`, `e2e/catalog-baseline.json`, and `e2e/catalog-render-baseline.json` when adding a design, keeping existing designs unchanged. Record the latter baselines through `e2e/catalog-baseline.spec.ts` with `UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1`; do not treat the catalog-only suite as coverage of that spec.
