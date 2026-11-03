// needs: browser
// guards: src/control/contentFormats.ts
// guards: src/control/sheetSource.ts
// guards: src/templates/behaviours/credits.ts
// guards: src/templates/importedDesign/creditsRoll.ts
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
// And the preview (row 18, AC-23): the wizard reads the same list through the shipped parser,
// headings, roles and their zero, one or several names in order, for role above and beside and
// each playback, with one choice where a drawing's columns could each be the roles.
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
    ['templates/importedDesign/creditsRoll.ts', 'NOACG_ROLL'],
  ].map(([rel, globalName]) => ({ entry: path.join(root, 'src', rel), globalName })),
  (page) =>
    page.evaluate(
      ({ legacy, artwork, drawn, beside, synthetic, list }) => {
        const { NOACG_SVG: R, NOACG_IMPORTED: I, NOACG_RECIPE: C, NOACG_ROLL: P } = window;
        const fieldsOf = (imp) => imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
        const base = (imp, behaviour) => ({ markup: imp.markup, width: imp.width, height: imp.height, fields: fieldsOf(imp), images: [], outlines: [], fonts: [], ...(behaviour ? { behaviour } : {}) });
        const build = (designSvg) => I.IMPORTED_SVG.create({ designSvg });
        const L = R.importSvgMarkup(legacy);
        const A = R.importSvgMarkup(artwork);
        return {
          role: C.CREDITS_FIELD_ROLE,
          recipe: C.CREDITS_RECIPE_ID,
          // A saved editable roll: the Heading is drawn above the list, so the list is f1.
          editable: build(base(L, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: L.candidates.findIndex((c) => c.label === 'Credits') } })),
          // The original-artwork roll: its text scrolls as drawn and its field is inert.
          artwork: build(base(A, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: A.candidates.findIndex((c) => c.label === 'Programme text') }, options: { artwork: true } })),
          // A credits drawing imported as plain text fields.
          plain: build(base(R.importSvgMarkup(drawn))),
          preview: (() => {
            // The step's own render: the sanitized markup laid out on the page.
            const laid = (imp) => {
              const host = document.createElement('div');
              host.innerHTML = imp.markup;
              document.body.appendChild(host);
              return host.firstElementChild;
            };
            const ids = (imp) => imp.candidates.map((c) => c.id);
            const idOf = (imp, words) => imp.candidates.find((c) => c.sample === words).id;
            const show = (markup, words, choice) => {
              const imp = R.importSvgMarkup(markup);
              const out = P.creditsPreview(laid(imp), ids(imp), idOf(imp, words), choice);
              return { ...out, ...(out.anchors ? { anchors: out.anchors.map((a) => `${imp.candidates.find((c) => c.id === a.candidateId).sample}:${a.kind}`) } : {}) };
            };
            // One list for every layout and playback: a styled binding of each, its list field
            // found by the Sheet the same way, every binding valid against its drawing.
            const bindings = [[drawn, 'Research'], [beside, 'Réalisation']].flatMap(([markup, words]) => {
              const imp = R.importSvgMarkup(markup);
              const root = laid(imp);
              const read = P.creditsPreview(root, ids(imp), idOf(imp, words));
              const fields = fieldsOf(imp).filter((f) => f.candidateId === idOf(imp, words));
              return ['static', 'roll', 'cards'].map((playback) => {
                const svg = { ...base(imp), fields, behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: read.layout, playback, anchors: read.anchors } } };
                return { layout: read.layout, playback, errors: P.validateCreditsBinding(svg, root), js: build(svg).js };
              });
            });
            // A saved binding of each reading of the ambiguous drawing, validated against it.
            const swapCheck = (() => {
              const imp = R.importSvgMarkup(synthetic.nameFirst);
              const root = laid(imp);
              const id = idOf(imp, 'Alex Rivera');
              const fields = fieldsOf(imp).filter((f) => f.candidateId === id);
              const check = (choice) => {
                const read = P.creditsPreview(root, ids(imp), id, choice);
                return P.validateCreditsBinding({ ...base(imp), fields, behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: read.layout, playback: 'cards', anchors: read.anchors } } }, root);
              };
              // Kinds no reading gives: every layer a role but the last.
              const read = P.creditsPreview(root, ids(imp), id);
              const bogus = read.anchors.map((a, i) => ({ ...a, kind: i === read.anchors.length - 1 ? 'name' : 'role' }));
              return {
                read: check({}),
                swapped: check({ swap: true }),
                bogus: P.validateCreditsBinding({ ...base(imp), fields, behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: read.layout, playback: 'cards', anchors: bogus } } }, root),
              };
            })();
            return {
              swapCheck,
              above: show(drawn, 'Research'),
              beside: show(beside, 'Réalisation'),
              legacy: show(legacy, L.candidates.find((c) => c.label === 'Credits').sample),
              nameFirst: show(synthetic.nameFirst, 'Alex Rivera'),
              nameFirstSwapped: show(synthetic.nameFirst, 'Alex Rivera', { swap: true }),
              turned: show(synthetic.turned, 'Director'),
              hebrew: show(synthetic.hebrew, 'במאי'),
              hebrewSwapped: show(synthetic.hebrew, 'במאי', { swap: true }),
              title: show(drawn, R.importSvgMarkup(drawn).candidates[0].sample),
              list: P.readCreditsList(list),
              bindings,
            };
          })(),
        };
      },
      {
        legacy: fixture('credits-roll.svg'),
        artwork: fixture('credits-artwork.svg'),
        drawn: fixture('jev-svg/dev/credits-1.svg'),
        beside: fixture('jev-svg/dev/credits-2.svg'),
        list: '# PRODUCTION\nDirector | Alex Rivera\nCamera | Jonas Berg\nLena Fors\nPetri Salo\nSound:\n\n# THANKS\nCatering | Dot & Co',
        synthetic: {
          // Names in the left column, roles on the right: geometry alone cannot say which.
          nameFirst: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600" font-family="sans-serif" fill="#fff"><text x="100" y="100" font-size="40">Alex Rivera</text><text x="600" y="100" font-size="24" fill="#fc0">Director</text><text x="100" y="200" font-size="40">Ari Moss</text><text x="600" y="200" font-size="24" fill="#fc0">Sound</text></svg>`,
          // Role beside, the whole block turned 8 degrees counterclockwise: a name right of its
          // role sits higher in the artwork's frame than the role does.
          turned: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600" font-family="sans-serif" fill="#fff"><g transform="translate(100 200) rotate(-8)"><text x="0" y="0" font-size="24" fill="#fc0">Director</text><text x="500" y="0" font-size="40">Alex Rivera</text><text x="0" y="100" font-size="24" fill="#fc0">Sound</text><text x="500" y="100" font-size="40">Ari Moss</text></g></svg>`,
          // Hebrew role beside its name: the role is on the right, where the line starts.
          hebrew: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600" font-family="sans-serif" fill="#fff"><text x="900" y="100" font-size="24" fill="#fc0" direction="rtl">במאי</text><text x="600" y="100" font-size="40" direction="rtl">דנה לוי</text><text x="900" y="200" font-size="24" fill="#fc0" direction="rtl">צילום</text><text x="600" y="200" font-size="40" direction="rtl">יוסי כהן</text><text x="600" y="250" font-size="40" direction="rtl">רות גל</text></svg>`,
        },
      },
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
  // contentFormats restates both (control cannot import templates): the recipe id and the role.
  assert.equal(BUILT.recipe, 'credits', 'the recipe id credits.ts declares');
  assert.equal(BUILT.role, 'credits', 'the field role credits.ts declares');
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

