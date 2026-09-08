---
v: 1
scope: src/model/imagePurpose.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-deterministic-preselect-guesses-only-between-other.md
---
`guessPurpose` is the deterministic preselect and guesses ONLY between `asset` and `mood`: the other two purposes are INTENTS no pixel reveals. It lives in the model layer for the same reason `generationSpec.ts` does - `VideoProject` PERSISTS the map as `assetUses`, and model imports nothing above layer 0.
