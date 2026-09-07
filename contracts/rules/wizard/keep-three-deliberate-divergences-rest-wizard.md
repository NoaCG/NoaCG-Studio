---
v: 1
scope: src/components/wizard/steps/EntryStep.tsx, e2e/wizard-entry-fit.spec.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-keep-three-deliberate-divergences-rest-wizard.md
---
Keep three deliberate divergences from the rest of the wizard on the Entry step: no kit card, cards act on CLICK rather than radio-plus-Continue, and Blank stays behind Advanced mode. `e2e/wizard-entry-fit.spec.ts` pins them.
