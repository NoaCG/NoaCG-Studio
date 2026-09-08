---
v: 1
scope: src/model/videoTypes.ts
kind: trap
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-adopts-regenerated-input-set-while-keeping.md
---
`mergeVideoInputs(prev, next)` adopts a regenerated input set while KEEPING the values the user already edited, and it takes an array - so a provider that simply did not re-declare its inputs must report that as nothing at all, and the CALL SITE keeps the previous set. An empty array is not the same answer: it means no editable content, it is honoured as such, and merging it empties the user's Content panel and reverts their text to the code defaults.
