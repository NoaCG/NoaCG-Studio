---
v: 1
scope: src/templates/search.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-exact-token-matches-exact-use.md
---
Keep exact token matches exact, and use `wordMatch` only as a fallback for otherwise unreachable tokens, with one-edit or mid-word matches at half weight and one-edit alias misses resolving to that alias. Keep `briefTerm` strictly AND-matched, and omit facet values without catalog matches through the `offered*` helpers.
