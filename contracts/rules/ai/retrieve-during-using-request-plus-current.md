---
v: 1
scope: src/ai/retrieval.ts, src/ai/claudeProvider.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-retrieve-during-using-request-plus-current.md
---
Retrieve during `specRefine` using the request plus the current spec's identity and content, and pin its `variantId` with `ShortlistOptions.keep`. Match the incumbent against the anchor rather than the narrowed pool, and refuse a `keep` from another structure.
