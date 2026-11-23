// guards: docs/template-library/coverage.json, src/templates/types/**, src/templates/behaviours/**, src/templates/catalog.ts, src/templates/endCredits/**, src/templates/versus/**, src/templates/frames/**, src/templates/picture.ts, src/templates/pictureTarget.ts, src/control/messageStaging.ts, src/control/resultStaging.ts, src/control/wordStaging.ts, src/templates/importedDesign/svgQr.ts, docs/tutorials/**, e2e/svg-templates.spec.ts, e2e/svg-examples.spec.ts, e2e/quarantine.json
//
// AC-2 of the SVG Template Library plan, complete since TL7: every id in scope has a row, every row
// is `covered` with no open extension, and every covered row keeps its templates and its proof.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { builtInsFor, formatMatrix, generateMatrix, loadMatrix, loadRegistries, lostSince, MATRIX_FILE, staleRows, summary, validateMatrix } from './template-coverage.mjs';
import { measured } from './measured.mjs';

/** A small repository: one template, its inventory, a proof spec, a source file. */
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'template-coverage-'));
  const put = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  put('src/types/a.ts', "id: 'a',\n");
  put('lib/SVG/a.svg', '<svg/>');
  put('lib/items.json', JSON.stringify([{ slug: 'a', recipe: 'quiz' }]));
  put('e2e/a.spec.ts', "const items = read('lib/items.json');\ntest(`${t.name} imports and plays`, () => {});\n");
  put('e2e/quarantine.json', JSON.stringify({ specs: {} }));
  return { root, put, done: () => rmSync(root, { recursive: true, force: true }) };
}

const coveredRow = () => ({
  id: 'a', kind: 'type', mechanism: 'existing recipe', recipe: 'quiz', status: 'covered', source: ['src/types/a.ts'],
  templates: ['lib/SVG/a.svg'],
  proof: { test: 'e2e/a.spec.ts', case: 'imports and plays', inventory: 'lib/items.json', observes: 'the answer reveals' },
});
const plannedRow = (extra = {}) => ({ id: 'b', kind: 'type', mechanism: 'plain fields', status: 'planned', phase: 'TL4', source: ['src/types/a.ts'], templates: [], proof: { observes: 'texts update' }, ...extra });

test('a covered row holds while its template, proof case and inventory entry hold', () => {
  const { root, done } = fixture();
  try {
    assert.deepEqual(validateMatrix({ rows: [coveredRow(), plannedRow()] }, { root }), []);
  } finally { done(); }
});

test('a covered row that loses its evidence fails, whichever part goes', () => {
  const { root, put, done } = fixture();
  try {
    const fails = (row, pattern) => assert.ok(validateMatrix({ rows: [row] }, { root }).some((p) => pattern.test(p)), String(pattern));
    fails({ ...coveredRow(), templates: ['lib/SVG/gone.svg'] }, /template lib\/SVG\/gone.svg is missing/);
    fails({ ...coveredRow(), templates: [] }, /covered with no template/);
    fails({ ...coveredRow(), proof: { ...coveredRow().proof, case: 'renamed case' } }, /has no test titled with the case/);
    fails({ ...coveredRow(), proof: { ...coveredRow().proof, test: 'e2e/gone.spec.ts' } }, /proof e2e\/gone.spec.ts is missing/);
    fails({ ...coveredRow(), recipe: 'score' }, /with recipe quiz, not score/);
    fails({ ...coveredRow(), proof: { observes: 'x' } }, /names its proof test/);
    const unstated = coveredRow();
    delete unstated.recipe;
    fails(unstated, /name the recipe a is proved with/);
    put('lib/items.json', JSON.stringify([{ slug: 'a', recipe: null }]));
    fails({ ...coveredRow(), recipe: null, proof: { ...coveredRow().proof, selects: 'recipe' } }, /runs only entries with a recipe, and a has none/);
    assert.deepEqual(validateMatrix({ rows: [{ ...coveredRow(), recipe: null }] }, { root }), [], 'a plain template on a loop that runs every entry holds');
    put('lib/items.json', JSON.stringify([{ slug: 'a', recipe: 'quiz' }]));
    put('e2e/a.spec.ts', "const items = read('lib/items.json');\n// imports and plays\ntest('something else', () => {});\n");
    fails(coveredRow(), /has no test titled with the case/);
    put('e2e/a.spec.ts', "const items = read('lib/items.json');\ntest(`${t.name} imports and plays`, () => {});\n");
    put('lib/items.json', JSON.stringify([]));
    fails(coveredRow(), /does not list a/);
    put('e2e/quarantine.json', JSON.stringify({ specs: { 'e2e/a.spec.ts': {} } }));
    fails(coveredRow(), /is quarantined/);
  } finally { done(); }
});

