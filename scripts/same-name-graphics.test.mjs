// guards: src/model/poolIdentity.ts, src/model/shows.ts, src/model/teamShowMerge.ts, src/control/hostedControl.ts, src/model/library.ts, src/model/templateSet.ts
//
// SAME-NAMED GRAPHICS NEVER REPLACE EACH OTHER (issue #779). Default names make two team members'
// "Lower third" the normal case. A production's pool used to match an added graphic by name alone,
// so the second member's graphic silently replaced the first. The library link now decides first:
// a different library graphic under a taken name joins the pool under a free name, both stay, and
// both reach the output, whose wire key stays the pool name (unique, as before). And the doors that
// mint a library graphic (Duplicate, a kit or pack save; Save As is e2e/library.spec.ts) take a free
// name, so they never make a same-named twin.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import './lib/tsResolve.mjs';

const { poolPlacement } = await import('../src/model/poolIdentity.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const template = (name, html) => ({
  name,
  type: 'lower-third',
  html,
  css: '',
  js: '',
  assets: [],
  fields: [],
  resolution: { width: 1920, height: 1080 },
  fps: 50,
});

test('a different library graphic under a taken name is added under a free name, never a replacement', () => {
  const pool = [{ name: 'Lower third', type: 'lower-third', graphicId: 'anna' }];
  assert.deepEqual(poolPlacement(pool, { name: 'Lower third', type: 'lower-third', graphicId: 'ben' }), { replace: -1, name: 'Lower third 2', rename: null });
  // The same library graphic again replaces its own copy, under the name it has in the pool.
  const both = [...pool, { name: 'Lower third 2', type: 'lower-third', graphicId: 'ben' }];
  assert.deepEqual(poolPlacement(both, { name: 'Lower third', type: 'lower-third', graphicId: 'ben' }), { replace: 1, name: 'Lower third 2', rename: null });
  assert.deepEqual(poolPlacement(both, { name: 'Lower third', type: 'lower-third', graphicId: 'anna' }), { replace: 0, name: 'Lower third', rename: null });
  // A copy with no link to tell it apart is still replaced by name, as before.
  assert.equal(poolPlacement([{ name: 'Lower third', type: 'lower-third' }], { name: 'Lower third', type: 'lower-third', graphicId: 'ben' }).replace, 0);
  assert.equal(poolPlacement(pool, { name: 'Lower third', type: 'lower-third' }).replace, 0);
});

test('two members who each add a "Lower third" from the same base both keep it, under two names', () => {
  const base = { id: 'show', name: 'Show', graphics: [], updatedAt: '2026-11-04T00:00:00.000Z' };
  const lt = (id, graphicId) => ({ id, name: 'Lower third', graphicId, layer: 20, template: template('Lower third', `<p>${graphicId}</p>`) });
  const theirs = { ...base, graphics: [lt('anna-copy', 'anna')], bindings: { 'Lower third': { f0: 'anna.name' } } };
  const ours = { ...base, graphics: [lt('ben-copy', 'ben')], bindings: { 'Lower third': { f0: 'ben.name' } } };
  const { doc } = mergeTeamShow(base, ours, theirs, '2026-11-05T00:00:00.000Z');
  assert.deepEqual(doc.graphics.map((g) => [g.id, g.name, g.template.name, g.layer]), [
    ['anna-copy', 'Lower third', 'Lower third', 20],
    ['ben-copy', 'Lower third 2', 'Lower third 2', 21],
  ]);
  // Ours' binding moves with its graphic and never lands on theirs. Both sides changed the bindings,
  // so theirs stands, as for any field both changed, and the loss is reported.
  const { doc: onlyOurs } = mergeTeamShow(base, ours, { ...theirs, bindings: undefined }, '2026-11-05T00:00:00.000Z');
  assert.deepEqual(onlyOurs.bindings, { 'Lower third 2': { f0: 'ben.name' } });
  const { doc: both, lost } = mergeTeamShow(base, ours, theirs, '2026-11-05T00:00:00.000Z');
  assert.deepEqual(both.bindings, { 'Lower third': { f0: 'anna.name' } });
  assert.ok(lost.includes('the field bindings'));
});

