---
v: 1
scope: src/ai/settings.ts, src/ai/modelTypes.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-keep-transport-vocabulary-user-key-subset.md
---
Keep `AI_PROVIDER_IDS` as the transport vocabulary and `AI_PROVIDERS` as the user-key subset `openai`, `anthropic`, `google`, `huggingface`. Move a stored managed route to `DEFAULT_BYOK_PROVIDER` when resolving the `custom` tier so it cannot spend NoaCG's key.
