---
v: 1
scope: src/model/library.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-deprecated-inert-data-packages-retired-deliberately.md
---
`packageId` is DEPRECATED inert data - packages are retired - and it is deliberately NOT nulled, because rewriting the whole library would storm sync. `migrateEmbeddedGraphics` still extracts a legacy v1 packet's embedded graphics into the library UNDER THEIR OWN ids, which is what makes the extraction convergent across devices, and it runs on every `loadAllGraphics`.
