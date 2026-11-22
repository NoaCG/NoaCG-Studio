// guards: e2e/fixtures/illustrator-exports/**, docs/tutorials/template-library/library.json, docs/tutorials/template-library/SVG/**
//
// The archived Illustrator exports (e2e/fixtures/illustrator-exports/README.md): the importer's
// only real Illustrator 30 output, kept whole whatever happens to the download folders.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { measured } from './measured.mjs';

const ARCHIVE = new URL('../e2e/fixtures/illustrator-exports/', import.meta.url);
const LIBRARY = new URL('../docs/tutorials/template-library/', import.meta.url);
const archived = readdirSync(ARCHIVE).filter((file) => file.endsWith('.svg')).sort();
const read = (base, file) => readFileSync(new URL(file, base), 'utf8');

test('every archived file is an Illustrator export, and the look-wrapped lines are among them', () => {
  measured(archived.length, 'archived Illustrator exports');
  for (const file of archived) assert.match(read(ARCHIVE, file), /Generator: Adobe Illustrator/, file);
  // An outer tspan carrying only a look around an inner one carrying only a position.
  assert.ok(archived.some((file) => /<text\b[^>]*>\s*<tspan class="[^"]+"><tspan x="[^"]*" y="[^"]*">/.test(read(ARCHIVE, file))), 'a look-wrapped line survives');
});

test('while the library lists an Illustrator export, the archive holds the same bytes', () => {
  const inventory = new URL('library.json', LIBRARY);
  if (!existsSync(inventory)) return;
  // The archive keeps the names the exports had in the examples set; library.json's `formerly`
  // says which one each template was (four gained -navy when the sets merged).
  const native = JSON.parse(readFileSync(inventory, 'utf8')).filter((entry) => entry.style === 'navy' && (entry.source ?? 'illustrator') === 'illustrator');
  assert.ok(native.length > 0, 'the library lists the navy Illustrator exports');
  for (const { slug, formerly } of native) {
    const archivedAs = `${(formerly ?? []).find((old) => old.startsWith('examples/'))?.slice('examples/'.length) ?? slug}.svg`;
    const download = new URL(`SVG/${slug}.svg`, LIBRARY);
    assert.ok(archived.includes(archivedAs), `${archivedAs} is archived`);
    if (existsSync(download) && /Generator: Adobe Illustrator/.test(readFileSync(download, 'utf8'))) {
      assert.equal(read(ARCHIVE, archivedAs), readFileSync(download, 'utf8'), `${slug}.svg matches its archived export`);
    }
  }
});
