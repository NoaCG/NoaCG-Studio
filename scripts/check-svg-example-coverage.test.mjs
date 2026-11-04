// guards: docs/tutorials/svg-examples/**, public/docs/examples/svg-examples/**, src/templates/behaviours/**
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCoverage, checkSource, registeredRecipes } from './check-svg-example-coverage.mjs';

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

test('editable SVG sources keep live named text and cannot masquerade as Illustrator exports', () => {
  const source = readFileSync(new URL('../docs/tutorials/svg-examples/SVG/digital-clock.svg', import.meta.url), 'utf8');
  const entry = { slug: 'digital-clock', source: 'svg' };
  assert.doesNotThrow(() => checkSource(source, entry));
  assert.throws(() => checkSource(source.replace('<title>Digital clock and timer</title>', ''), entry), /source has a title/);
  assert.throws(() => checkSource(source.replace(/<text\b[\s\S]*?<\/text>/, ''), entry), /editable live text/);
  assert.throws(() => checkSource(source.replace('inkscape:label="Text"', 'inkscape:label="Unknown"'), entry), /layer names/);
  assert.throws(() => checkSource(source.replace('<desc>', '<!-- Generator: Adobe Illustrator --><desc>'), entry), /must not claim/);
  assert.throws(() => checkSource(source, { ...entry, source: 'pdf' }), /unknown editable source/);
  assert.throws(() => checkSource(source.replace('</svg>', ''), entry), /never closed/);
});

test('legacy Illustrator sources still need their original export and actual PDF-compatible source', () => {
  const folder = fileURLToPath(new URL('../docs/tutorials/svg-examples/', import.meta.url));
  const source = readFileSync(new URL('../docs/tutorials/svg-examples/SVG/title.svg', import.meta.url), 'utf8');
  assert.doesNotThrow(() => checkSource(source, { slug: 'title' }, folder));
  assert.throws(() => checkSource(source.replace('Generator: Adobe Illustrator', 'Another editor'), { slug: 'title' }, folder), /export from the editable source/);
  assert.throws(() => checkSource(source, { slug: 'missing' }, folder), /ENOENT/);
});
