---
v: 1
scope: src/templates/contract.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-keep-discovery-metadata-out-variant-build.md
---
Keep discovery metadata out of the variant's build contract; resolve facets and search through the shared taxonomy, `templateMeta.ts`, and `search.ts`. Define import option shapes in `importedDesign/designTypes.ts` and reference them only as `WizardOptions` members in `contract.ts`.
