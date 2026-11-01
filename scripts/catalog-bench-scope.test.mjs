// The calibration bench's scope guard, one test per rule (S1 to S12 in
// docs/work-specs/cicd-improvement/evidence/phase-ci12.md). Each test starts from an honest report
// that passes and makes the one mutation its rule names.
// guards: e2e/catalog/_bench-scope.mjs, e2e/catalog/catalog-bench.spec.ts, scripts/catalog-specs.mjs, playwright.catalog.config.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import BenchScopeGuard, {
  BENCH_CATEGORIES,
  BENCH_SLICES,
  BENCH_SPEC,
  NOT_BENCHED,
  REPORT,
  benchScopeProblems,
  scopeFromEnv,
} from '../e2e/catalog/_bench-scope.mjs';

// A small catalog: lower-third in two slices (lt01 and lt03 in slice 1, lt02 in slice 2), one
// whole category, and one the bench declares it does not bench.
const manifest = { categories: ['lower-third', 'ticker'], slices: { 'lower-third': 2 }, notBenched: { 'imported-design': 'a reason' } };
const catalog = [
  { id: 'lt01', category: 'lower-third' },
  { id: 'lt02', category: 'lower-third' },
  { id: 'lt03', category: 'lower-third' },
  { id: 'tk01', category: 'ticker' },
  { id: 'imp01', category: 'imported-design' },
];
const ok = (...ids) => ids.map((id) => ({ id, ok: true }));
const unit = (category, slice, slices, report, status = 'passed') => ({ category, slice, slices, status, report });
// Every planned unit, as the honest full run reports it.
const fullUnits = () => [unit('lower-third', 0, 2, ok('lt01', 'lt03')), unit('lower-third', 1, 2, ok('lt02')), unit('ticker', 0, 1, ok('tk01'))];
// A scoped run of lt01: ticker skips as out of scope, lower-third slice 2 measures nothing.
const scopedUnits = () => [unit('lower-third', 0, 2, ok('lt01')), unit('lower-third', 1, 2, []), unit('ticker', 0, 1, null, 'skipped')];
const scope = (designs, categories) => ({ designs, categories });
const judge = (over = {}) =>
  benchScopeProblems({ catalog, manifest, scope: scope(['lt01'], ['lower-third']), units: scopedUnits(), ...over });

