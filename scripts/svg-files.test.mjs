// The SVG templates page lists every inventoried graphic with its preview and its own SVG, and the
// public copies it links are byte-identical to the sources.
// guards: scripts/svg-files.mjs, svg-templates.html, public/downloads/svg/**, docs/tutorials/svg-templates/**, docs/tutorials/svg-examples/**
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SVG_GALLERY_MARKER, SVG_PACKAGES, SVG_SETS, checkSvgFiles, fileUrl, readInventory, renderSvgGallery } from './svg-files.mjs';

test('the public copies match both inventories exactly', () => {
  assert.deepEqual(checkSvgFiles(), [], 'run node scripts/svg-files.mjs --write');
});

test('the gallery shows every graphic once, with its preview and its SVG', () => {
  const html = renderSvgGallery();
  for (const set of SVG_SETS) {
    assert.match(html, new RegExp(`id="${set.id}"`));
    assert.ok(html.includes(`href="${set.zip}"`), `${set.id} offers its zip`);
    for (const entry of readInventory(set)) {
      // Once in its set, and once more in each package that lists it.
      const packages = SVG_PACKAGES.filter((p) => p.set === set.id && (entry.packages ?? []).includes(p.id)).length;
      assert.equal(html.split(`href="${fileUrl(set, entry.slug, 'svg')}" download`).length, 2 + packages, `${set.id}/${entry.slug} SVG once per section`);
      assert.ok(html.includes(`src="${fileUrl(set, entry.slug, 'png')}"`), `${set.id}/${entry.slug} preview`);
    }
  }
});

test('the page holds the gallery marker', () => {
  assert.ok(readFileSync(new URL('../svg-templates.html', import.meta.url), 'utf8').includes(SVG_GALLERY_MARKER));
});

test('a package shows each of its templates with the default preview and every named state, all with alt text', () => {
  const html = renderSvgGallery();
  for (const pkg of SVG_PACKAGES) {
    const set = SVG_SETS.find((s) => s.id === pkg.set);
    const section = html.slice(html.indexOf(`id="${pkg.id}"`), html.indexOf('</section>', html.indexOf(`id="${pkg.id}"`)));
    const entries = readInventory(set).filter((e) => (e.packages ?? []).includes(pkg.id));
    assert.ok(entries.length > 0, `${pkg.id} lists templates`);
    for (const entry of entries) {
      assert.ok(entry.alt && entry.alt.length > 20, `${entry.slug} describes its default preview`);
      assert.ok(section.includes(`alt="${entry.alt.replace(/'/g, '&#39;')}"`) || section.includes(`src="${fileUrl(set, entry.slug, 'png')}" alt="`), `${entry.slug} default preview with alt`);
      for (const state of entry.states ?? []) {
        assert.ok(state.name && state.alt && state.alt.length > 20, `${entry.slug}/${state.preview} is named and described`);
        assert.ok(section.includes(`src="${fileUrl(set, state.preview, 'png')}" alt="`), `${entry.slug}/${state.preview} shown`);
      }
    }
    assert.doesNotMatch(section, /alt=""/, `${pkg.id}: no preview without alt text`);
  }
});
