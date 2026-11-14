// gate: build
// guards: scripts/e2e-dev-server-specs.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, devServerPaths } from './e2e-dev-server-specs.mjs';

const MARK = '// runs on: dev server - swaps the backend config over the network\n';

test('finds every URL-style /src and /benchmarks path outside the door and comments', () => {
  const text = [
    "await page.route('**/src/backend/config.ts*', r => r.abort());",
    "const m = await import('/src/model/id.ts?t=' + Date.now());",
    "import { s } from '/src/output/stage.ts';",
    "const b = await import('/benchmarks/creative/v1/briefs.json');",
    "await request.get(`${base}/src/x.ts`);",
    "await __noacgImport('/src/model/library.ts');",
    "// a comment naming import('/src/x.ts')",
    "import { x } from '../src/model/x';",
    "type T = typeof import('/src/model/library.ts');",
  ].join('\n');
  assert.deepEqual(devServerPaths(text), [1, 2, 3, 4, 5]);
});

test('a spec that needs the dev server must say so, and a helper may not need it', () => {
  const { specs, problems } = classify([
    ['e2e/a.spec.ts', "await page.route('**/src/backend/config.ts*', r => r.abort());"],
    ['e2e/b.spec.ts', MARK + "await page.route('**/src/backend/config.ts*', r => r.abort());"],
    ['e2e/c.spec.ts', MARK + 'reads stylesheets'],
    ['e2e/_h.ts', "await page.route('**/src/main.tsx*', r => r.abort());"],
    ['e2e/d.spec.ts', "await __noacgImport('/src/model/library.ts');"],
    ['e2e/e.spec.ts', '// runs on: dev server - \nawait page.route(\'**/src/x.ts\', r => r.abort());'],
  ]);
  assert.deepEqual(specs, ['e2e/b.spec.ts', 'e2e/c.spec.ts']);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /^e2e\/a\.spec\.ts:1 needs the dev server/);
  assert.match(problems[1], /^e2e\/_h\.ts:1 is a helper/);
  assert.match(problems[2], /^e2e\/e\.spec\.ts:2 needs the dev server/, 'a header with no reason does not count');
});