test('Rule S1: a selected id the catalog does not ship fails', () => {
  const { problems } = judge({ scope: scope(['lt01', 'zz09'], ['lower-third']) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not ship: zz09/);
});

test('Rule S2: an empty overall selection, or a category filter without designs, fails', () => {
  const empty = judge({ scope: scope([], null), units: [] });
  assert.ok(empty.problems.some((p) => /names no design/.test(p)), empty.problems.join('\n'));
  const categoryOnly = judge({ scope: scope(null, ['ticker']), units: fullUnits() });
  assert.deepEqual(categoryOnly.problems.length, 1);
  assert.match(categoryOnly.problems[0], /without NOACG_ONLY_DESIGNS/);
  // As read from the environment: present but empty is [], absent is null.
  assert.deepEqual(scopeFromEnv({ NOACG_ONLY_DESIGNS: ' , ' }), { designs: [], categories: null });
  assert.deepEqual(scopeFromEnv({}), { designs: null, categories: null });
});

test('Rule S3: a category list that leaves out, or adds, a category fails', () => {
  const missing = judge({ scope: scope(['lt01', 'tk01'], ['lower-third']), units: [...scopedUnits().slice(0, 2), unit('ticker', 0, 1, ok('tk01'))] });
  assert.equal(missing.problems.length, 1);
  assert.match(missing.problems[0], /leaves out ticker/);
  const extra = judge({ scope: scope(['lt01'], ['lower-third', 'ticker']), units: [...scopedUnits().slice(0, 2), unit('ticker', 0, 1, [])] });
  assert.equal(extra.problems.length, 1);
  assert.match(extra.problems[0], /names ticker, where no selected design lives/);
});

test('Rule S4: a catalog category neither benched nor declared fails, scoped or full', () => {
  const withNew = [...catalog, { id: 'nw01', category: 'new-category' }];
  const scoped = judge({ catalog: withNew, scope: scope(['lt01', 'nw01'], ['lower-third', 'new-category']) });
  assert.equal(scoped.problems.length, 1);
  assert.match(scoped.problems[0], /neither benched nor declared not benched: new-category/);
  const full = benchScopeProblems({ catalog: withNew, manifest, scope: scope(null, null), units: fullUnits() });
  assert.equal(full.problems.length, 1);
  assert.match(full.problems[0], /new-category/);
});

test('Rule S5: a unit not run, skipped, cut short, without a report or with another slice count fails', () => {
  const cases = [
    ['absent', [scopedUnits()[0]], /"lower-third slice 2 of 2" was not run/],
    ['skipped', [scopedUnits()[0], unit('lower-third', 1, 2, null, 'skipped')], /ended skipped/],
    ['interrupted', [scopedUnits()[0], unit('lower-third', 1, 2, [], 'interrupted')], /ended interrupted/],
    ['no report', [scopedUnits()[0], unit('lower-third', 1, 2, null)], /attached no report/],
    ['slice count', [scopedUnits()[0], unit('lower-third', 1, 3, [])], /reported 3 slice\(s\) where the manifest has 2/],
    ['twice', [...scopedUnits(), unit('lower-third', 1, 2, [])], /ran 2 times/],
  ];
  for (const [name, units, pattern] of cases) {
    const { problems } = judge({ units });
    assert.equal(problems.length, 1, `${name}: ${problems.join('\n')}`);
    assert.match(problems[0], pattern, name);
  }
});

test('Rule S6: an expected design no unit measured, or two units measured, fails', () => {
  const omitted = benchScopeProblems({ catalog, manifest, scope: scope(null, null), units: [unit('lower-third', 0, 2, ok('lt01')), unit('lower-third', 1, 2, ok('lt02')), unit('ticker', 0, 1, ok('tk01'))] });
  assert.equal(omitted.problems.length, 1);
  assert.match(omitted.problems[0], /never measured: lt03/);
  const twice = judge({ units: [unit('lower-third', 0, 2, ok('lt01')), unit('lower-third', 1, 2, ok('lt01'))] });
  assert.equal(twice.problems.length, 1);
  assert.match(twice.problems[0], /more than one unit: lt01/);
});

test('Rule S7: a measured design that was not selected fails', () => {
  const { problems } = judge({ units: [unit('lower-third', 0, 2, ok('lt01', 'lt03')), unit('lower-third', 1, 2, [])] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not selected: lt03/);
});

test('Rule S8: an empty slice passes only when the complete selected manifest ran', () => {
  const honest = judge();
  assert.deepEqual(honest.problems, []);
  assert.deepEqual(honest.summary.emptyUnits, ['lower-third slice 2 of 2']);
  // The same empty slice, but the slice that holds lt01 measured nothing too.
  const incomplete = judge({ units: [unit('lower-third', 0, 2, []), unit('lower-third', 1, 2, [])] });
  assert.equal(incomplete.problems.length, 1);
  assert.match(incomplete.problems[0], /never measured: lt01/);
});

test('Rule S9: a declared not-benched design is named, never counted, and alone passes only on the declaration', () => {
  const mixed = judge({ scope: scope(['lt01', 'imp01'], ['lower-third', 'imported-design']) });
  assert.deepEqual(mixed.problems, []);
  assert.deepEqual(mixed.summary.notBenched, [{ id: 'imp01', reason: 'a reason' }]);
  assert.equal(mixed.summary.measured, 1);
  assert.equal(mixed.summary.expected, 1);
  const allSkipped = [unit('lower-third', 0, 2, null, 'skipped'), unit('lower-third', 1, 2, null, 'skipped'), unit('ticker', 0, 1, null, 'skipped')];
  const alone = judge({ scope: scope(['imp01'], ['imported-design']), units: allSkipped });
  assert.deepEqual(alone.problems, []);
  assert.equal(alone.summary.measured, 0);
  assert.deepEqual(alone.summary.notBenched.map((d) => d.id), ['imp01']);
  // Undeclare it and the same run fails (S4): the declaration is what lets it pass.
  const undeclared = judge({ manifest: { ...manifest, notBenched: {} }, scope: scope(['imp01'], ['imported-design']), units: allSkipped });
  assert.equal(undeclared.problems.length, 1);
  assert.match(undeclared.problems[0], /imported-design/);
});

// A planned bench test as the reporter sees it.
const planned = (category, slice, slices) => ({
  location: { file: `/repo/e2e/catalog/${BENCH_SPEC}` },
  annotations: [{ type: REPORT, description: JSON.stringify({ category, slice, slices }) }],
});
const ran = (status, report) => ({ status, attachments: report === undefined ? [] : [{ name: REPORT, body: Buffer.from(JSON.stringify(report)) }] });
async function runGuard({ env, results, readCatalog = async () => catalog, extraTests = [] }) {
  const lines = [];
  const writes = [];
  const guard = new BenchScopeGuard({ env, readCatalog, log: (l) => lines.push(l), write: (p, t) => writes.push([p, t]) });
  const tests = results.map(([t]) => t);
  guard.onBegin({}, { allTests: () => [...tests, ...extraTests] });
  for (const [t, r] of results) if (r) guard.onTestEnd(t, r);
  return { out: await guard.onEnd({ status: 'passed' }), lines, writes };
}

test('Rule S10: a catalog the guard cannot read fails the run', async () => {
  const results = [[planned('ticker', 0, 1), ran('passed', ok('tk01'))]];
  const thrown = await runGuard({ env: {}, results, readCatalog: async () => { throw new Error('no browser'); } });
  assert.deepEqual(thrown.out, { status: 'failed' });
  assert.match(thrown.lines.join('\n'), /could not read the catalog/);
  const empty = await runGuard({ env: {}, results, readCatalog: async () => [] });
  assert.deepEqual(empty.out, { status: 'failed' });
});

test('Rule S11: the honest report passes, scoped and full, with its counts', async () => {
  const full = benchScopeProblems({ catalog, manifest, scope: scope(null, null), units: fullUnits() });
  assert.deepEqual(full.problems, []);
  assert.deepEqual(
    { mode: full.summary.mode, selected: full.summary.selected, expected: full.summary.expected, measured: full.summary.measured },
    { mode: 'full', selected: 5, expected: 4, measured: 4 },
  );
  assert.deepEqual(full.summary.notBenched, [{ id: 'imp01', reason: 'a reason' }]);
  const scoped = judge();
  assert.deepEqual(scoped.problems, []);
  assert.equal(scoped.summary.mode, 'scoped');
  // Through the reporter, with the real manifest: a scoped run of one ticker passes and writes
  // its summary where NOACG_CATALOG_BENCH_REPORT asks.
  const tickers = [{ id: 'tk01', category: 'ticker' }];
  const results = BENCH_CATEGORIES.flatMap((c) =>
    Array.from({ length: BENCH_SLICES[c] ?? 1 }, (_, s) => [planned(c, s, BENCH_SLICES[c] ?? 1), c === 'ticker' ? ran('passed', ok('tk01')) : ran('skipped')]),
  );
  const env = { NOACG_ONLY_DESIGNS: 'tk01', NOACG_ONLY_CATEGORIES: 'ticker', NOACG_CATALOG_BENCH_REPORT: '/tmp/out.json' };
  const { out, lines, writes } = await runGuard({ env, results, readCatalog: async () => tickers });
  assert.equal(out, undefined, lines.join('\n'));
  assert.match(lines[0], /measured 1 of 1 expected design/);
  assert.equal(writes[0][0], '/tmp/out.json');
  assert.deepEqual(JSON.parse(writes[0][1]).results, { tk01: true });
  // The real manifest accounts for imported-design (#1926) and keeps every slice budget benched.
  assert.ok('imported-design' in NOT_BENCHED);
  for (const c of Object.keys(BENCH_SLICES)) assert.ok(BENCH_CATEGORIES.includes(c), c);
});

test('Rule S12: the guard judges every run that plans a bench unit, and only those', async () => {
  // A bench unit planned and filtered short: the reporter fails a run that would have passed.
  const results = [[planned('ticker', 0, 1), ran('skipped')]];
  const failed = await runGuard({ env: {}, results, readCatalog: async () => [{ id: 'tk01', category: 'ticker' }] });
  assert.deepEqual(failed.out, { status: 'failed' });
  assert.match(failed.lines.join('\n'), /NOT COMPLETE EVIDENCE/);
  // No bench unit planned (another catalog spec alone): not judged, the catalog not even read.
  let read = false;
  const other = await runGuard({ env: {}, results: [], extraTests: [{ location: { file: '/repo/e2e/catalog/ograf-parity.spec.ts' }, annotations: [] }], readCatalog: async () => { read = true; return catalog; } });
  assert.equal(other.out, undefined);
  assert.equal(read, false);
  // The scoped door refuses a --reporter that would replace the guard, before anything starts.
  const script = fileURLToPath(new URL('./catalog-specs.mjs', import.meta.url));
  for (const flag of [['--reporter', 'dot'], ['--reporter=dot']]) {
    const run = spawnSync(process.execPath, [script, ...flag], { encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /would replace the catalog scope guard/);
  }
});
