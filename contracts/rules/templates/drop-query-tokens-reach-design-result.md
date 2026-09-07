---
v: 1
scope: src/templates/search.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-drop-query-tokens-reach-design-result.md
---
Drop query tokens that reach no design from the result AND and return them as `BrowseOutcome.ignored`. Keep `catalogVocabulary()` as the shared matching vocabulary, and index a design id at name weight.
