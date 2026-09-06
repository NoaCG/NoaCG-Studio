// RE-EXPORT SHIM - it exists for ONE landing, then it goes.
//
// The template contract that lived here (TemplateVariant, WizardOptions, the palettes, the field
// plans, resolveOptions, fieldsFromOptions, ...) moved to src/templates/contract.ts, and the
// Import-graphic road's DesignSvg* / DesignArt shapes moved to
// src/templates/importedDesign/designTypes.ts (docs/WORKFLOW_ARCHITECTURE.md §5.5, domain
// row 1). Nothing here is kernel: every model/ importer of this file takes types only.
//
// The file keeps the old path resolving so the hundreds of importers on open branches - and the
// scripts that `import('/src/model/wizard.ts')` through Vite - compile while those branches land.
// Nine scripts load `/src/model/wizard.ts` by Vite path inside `page.evaluate` (the catalog sweeps,
// acceptance-pack, prerender) and scripts/metrics/cochange.mjs names it too: none of those is
// caught by tsc or depcruise, so the deleting landing greps for the path.
// The next landing rewrites every importer to the new paths and DELETES this file, together with
// the one temporary model -> templates allowance in .dependency-cruiser.cjs that it needs.

export * from '../templates/contract';
export * from '../templates/importedDesign/designTypes';
