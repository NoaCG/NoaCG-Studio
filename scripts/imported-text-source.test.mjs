// needs: browser
// guards: src/control/contentFormats.ts
// guards: src/control/sheetSource.ts
//
// IMPORTED TEXT FIELDS FOLLOW A SHEET THROUGH THE EXISTING ADAPTERS (jev-svg-import row 17,
// AC-14, text and ticker half).
//
// An imported design's text layers are ordinary fields with their own ids (`fN` in drawing order),
// so they follow a Sheet as keyed values: the data template's `Field ID,Label,Value` rows or
// Name/Value rows. A ticker drawn in SVG has no ticker engine (moving SVG is out of scope), but its
// message field can follow the same `lines` leaf the native tickers read, in row order.
// What is pinned:
//   - keyed by the imported field's own id, never by f0; a value's line breaks arrive intact;
//   - empty and missing differ: an empty Value clears, a missing row writes nothing and is said;
//   - a lines source keys the native ticker's f0 and no imported field, which the operator picks;
//     the imported field then gets the ordered rows, the native ticker its lines as before;
//   - save and reopen keep each binding and the artwork's bytes;
//   - no model request: the only address fetched is the Sheet's own export.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import { withBundledPage } from './catalog-emit.mjs';
import './lib/tsResolve.mjs';

