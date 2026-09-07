---
v: 1
scope: src/components/wizard/CreationWizard.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-brand-mark-own-draft-field.md
---
Keep the brand mark its own draft field, never one of `importedImages`, and let `draftToOptions` decide PER DESIGN whether it travels: never to a design with no logo slot, and never to a picture slot such as a presenter avatar or cover artwork. Create writes NO brand record - Home owns making one.
