---
v: 1
scope: src/components/wizard/CreationWizard.tsx, src/components/wizard/import/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-give-only-step-whose-left-pane.md
---
Give `.wz-body-working` only to a step whose left pane is a CANVAS. It lifts the measure cap and clamps the preview, which a form-shaped left pane cannot afford.