test('one inventory with two styles: a proof loop runs one style, and a template of the other fails it', () => {
  const { root, put, done } = fixture();
  try {
    put('lib/items.json', JSON.stringify([{ slug: 'a', recipe: 'quiz', style: 'navy' }]));
    const styled = (style) => ({ ...coveredRow(), proof: { ...coveredRow().proof, style } });
    // The proof spec reads the shared inventory but loops over studio only: a navy row fails.
    put('e2e/a.spec.ts', "const items = read('lib/items.json').filter((t) => t.style === 'studio');\ntest(`${t.name} imports and plays`, () => {});\n");
    assert.ok(validateMatrix({ rows: [styled('navy')] }, { root }).some((p) => /does not select the navy templates/.test(p)));
    put('e2e/a.spec.ts', "const items = read('lib/items.json').filter((t) => t.style === 'navy');\ntest(`${t.name} imports and plays`, () => {});\n");
    assert.deepEqual(validateMatrix({ rows: [styled('navy')] }, { root }), []);
    assert.ok(validateMatrix({ rows: [styled('studio')] }, { root }).some((p) => /runs the studio templates, and a is navy/.test(p)));
    assert.ok(validateMatrix({ rows: [coveredRow()] }, { root }).some((p) => /runs the \(unnamed\) templates/.test(p)), 'a styled inventory needs the proof to name its style');
  } finally { done(); }
});

test('built-in alternatives are the catalog designs of the row\'s type and the untyped designs mapped to it', () => {
  const designs = [
    { id: 'lt01', name: 'Typed', typeId: 'lower-third', category: 'lower-third' },
    { id: 'x1', name: 'Other type', typeId: 'ticker', category: 'lower-third' },
    { id: 'u1', name: 'By category', typeId: null, category: 'lower-third' },
    { id: 'u2', name: 'By variant', typeId: null, category: 'infographic' },
    { id: 'u3', name: 'Moved away', typeId: null, category: 'lower-third' },
    { id: 'cr01', name: 'Roll', typeId: null, category: 'end-credits' },
  ];
  const looks = { categories: { 'lower-third': 'lower-third' }, variants: { u2: { row: 'lower-third', capability: 'x' }, u3: { row: 'ticker', capability: 'x' } } };
  assert.deepEqual(builtInsFor({ id: 'lower-third', kind: 'type' }, designs, looks), ['Typed', 'By category', 'By variant']);
  assert.deepEqual(builtInsFor({ id: 'end-credits-scroll', kind: 'untyped', variants: ['cr01'] }, designs, looks), ['Roll']);
  assert.deepEqual(builtInsFor({ id: 'quiz', kind: 'recipe' }, designs, looks), []);
  // Regeneration writes them from the catalog, replacing what the committed row said.
  const registry = { rows: [{ id: 'lower-third', kind: 'type', source: ['s.ts'] }], designs };
  const committed = { looks, rows: [{ id: 'lower-third', kind: 'type', source: ['s.ts'], builtIns: ['Stale'], status: 'planned' }] };
  assert.deepEqual(generateMatrix(registry, committed).rows[0].builtIns, ['Typed', 'By category', 'By variant']);
});

test('a planned row names its mechanism, proof and phase; complete mode refuses it', () => {
  const { root, done } = fixture();
  try {
    assert.ok(validateMatrix({ rows: [plannedRow({ phase: null })] }, { root }).some((p) => /names the phase/.test(p)));
    assert.ok(validateMatrix({ rows: [plannedRow({ mechanism: 'unassigned' })] }, { root }).some((p) => /assign its mechanism/.test(p)));
    assert.ok(validateMatrix({ rows: [plannedRow({ proof: {} })] }, { root }).some((p) => /observable proof/.test(p)));
    assert.ok(validateMatrix({ rows: [plannedRow()] }, { root, complete: true }).some((p) => /complete coverage is required/.test(p)));
  } finally { done(); }
});

test('a new registry id gets a row only by regeneration, and stays failing until it is assigned', () => {
  const { root, done } = fixture();
  try {
    const committed = { rows: [coveredRow()] };
    const registry = { rows: [{ id: 'a', kind: 'type', source: ['src/types/a.ts'] }, { id: 'new', kind: 'type', source: ['src/types/a.ts'] }] };
    const generated = generateMatrix(registry, committed);
    assert.deepEqual(staleRows(committed, generated), ['type new: registered with no row - run node scripts/template-coverage.mjs --write, then assign it']);
    assert.deepEqual(generated.rows[0], coveredRow(), 'regeneration keeps an assigned row');
    assert.deepEqual(generated.coveredFloor, ['type:a']);
    assert.ok(validateMatrix(generated, { root }).some((p) => /type new: assign its mechanism/.test(p)));
    const gone = generateMatrix({ rows: [] }, committed);
    assert.deepEqual(staleRows(committed, gone), ['type a: no longer registered - run node scripts/template-coverage.mjs --write']);
  } finally { done(); }
});

