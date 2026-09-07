---
v: 1
scope: src/components/wizard/steps/BrowseStep.tsx, src/components/wizard/CreationWizard.tsx
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-browse-filter-state-creationwizard-back.md
---
Keep Browse filter state in CreationWizard as `browseFilters` so Back returns with filters intact, and pass the setter as a REACT DISPATCH so chip toggles compose as functional updates.
