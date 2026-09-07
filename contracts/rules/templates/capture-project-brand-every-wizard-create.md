---
v: 1
scope: src/templates/**, src/components/wizard/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-capture-project-brand-every-wizard-create.md
---
Capture the project brand on every wizard Create. Leave the current-project colors-and-typeface toggle off by default, and apply the selected project palette and font through `brandPatch` when the user enables it.
