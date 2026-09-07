---
v: 1
scope: src/components/wizard/steps/FinishStep.tsx, src/components/wizard/CreationWizard.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-send-all-three-finish-doors-through.md
---
Send all three Finish doors through `applyDraftProject`, which is what keeps them byte-identical. The editor path formats through Prettier, so an export path that skipped it would ship different HTML for the same choices.
