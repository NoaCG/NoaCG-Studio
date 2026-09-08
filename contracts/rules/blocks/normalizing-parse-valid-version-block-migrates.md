---
v: 1
scope: src/blocks/animData.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-normalizing-parse-valid-version-block-migrates.md
---
`parseAnimData` is a NORMALIZING parse - a valid version-1 block migrates on read through `migrateAnimData` so everything downstream sees only the current shape - and serialization ALWAYS writes the current version, so a saved v1 document flips on its first edit as a one-line diff. Additive optional fields never bump the version; a BREAKING shape change bumps it and ships its migration here in the same commit; an unknown version degrades to hand-crafted, never a crash.
