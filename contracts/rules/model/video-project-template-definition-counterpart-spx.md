---
v: 1
scope: src/model/videoTypes.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-video-project-template-definition-counterpart-spx.md
---
`VideoInput` is the video project's Template Definition, the counterpart of an SPX DataField: a key, a type, a label, a value and a default, plus options or bounds. The AI declares a handful so a non-technical user edits the content in the Content panel WITHOUT touching code, and the composition reads them from its `fields` prop with the declared default as the fallback. `videoFieldValues(inputs)` builds the bag passed as `fields` into BOTH the live preview and the render, so the two cannot disagree.
