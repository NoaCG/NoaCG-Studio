---
v: 1
scope: src/components/wizard/CreationWizard.tsx, src/components/wizard/draft/**, src/components/wizard/kitPlan.ts, src/components/brand/**, src/model/brand.ts
kind: rule
fires: contract
status: retired
since: 2026-09-07
record: contracts/records/templates/2026-09-07-capture-project-brand-every-wizard-create.md
---
Capture the project brand on every wizard Create, so graphics made in one project read as siblings. Re-apply a saved brand's palette and typeface through `brandPatch`.
