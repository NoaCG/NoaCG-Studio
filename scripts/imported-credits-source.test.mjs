// needs: browser
// guards: src/control/contentFormats.ts
// guards: src/control/sheetSource.ts
// guards: src/templates/behaviours/credits.ts
//
// AN IMPORTED CREDITS LIST FOLLOWS A SHEET THROUGH THE EXISTING CREDITS ADAPTER (jev-svg-import
// row 17, AC-14, credits half).
//
// An imported design's credits list is one field, wherever its recipe compiled it: a Heading
// drawn above the list makes it f1. The Sheet connection reads the graphic's list from the
// emitted NOACG_BEHAVIOUR table (contentFormats `graphicListFormat`), so the tab's rows go through
// the native credits adapter, the review keys the rows to that field and never to whatever text
// is f0, and the reader in the page and the server tick with every page closed write the same
// text, which the shipped credits parser reads back as headings, roles and their names in order.
// What is pinned:
//   - the list field is found without assuming f0; the original-artwork roll (its field inert) and
//     a plain import of a credits drawing take keyed values, as before; native graphics unchanged;
//   - role and name columns, headings, order, several names per role and a role waiting for names;
//   - the review's proposal, its save and its reopening, the graphic's styling untouched;
//   - a failed read keeps the last good list, an empty tab clears it, a list never goes missing;
//   - Pause holds the list and Resume writes only what changed; a closed page is served by the tick;
//   - the update policy that exists today: the editable roll rebuilds from the written list on
//     update(); the artwork roll is offered nothing to follow;
//   - no model request: the only address fetched is the Sheet's own export.
// Templates are built on one blank Chromium page from the real importer (scripts/catalog-emit.mjs).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { withBundledPage } from './catalog-emit.mjs';
import './lib/tsResolve.mjs';

const formats = await import('../src/control/contentFormats.ts');
const sheet = await import('../src/control/sheetSource.ts');
const { fieldDescriptors } = await import('../src/control/controlModel.ts');
const { proposeMapping, mappingEntries } = await import('../src/model/productionData.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (rel) => readFileSync(path.join(root, 'e2e/fixtures', rel), 'utf8');

// ── The graphics, built by the real importer ────────────────────────────────────────────────

const BUILT = await withBundledPage(
  [
    ['assets/svgImport.ts', 'NOACG_SVG'],
    ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
    ['templates/behaviours/credits.ts', 'NOACG_RECIPE'],
  ].map(([rel, globalName]) => ({ entry: path.join(root, 'src', rel), globalName })),
  (page) =>
    page.evaluate(
      ({ legacy, artwork, drawn }) => {
        const { NOACG_SVG: R, NOACG_IMPORTED: I, NOACG_RECIPE: C } = window;
        const fieldsOf = (imp) => imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
        const base = (imp, behaviour) => ({ markup: imp.markup, width: imp.width, height: imp.height, fields: fieldsOf(imp), images: [], outlines: [], fonts: [], ...(behaviour ? { behaviour } : {}) });
        const build = (designSvg) => I.IMPORTED_SVG.create({ designSvg });
        const L = R.importSvgMarkup(legacy);
        const A = R.importSvgMarkup(artwork);
        return {
          role: C.CREDITS_FIELD_ROLE,
          // A saved editable roll: the Heading is drawn above the list, so the list is f1.
          editable: build(base(L, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: L.candidates.findIndex((c) => c.label === 'Credits') } })),
          // The original-artwork roll: its text scrolls as drawn and its field is inert.
          artwork: build(base(A, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: A.candidates.findIndex((c) => c.label === 'Programme text') }, options: { artwork: true } })),
          // A credits drawing imported as plain text fields.
          plain: build(base(R.importSvgMarkup(drawn))),
        };
      },
      { legacy: fixture('credits-roll.svg'), artwork: fixture('credits-artwork.svg'), drawn: fixture('jev-svg/dev/credits-1.svg') },
    ),
);
const named = (template, name) => ({ ...template, name });
const EDITABLE = named(BUILT.editable, 'Imported credits');
const ARTWORK = named(BUILT.artwork, 'Artwork credits');
const PLAIN = named(BUILT.plain, 'Credits drawing');
const shapeOf = (template) => ({ type: template.type, template: { js: template.js } });
const fieldsOf = (template) => fieldDescriptors(template.fields);

