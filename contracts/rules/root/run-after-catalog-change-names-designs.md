---
v: 1
scope: src/templates/**, src/blocks/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-run-after-catalog-change-names-designs.md
---
Run `npm run catalog:affected` after a catalog change. It names the designs the change can move and prints the catalog gates scoped to them, the whole catalog for anything shared.
