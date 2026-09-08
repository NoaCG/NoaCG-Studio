---
v: 1
scope: src/model/wizard.ts
kind: trap
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-export-shim-nothing-else-template-contract.md
---
`src/model/wizard.ts` is a RE-EXPORT SHIM and nothing else. The template contract it once held - categories, variants, `WizardOptions`, palettes, field plans - lives in `templates/contract.ts`, and the Import-graphic shapes (`DesignSvg*`, `DesignArt`) in `templates/importedDesign/designTypes.ts`; read those contracts THERE. Every importer in this directory takes types only, and the landing that rewrites the importers onto the new paths is what deletes the shim.