test('coverage never goes back: a covered row stays on the floor, and turning it to planned fails', () => {
  const { root, done } = fixture();
  try {
    const registry = { rows: [{ id: 'a', kind: 'type', source: ['src/types/a.ts'] }] };
    const covered = generateMatrix(registry, { rows: [coveredRow()] });
    assert.deepEqual(covered.coveredFloor, ['type:a']);
    const demoted = generateMatrix(registry, { ...covered, rows: [{ ...plannedRow(), id: 'a' }] });
    assert.deepEqual(demoted.coveredFloor, ['type:a'], 'regeneration keeps the floor');
    assert.deepEqual(validateMatrix(demoted, { root }), ['type a: was covered and is now planned - coverage never goes back']);
    const handEdited = { ...covered, coveredFloor: [] };
    assert.ok(staleRows(handEdited, generateMatrix(registry, handEdited)).some((p) => /out of date/.test(p)), 'a floor emptied by hand is out of date');
  } finally { done(); }
});

test('a row covered on origin/main and planned here fails, even with its floor entry removed', () => {
  const base = { rows: [coveredRow(), plannedRow()] };
  const now = { coveredFloor: [], rows: [{ ...coveredRow(), status: 'planned', phase: 'TL4' }, plannedRow()] };
  assert.deepEqual(lostSince(base, now), ['type a: covered on origin/main and planned here - coverage never goes back']);
  assert.deepEqual(lostSince(null, now), []);
});

test('an open extension on a covered row names its phase and proof, and complete mode refuses it', () => {
  const { root, done } = fixture();
  try {
    const open = { phase: 'TL5', observes: 'focus plays' };
    assert.deepEqual(validateMatrix({ rows: [{ ...coveredRow(), extensions: [open] }] }, { root }), []);
    assert.ok(validateMatrix({ rows: [{ ...coveredRow(), extensions: [{ observes: 'x' }] }] }, { root }).some((p) => /open extension names its phase/.test(p)));
    assert.ok(validateMatrix({ rows: [{ ...coveredRow(), extensions: [open] }] }, { root, complete: true }).some((p) => /open extension \(focus plays\)/.test(p)));
  } finally { done(); }
});

test('every untyped design maps to a row, once, by row, variant or category', () => {
  const { root, done } = fixture();
  try {
    const rows = [{ ...plannedRow(), variants: ['cr01'] }];
    const matrix = { looks: { categories: { infographic: 'b' }, variants: { lt62: { row: 'b', capability: 'weather' } }, excluded: { 'imported-design': 'the door' } }, rows };
    const looks = [{ id: 'cr01', category: 'end-credits' }, { id: 'ig01', category: 'infographic' }, { id: 'lt62', category: 'lower-third' }, { id: 'svg01', category: 'imported-design' }];
    assert.deepEqual(validateMatrix(matrix, { root, untypedLooks: looks }), []);
    assert.deepEqual(validateMatrix(matrix, { root, untypedLooks: [...looks, { id: 'cr99', category: 'end-credits' }] }),
      ['untyped design cr99 (end-credits) maps to no row: list it on a row, in looks.variants, or map its category']);
    assert.ok(validateMatrix(matrix, { root, untypedLooks: looks.slice(1) }).some((p) => /cr01 is listed but the catalog holds no untyped design/.test(p)));
  } finally { done(); }
});

test('the committed matrix matches the registries and every covered row holds', { timeout: 120_000 }, async () => {
  const committed = loadMatrix();
  const registry = await loadRegistries();
  const generated = generateMatrix(registry, committed);
  assert.deepEqual(staleRows(committed, generated), []);
  assert.equal(formatMatrix(committed), formatMatrix(generated));
  const { rows, covered, planned } = summary(committed);
  measured(rows, 'coverage rows');
  measured(registry.untypedLooks.length, 'untyped catalog designs mapped to a row');
  assert.deepEqual(validateMatrix(committed, { untypedLooks: registry.untypedLooks, complete: true }), []);
  // Against the landed matrix, where this checkout has it (a shallow CI checkout may not).
  const landed = spawnSync('git', ['show', `origin/main:${MATRIX_FILE}`], { encoding: 'utf8', windowsHide: true });
  if (landed.status === 0) assert.deepEqual(lostSince(JSON.parse(landed.stdout), committed), []);
  // D9 scope: 72 types are the registry's, so only the fixed kinds are counted here.
  assert.equal(committed.rows.filter((row) => row.kind === 'untyped').length, 8);
  assert.equal(committed.rows.filter((row) => row.kind === 'contract').length, 4);
  assert.ok(covered > 0 && covered + planned === rows);
});
