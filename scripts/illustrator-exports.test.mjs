// guards: e2e/fixtures/illustrator-exports/**, docs/tutorials/svg-examples/examples.json, docs/tutorials/svg-examples/SVG/**
//
// The archived Illustrator exports (e2e/fixtures/illustrator-exports/README.md): the importer's
// only real Illustrator 30 output, kept whole whatever happens to the download folders.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { measured } from './measured.mjs';

const ARCHIVE = new URL('../e2e/fixtures/illustrator-exports/', import.meta.url);
const EXAMPLES = new URL('../docs/tutorials/svg-examples/', import.meta.url);
const archived = readdirSync(ARCHIVE).filter((file) => file.endsWith('.svg')).sort();
const read = (base, file) => readFileSync(new URL(file, base), 'utf8');

test('every archived file is an Illustrator export, and the look-wrapped lines are among them', () => {
  measured(archived.length, 'archived Illustrator exports');
  for (const file of archived) assert.match(read(ARCHIVE, file), /Generator: Adobe Illustrator/, file);
  // An outer tspan carrying only a look around an inner one carrying only a position.
  assert.ok(archived.some((file) => /<text\b[^>]*>\s*<tspan class="[^"]+"><tspan x="[^"]*" y="[^"]*">/.test(read(ARCHIVE, file))), 'a look-wrapped line survives');
});

test('while the examples list an Illustrator export, the archive holds the same bytes', () => {
  const inventory = new URL('examples.json', EXAMPLES);
  if (!existsSync(inventory)) return;
  const native = JSON.parse(readFileSync(inventory, 'utf8')).filter((entry) => (entry.source ?? 'illustrator') === 'illustrator');
  for (const { slug } of native) {
    const download = new URL(`SVG/${slug}.svg`, EXAMPLES);
    assert.ok(archived.includes(`${slug}.svg`), `${slug}.svg is archived`);
    if (existsSync(download) && /Generator: Adobe Illustrator/.test(readFileSync(download, 'utf8'))) {
      assert.equal(read(ARCHIVE, `${slug}.svg`), readFileSync(download, 'utf8'), `${slug}.svg matches its download`);
    }
  }
});
