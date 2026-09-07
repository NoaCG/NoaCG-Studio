---
v: 1
scope: src/components/save/SaveDialogs.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-mount-once-after-wizard-unsaved-changes.md
---
Mount `SaveDialogs` ONCE in `App.tsx` AFTER the wizard, so the unsaved-changes guard paints OVER it, and let both the first-save dialog and the guard declare `useModalGate`. A guard rendered behind the wizard is a question nobody can answer.
