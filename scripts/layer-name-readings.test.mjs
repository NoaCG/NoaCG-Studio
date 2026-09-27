// guards: src/templates/behaviours/naming.ts, src/templates/behaviours/words.json, docs/SVG_IMPORT_PLAN.md, scripts/fixtures/layer-name-readings.json
//
// A LAYER NAME SOMEBODY ALREADY USES NEVER CHANGES MEANING, AND THE LOOSER READING SAYS WHAT IT
// READS (docs/SVG_IMPORT_PLAN.md §2a).
//
// The importer finds a graphic's type from its layer names (src/templates/behaviours/naming.ts
// over words.json). On 2026-09-27 the reading was widened - joined names like `AnswerA`, and
// German and Spanish beside English, Finnish and Swedish - for a student whose file is not our
// sample. Widening a matcher is how a name that worked yesterday quietly starts meaning something
// else, so this file holds two things:
//
//   1. THE PIN. scripts/fixtures/layer-name-readings.json is every name the matcher read before
//      the widening (every taught name and synonym with its rows swapped, and every layer name in
//      the repository's SVGs) with what it read as in each type. Each keeps every reading it had;
//      it may only gain one in a type where it read nothing.
//   2. THE TABLE. The tolerance table in docs/SVG_IMPORT_PLAN.md §2a is read from the page and
//      every row is held to the matcher, so what the plan says is accepted is what is accepted,
//      including what was deliberately left out.
//
// Then the proposal itself on a few whole inventories: a German quiz, a joined-name quiz, a
// Spanish score board, and the same quiz with its containers named in four languages.
//
// No browser: the matcher is string work. What needs Chromium is whether the importer reads the
// names out of a real file, which e2e/import-svg-behaviour.spec.ts walks.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One TypeScript module of the app's graph, importable here. */
async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { matchRole, readableName, bestProposal } = await load(path.join(projectRoot, 'src/templates/behaviours/naming.ts'));
const { BEHAVIOUR_RECIPES } = await load(path.join(projectRoot, 'src/templates/behaviours/registry.ts'));

/** Every role a name matches in each type, as `role@row` (`:weak` where it is not evidence). */
function readings(name) {
  const out = {};
  for (const recipe of BEHAVIOUR_RECIPES) {
    const hits = [];
    for (const role of recipe.roles) {
      if (role.countdown) continue; // bound by kind, never by a name
      const m = matchRole(role, readableName(name, recipe.roles));
      if (m) hits.push(`${role.id}@${m.key}${m.weak ? ':weak' : ''}`);
    }
    if (hits.length > 0) out[recipe.id] = hits;
  }
  return out;
}

test('every name the importer read before still reads exactly as it did', () => {
  const pinned = JSON.parse(readFileSync(path.join(projectRoot, 'scripts/fixtures/layer-name-readings.json'), 'utf8'));
  delete pinned._;
  const names = Object.keys(pinned);
  assert.ok(names.length > 800, `the pin holds ${names.length} names; it was taken with 896`);
  const changed = [];
  for (const name of names) {
    const now = readings(name);
    for (const [recipe, before] of Object.entries(pinned[name])) {
      const after = now[recipe] ?? [];
      if (after.join(', ') !== before.join(', ')) changed.push(`"${name}" in ${recipe}: was ${before.join(', ')}, now ${after.join(', ') || 'nothing'}`);
    }
  }
  assert.deepEqual(changed, []);
});

