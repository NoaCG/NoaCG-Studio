// guards: src/control/liveData.ts, src/export/targets/spxStarter.ts, src/export/common.ts, src/blocks/animMigration.ts, scripts/fixtures/show-saved-before-c1a.json
//
// ONE WAY TO CONNECT A SHEET, AND THE OLD WAY STILL RUNS (sheet-data-flow AC-10, data-sources C6).
// New graphics are no longer offered the graphic-level Sheet block, but a graphic saved with one
// keeps reading its Sheet wherever it plays. "Plays" here is the template output: the SPX package
// an operator drops into their templates folder, built from the record an earlier build saved
// (scripts/fixtures/show-saved-before-c1a.json, Hairline). Its script still carries the block
// byte for byte, and that block, run against a CSV, still hands the graphic its values.
//
// The migration's two rules are pinned here too: when Connect data… must wait for the reader to
// stop (`ownReaderGate`), and where "Stop its own reader" removes it (`ownReaderRemoval`).

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
  const spx = await spxTarget();
  const zip = await spx.build(hairline.template, {});
  const js = await zip.file(/js\/template\.js$/)[0].async('string');
  assert.ok(hasLiveData(js), 'the export kept the block');
  assert.ok(js.includes(blockOf(hairline.template.js)), 'the block is exported unchanged');
});

test('the exported block still reads its Sheet and emits the values to the graphic', async () => {
  const spx = await spxTarget();
  const zip = await spx.build(hairline.template, {});
  const js = await zip.file(/js\/template\.js$/)[0].async('string');
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
});

test('"Stop its own reader" removes it from the design, and from the copy only before Publish', () => {
  assert.deepEqual(ownReaderRemoval({ library: true, published: false }), { library: true, copy: true });
  assert.deepEqual(ownReaderRemoval({ library: true, published: true }), { library: true, copy: false });
  assert.deepEqual(ownReaderRemoval({ library: false, published: false }), { library: false, copy: true });
  // Published with no library record, nothing could carry the removal to the output.
  assert.equal(ownReaderRemoval({ library: false, published: true }), null);
});
