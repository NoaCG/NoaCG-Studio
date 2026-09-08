---
v: 1
scope: src/ai/provider.ts, src/ai/claudeProvider.ts, src/ai/designSpec.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-bundle-only-pictures-through-keep-pictures.md
---
Bundle only `asset` pictures through `GenerateContext.images`; keep `layout`, `mood` and `plate` pictures vision-only in `GenerateContext.references` as `{asset, use}`. Use `fixedAssetPaths` to keep permanent assets out of operator fields.