/** The rows of the tolerance table in docs/SVG_IMPORT_PLAN.md §2a. */
function toleranceTable() {
  const page = readFileSync(path.join(projectRoot, 'docs/SVG_IMPORT_PLAN.md'), 'utf8');
  const block = /<!-- layer-name-tolerance:start[^>]*-->([\s\S]*?)<!-- layer-name-tolerance:end -->/.exec(page);
  assert.ok(block, 'docs/SVG_IMPORT_PLAN.md has lost its layer-name-tolerance table');
  // Every table line between the markers is a row to hold, bar the header and its rule: a row this
  // cannot read fails here rather than being skipped, so a mistyped row is never silently unchecked.
  return block[1]
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && !/^\|\s*Name\s*\|/.test(line.trim()) && !/^\|-/.test(line.trim()))
    .map((line) => {
      const [name, type, reads] = line.split('|').slice(1, 4).map((cell) => cell.trim());
      assert.match(name ?? '', /^`[^`]+`$/, `a tolerance row whose name is not one quoted name: ${line}`);
      assert.match(reads ?? '', /^(?:-|`[^`]+`(?:, `[^`]+`)*)$/, `a tolerance row whose Reads as is not - or quoted roles: ${line}`);
      const unquote = (cell) => cell.replace(/^`|`$/g, '');
      return { name: unquote(name), type, reads: reads === '-' ? '' : reads.split(',').map((r) => unquote(r.trim())).join(', ') };
    });
}

test('every row of the tolerance table is what the matcher reads', () => {
  const rows = toleranceTable();
  assert.ok(rows.length > 150, `the table has ${rows.length} rows`);
  const wrong = [];
  for (const row of rows) {
    const now = readings(row.name);
    if (row.type === 'every') {
      if (Object.keys(now).length > 0) wrong.push(`"${row.name}" should read as nothing anywhere, reads ${JSON.stringify(now)}`);
      continue;
    }
    assert.ok(BEHAVIOUR_RECIPES.some((r) => r.id === row.type), `the table names a type "${row.type}" that has no recipe`);
    const got = (now[row.type] ?? []).join(', ');
    if (got !== row.reads) wrong.push(`"${row.name}" in ${row.type}: the table says ${row.reads || '-'}, the matcher reads ${got || '-'}`);
  }
  assert.deepEqual(wrong, []);
});

test('the spelled-out retry is only for a name the recipe reads as nothing', () => {
  const vote = BEHAVIOUR_RECIPES.find((r) => r.id === 'vote');
  const percent = vote.roles.find((r) => r.id === 'percent');
  const total = vote.roles.find((r) => r.id === 'total');
  // Read as written, `TotalShare1` is the total; spelled out it would ALSO be row 1's share, and
  // one layer would then have two jobs. The strict reading wins and the retry is never made.
  const name = readableName('TotalShare1', vote.roles);
  assert.deepEqual(matchRole(total, name), { key: '', weak: false });
  assert.equal(matchRole(percent, name), null);
  // `matchRole` alone never retries: that is the reading the docs' own examples are checked
  // against (scripts/behaviour-docs.mjs), and it stays the strict one.
  const quiz = BEHAVIOUR_RECIPES.find((r) => r.id === 'quiz');
  const answer = quiz.roles.find((r) => r.id === 'answer');
  assert.equal(matchRole(answer, 'AnswerA'), null);
  assert.deepEqual(matchRole(answer, readableName('AnswerA', quiz.roles)), { key: 'A', weak: false });
});

// ── WHOLE INVENTORIES ──

const text = (label, extra = {}) => ({ label, numeric: false, clock: false, ...extra });
const group = (label, hidden = true) => ({ label, hidden });
/** The slice of an SvgImportResult the proposal reads, ids by position. */
const inventory = (candidates, groups = []) => ({
  candidates: candidates.map((c, i) => ({ id: `c${i}`, ...c })),
  groups: groups.map((g, i) => ({ id: `g${i}`, ...g })),
  shapes: [],
});

test('a quiz named in German is proposed as the quiz, with its three rows', () => {
  const p = bestProposal(
    inventory(
      [text('Frage'), text('Antwort A'), text('Antwort B'), text('Antwort C')],
      [group('Gewählt A'), group('Gewählt B'), group('Gewählt C'), group('Richtig A'), group('Falsch A'), group('Gesperrt')],
    ),
  );
  assert.equal(p?.recipe, 'quiz');
  assert.deepEqual(p.rows, ['A', 'B', 'C']);
  assert.ok(p.fields.question && p.layers.locked, 'the question and the locked moment are bound');
  assert.equal(Object.keys(p.layers['answer.selected']).length, 3);
});

test('a quiz whose names are joined is proposed exactly as the spaced one', () => {
  const build = (names) => bestProposal(inventory(names.slice(0, 3).map((n) => text(n)), names.slice(3).map((n) => group(n))));
  const spaced = build(['Question', 'Answer A', 'Answer B', 'Selected A', 'Selected B', 'Correct A', 'Correct B']);
  assert.equal(spaced?.recipe, 'quiz');
  assert.deepEqual(build(['Question', 'AnswerA', 'AnswerB', 'SelectedA', 'SelectedB', 'CorrectA', 'CorrectB']), spaced);
});

test('a Spanish score board is proposed as the score tracker', () => {
  const p = bestProposal(
    inventory(
      [text('Equipo 1'), text('Equipo 2'), text('Puntos 1', { numeric: true }), text('Puntos 2', { numeric: true })],
      [group('Gol 1'), group('Gol 2'), group('Fin del partido')],
    ),
  );
  assert.equal(p?.recipe, 'score');
  assert.deepEqual(p.rows, ['1', '2']);
  assert.equal(Object.keys(p.layers['team.flash']).length, 2, 'Gol N is the flash when it is a hidden group');
  assert.ok(p.layers.final);
});

test('the containers are read by nothing, in any language or case', () => {
  // The containers come after the moments, so the ids of everything bound stay put and the
  // proposals compare whole.
  const build = (containers) =>
    bestProposal(
      inventory(
        [text('Question'), text('Answer A'), text('Answer B')],
        [group('Selected A'), group('Selected B'), group('Locked in'), ...containers.map((c) => group(c, false))],
      ),
    );
  const reference = build(['Text', 'Moments', 'Board']);
  assert.equal(reference?.recipe, 'quiz');
  for (const containers of [
    ['TEXT', 'MOMENTS', 'BOARD'],
    ['text', 'moments', 'board'],
    ['Teksti', 'Hetket', 'Taulu'],
    ['Text', 'Ögonblick', 'Tavla'],
    ['Text', 'Momente', 'Tafel'],
    ['Texto', 'Momentos', 'Tablero'],
    [],
  ]) {
    assert.deepEqual(build(containers), reference,`containers ${containers.join('/') || '(none)'}`);
  }
});
