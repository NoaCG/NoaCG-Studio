// guards: src/model/library.ts, src/model/shows.ts, src/control/hostedControl.ts, src/control/copyAdoption.ts, src/control/payloadVersion.ts
//
// THE PRODUCTION'S COPY IS THE ONLY TRUTH (live-publishing W2, docs/work-specs/live-publishing/
// designs/G1.md, rules R1, R2, R3, R10). What plays, publishes and exports is the copy: a library
// edit, a broken record or a deleted one changes nothing. A newer library design comes in only
// through Update, which keeps everything but the design and names a dropped field first. Adoption
// keeps what is published now and gives a never-published production the library's current design.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import './lib/tsResolve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'production-copies-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const template = (name, html, fields = [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }]) => ({
  name, type: 'lower-third', html, css: '', js: '', assets: [], fields, resolution: { width: 1920, height: 1080 }, fps: 50,
});

/** The stores and the builders, bundled for Node over an in-memory localStorage. */
async function withStore(run) {
  const entry = path.join(dir, 'entry.ts');
  writeFileSync(entry, [
    `export * from ${JSON.stringify(path.join(root, 'src/model/shows.ts'))};`,
    `export { buildOutputPayload, buildPanelSpec, copyDigest } from ${JSON.stringify(path.join(root, 'src/control/hostedControl.ts'))};`,
    `export { createGraphic, updateGraphic, loadGraphics, newerLibraryDesign, templateForSavedGraphic } from ${JSON.stringify(path.join(root, 'src/model/library.ts'))};`,
    `export { adoptionPlan } from ${JSON.stringify(path.join(root, 'src/control/copyAdoption.ts'))};`,
    `export { stampPayload } from ${JSON.stringify(path.join(root, 'src/control/payloadVersion.ts'))};`,
    `export { productionGateFailures } from ${JSON.stringify(path.join(root, 'src/validation/productionGate.ts'))};`,
  ].join('\n'));
  const bundle = await rolldown({ input: entry, platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, `store-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(file, output[0].code);
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
    key: (i) => [...stored.keys()][i] ?? null,
    get length() { return stored.size; },
  };
  try {
    return await run(await import(pathToFileURL(file).href));
  } finally {
    globalThis.localStorage = previous;
  }
}

const read = (store, id) => store.loadShows().find((s) => s.id === id);

test('a library edit, a broken record and a deleted one change nothing a publish builds (R1)', async () => {
  await withStore(async (store) => {
    const { doc } = store.createGraphic(template('Strap', '<p>v1</p>'), { name: 'Strap' });
    const show = store.createShowNamed('P');
    assert.equal(store.addGraphicToShow(show.id, doc.template, { graphicId: doc.id }).error, null);
    const record = read(store, show.id);
    const before = JSON.stringify(await store.buildOutputPayload(record, []));
    store.updateGraphic(doc.id, { template: template('Strap', '<p>v2 in the library</p>') });
    const edited = store.loadGraphics();
    assert.equal(JSON.stringify(await store.buildOutputPayload(record, edited)), before, 'the payload is the copy');
    assert.equal(store.templateForSavedGraphic(record.graphics[0], edited).html, '<p>v1</p>');
    assert.equal(store.buildPanelSpec(record, edited)[0].template?.html ?? '<p>v1</p>', '<p>v1</p>');
    // A broken record changes nothing either: the gate judges the copy, as it does with no library.
    const gateOnCopy = JSON.stringify(store.productionGateFailures(record.graphics, []));
    store.updateGraphic(doc.id, { template: { ...template('Strap', '<p>'), js: 'this is not javascript (' } });
    assert.equal(JSON.stringify(store.productionGateFailures(record.graphics, store.loadGraphics())), gateOnCopy);
    assert.equal(JSON.stringify(await store.buildOutputPayload(record, store.loadGraphics())), before);
  });
});

test('the newer library design shows, and Update takes it keeping everything else (R2, R3)', async () => {
  await withStore(async (store) => {
    const { doc } = store.createGraphic(template('Strap', '<p>v1</p>'), { name: 'Strap' });
    const show = store.createShowNamed('P');
    store.addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    let record = read(store, show.id);
    const pooled = record.graphics[0];
    assert.equal(pooled.designAt, pooled.savedAt, 'an add stamps the copy');
    store.setShowGraphicLayer(show.id, pooled.id, 33);
    store.setGraphicAdjust(show.id, pooled.id, { x: 10 });
    const cueId = record.cues[0].id;
    store.updateShowCue(show.id, cueId, { values: { f0: 'Ada' } });
    record = read(store, show.id);
    assert.equal(store.newerLibraryDesign(record.graphics[0], store.loadGraphics()), undefined, 'no newer design yet');

    const later = template('Strap', '<p>v2</p>');
    store.updateGraphic(doc.id, { template: later });
    const newer = store.newerLibraryDesign(record.graphics[0], store.loadGraphics());
    assert.ok(newer, 'Newer design in library');
    assert.deepEqual(store.droppedFields(record, record.graphics[0], newer.template), []);
    assert.equal(store.updateCopyFromLibrary(show.id, pooled.id, newer, 'not what was read').error, 'The graphic changed elsewhere. Look again before you update.');
    assert.equal(store.updateCopyFromLibrary(show.id, pooled.id, newer, record.graphics[0].savedAt).error, null);
    const after = read(store, show.id);
    const g = after.graphics[0];
    assert.equal(g.template.html, '<p>v2</p>');
    assert.equal(g.id, pooled.id);
    assert.equal(g.name, 'Strap');
    assert.equal(g.template.name, 'Strap');
    assert.equal(g.layer, 33);
    assert.equal(g.adjust?.x, 10);
    assert.equal(g.graphicId, doc.id);
    assert.equal(g.savedAt, newer.updatedAt);
    assert.equal(g.designAt, g.savedAt, 'Update stamps');
    assert.deepEqual(after.cues, record.cues, 'no cue is touched');
    assert.equal(store.newerLibraryDesign(g, store.loadGraphics()), undefined);
  });
});

test('a design that drops a field a cue uses is named first (R2)', async () => {
  await withStore(async (store) => {
    const two = [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }, { field: 'f1', ftype: 'textfield', title: 'Role', value: '' }];
    const { doc } = store.createGraphic(template('Strap', '<p>v1</p>', two), { name: 'Strap' });
    const show = store.createShowNamed('P');
    store.addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    const record = read(store, show.id);
    store.updateShowCue(show.id, record.cues[0].id, { values: { f0: 'Ada', f1: 'Host' } });
    const onlyName = template('Strap', '<p>v2</p>', [two[0]]);
    assert.deepEqual(store.droppedFields(read(store, show.id), record.graphics[0], onlyName), ['Role']);
    // A field nobody uses is no question.
    store.updateShowCue(show.id, record.cues[0].id, { values: { f0: 'Ada', f1: '' } });
    assert.deepEqual(store.droppedFields(read(store, show.id), record.graphics[0], onlyName), []);
    // Adding again replaces as it always has, and stamps.
    assert.equal(store.addGraphicToShow(show.id, onlyName, { graphicId: doc.id }).error, null);
    const g = read(store, show.id).graphics[0];
    assert.equal(g.template.html, '<p>v2</p>');
    assert.equal(g.designAt, g.savedAt);
  });
});

test('adoption keeps what is published now, matched by the digest a publish writes (R10)', async () => {
  await withStore(async (store) => {
    const { doc } = store.createGraphic(template('Strap', '<p>on air</p>'), { name: 'Strap' });
    const show = store.createShowNamed('P');
    store.addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    // A record written before copy truth: the copy carries no stamp.
    const legacy = { ...read(store, show.id), hostedSlug: 'abc' };
    legacy.graphics = legacy.graphics.map((g) => { const plain = { ...g }; delete plain.designAt; return plain; });
    const payload = await store.buildOutputPayload(legacy, []);
    const stamp = await store.stampPayload(payload, null, undefined, { Strap: legacy.graphics[0].savedAt });
    assert.equal(await store.copyDigest(legacy, 0, legacy.graphics[0].template), stamp.g.Strap, 'adoption digests as a publish does');

    // The library moved on since: a published production never takes it at adoption.
    store.updateGraphic(doc.id, { template: template('Strap', '<p>library later</p>') });
    const plan = await store.adoptionPlan(legacy, store.loadGraphics(), stamp, store.copyDigest);
    assert.equal(plan[legacy.graphics[0].id].template.html, '<p>on air</p>');

    // The copy lags what is on air (a team save failed after an old publish) and the library holds
    // the published design: adoption takes the library's, timed at least at the stamp's time.
    const lagging = { ...legacy, graphics: [{ ...legacy.graphics[0], template: template('Strap', '<p>older copy</p>'), savedAt: '2026-01-01T00:00:00.000Z' }] };
    store.updateGraphic(doc.id, { template: template('Strap', '<p>on air</p>') });
    const library = store.loadGraphics();
    const onAirStamp = await store.stampPayload(await store.buildOutputPayload({ ...lagging, graphics: [{ ...lagging.graphics[0], template: template('Strap', '<p>on air</p>') }] }, []), null, undefined, { Strap: library[0].updatedAt });
    const caught = await store.adoptionPlan(lagging, library, onAirStamp, store.copyDigest);
    assert.equal(caught[lagging.graphics[0].id].template.html, '<p>on air</p>');
    assert.equal(caught[lagging.graphics[0].id].savedAt, library[0].updatedAt);

    // Nothing matches, or the stamp cannot be read: the copy, with its own time.
    const none = await store.adoptionPlan(lagging, [], onAirStamp, store.copyDigest);
    assert.equal(none[lagging.graphics[0].id].template.html, '<p>older copy</p>');
    const unread = await store.adoptionPlan(lagging, library, null, store.copyDigest);
    assert.equal(unread[lagging.graphics[0].id].template.html, '<p>older copy</p>');
    // A graphic renamed since the publish is not named in the stamp: the copy.
    const renamed = { ...legacy, graphics: [{ ...legacy.graphics[0], name: 'Strap 2', template: { ...legacy.graphics[0].template, name: 'Strap 2' } }] };
    assert.equal((await store.adoptionPlan(renamed, library, stamp, store.copyDigest))[legacy.graphics[0].id].template.html, '<p>on air</p>');
  });
});

test('a never-published production takes the library\'s current design once, and adoption stamps (R10)', async () => {
  await withStore(async (store) => {
    const { doc } = store.createGraphic(template('Strap', '<p>v1</p>'), { name: 'Strap' });
    const show = store.createShowNamed('P');
    store.addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    // Unstamp it, as a record from before copy truth.
    const legacy = read(store, show.id);
    const plain = { ...legacy.graphics[0] };
    delete plain.designAt;
    store.upsertShows([{ ...legacy, graphics: [plain] }]);
    store.updateGraphic(doc.id, { template: template('Strap', '<p>v2</p>') });
    const current = read(store, show.id);
    const plan = await store.adoptionPlan(current, store.loadGraphics(), null, store.copyDigest);
    assert.equal(plan[plain.id].template.html, '<p>v2</p>');
    // The write: only a copy still unstamped and still at the time the plan read.
    assert.equal(store.adoptShowCopies(show.id, plan, { [plain.id]: 'another time' }).error, null);
    assert.equal(read(store, show.id).graphics[0].template.html, '<p>v1</p>', 'a copy that moved is left alone');
    store.adoptShowCopies(show.id, plan, { [plain.id]: plain.savedAt });
    const adopted = read(store, show.id).graphics[0];
    assert.equal(adopted.template.html, '<p>v2</p>');
    assert.equal(adopted.designAt, adopted.savedAt, 'stamped, so adoption never runs for it again');
    assert.deepEqual(await store.adoptionPlan(read(store, show.id), store.loadGraphics(), null, store.copyDigest), {});
  });
});
