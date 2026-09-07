---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-add-imports-sanctioned-animation-data-importer.md
---
Do not add imports from `src/blocks/**` to `src/templates/**`; the sanctioned animation-data and importer seam is not permission for more upward dependencies. Copy a small reusable helper locally when necessary, and inspect new imports first when wizard or AI suites time out wholesale without a console error.
