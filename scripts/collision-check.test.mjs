// The collision check reads a running row's REAL diff, not a forecast. On 2026-09-04 row C's
// forecast named three files its diff never touched, so two rows waited 79 minutes on a phantom
// collision. What is pinned: a forecast that misses the real files is CLEAR, a real overlap or a
// shared covering spec COLLIDES, a full-coverage side is a caution not a collision, and a
// candidate never collides with its own branch.
import assert from 'node:assert/strict';
import test from 'node:test';

import { collisions, matchesOwned, parseOwns } from './collision-check.mjs';

test('parseOwns splits paths from specs and drops free text', () => {
  const parsed = parseOwns('OWNS `src/components/home/`, src/model/shows.ts specs: library.spec.ts, e2e/productions.spec.ts');
  assert.deepEqual(parsed.files, ['src/components/home/', 'src/model/shows.ts']);
  assert.deepEqual(parsed.specs, ['library.spec.ts', 'productions.spec.ts']);
});

test('matchesOwned handles a directory prefix, a glob, and an exact path', () => {
  assert.equal(matchesOwned('src/components/home/Card.tsx', ['src/components/home/']), true);
  assert.equal(matchesOwned('src/components/wizard/import/ImportDesignStep.tsx', ['src/components/wizard/import/*']), true);
  assert.equal(matchesOwned('src/model/shows.ts', ['src/model/shows.ts']), true);
  assert.equal(matchesOwned('src/model/other.ts', ['src/model/shows.ts']), false);
});

const noSpecs = () => ({ mode: 'subset', specs: [] });

test('a forecast that misses the running row\'s real files is CLEAR (the 2026-09-04 case)', () => {
  // C really changed svg.ts; a candidate that forecasts MapSvgFieldsStep is disjoint in reality.
  const entries = [{ branch: 'claude/c', files: ['src/templates/importedDesign/svg.ts'] }];
  const verdict = collisions({ files: ['src/components/wizard/import/MapSvgFieldsStep.tsx'] }, entries, noSpecs);
  assert.equal(verdict.clear, true);
});

test('a real file overlap collides and names the branch and file', () => {
  const entries = [{ branch: 'claude/c', files: ['src/templates/importedDesign/svg.ts'] }];
  const verdict = collisions({ files: ['src/templates/importedDesign/'] }, entries, noSpecs);
  assert.equal(verdict.clear, false);
  assert.equal(verdict.hits[0].branch, 'claude/c');
  assert.deepEqual(verdict.hits[0].files, ['src/templates/importedDesign/svg.ts']);
});

test('a shared covering spec collides with no file in common', () => {
  const coverage = (files) => ({ mode: 'subset', specs: files.some((f) => f.includes('auth')) ? ['auth.spec.ts'] : [] });
  const entries = [{ branch: 'claude/d', files: ['src/backend/auth.ts'] }];
  const verdict = collisions({ files: ['src/components/auth/authView.ts'] }, entries, coverage);
  assert.equal(verdict.clear, false);
  assert.deepEqual(verdict.hits[0].specs, ['auth.spec.ts']);
});

test('a full-coverage side is a caution, not a collision', () => {
  const coverage = (files) => ({ mode: files.some((f) => f.includes('core')) ? 'full' : 'subset', specs: [] });
  const entries = [{ branch: 'claude/e', files: ['src/unrelated.ts'] }];
  const verdict = collisions({ files: ['src/core-thing.ts'] }, entries, coverage);
  assert.equal(verdict.clear, true);
  assert.equal(verdict.cautions.length, 1);
});

test('a candidate never collides with its own branch', () => {
  const entries = [{ branch: 'claude/h', files: ['src/components/wizard/import/ImportDesignStep.tsx'] }];
  const verdict = collisions({ files: ['src/components/wizard/steps/'], branch: 'claude/h' }, entries, noSpecs);
  assert.equal(verdict.clear, true);
});