/** The shipped credits parser, cut out of the template literal the roll emits (credits-parser.test.mjs). */
const parseCredits = (() => {
  const source = readFileSync(path.join(root, 'src/templates/endCredits/shared.ts'), 'utf8');
  const start = source.indexOf('var ROLE_LABEL_MAX');
  const block = source.slice(start, source.indexOf('`;', start));
  assert.ok(start > 0 && !block.includes('${'), 'parser block found as plain text');
  return new Function('escapeHtml', `${block.replace(/\\\\/g, '\\')}\nreturn parseCredits;`)((s) => String(s));
})();

/** A tab as the Sheet answers it: role and name columns, a heading, several names under one role
 *  on the rows below it, a role waiting for names, and a section break. */
const TAB = [
  ['Role', 'Name'],
  ['# PRODUCTION', ''],
  ['Director', 'Alex Rivera'],
  ['Camera', 'Jonas Berg'],
  ['', 'Lena Fors'],
  ['', 'Petri Salo'],
  ['Sound', ''],
  ['', ''],
  ['# THANKS', ''],
  ['Catering', 'Dot & Co'],
];
const TAB_TEXT = '# PRODUCTION\nDirector | Alex Rivera\nCamera | Jonas Berg\nLena Fors\nPetri Salo\nSound:\n\n# THANKS\nCatering | Dot & Co';
const csvOf = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';

// ── Which field the rows fill ───────────────────────────────────────────────────────────────

test('the list is the field the recipe compiled it to, not f0; the artwork roll and a plain drawing take values', () => {
  assert.equal(BUILT.role, 'credits', 'contentFormats reads the role credits.ts declares');
  const table = JSON.parse(/var NOACG_BEHAVIOUR = (\{[\s\S]*?\});/.exec(EDITABLE.js)[1]);
  assert.equal(table.fields.credits, 'f1', 'the fixture really puts the list at f1');
  assert.equal(EDITABLE.fields.find((f) => f.field === 'f0').title, 'Heading');

  const g = shapeOf(EDITABLE);
  assert.deepEqual(formats.graphicListFormat(g), { adapter: 'credits', main: 'f1' });
  assert.deepEqual(formats.listFormatFor(g, 'f1'), { adapter: 'credits', main: 'f1' });
  assert.equal(formats.listFormatFor(g, 'f0'), null, 'the Heading stays a text field');
  assert.equal(sheet.sheetShapeFor(g), 'credits');
  assert.deepEqual(formats.scalarFields(g, fieldsOf(EDITABLE)).map((d) => d.key), ['f0', 'f2'], 'the data template keeps Heading and speed, not the list');

  for (const other of [ARTWORK, PLAIN]) {
    assert.equal(formats.graphicListFormat(shapeOf(other)), null, other.name);
    assert.equal(sheet.sheetShapeFor(shapeOf(other)), 'values', other.name);
    for (const f of other.fields) assert.equal(formats.listFormatFor(shapeOf(other), f.field), null, `${other.name} ${f.field}`);
  }
  // A hand-edited table the build no longer reads, or no table at all, is plain values.
  assert.equal(sheet.sheetShapeFor({ type: 'imported-design', template: { js: EDITABLE.js.replace('"version": 1', '"version": 9') } }), 'values');
  assert.equal(sheet.sheetShapeFor({ type: 'imported-design', template: { js: '' } }), 'values');
});

test('native graphics read exactly as before', () => {
  const native = (type, js = '') => ({ type, template: { js } });
  assert.equal(sheet.sheetShapeFor(native('ticker')), 'lines');
  assert.equal(sheet.sheetShapeFor(native('end-credits')), 'credits');
  assert.equal(sheet.sheetShapeFor(native('infographic', 'x.infographic-time')), 'schedule');
  assert.equal(sheet.sheetShapeFor(native('results-board', 'x-row-cells')), 'standings');
  assert.equal(sheet.sheetShapeFor(native('lowerThird')), 'values');
  assert.deepEqual(formats.graphicListFormat(native('results-board', 'x-row-cells')), { adapter: 'standings', main: 'f2', headers: 'f3' });
  // A native graphic's leaves name the same fields with or without the graphic.
  const content = sheet.sheetContent('lines', [['a']]);
  const keys = (graphic) => sheet.offeredValues('s1', 'lines', content, 'sheet', graphic).map((o) => o.key);
  assert.deepEqual(keys(undefined), ['f0']);
  assert.deepEqual(keys(native('ticker')), ['f0']);
  assert.deepEqual(sheet.listLeaves('standings', native('results-board', 'x-row-cells')).map((l) => l.field), ['f2', 'f3']);
});

