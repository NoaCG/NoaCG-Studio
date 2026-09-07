---
v: 1
scope: src/ai/claudeProvider.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-pass-attachment-context-through-referenced-images.md
---
Pass attachment context through `modify` to `toTemplate` so referenced images are bundled. Merge existing and newly attached images by path in `contextFrom`, and do not force code-level refinement merely because an image was attached.