const dir = mkdtempSync(path.join(tmpdir(), 'same-name-graphics-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** The shows store and the output builder, bundled for Node over an in-memory localStorage. */
async function withStore(run) {
  const entry = path.join(dir, 'entry.ts');
  writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/model/shows.ts'))};\nexport { buildOutputPayload, buildPanelSpec } from ${JSON.stringify(path.join(root, 'src/control/hostedControl.ts'))};\n` +
    `export { createGraphic, duplicateGraphic, loadGraphics } from ${JSON.stringify(path.join(root, 'src/model/library.ts'))};\n` +
    `export { saveTemplateSetToProduction } from ${JSON.stringify(path.join(root, 'src/model/templateSet.ts'))};\n`);
  const bundle = await rolldown({ input: entry, platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, `store-${Date.now()}.mjs`);
  writeFileSync(file, output[0].code);
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
    key: (i) => [...stored.keys()][i] ?? null,
    get length() {
      return stored.size;
    },
  };
  try {
    return await run(await import(pathToFileURL(file).href));
  } finally {
    globalThis.localStorage = previous;
  }
}

test('two members’ same-named graphics both stay in the production and both reach the output', async () => {
  await withStore(async (store) => {
    const show = store.createShowNamed('Team show');
    assert.equal(store.addGraphicToShow(show.id, template('Lower third', '<p>anna</p>'), { graphicId: 'anna' }).error, null);
    assert.equal(store.addGraphicToShow(show.id, template('Lower third', '<p>ben</p>'), { graphicId: 'ben' }).error, null);
    // Anna edits hers and adds it again: her own copy is replaced, Ben's stays.
    const { shows } = store.addGraphicToShow(show.id, template('Lower third', '<p>anna v2</p>'), { graphicId: 'anna' });
    const saved = shows.find((s) => s.id === show.id);
    assert.deepEqual(saved.graphics.map((g) => [g.name, g.graphicId, g.template.html]), [
      ['Lower third', 'anna', '<p>anna v2</p>'],
      ['Lower third 2', 'ben', '<p>ben</p>'],
    ]);
    assert.equal(new Set(saved.graphics.map((g) => g.layer)).size, 2, 'two layers, so neither replaces the other on air');
    const payload = await store.buildOutputPayload(saved, []);
    assert.deepEqual(payload.graphics.map((g) => [g.key, g.html]), [
      ['Lower third', '<p>anna v2</p>'],
      ['Lower third 2', '<p>ben</p>'],
    ]);
    // Each graphic's seeded cue reaches the output, addressed to its own graphic.
    assert.deepEqual(payload.cues.map((c) => c.graphic), ['Lower third', 'Lower third 2']);
    assert.deepEqual(store.buildPanelSpec(saved, []).map((g) => g.name), ['Lower third', 'Lower third 2']);
  });
});

test('Duplicate and a kit saved twice take free names, so the library never holds same-named twins', async () => {
  await withStore(async (store) => {
    const { doc } = store.createGraphic(template('Lower third', '<p>a</p>'), { name: 'Lower third' });
    assert.equal(store.duplicateGraphic(doc.id).doc.name, 'Lower third copy');
    assert.equal(store.duplicateGraphic(doc.id).doc.name, 'Lower third copy 2');
    const kit = [template('Lower third', '<p>kit</p>'), template('Name strap', '<p>kit</p>')];
    const first = await store.saveTemplateSetToProduction(kit, 'Kit', { kind: 'new', name: 'Kit one' });
    const second = await store.saveTemplateSetToProduction(kit, 'Kit', { kind: 'new', name: 'Kit two' });
    assert.deepEqual(store.loadGraphics().map((g) => g.name).sort(), [
      'Lower third', 'Lower third 2', 'Lower third 3', 'Lower third copy', 'Lower third copy 2', 'Name strap', 'Name strap 2',
    ]);
    // Each production pools its kit under the names the kit gives them, linked to its own records.
    const pooled = (id) => store.loadShows().find((s) => s.id === id).graphics;
    assert.deepEqual(pooled(first.id).map((g) => g.name), ['Lower third', 'Name strap']);
    assert.deepEqual(pooled(second.id).map((g) => g.name), ['Lower third', 'Name strap']);
    const record = (id) => store.loadGraphics().find((g) => g.id === id).name;
    assert.deepEqual(pooled(second.id).map((g) => record(g.graphicId)), ['Lower third 3', 'Name strap 2']);
  });
});

test('a teammate’s republish keeps the author’s saved entries; the author’s own publish writes them', async () => {
  await withStore(async (store) => {
    const show = store.createShowNamed('Team show');
    const { shows } = store.addGraphicToShow(show.id, template('Lower third', '<p>anna</p>'), { graphicId: 'anna' });
    const saved = shows.find((s) => s.id === show.id);
    const published = [{ name: 'Lower third', fields: [], js: '', images: [], entries: [{ id: 'e1', label: 'Mayor', values: { f0: 'Mayor' } }], dataRows: [] }];
    // Ben's library does not hold Anna's record: her entries stay as published.
    assert.deepEqual(store.buildPanelSpec(saved, [], published)[0].entries.map((e) => e.label), ['Mayor']);
    // Anna's does, and what it holds now is what goes out, an emptied list included.
    const anna = { ...store.createGraphic(template('Lower third', '<p>anna</p>'), { name: 'Lower third', id: 'anna', entries: [{ id: 'e2', label: 'Chair', values: {} }] }).doc };
    assert.deepEqual(store.buildPanelSpec(saved, [anna], published)[0].entries.map((e) => e.label), ['Chair']);
    assert.deepEqual(store.buildPanelSpec(saved, [{ ...anna, entries: [] }], published)[0].entries, []);
  });
});
