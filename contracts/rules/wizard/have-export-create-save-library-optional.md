---
v: 1
scope: src/components/wizard/steps/FinishStep.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-have-export-create-save-library-optional.md
---
Have Export create, SAVE to the library - not optional - and open ExportWindow OVER the wizard through `keepGalleryOpen`, so closing it returns to the last creation step and the editor is never revealed. A FAILED save deliberately lands in the editor instead, where the topbar failed status is visible.
