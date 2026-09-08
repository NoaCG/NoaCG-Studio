---
v: 1
scope: src/blocks/assetOps.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-rewrites-asset-path-exact-string-replace.md
---
`moveAsset` rewrites an asset path with an EXACT-STRING replace across html, css and js - the verbatim-path convention `inlineAssetRefs` relies on - and a `./`-prefixed reference is covered because the bare path is a substring. Anything cleverer breaks the preview's inlining.
