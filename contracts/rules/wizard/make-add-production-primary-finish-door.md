---
v: 1
scope: src/components/wizard/steps/FinishStep.tsx, src/components/wizard/WizardConfirm.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-make-add-production-primary-finish-door.md
---
Make "Add to the production" the primary Finish door: it applies with `skipNavigation` and `keepGalleryOpen` exactly as Export does, so the editor never flashes on the way to the rundown, and a failed save leaves the wizard open on Finish to press again. It CONFIRMS first through `WizardConfirm`, and that dialog PRINTS the production by name.