// ── What the rows become ────────────────────────────────────────────────────────────────────

test('role and name columns, headings, order and several names per role reach the list in the native grammar', () => {
  const content = sheet.sheetContent('credits', TAB);
  assert.equal(content.leaves.lines, TAB_TEXT);
  assert.deepEqual(parseCredits(content.leaves.lines), [
    [
      { type: 'heading', text: 'PRODUCTION' },
      { type: 'group', role: 'Director', names: ['Alex Rivera'] },
      { type: 'group', role: 'Camera', names: ['Jonas Berg', 'Lena Fors', 'Petri Salo'] },
      { type: 'group', role: 'Sound', names: [] },
    ],
    [
      { type: 'heading', text: 'THANKS' },
      { type: 'group', role: 'Catering', names: ['Dot & Co'] },
    ],
  ]);
  // The same list pasted into the cue reads the same: one adapter for both.
  assert.equal(formats.fillList(formats.graphicListFormat(shapeOf(EDITABLE)), TAB).values.f1, TAB_TEXT);
});

// ── The review, its save and its reopening ──────────────────────────────────────────────────

test('the review keys the rows to the list field; without the graphic it would have keyed the Heading', () => {
  const content = sheet.sheetContent('credits', TAB);
  const fields = fieldsOf(EDITABLE);
  const propose = (offered) => proposeMapping(fields, offered, {}, () => false);
  const rows = propose(sheet.offeredValues('s1', 'credits', content, 'sheet', shapeOf(EDITABLE)));
  assert.deepEqual(rows.map((r) => [r.fieldId, r.status, r.path]), [
    ['f0', 'unmatched', null],
    ['f1', 'key', 'sheet.s1.lines'],
    ['f2', 'unmatched', null],
  ]);
  const before = propose(sheet.offeredValues('s1', 'credits', content, 'sheet'));
  assert.deepEqual(before.find((r) => r.fieldId === 'f0').path, 'sheet.s1.lines', 'the defect this guards: the native default keys f0');
  // A source of another shape names no field of an imported list.
  assert.equal(sheet.offeredValues('s1', 'lines', sheet.sheetContent('lines', [['a']]), 'sheet', shapeOf(EDITABLE))[0].key, undefined);
});

/** The shows store, bundled for Node over an in-memory localStorage (cue-adjust.test.mjs). */
const dir = mkdtempSync(path.join(tmpdir(), 'imported-credits-source-'));
after(() => rmSync(dir, { recursive: true, force: true }));
async function withShows(run) {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, `shows-${Date.now()}.mjs`);
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
    return await run(await import(pathToFileURL(file).href), stored);
  } finally {
    globalThis.localStorage = previous;
  }
}

test('save and reopen: the binding, the source shape and the artwork itself come back as they were', async () => {
  await withShows(async (shows, stored) => {
    const show = shows.createShowNamed('Credits night');
    shows.addGraphicToShow(show.id, EDITABLE);
    const fields = fieldsOf(EDITABLE);
    const shape = sheet.sheetShapeFor(shapeOf(EDITABLE));
    const content = sheet.sheetContent(shape, TAB);
    const rows = proposeMapping(fields, sheet.offeredValues('s1', shape, content, 'sheet', shapeOf(EDITABLE)), {}, () => false);
    const source = { id: 's1', kind: 'sheet', label: 'Credits tab', config: { sheetId: 'sheet-s1', gid: '0', shape } };
    const saved = shows.connectShowSource(show.id, source, mappingEntries(EDITABLE.name, rows, {}));
    assert.equal(saved.error, null);
    assert.deepEqual(saved.refused, []);

    // Reopen from what storage holds.
    const reopened = JSON.parse(stored.get('spx-gfx-shows')).find((s) => s.id === show.id);
    assert.deepEqual(reopened.bindings, { [EDITABLE.name]: { f1: 'sheet.s1.lines' } });
    assert.deepEqual(reopened.sources.map((s) => [s.id, s.config.shape]), [['s1', 'credits']]);
    const pooled = reopened.graphics.find((g) => g.name === EDITABLE.name).template;
    for (const key of ['html', 'css', 'js']) assert.equal(pooled[key], EDITABLE[key], `${key} kept byte for byte: the imported styling is untouched`);

    // The review opened again proposes nothing new: the saved binding is the proposal.
    const again = proposeMapping(fields, sheet.offeredValues('s1', reopened.sources[0].config.shape, content, 'sheet', shapeOf(pooled)), reopened.bindings[EDITABLE.name], () => false);
    assert.deepEqual(mappingEntries(EDITABLE.name, again, {}), []);
  });
});

