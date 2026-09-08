---
v: 1
scope: src/model/shows.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-production-unit-user-word-production-never.md
---
`shows.ts` is the PRODUCTION unit - the user's word is production, never the old rundown: a name-keyed graphic POOL with one renderer instance each, plus the CUE rundown, where `cues` are additive-optional data rows over the pool and many cues can point at one graphic. Every pool graphic holds its OWN on-air cue, so several are live at once. Packet conventions apply: updatedAt last-write-wins, tombstones.
