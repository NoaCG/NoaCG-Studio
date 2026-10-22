// guards: src/control/liveData.ts, src/model/ownReaderHolds.ts, src/model/shows.ts, src/model/publishedRecord.ts, src/export/targets/spxStarter.ts, src/export/common.ts, src/blocks/animMigration.ts, scripts/fixtures/show-saved-before-c1a.json
//
// ONE WAY TO CONNECT A SHEET, AND THE OLD WAY STILL RUNS (sheet-data-flow AC-10, data-sources C6).
// New graphics are no longer offered the graphic-level Sheet block, but a graphic saved with one
// keeps reading its Sheet wherever it plays. "Plays" here is the template output: the SPX package
// an operator drops into their templates folder, built from the record an earlier build saved
// (scripts/fixtures/show-saved-before-c1a.json, Hairline). Its script still carries the block
// byte for byte, and that block, run against a CSV, still hands the graphic its values.
//
// The migration's two rules are pinned here too: when Connect data… must wait for the reader to
// stop (`ownReaderGate`), and where "Stop its own reader" removes it (`ownReaderRemoval`). So is
// the binding write itself (shows.ts `applyBindings`, bundled like the export): it refuses a
// graphic the Playout page holds back and one whose stop the production's record still carries.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import './lib/tsResolve.mjs';

const { hasLiveData, liveDataUrl, ownReaderGate, ownReaderRemoval, stripLiveData } = await import('../src/control/liveData.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { show } = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/show-saved-before-c1a.json'), 'utf8'));
const hairline = show.graphics.find((g) => g.name === 'Hairline');

const dir = mkdtempSync(path.join(tmpdir(), 'legacy-sheet-block-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** The SPX export, bundled once for node and imported from a file so its package imports resolve. */
let spxLoaded;
const spxTarget = () => (spxLoaded ??= loadSpxTarget());
async function loadSpxTarget() {
  const bundle = await rolldown({ input: path.join(root, 'src/export/targets/spxStarter.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'spx.mjs');
  writeFileSync(file, output[0].code);
  return (await import(pathToFileURL(file).href)).spxTarget;
}

/** The template script of the SPX package built from the fixture's Hairline. */
async function exportedScript() {
  const zip = await (await spxTarget()).build(hairline.template, {});
  return zip.file(/js\/template\.js$/)[0].async('string');
}

/** The block exactly as the record carries it. */
function blockOf(js) {
  const start = js.indexOf('/* == LIVE DATA');
  const endMark = '/* == END LIVE DATA == */';
  const end = js.indexOf(endMark);
  assert.ok(start >= 0 && end > start, 'the record carries a whole block');
  return js.slice(start, end + endMark.length);
}

/** Run a block with a fake network and timer; answers what it handed `update`. */
async function runBlock(block, csv) {
  const updates = [];
  const fetched = [];
  const context = {
    fetch: (url) => {
      fetched.push(url);
      return Promise.resolve({ text: () => Promise.resolve(csv) });
    },
    setInterval: () => 0,
    update: (json) => updates.push(JSON.parse(json)),
  };
  vm.runInNewContext(block, context);
  for (let i = 0; i < 5 && updates.length === 0; i++) await new Promise((resolve) => setImmediate(resolve));
  return { updates, fetched };
}

test('an existing graphic\'s Sheet block is in its exported template script, byte for byte', async () => {
  const js = await exportedScript();
  assert.ok(hasLiveData(js), 'the export kept the block');
  assert.ok(js.includes(blockOf(hairline.template.js)), 'the block is exported unchanged');
});

test('the exported block still reads its Sheet and emits the values to the graphic', async () => {
  const js = await exportedScript();
  const url = liveDataUrl(js);
  assert.ok(url, 'the block names its address');
  const { updates, fetched } = await runBlock(blockOf(js), 'Name,Title\n"Lee, Ann",Guest of the night\n');
  assert.deepEqual(fetched, [url]);
  assert.equal(updates.length, 1, 'one read, one update');
  assert.equal(updates[0].f0, 'Lee, Ann', 'the column under the field\'s title reaches the field');
});

test('stripping the block leaves the rest of the script exactly as it was', () => {
  const stripped = stripLiveData(hairline.template.js);
  assert.equal(hasLiveData(stripped), false);
  assert.equal(liveDataUrl(stripped), null);
  assert.ok(hairline.template.js.startsWith(stripped.trimEnd().slice(0, 200)), 'the graphic\'s own code is untouched');
});

test('Connect data… waits while the graphic\'s own reader can still run where it plays', () => {
  const reader = hairline.template.js;
  const plain = stripLiveData(reader);
  // The design it plays still reads: the migration comes first, published or not.
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: reader, published: false }), 'reader');
  assert.equal(ownReaderGate({ copyJs: reader, resolvedJs: reader, published: true }), 'reader');
  // Removed from the design, still in the copy: unpublished, the copy is removed too; published,
  // the copy IS what the output runs, so Connect waits for Publish.
  assert.equal(ownReaderGate({ copyJs: reader, resolvedJs: plain, published: false }), 'reader');
  assert.equal(ownReaderGate({ copyJs: reader, resolvedJs: plain, published: true }), 'publish');
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: true }), 'none');
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: false }), 'none');
  // Published, the copy is clean, but the payload the output took still reads (a Publish that
  // failed after refreshing the copy): Connect still waits for Publish.
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: true, outputReads: true }), 'publish');
  // Published and clean, but an output has not taken that version (an on-air frame waits for its
  // Out, a change failed to prepare): Connect waits.
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: true, outputBehind: true }), 'clear');
  // Unpublished, nothing runs outside this page.
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: false, outputReads: true, outputBehind: true }), 'none');
  // Stopped while published, in another browser: this one never saw the reader, its copy, design
  // and payload are clean and it has no history, but the production's record carries the stop
  // until positive evidence clears it, so Connect waits here too.
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: true, stopRecorded: true }), 'clear');
  assert.equal(ownReaderGate({ copyJs: plain, resolvedJs: plain, published: false, stopRecorded: true }), 'none');
});

