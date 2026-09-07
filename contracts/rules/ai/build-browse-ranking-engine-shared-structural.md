---
v: 1
scope: src/ai/retrieval.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-build-browse-ranking-engine-shared-structural.md
---
Build `shortlistFor` with the Browse ranking engine in `src/templates/search.ts` and the shared structural anchor table, using the brief and existing intent without another model call. Weight terms by rarity, cut relative to the best match, fill the floor in bands, and make `Shortlist.reason` distinguish matches from top-ups.