// ── The preview (row 18, AC-23) ──────────────────────────────────────────────────────────────

const PREVIEW = BUILT.preview;
const TAB_LIST = [
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
];

test('preview: the Sheet\'s list reads as headings, roles and zero, one or several names, in order, by the shipped parser', () => {
  // The same text a Sheet writes into the field (test above): one reading for source and preview.
  assert.equal(sheet.sheetContent('credits', TAB).leaves.lines, TAB_TEXT);
  assert.deepEqual(PREVIEW.list, TAB_LIST);
  assert.deepEqual(PREVIEW.list, parseCredits(TAB_TEXT), 'the preview reads exactly what the roll parses');
});

test('preview: role above and role beside read off the drawing, the one list kept, a title drawn above left as artwork', () => {
  assert.equal(PREVIEW.above.styled, true);
  assert.equal(PREVIEW.above.layout, 'role-above');
  assert.equal(PREVIEW.above.ambiguous, false, 'above, the order says which look is the role');
  assert.deepEqual(PREVIEW.above.list, [[
    { type: 'group', role: 'Research', names: ['Nia Vale', 'Tomas Fen'] },
    { type: 'group', role: 'Sound', names: ['Ari Moss'] },
  ]]);
  assert.deepEqual(PREVIEW.above.anchors, ['Research:role', 'Nia Vale:name', 'Tomas Fen:name', 'Sound:role', 'Ari Moss:name']);

  assert.equal(PREVIEW.beside.styled, true);
  assert.equal(PREVIEW.beside.layout, 'role-beside');
  assert.deepEqual(PREVIEW.beside.list, [[
    { type: 'group', role: 'Réalisation', names: ['Léa Orme'] },
    { type: 'group', role: 'Image', names: ['Noé Rivage', 'Émilie Lac'] },
  ]]);
  // A layer that is not a role or name of the drawing previews as its own text, never a guess.
  assert.equal(PREVIEW.title.styled, false);
  // The editable roll's one multi-line sample previews as the list it is.
  assert.equal(PREVIEW.legacy.styled, false);
  assert.ok(PREVIEW.legacy.list.flat().some((item) => item.type === 'group' && item.names.length > 1), JSON.stringify(PREVIEW.legacy.list));
});

