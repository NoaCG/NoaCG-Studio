// The e2e build's registry lists exactly what the specs import, and runs side-effecting modules lazily.
// guards: scripts/e2e-module-registry.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import { LAZY, plainImports, registrySource, specImports } from './e2e-module-registry.mjs';

test('reads each literal source import once, through import() or the door, in any quote, and leaves a ?t= second copy out', () => {
  const found = specImports([
    "await import('/src/store/templateStore.ts'); await import(\"/src/model/library.ts\")",
    'await import(`/src/store/templateStore.ts`); await import(\'/src/model/id.ts?t=\' + Date.now())',
    'await import("/src/components/ExportWindow.tsx")',
    "await __noacgImport('/src/model/brand.ts')",
  ]);
  assert.deepEqual(found, ['/src/components/ExportWindow.tsx', '/src/model/brand.ts', '/src/model/library.ts', '/src/store/templateStore.ts']);
});

test('imports the rest statically and only the side-effecting modules behind a function', () => {
  const lazy = [...LAZY][0];
  const text = registrySource(['/src/model/library.ts', lazy]);
  assert.match(text, /import \* as m0 from '\.\/model\/library\.ts';/);
  assert.match(text, /'\/src\/model\/library\.ts': m0,/);
  assert.ok(!text.includes(`from '.${lazy.slice(4)}'`), 'a lazy module is never imported statically');
  assert.ok(text.includes(`'${lazy}': () => import('.${lazy.slice(4)}'),`));
});

test('refuses a plain in-page source import, and allows the door and a type position', () => {
  const found = plainImports([
    ['e2e/a.spec.ts', "await __noacgImport('/src/model/library.ts');\ntype T = typeof import('/src/model/library.ts');"],
    ['e2e/b.spec.ts', "line one\nawait import('/src/store/templateStore.ts');"],
  ]);
  assert.deepEqual(found, ['e2e/b.spec.ts:2']);
});
