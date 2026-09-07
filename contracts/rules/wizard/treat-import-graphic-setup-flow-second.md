---
v: 1
scope: src/components/wizard/import/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-treat-import-graphic-setup-flow-second.md
---
Treat Import graphic as a SETUP flow, not a second editor. Its one drop zone takes three MODES and never a branch: `design` for any raster, `svg` for the mapping step alone, and `file` for a finished template. What each step DOES is owned by docs/IMPORT_MVP.md and docs/SVG_IMPORT_PLAN.md; only what the wizard itself owns belongs here.
