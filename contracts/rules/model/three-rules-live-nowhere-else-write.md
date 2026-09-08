---
v: 1
scope: src/model/productionData.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-three-rules-live-nowhere-else-write.md
---
Three rules live in `productionData.ts` and nowhere else. A write is ABSOLUTE STATE - `mergePatch` is RFC 7386 and nothing in the file can express an increment, so a retried write cannot corrupt a value. A binding RESOLVES TO FIELD VALUES, ordinary field updates, so the template stays a plain SPX graphic and an export keeps working with no feed. And a MISSING PATH WRITES NOTHING, so a live field keeps its last good value - freezing is not-writing.
