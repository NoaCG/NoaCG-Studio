---
v: 1
scope: src/ai/retrieval.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-check-before-using-retrieval-latter-deliberately.md
---
Check `anchorResolves` before using `variantSatisfiesAnchor` in retrieval; the latter deliberately accepts unresolved anchors for satisfaction checks. Return `FULL_CATALOG` when no anchor resolves, drop an empty field bucket and fall back to catalog order when no query signal survives.
