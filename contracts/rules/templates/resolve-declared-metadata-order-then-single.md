---
v: 1
scope: src/templates/meta.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-resolve-declared-metadata-order-then-single.md
---
Resolve declared metadata in the order `VARIANT_META[id]`, `TYPE_META[typeId]`, then the single-valued `CATEGORY_DEFAULT_META[category]`. Keep `TYPE_OCCASIONS` and `VARIANT_OCCASIONS` separate from `DeclaredTemplateMeta`, resolving occasion from variant, else type, else none, with no category fallback or guessed declarations.
