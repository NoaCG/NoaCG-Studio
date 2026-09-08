---
v: 1
scope: src/model/videoTypes.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-input-value-logical-name-project-asset.md
---
An `image` input's value is the LOGICAL NAME of a project asset - the counterpart of an SPX filelist filename - and the composition resolves it against the `assets` prop it already receives. That is what keeps an image input from adding any bytes to the render manifest budget.
