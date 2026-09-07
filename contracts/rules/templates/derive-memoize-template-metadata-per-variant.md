---
v: 1
scope: src/templates/templateMeta.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-derive-memoize-template-metadata-per-variant.md
---
Derive and memoize template metadata per variant from the compiled schema and shared taxonomy. Exclude `HIDDEN_CONFIG_FIELDS` from visible counts, intersect buckets with reachable field ranges, combine declared and derived capabilities, and derive placement, motion, and complexity rather than duplicating declarations.
