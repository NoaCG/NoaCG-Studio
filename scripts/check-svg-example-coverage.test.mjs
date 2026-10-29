// guards: docs/tutorials/svg-examples/**, public/docs/examples/svg-examples/**, src/templates/behaviours/**
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCoverage, registeredRecipes } from './check-svg-example-coverage.mjs';

const examples = JSON.parse(readFileSync(new URL('../docs/tutorials/svg-examples/examples.json', import.meta.url), 'utf8'));
test('the downloadable inventory covers every registered import behavior with its actual assets', () => {
  assert.deepEqual(checkCoverage(), { examples: examples.length, behaviors: registeredRecipes().length });
});
test('dropping an advertised behavior fails even when all remaining files are valid', () => {
  assert.throws(() => checkCoverage(undefined, examples.filter((entry) => entry.recipe !== 'credits')), /credits needs an example/);
});
test('an unsupported behavior or repeated filename cannot silently enter the download inventory', () => {
  assert.throws(() => checkCoverage(undefined, [...examples, { slug: 'other', recipe: 'unsupported' }]), /unsupported behavior/);
  assert.throws(() => checkCoverage(undefined, [...examples, examples[0]]), /filenames are unique/);
});
