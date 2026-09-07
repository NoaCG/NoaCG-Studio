---
v: 1
scope: src/templates/search.ts, src/templates/meta.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-rank-query-named-occasion-above-subtype.md
---
Rank a query's named occasion above subtype, stacking its contribution with category relevance. Make occasion phrases alias keys pointing to facets, never words in the loose text index, and verify them with `npm run test:use-case-search`.
