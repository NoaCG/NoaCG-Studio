---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-hide-input-only-data-holders-through.md
---
Hide input-only data holders through the shared `DATA_SOURCE_CLASS` and `dataSourceCss` stylesheet rule, never inline `display: none`. Preserve the empty-image exception handled by `setFieldValue` and restored by `resetGraphicInline`.