test('preview: ambiguous columns get one choice; right-to-left lines read from the right', () => {
  // Names drawn left of their roles: read left to right the names would be roles, and nothing in
  // the geometry says otherwise, so the author gets the one choice and its answer swaps them.
  assert.equal(PREVIEW.nameFirst.ambiguous, true);
  assert.deepEqual(PREVIEW.nameFirst.list, [[{ type: 'group', role: 'Alex Rivera', names: ['Director'] }, { type: 'group', role: 'Ari Moss', names: ['Sound'] }]]);
  assert.deepEqual(PREVIEW.nameFirstSwapped.list, [[{ type: 'group', role: 'Director', names: ['Alex Rivera'] }, { type: 'group', role: 'Sound', names: ['Ari Moss'] }]]);
  assert.deepEqual(PREVIEW.nameFirstSwapped.anchors, ['Director:role', 'Alex Rivera:name', 'Sound:role', 'Ari Moss:name']);
  // Either answer saves as a valid binding of that drawing; kinds neither reading gives do not.
  assert.deepEqual(PREVIEW.swapCheck.read, []);
  assert.deepEqual(PREVIEW.swapCheck.swapped, []);
  assert.ok(PREVIEW.swapCheck.bogus.some((e) => e.startsWith('stale-anchors')), JSON.stringify(PREVIEW.swapCheck.bogus));
  // A turned block is read in its own frame: the first role keeps its name.
  assert.equal(PREVIEW.turned.layout, 'role-beside');
  assert.deepEqual(PREVIEW.turned.list, [[{ type: 'group', role: 'Director', names: ['Alex Rivera'] }, { type: 'group', role: 'Sound', names: ['Ari Moss'] }]]);
  // Hebrew: the role starts the line at the right, so it reads first without any choice (#1941).
  assert.equal(PREVIEW.hebrew.rtl, true);
  assert.equal(PREVIEW.hebrew.layout, 'role-beside');
  assert.deepEqual(PREVIEW.hebrew.list, [[{ type: 'group', role: 'במאי', names: ['דנה לוי'] }, { type: 'group', role: 'צילום', names: ['יוסי כהן', 'רות גל'] }]]);
  assert.deepEqual(PREVIEW.hebrewSwapped.list.flat().map((g) => g.role), ['דנה לוי', 'יוסי כהן', 'רות גל'], 'the choice still reads the other column');
});

test('preview: one list field, one Sheet source, through role above and beside and static, roll and cards', () => {
  assert.deepEqual(PREVIEW.bindings.map((b) => `${b.layout}/${b.playback}`), [
    'role-above/static', 'role-above/roll', 'role-above/cards', 'role-beside/static', 'role-beside/roll', 'role-beside/cards',
  ]);
  for (const b of PREVIEW.bindings) {
    const label = `${b.layout}/${b.playback}`;
    assert.deepEqual(b.errors, [], `${label}: a valid binding of its drawing`);
    const shape = { type: 'imported-design', template: { js: b.js } };
    const format = formats.graphicListFormat(shape);
    assert.deepEqual(format, { adapter: 'credits', main: 'f0' }, `${label}: one list field`);
    assert.equal(sheet.sheetShapeFor(shape), 'credits', `${label}: the same Sheet adapter`);
    assert.equal(formats.fillList(format, TAB).values.f0, TAB_TEXT, `${label}: the same list text`);
  }
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
