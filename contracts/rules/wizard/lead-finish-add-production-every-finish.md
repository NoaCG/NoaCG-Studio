---
v: 1
scope: src/components/wizard/CreationWizard.tsx, src/components/wizard/steps/FinishStep.tsx
kind: rule
fires: contract
status: active
since: 2026-09-24
supersedes: wizard/make-add-production-primary-finish-door, wizard/have-export-create-save-library-optional
record: contracts/records/wizard/2026-09-24-lead-finish-add-production-every-finish.md
---
Lead Finish with "Add to the production". Every Finish door applies the built graphic with the wizard kept open (`keepGalleryOpen`) and routes away itself, so nothing flashes on the way: the production door CONFIRMS through `WizardConfirm`, which PRINTS the production by name, then lands on the rundown; Export SAVES to the library - not optional - and opens ExportWindow OVER the wizard, so closing it returns to the last creation step. A failed save leaves the wizard open on Finish to press the door again.
