---
v: 1
scope: src/components/PreviewFrame.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-wear-template-runtime-error-stage-itself.md
---
Wear a template RUNTIME ERROR on the stage itself as `.preview-runtime-error` - the same fault the Export gate reports from the store's `previewError` - as a label with `pointer-events: none`, never a control. It clears itself because every rebuild starts by resetting `previewError`.