// ── Delivery: the page's reader and the server tick ─────────────────────────────────────────

/** A clock whose timers run when the test moves time (sheet-source.test.mjs). */
function fakeClock() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    now: () => now,
    setTimer: (run, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      await settle();
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
        await settle();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

/** The page's reader of the credits tab, connected to the imported list, through the same
 *  `accept` the production page passes (pathValue over every connected field). */
function pageReader() {
  const clock = fakeClock();
  const leases = new Map();
  const tab = { status: 200, csv: csvOf(TAB), fetched: [] };
  const bindings = { [EDITABLE.name]: { f1: 'sheet.s1.lines' } };
  const fieldsOfGraphic = (name) => (name === EDITABLE.name ? fieldsOf(EDITABLE) : null);
  const t = { writes: [], statuses: [], paused: false, tab, clock };
  t.reader = sheet.createSheetReader({
    key: 'prod-1:s1',
    sourceId: 's1',
    link: { sheetId: 'sheet-s1', gid: '0' },
    shape: 'credits',
    tab: 'A',
    world: 'local',
    io: {
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      fetch: async (url) => {
        tab.fetched.push(url);
        if (tab.status === 0) throw new TypeError('Failed to fetch');
        return { ok: tab.status === 200, status: tab.status, text: async () => tab.csv };
      },
      readLease: (k) => (leases.has(k) ? structuredClone(leases.get(k)) : null),
      writeLease: (k, lease) => leases.set(k, structuredClone(lease)),
    },
    connected: () => new Set(['sheet.s1.lines']),
    accept: (p, text) => sheet.pathValue(sheet.connectedFields(bindings, p, fieldsOfGraphic), text),
    paused: () => t.paused,
    write: async (patch) => {
      t.writes.push(patch);
      return true;
    },
    onStatus: (s) => t.statuses.push(s),
  });
  t.status = () => t.statuses.at(-1);
  return t;
}
const lines = (patch) => patch.sheet.s1.lines;

test('a change is written once; a failed read keeps the last good list; an empty tab clears it', async () => {
  const t = pageReader();
  await t.clock.advance(0);
  assert.deepEqual(t.writes.map(lines), [TAB_TEXT]);

  // A name added under Camera, and the rows reordered: the list follows the tab's order.
  t.tab.csv = csvOf([['Role', 'Name'], ['Camera', 'Jonas Berg'], ['', 'Ida Lake'], ['Director', 'Alex Rivera']]);
  await t.clock.advance(sheet.SHEET_READ_MS);
  assert.equal(lines(t.writes.at(-1)), 'Camera | Jonas Berg\nIda Lake\nDirector | Alex Rivera');
  await t.clock.advance(sheet.SHEET_READ_MS);
  assert.equal(t.writes.length, 2, 'an unchanged tab writes nothing');

  // Denied, then unreachable: nothing is written, so the field keeps the last good list.
  t.tab.status = 403;
  await t.clock.advance(sheet.SHEET_READ_MS);
  t.tab.status = 0;
  await t.clock.advance(sheet.SHEET_READ_MS * 2);
  assert.equal(t.writes.length, 2);
  assert.deepEqual([t.status().state, t.status().stale], ['failing', true], 'three missed reads mark it stale');
  t.tab.status = 200;
  await t.clock.advance(sheet.SHEET_READ_MS);
  assert.deepEqual([t.status().state, t.status().stale], ['ok', false], 'reconnected');
  assert.equal(t.writes.length, 2, 'the recovered tab is unchanged: nothing to write');

  // Empty is a value: a tab with only its header clears the list (""), unlike a failed read.
  t.tab.csv = 'Role,Name\n';
  await t.clock.advance(sheet.SHEET_READ_MS);
  assert.equal(lines(t.writes.at(-1)), '');
  t.reader.stop();
});

test('Pause holds the list; Resume writes only what changed while paused', async () => {
  const t = pageReader();
  await t.clock.advance(0);
  t.paused = true;
  t.tab.csv = csvOf([...TAB, ['Editor', 'Mia Holt']]);
  const fetched = t.tab.fetched.length;
  await t.clock.advance(sheet.SHEET_READ_MS * 3);
  assert.equal(t.tab.fetched.length, fetched, 'paused: nothing is read');
  assert.equal(t.status().state, 'paused');
  assert.equal(t.writes.length, 1);
  t.paused = false;
  t.reader.poke();
  await t.clock.advance(0);
  assert.deepEqual(t.writes.map(lines), [TAB_TEXT, `${TAB_TEXT}\nEditor | Mia Holt`]);
  t.reader.stop();
});

test('with every page closed, the server tick writes the same list into the published production', async () => {
  const built = await buildApiRuntime(['api/data/[...path].ts']);
  try {
    const tick = await import(pathToFileURL(path.join(built.outputDir, 'api/_lib/dataTick.js')).href);
    const fetched = [];
    const commits = [];
    let csv = csvOf(TAB);
    let now = 1_000_000;
    const due = {
      slug: 'slug-1',
      source: { id: 's1', kind: 'sheet', label: 's1', config: { sheetId: 'sheet-s1', gid: '0', shape: 'credits' } },
      bindings: { [EDITABLE.name]: { f1: 'sheet.s1.lines' } },
      // What a published production carries for the graphic: its fields as the panel lists them.
      fields: { [EDITABLE.name]: EDITABLE.fields.map((f) => ({ field: f.field, ftype: f.ftype })) },
    };
    const rows = {};
    const io = {
      now: () => now,
      due: async () => [structuredClone(due)],
      lease: async (slug, source, claim, ttl) => (ttl === 0 ? { ok: false } : { ok: true, claim: 'tick', ...(rows[source] ?? {}) }),
      commit: async (slug, source, claim, writes, state) => {
        commits.push(writes);
        rows[source] = { snapshot: state.snapshot, content: state.content, status: state.status };
        return { ok: true };
      },
      record: async () => {},
      fetch: async (url) => {
        fetched.push(url);
        return { ok: true, status: 200, text: async () => csv };
      },
      feed: async () => {
        throw new Error('no feed here');
      },
      setTimer: () => 0,
      clearTimer: () => {},
    };
    assert.deepEqual((await tick.runDataTick(io)).sources.map((s) => s.outcome), ['read']);
    assert.deepEqual(commits.at(-1), { 'sheet.s1.lines': TAB_TEXT });
    now += 60_000;
    assert.deepEqual((await tick.runDataTick(io)).sources.map((s) => s.outcome), ['unchanged']);
    csv = 'Role,Name\n';
    now += 60_000;
    await tick.runDataTick(io);
    assert.deepEqual(commits.at(-1), { 'sheet.s1.lines': '' }, 'an emptied tab clears on air with no page open');
    assert.ok(fetched.every((url) => url.startsWith('https://docs.google.com/spreadsheets/d/sheet-s1/export?format=csv')), 'the tick fetched the Sheet and nothing else');
  } finally {
    await built.cleanup();
  }
});

// ── What the graphic does with the written list ────────────────────────────────────────────

test('the update policy that exists: the editable roll rebuilds from the list on update(); the artwork roll follows nothing', () => {
  // The editable roll's update() calls its rebuild hook, which reads the list field by the role.
  assert.match(EDITABLE.js, /if \(typeof creditsDataUpdated === 'function'\) creditsDataUpdated\(\);/);
  assert.match(EDITABLE.js, /function creditsDataUpdated\(/);
  // The artwork roll's field is hidden, so no review offers it and no source is shaped for it.
  assert.equal(ARTWORK.fields.find((f) => f.field === 'f0').ftype, 'hidden');
  assert.deepEqual(fieldsOf(ARTWORK).map((d) => d.key), ['f1'], 'only the speed is an operator field');
});

test('no model request: the adapters and the reader import nothing from the AI layer', () => {
  for (const file of ['src/control/contentFormats.ts', 'src/control/sheetSource.ts', 'src/control/sourceMapping.ts', 'src/blocks/behaviourData.ts']) {
    const text = readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /from '[^']*\/ai\//, file);
  }
});
