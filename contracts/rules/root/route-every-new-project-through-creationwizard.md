---
v: 1
scope: src/components/wizard/**
kind: rule
fires: contract
status: active
since: 2026-09-24
supersedes: root/send-new-projects-through-creationwizard-where, wizard/apply-create-sample-data-reset-new
record: contracts/records/root/2026-09-24-route-every-new-project-through-creationwizard.md
---
Route every new project through the CreationWizard, where `variant.create(options)` generates the complete commented template applied with sample data reset. Finish is the flow's ONE branch - a production, an export, or the new editor - and export is never a reward for opening an editor.
