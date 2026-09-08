---
v: 1
scope: src/model/taxonomy.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-alias-table-several-declared-tables-per.md
---
The alias table is several DECLARED tables - one per locale, plus the occasion phrases - merged into ONE `ALIASES` with every key folded through the exported `normalizeSearchText`, the same fold `templates/search.ts` runs over a typed query. That is what lets a locale table be written in the spelling people actually type and still be found. Colliding keys UNION their targets; they never overwrite.