const formats = await import('../src/control/contentFormats.ts');
const sheet = await import('../src/control/sheetSource.ts');
const { fieldDescriptors } = await import('../src/control/controlModel.ts');
const { proposeMapping, mappingEntries } = await import('../src/model/productionData.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (rel) => readFileSync(path.join(root, 'e2e/fixtures', rel), 'utf8');

const BUILT = await withBundledPage(
  [
    ['assets/svgImport.ts', 'NOACG_SVG'],
    ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ].map(([rel, globalName]) => ({ entry: path.join(root, 'src', rel), globalName })),
  (page) =>
    page.evaluate(
      ({ notice, ticker }) => {
        const { NOACG_SVG: R, NOACG_IMPORTED: I } = window;
        const build = (markup) => {
          const imp = R.importSvgMarkup(markup);
          const fields = imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
          return I.IMPORTED_SVG.create({ designSvg: { markup: imp.markup, width: imp.width, height: imp.height, fields, images: [], outlines: [], fonts: [] } });
        };
        return { notice: build(notice), ticker: build(ticker) };
      },
      { notice: fixture('jev-svg/qualification/multiline.svg'), ticker: fixture('jev-svg/qualification/ticker.svg') },
    ),
);
const NOTICE = { ...BUILT.notice, name: 'Notice' };
const STRIP = { ...BUILT.ticker, name: 'Drawn ticker' };
/** A native ticker, as the catalog saves one: its lines in f0. */
const NATIVE = { name: 'News ticker', type: 'ticker', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 50, html: '<div></div>', css: '', js: '', fields: [{ field: 'f0', ftype: 'textarea', title: 'Headlines', value: '' }], settings: {}, assets: [], layers: [] };
const shapeOf = (t) => ({ type: t.type, template: { js: t.js } });
const fieldsOf = (t) => fieldDescriptors(t.fields);
const BODY = 'f1';
const MESSAGE = 'f1';

test('the fixtures are what this test assumes: the body and the message line are f1, a title is f0', () => {
  assert.deepEqual(NOTICE.fields.map((f) => [f.field, f.title]), [['f0', 'Text 1'], [BODY, 'body']]);
  assert.deepEqual(STRIP.fields.map((f) => [f.field, f.title]), [['f0', 'Text 1'], [MESSAGE, 'message-line']]);
  for (const t of [NOTICE, STRIP]) {
    assert.equal(sheet.sheetShapeFor(shapeOf(t)), 'values', `${t.name} follows keyed values`);
    assert.deepEqual(formats.scalarFields(shapeOf(t), fieldsOf(t)).map((d) => d.key), ['f0', 'f1'], `${t.name}'s data template lists both`);
  }
});

const MULTILINE = 'Doors open at 18:00\nEntry from the courtyard\nStep-free access';

test('keyed by the imported field id, a multiline value arrives with its line breaks', () => {
  const csv = formats.scalarTemplateCsv(formats.scalarFields(shapeOf(NOTICE), fieldsOf(NOTICE)), { f0: 'NOTICE', [BODY]: MULTILINE });
  // The template downloads and reads back keyed by id, line breaks inside the quoted cell.
  assert.deepEqual(formats.parseScalarCsv(csv, fieldsOf(NOTICE)), { values: { f0: 'NOTICE', [BODY]: MULTILINE }, problems: [] });

  // The same rows as the Sheet answers them.
  const rows = [['Field ID', 'Label', 'Value'], ['f0', 'Text 1', 'NOTICE'], [BODY, 'body', MULTILINE]];
  const content = sheet.sheetContent('values', rows);
  assert.equal(content.leaves[`values.${BODY}`], MULTILINE);
  const offered = sheet.offeredValues('s1', 'values', content, 'sheet', shapeOf(NOTICE));
  const proposed = proposeMapping(fieldsOf(NOTICE), offered, {}, () => false);
  assert.deepEqual(proposed.map((r) => [r.fieldId, r.status, r.path]), [
    ['f0', 'key', 'sheet.s1.values.f0'],
    [BODY, 'key', `sheet.s1.values.${BODY}`],
  ]);
  // What the bound field takes: the text as written, line breaks and all.
  const bindings = { [NOTICE.name]: { f0: 'sheet.s1.values.f0', [BODY]: `sheet.s1.values.${BODY}` } };
  const of = (name) => (name === NOTICE.name ? fieldsOf(NOTICE) : null);
  assert.equal(sheet.pathValue(sheet.connectedFields(bindings, `sheet.s1.values.${BODY}`, of), MULTILINE), MULTILINE);

  // Name/Value rows match by the field's title instead.
  const byName = sheet.sheetContent('values', [['Name', 'Value'], ['body', 'One\nTwo']]);
  const named = proposeMapping(fieldsOf(NOTICE), sheet.offeredValues('s1', 'values', byName, 'sheet', shapeOf(NOTICE)), {}, () => false);
  assert.deepEqual(named.find((r) => r.fieldId === BODY).path, 'sheet.s1.values.body');
  assert.equal(byName.leaves['values.body'], 'One\nTwo');
});

test('empty and missing differ: an empty Value clears, a missing row writes nothing and is said', () => {
  const connected = new Set(['sheet.s1.values.f0', `sheet.s1.values.${BODY}`]);
  const read = (rows) => sheet.sheetContent('values', [['Field ID', 'Label', 'Value'], ...rows]);
  const first = sheet.sheetWrites('s1', read([['f0', '', 'NOTICE'], [BODY, '', MULTILINE]]), connected, {});
  assert.deepEqual(first.patch, { sheet: { s1: { values: { f0: 'NOTICE', [BODY]: MULTILINE } } } });

  const emptied = sheet.sheetWrites('s1', read([['f0', '', 'NOTICE'], [BODY, '', '']]), connected, first.snapshot);
  assert.deepEqual(emptied.patch, { sheet: { s1: { values: { [BODY]: '' } } } }, 'an empty cell is a value: it clears');
  assert.deepEqual(emptied.missing, []);

  const gone = sheet.sheetWrites('s1', read([['f0', '', 'NOTICE']]), connected, first.snapshot);
  assert.deepEqual(gone.patch, {}, 'a missing row writes nothing: the field keeps its value');
  assert.deepEqual(gone.missing, [`values.${BODY}`]);
  const back = sheet.sheetWrites('s1', read([['f0', '', 'NOTICE'], [BODY, '', 'Back again']]), connected, gone.snapshot);
  assert.deepEqual(back.patch, { sheet: { s1: { values: { [BODY]: 'Back again' } } } });

  // The data template tells them apart too.
  const parsed = formats.parseScalarCsv(`Field ID,Label,Value\nf0,Text 1,\n`, fieldsOf(NOTICE));
  assert.deepEqual(parsed.values, { f0: '' });
  assert.deepEqual(parsed.problems.map((p) => p.field), [BODY]);
});

test('a ticker tab: the native ticker keeps its lines, the drawn ticker\'s message follows them in row order when picked', () => {
  const rows = [['Harbor fair opens Friday'], ['WEATHER', 'Garden tour at noon'], ['Late ferry at 23:10']];
  const content = sheet.sheetContent('lines', rows);
  const ordered = 'Harbor fair opens Friday\nWEATHER\tGarden tour at noon\nLate ferry at 23:10';
  assert.equal(content.leaves.lines, ordered);

  // The native ticker is keyed as it always was.
  const native = proposeMapping(fieldsOf(NATIVE), sheet.offeredValues('s1', 'lines', content, 'sheet', shapeOf(NATIVE)), {}, () => false);
  assert.deepEqual(native.map((r) => [r.fieldId, r.status, r.path]), [['f0', 'key', 'sheet.s1.lines']]);
  // The drawn ticker's title is not keyed to the lines; nothing is proposed until the operator picks.
  const drawn = proposeMapping(fieldsOf(STRIP), sheet.offeredValues('s1', 'lines', content, 'sheet', shapeOf(STRIP)), {}, () => false);
  assert.deepEqual(drawn.map((r) => [r.fieldId, r.status, r.path]), [['f0', 'unmatched', null], [MESSAGE, 'unmatched', null]]);
  const picked = mappingEntries(STRIP.name, drawn, { [MESSAGE]: 'sheet.s1.lines' });
  assert.deepEqual(picked, [{ graphic: STRIP.name, fieldId: MESSAGE, path: 'sheet.s1.lines' }]);

  // One path, two graphics: each takes the same ordered text.
  const bindings = { [NATIVE.name]: { f0: 'sheet.s1.lines' }, [STRIP.name]: { [MESSAGE]: 'sheet.s1.lines' } };
  const of = (name) => (name === NATIVE.name ? fieldsOf(NATIVE) : name === STRIP.name ? fieldsOf(STRIP) : null);
  assert.equal(sheet.pathValue(sheet.connectedFields(bindings, 'sheet.s1.lines', of), ordered), ordered);
  // Reordered and emptied rows follow; an empty tab clears both.
  assert.equal(sheet.sheetContent('lines', [rows[2], rows[0]]).leaves.lines, 'Late ferry at 23:10\nHarbor fair opens Friday');
  assert.equal(sheet.sheetContent('lines', []).leaves.lines, '');
});

const dir = mkdtempSync(path.join(tmpdir(), 'imported-text-source-'));
after(() => rmSync(dir, { recursive: true, force: true }));

test('save and reopen: each binding comes back, and the artwork is byte for byte what was imported', async () => {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'shows.mjs');
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
    const shows = await import(pathToFileURL(file).href);
    const show = shows.createShowNamed('Evening notices');
    for (const t of [NOTICE, STRIP, NATIVE]) shows.addGraphicToShow(show.id, t);
    const values = { id: 'v1', kind: 'sheet', label: 'Notices', config: { sheetId: 'sheet-v1', gid: '0', shape: 'values' } };
    const ticker = { id: 't1', kind: 'sheet', label: 'Headlines', config: { sheetId: 'sheet-t1', gid: '0', shape: 'lines' } };
    assert.equal(shows.connectShowSource(show.id, values, [{ graphic: NOTICE.name, fieldId: BODY, path: `sheet.v1.values.${BODY}` }]).error, null);
    assert.equal(shows.connectShowSource(show.id, ticker, [{ graphic: NATIVE.name, fieldId: 'f0', path: 'sheet.t1.lines' }, { graphic: STRIP.name, fieldId: MESSAGE, path: 'sheet.t1.lines' }]).error, null);

    const reopened = JSON.parse(stored.get('spx-gfx-shows')).find((s) => s.id === show.id);
    assert.deepEqual(reopened.bindings, {
      [NOTICE.name]: { [BODY]: `sheet.v1.values.${BODY}` },
      [NATIVE.name]: { f0: 'sheet.t1.lines' },
      [STRIP.name]: { [MESSAGE]: 'sheet.t1.lines' },
    });
    assert.deepEqual(reopened.sources.map((s) => [s.id, s.config.shape]), [['v1', 'values'], ['t1', 'lines']]);
    for (const t of [NOTICE, STRIP]) {
      const pooled = reopened.graphics.find((g) => g.name === t.name).template;
      for (const key of ['html', 'css', 'js']) assert.equal(pooled[key], t[key], `${t.name} ${key} kept: the imported styling is untouched`);
    }
  } finally {
    globalThis.localStorage = previous;
  }
});

test('no model request: a read fetches the Sheet export and nothing else', async () => {
  const fetched = [];
  const read = await sheet.readSheet(
    async (url) => {
      fetched.push(url);
      return { ok: true, status: 200, text: async () => `Field ID,Label,Value\n${BODY},body,"${MULTILINE}"\n` };
    },
    { sheetId: 'sheet-v1', gid: '0' },
    new AbortController().signal,
  );
  assert.equal(read.ok, true);
  assert.equal(sheet.sheetContent('values', read.rows).leaves[`values.${BODY}`], MULTILINE);
  assert.deepEqual(fetched, ['https://docs.google.com/spreadsheets/d/sheet-v1/export?format=csv&gid=0']);
});
