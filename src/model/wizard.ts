// RE-EXPORT SHIM - it exists for ONE landing, then it goes.
//
// The template contract that lived here (TemplateVariant, WizardOptions, the palettes, the field
// plans, resolveOptions, fieldsFromOptions, ...) moved to src/templates/contract.ts, and the
// Import-graphic road's DesignSvg* / DesignArt shapes moved to
// src/templates/importedDesign/designSvgTypes.ts (docs/WORKFLOW_ARCHITECTURE.md §5.5, domain
// row 1). Nothing here is kernel: every model/ importer of this file takes types only.
//
// The file keeps the old path resolving so the hundreds of importers on open branches - and the
// scripts that `import('/src/model/wizard.ts')` through Vite - compile while those branches land.
// The next landing rewrites every importer to the new paths and DELETES this file, together with
// the one temporary model -> templates allowance in .dependency-cruiser.cjs that it needs.

export * from '../templates/contract';
export * from '../templates/importedDesign/designSvgTypes';