test('"Stop its own reader" removes it from the design, and from the copy only before Publish', () => {
  assert.deepEqual(ownReaderRemoval({ library: true, published: false }), { library: true, copy: true });
  assert.deepEqual(ownReaderRemoval({ library: true, published: true }), { library: true, copy: false });
  assert.deepEqual(ownReaderRemoval({ library: false, published: false }), { library: false, copy: true });
  // Published with no library record, nothing could carry the removal to the output.
  assert.equal(ownReaderRemoval({ library: false, published: true }), null);
});

test('what the Playout page holds back reaches the other binding doors, per production, and clears (C6)', async () => {
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) };
  try {
    const { ownReaderHolds, setOwnReaderHolds } = await import('../src/model/ownReaderHolds.ts');
    assert.deepEqual([...ownReaderHolds('a')], []);
    setOwnReaderHolds('a', ['Score', 'Card']);
    assert.deepEqual([...ownReaderHolds('a')].sort(), ['Card', 'Score']);
    assert.deepEqual([...ownReaderHolds('b')], [], 'another production holds nothing');
    setOwnReaderHolds('a', []);
    assert.deepEqual([...ownReaderHolds('a')], []);
    assert.equal(stored.size, 0, 'an empty hold leaves no key behind');
    stored.set('spx-gfx-own-reader-holds:a', '{not json');
    assert.deepEqual([...ownReaderHolds('a')], [], 'an unreadable record holds nothing rather than throwing');
    // The reader history survives a reload, apart from the holds, and clears the same way.
    const { formerReaders, setFormerReaders } = await import('../src/model/ownReaderHolds.ts');
    setFormerReaders('a', new Set(['Card']));
    assert.deepEqual([...formerReaders('a')], ['Card']);
    assert.deepEqual([...ownReaderHolds('a')], [], 'history is not a hold');
    setFormerReaders('a', []);
    assert.deepEqual([...formerReaders('a')], []);
  } finally {
    globalThis.localStorage = previous;
  }
});

/** model/shows.ts, bundled for node (it imports `.txt` licence files) and imported from a file. */
async function loadShowsModule() {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'shows.mjs');
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

