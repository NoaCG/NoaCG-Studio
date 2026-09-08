---
v: 1
scope: src/ai/modelTypes.ts, src/ai/modelGateway.ts, src/ai/modelCatalog.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-keep-provider-specific-transport-below-through.md
---
Keep provider-specific transport below `AIProvider` through `modelTypes.ts` and `modelGateway.ts`; normalize structured output, usage, costs, errors, retries and explicit fallbacks at the gateway seam. Make `modelCatalog.ts` consume the normalized server discovery endpoint.
