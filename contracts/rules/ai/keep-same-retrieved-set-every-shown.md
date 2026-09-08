---
v: 1
scope: src/ai/claudeProvider.ts, src/ai/designSpec.ts, src/ai/stubProvider.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-keep-same-retrieved-set-every-shown.md
---
Keep `catalogDigest(only?)` and `narrowVariantTool` on the same retrieved set so every shown `variantId` is legal. Preserve the full digest on CREATE and let `stubProvider` choose deterministically from the same shortlist.
