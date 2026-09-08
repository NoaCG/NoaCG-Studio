---
v: 1
scope: src/model/imagePurpose.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-lives-model-layer-same-reason-does.md
---
`imagePurpose.ts` lives in the MODEL layer for the same reason `generationSpec.ts` does: `VideoProject` PERSISTS the map as `assetUses`, and the model imports nothing above layer 0. The preselect's only signal is `probeAsset` - alpha plus a small footprint.
