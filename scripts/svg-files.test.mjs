// The SVG templates page lists every inventoried graphic with its preview and its own SVG, and the
// public copies it links are byte-identical to the sources.
// guards: scripts/svg-files.mjs, svg-templates.html, public/downloads/svg/**, docs/tutorials/svg-templates/**, docs/tutorials/svg-examples/**
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SVG_GALLERY_MARKER, SVG_SETS, checkSvgFiles, fileUrl, readInventory, renderSvgGallery } from './svg-files.mjs';

test('the public copies match both inventories exactly', () => {
  assert.deepEqual(checkSvgFiles(), [], 'run node scripts/svg-files.mjs --write');
});

test('the gallery shows every graphic once, with its preview and its SVG', () => {
  const html = renderSvgGallery();
  for (const set of SVG_SETS) {
    assert.match(html, new RegExp(`id="${set.id}"`));
    assert.ok(html.includes(`href="${set.zip}"`), `${set.id} offers its zip`);
    for (const entry of readInventory(set)) {
      assert.equal(html.split(`href="${fileUrl(set, entry.slug, 'svg')}" download`).length, 2, `${set.id}/${entry.slug} SVG once`);
      assert.ok(html.includes(`src="${fileUrl(set, entry.slug, 'png')}"`), `${set.id}/${entry.slug} preview`);
    }
  }
});

test('the page holds the gallery marker', () => {
  assert.ok(readFileSync(new URL('../svg-templates.html', import.meta.url), 'utf8').includes(SVG_GALLERY_MARKER));
});
