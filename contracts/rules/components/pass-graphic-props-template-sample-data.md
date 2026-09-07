---
v: 1
scope: src/components/ExportSurface.tsx, src/components/ExportPanel.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-pass-graphic-props-template-sample-data.md
---
Pass the graphic to `ExportSurface` as props - the template, its sample data and `graphicId` - and read NO store there, because the same six targets and the same validation gate have to serve a graphic that is not the open project. The render section appears when `isRenderConfigured()`; `ExportPanel` is the dock adapter that feeds the verdict back through `setValidation`, and `render/RenderPanel` takes the template, the sample data and the validation result the same way, gating ProRes and image sequences on `needsSignIn` as AI does.
