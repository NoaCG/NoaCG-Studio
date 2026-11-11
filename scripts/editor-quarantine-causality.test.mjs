import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { drivesBrowser, watchedForBrowser } from './jobs-store.mjs';
import { actionShell, batch, validateReport, observeQueueFile, scheduledInvocations } from './editor-quarantine-causality.mjs';

const report = () => ({ config: { workers: 1 }, stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ specs: [0, 1].map(i => ({ title: `case${i}`, tests: [{ projectName: 'chromium', results: [{ status: 'passed', retry: 0 }] }] })) }] });
const done = { state: 'done', exitCode: 0 };
test('batch partition measures every pair exactly once for each spec', () => {
  for (const kind of ['clock', 'operator']) {
    const pairs = [];
    for (let i = 1; i <= (kind === 'clock' ? 12 : 4); i++) {
      const b = batch(`codex/editor-causality-20261111-${kind}-${String(i).padStart(2, '0')}`);
      pairs.push(...Array.from({ length: b.size }, (_, j) => b.start + j + 1));
    }
    assert.deepEqual(pairs, Array.from({ length: 60 }, (_, i) => i + 1));
  }
  for (const ref of ['main', 'codex/editor-causality-20261111-clock-00', 'codex/editor-causality-20261111-clock-13', 'codex/editor-causality-20261111-operator-05']) assert.throws(() => batch(ref));
});
test('measurement retains a valid first-attempt failure as data', () => {
  assert.equal(validateReport(report(), 2, done).failed, false);
  const r = report();r.stats.expected = 1;r.stats.unexpected = 1;
  r.suites[0].specs[1].tests[0].results[0].status = 'failed';
  assert.equal(validateReport(r, 2, { state: 'failed', exitCode: 1 }).failed, true);
});
test('incomplete, retried, skipped, extra-worker and inconsistent measurements are refused', () => {
  const mutations = [
    r => { r.config.workers = 2; }, r => { r.stats.skipped = 1; }, r => { r.stats.flaky = 1; },
    r => { r.suites[0].specs.pop(); }, r => { r.stats.expected = 1; },
    r => { r.errors = [{ message: 'worker died' }]; },
    r => { r.suites[0].specs[0].tests[0].results[0].retry = 1; },
    r => { r.suites[0].specs[0].tests[0].results[0].status = 'interrupted'; },
    r => { r.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1 }); },
  ];
  for (const mutate of mutations) { const r = report(); mutate(r); assert.throws(() => validateReport(r, 2, done)); }
  assert.throws(() => validateReport(report(), 2, { state: 'running', exitCode: 0 }));
  assert.throws(() => validateReport(report(), 2, { state: 'failed', exitCode: 1 }));
});
test('original composite shell is extracted whole, including each schema and auth guard', () => {
  const action = readFileSync(new URL('../.github/actions/configured-stack/action.yml', import.meta.url), 'utf8');
  const schema = actionShell(action, 'Assert the schema, its grants, and the realtime publication');
  assert(schema.includes('supabase_migrations.schema_migrations'));
  assert(schema.includes('pg_default_acl'));
  assert(schema.includes('has_table_privilege'));
  assert(schema.includes('pg_publication_tables'));
  const auth = actionShell(action, 'Create the test account and prove it can sign in');
  assert(auth.includes('Test account authenticates.'));
  assert(auth.includes('Teammate account authenticates.'));
  assert(!schema.includes('Create the test account'));
  assert.throws(() => actionShell(action, 'nonexistent'));
});

test('diagnostic queue admission owns the browser slot before any process starts', () => {
  const source = readFileSync(new URL('./editor-quarantine-causality.mjs', import.meta.url), 'utf8');
  assert(source.includes("command, '--kind', 'sweep', '--cap', '5'"));
  const job = { command: "env 'PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/report.json' npm run test:e2e -- e2e/output-debate-clock.spec.ts --workers=1 --retries=0", kind: 'sweep', state: 'running', pid: 100 };
  assert.equal(drivesBrowser(job), true);
  assert.equal(watchedForBrowser(job), false);
});

test('operator extension has exactly four bounded additional sixty-pair cohorts', () => {
  const identities = new Set();
  for (let cohort = 2; cohort <= 5; cohort++) {
    for (let index = 1; index <= 4; index++) {
      const b = batch(`codex/editor-causality-20261111-operator-c${cohort}-${String(index).padStart(2, '0')}`);
      assert.equal(b.cohort, cohort);
      for (let pair = b.start + 1; pair <= b.start + b.size; pair++) identities.add(`${cohort}:${pair}`);
    }
  }
  assert.equal(identities.size, 240);
  assert.equal(batch('codex/editor-causality-20261111-operator-01').cohort, 1);
  for (const ref of ['operator-c1-01', 'operator-c6-01', 'operator-c2-00', 'operator-c2-05', 'clock-c2-01']) {
    assert.throws(() => batch(`codex/editor-causality-20261111-${ref}`));
  }
});

test('a partial live queue observation preserves the same job and later observes its failure', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'causal-queue-'));
  const file = path.join(directory, 'j-0001.json'), previous = { id: 'j-0001', state: 'running' }, faults = [];
  try {
    writeFileSync(file, '');
    assert.equal(observeQueueFile(file, previous, f => faults.push(f)), previous);
    assert.equal(faults.length, 1);
    writeFileSync(file, JSON.stringify({ id: 'j-0001', state: 'failed', exitCode: 1 }));
    assert.deepEqual(observeQueueFile(file, previous, f => faults.push(f)), { id: 'j-0001', state: 'failed', exitCode: 1 });
    writeFileSync(file, '{');
    assert.equal(observeQueueFile(file, undefined, f => faults.push(f)), undefined);
    assert.throws(() => observeQueueFile(path.join(directory, 'missing'), previous, () => {}), { code: 'ENOENT' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('completion keeps five matched units and one separately identified parent observation', () => {
  const selection = batch('codex/editor-causality-20261111-operator-c4-03-completion-01');
  const rows = scheduledInvocations(selection);
  assert.equal(selection.completion, 'completion-01');
  assert.equal(rows.length, 11);
  assert.equal(rows.filter(r => r.arm === 'parent').length, 6);
  assert.equal(rows.filter(r => r.arm === 'landing').length, 5);
  for (let pair = 41; pair <= 45; pair++) assert.deepEqual(rows.filter(r => r.pair === pair).map(r => r.arm).sort(), ['landing', 'parent']);
  assert.deepEqual(rows.filter(r => r.pair === 46), [{ pair: 46, arm: 'parent' }]);
  for (const ref of ['operator-c4-02-completion-01', 'operator-c4-03-completion-02', 'operator-c3-03-completion-01']) assert.throws(() => batch(`codex/editor-causality-20261111-${ref}`));
});
