---
v: 1
scope: src/components/wizard/WizardPreview.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-never-let-anything-wizard-renders-navigate.md
---
Never let anything the wizard renders navigate a live frame. WizardPreview mounts a NEW iframe per document, keyed on its generation, because replacing an existing frame `srcdoc` is a subframe navigation that joins the session history.
