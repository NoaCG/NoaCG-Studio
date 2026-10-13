// Loading a module of the creation wizard into a Node test, or into a blank Chromium page.
//
// The pattern is scripts/field-auto-map.test.mjs's (rolldown, `rawSuffix`) with one redirect.
// The wizard reaches the Import-graphic road through `import/index.ts`, and that index also
// re-exports the road's step COMPONENTS, which do not load outside the app: they import
// stylesheets, and one of them calls `DOMParser` at module load. What the draft and the kit plan
// use from the road is `import/draft.ts` alone, so `IMPORT_DRAFT_ONLY` resolves every wizard
// import of the `import` folder (core.ts's `../import`, draft.ts's `./import`) to that file. A
// module loaded this way exports the import road's draft names and none of its components.
import path from 'node:path';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

/** `import` from inside the wizard -> `import/draft.ts`. */
export const IMPORT_DRAFT_ONLY = {
  name: 'wizard-import-draft-only',
  resolveId(source, importer) {
    if (!importer || !/[\\/]components[\\/]wizard[\\/]/.test(importer)) return null;
    if (!/(^|\/)import$/.test(source)) return null;
    return path.resolve(path.dirname(importer), source, 'draft.ts');
  },
};

/** One TypeScript module of the app's graph, importable in Node. */
export async function loadWizardModule(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix, IMPORT_DRAFT_ONLY], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

/** The same module as a browser script exposing `window[globalName]`. */
export async function wizardBrowserScript(entry, globalName) {
  const bundle = await rolldown({ input: entry, platform: 'browser', plugins: [rawSuffix, IMPORT_DRAFT_ONLY], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'iife', name: globalName, codeSplitting: false });
  await bundle.close();
  return output[0].code;
}
