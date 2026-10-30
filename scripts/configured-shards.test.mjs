// The configured suite's shard plan: every spec on exactly one runner, the heavy live-behaviour
// files spread rather than stacked, a file that always fails still weighed, and no history at all
// split by file count rather than onto one runner.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIGURED_SHARDS, configuredMinutes, configuredSpecFiles, planConfigured } from './configured-shards.mjs';

const done = (m) => ({ status: 'expected', expectedStatus: 'passed', results: [{ duration: m * 60_000 }] });
const failed = (m) => ({ status: 'unexpected', expectedStatus: 'passed', results: [{ duration: m * 60_000 }] });
const unreached = { status: 'skipped', expectedStatus: 'passed', results: [] };
const run = (files) => ({
  suites: Object.entries(files).map(([file, tests]) => ({
    file,
    specs: tests.map((t) => ({ ok: t.status !== 'unexpected', tests: [t] })),
  })),
});

test('every configured spec on disk lands on exactly one of the four runners', () => {
  const suite = configuredSpecFiles();
  assert.ok(suite.length > 0);
  const plan = planConfigured({ suite });
  assert.equal(plan.shardSpecs.length, CONFIGURED_SHARDS);
  assert.deepEqual(plan.shardSpecs.flat().sort(), suite);
  assert.deepEqual(plan.matrix, { shardIndex: [1, 2, 3, 4], shardTotal: [4] });
});

test('the long live-behaviour files are spread across runners, not stacked in file order', () => {
  const suite = ['a-live.spec.ts', 'b-live.spec.ts', 'c-live.spec.ts', 'd-live.spec.ts', ...'efghijkl'.split('').map((c) => `${c}.spec.ts`)];
  const minutes = Object.fromEntries(suite.map((f) => [f, [done(f.includes('live') ? 1.5 : 0.2)]]));
  const plan = planConfigured({ suite, reports: [run(minutes)] });
  for (const bin of plan.shardSpecs) assert.equal(bin.filter((f) => f.includes('live')).length, 1, JSON.stringify(plan.shardSpecs));
});

test('a file that failed in every report keeps its finished minutes; an unfinished one does not', () => {
  const reports = [
    run({ 'quarantined.spec.ts': [failed(2)], 'cut.spec.ts': [done(0.1), unreached], 'clean.spec.ts': [done(0.5)] }),
    run({ 'quarantined.spec.ts': [failed(1.8)], 'clean.spec.ts': [done(0.7)] }),
  ];
  assert.deepEqual(configuredMinutes(reports), { 'quarantined.spec.ts': 2, 'clean.spec.ts': 0.7 });
});

test('with no earlier report the split is by file count', () => {
  const suite = Array.from({ length: 9 }, (_, i) => `s${i}.spec.ts`);
  const plan = planConfigured({ suite });
  assert.deepEqual(plan.shardSpecs.map((b) => b.length).sort(), [2, 2, 2, 3]);
});