test('the binding write refuses a held graphic and a recorded stop, whichever browser binds (C6)', async () => {
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
    const shows = await loadShowsModule();
    const { publishedRecordDigest } = await import('../src/model/publishedRecord.ts');
    const plain = { ...hairline.template, js: stripLiveData(hairline.template.js) };
    const make = (name) => {
      const show = shows.createShowNamed(name);
      shows.addGraphicToShow(show.id, plain);
      shows.addGraphicToShow(show.id, { ...plain, name: 'Other' });
      shows.setShowHostedSlug(show.id, `${name}-slug`);
      return show.id;
    };
    const read = (id) => shows.loadShows().find((s) => s.id === id);
    const bind = (id, graphic) => {
      shows.setFieldBinding(id, graphic, 'f0', 'guest.name');
      return read(id).bindings?.[graphic]?.f0 ?? null;
    };

    // Held by this browser's Playout page (model/ownReaderHolds.ts): refused, the rest binds.
    const held = make('held');
    stored.set(`spx-gfx-own-reader-holds:${held}`, JSON.stringify(['Hairline']));
    assert.equal(bind(held, 'Hairline'), null, 'a held graphic takes no binding');
    assert.equal(bind(held, 'Other'), 'guest.name');
    shows.setFieldBindings(held, [{ graphic: 'Hairline', fieldId: 'f1', path: 'guest.title' }]);
    assert.equal(read(held).bindings?.Hairline, undefined, 'Bind all and Connect take the same refusal');

    // Stopped while published in another browser: nothing held here, the copy and design are
    // clean, and the production's record alone carries the stop. Refused until it clears.
    const synced = make('synced');
    assert.deepEqual(shows.setOwnReaderStops(synced, { add: ['Hairline'] }).error, null);
    assert.deepEqual(read(synced).ownReaderStops, ['Hairline']);
    assert.deepEqual([...shows.ownSheetGraphics(read(synced), [])], ['Hairline']);
    assert.equal(bind(synced, 'Hairline'), null, 'a recorded stop takes no binding');
    assert.equal(bind(synced, 'Other'), 'guest.name');
    const digest = publishedRecordDigest(read(synced));
    // Recording a stop is not a change to publish: it never reaches an output.
    shows.setOwnReaderStops(synced, { add: ['Other'] });
    assert.equal(publishedRecordDigest(read(synced)), digest);
    shows.setOwnReaderStops(synced, { clear: ['Hairline', 'Other'] });
    assert.equal(read(synced).ownReaderStops, undefined, 'cleared, the record carries nothing');
    assert.equal(bind(synced, 'Hairline'), 'guest.name', 'cleared on evidence, it binds');

    // Unpublished, no output runs, so a stale stop holds nothing.
    const quiet = make('quiet');
    shows.setOwnReaderStops(quiet, { add: ['Hairline'] });
    shows.setShowHostedSlug(quiet, undefined);
    assert.deepEqual(shows.publishedReaderStops(read(quiet)), []);
    assert.equal(read(quiet).ownReaderStops, undefined, 'unpublishing drops the stops: no output follows it again');
    assert.equal(bind(quiet, 'Hairline'), 'guest.name');

    // Publish records the stop itself, in every production whose copy loses its reader to the
    // refreshed design (the one where Stop was pressed or another sharing it), in the same write.
    const reader = { ...hairline.template };
    const design = { template: plain, updatedAt: '2999-01-01T00:00:00.000Z' };
    const shared = shows.createShowNamed('shared');
    shows.addGraphicToShow(shared.id, reader);
    shows.setShowHostedSlug(shared.id, 'shared-slug');
    assert.equal(shows.refreshGraphicCopies(shared.id, () => design).error, null);
    assert.deepEqual(read(shared.id).ownReaderStops, ['Hairline']);
    assert.equal(bind(shared.id, 'Hairline'), null, 'held whichever browser binds');
    // Before the first Publish no output runs it: nothing to record.
    const fresh = shows.createShowNamed('fresh');
    shows.addGraphicToShow(fresh.id, reader);
    shows.refreshGraphicCopies(fresh.id, () => design);
    assert.equal(read(fresh.id).ownReaderStops, undefined);
  } finally {
    globalThis.localStorage = previous;
  }
});
