---
v: 1
scope: src/model/videoTypes.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-canonical-unit-video-editor-parallel-composition.md
---
`VideoProject` is the canonical unit of the AI video editor and is PARALLEL to `SpxTemplate` - one composition source plus duration, fps, size and transparency, plus assets in the exact `AssetFile` shape, plus the editable inputs, the AI chat history and the motion plan. The two worlds NEVER mix, and `kind: 'video'` is the serialized discriminant.
