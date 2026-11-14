// node --test docs/work-specs/cicd-followup/evidence/d2-selection-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectLosses } from './d2-selection-guard.mjs';

const plan = (specs, mode = 'subset') => ({ mode, specs });
const devProject = ['no-old-editor.spec.ts', 'sync-dot.spec.ts'];

test('a spec lost only on the dev project does not count', () => {
  assert.deepEqual(buildProjectLosses(plan(['a.spec.ts', 'no-old-editor.spec.ts']), plan(['a.spec.ts']), devProject), []);
});

test('a spec lost on the build project counts', () => {
  assert.deepEqual(
    buildProjectLosses(plan(['a.spec.ts', 'b.spec.ts', 'sync-dot.spec.ts']), plan(['a.spec.ts']), devProject),
    ['b.spec.ts'],
  );
});

test('a whole-suite dev plan against a narrower build plan is a loss; a whole-suite build plan never is', () => {
  assert.deepEqual(buildProjectLosses(plan([], 'full'), plan(['a.spec.ts']), devProject), ['(the whole suite)']);
  assert.deepEqual(buildProjectLosses(plan(['a.spec.ts']), plan([], 'full'), devProject), []);
});
