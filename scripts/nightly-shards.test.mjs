// The nightly's shard plan: earlier nightlies weigh the packing ahead of the durations table, and a
// file a night did not finish is left to an older night rather than weighed by its partial minutes.
import assert from 'node:assert/strict';
import test from 'node:test';

import { nightlyMinutes, planNightly } from './nightly-shards.mjs';

const done = (ms) => ({ status: 'expected', expectedStatus: 'passed', results: [{ duration: ms }] });
const unreached = { status: 'skipped', expectedStatus: 'passed', results: [] };
const night = (files) => ({
  suites: Object.entries(files).map(([file, tests]) => ({ file, specs: tests.map((x) => ({ ok: true, tests: [x] })) })),
});

test('the newest night that finished a file wins, and a file it did not finish falls to an older night', () => {
  const newest = night({ 'a.spec.ts': [done(60_000)], 'b.spec.ts': [done(60_000), unreached] });
  const older = night({ 'a.spec.ts': [done(600_000)], 'b.spec.ts': [done(180_000)], 'c.spec.ts': [done(120_000)] });
  assert.deepEqual(nightlyMinutes([newest, older]), { 'a.spec.ts': 1, 'b.spec.ts': 3, 'c.spec.ts': 2 });
});

test('the plan covers every spec exactly once and weighs nightly minutes over the table', () => {
  const suite = ['heavy.spec.ts', 'x.spec.ts', 'y.spec.ts', 'z.spec.ts'];
  // The table thinks heavy is light; last night measured it at ten minutes.
  const table = { minutes: { 'heavy.spec.ts': 0.5, 'x.spec.ts': 3, 'y.spec.ts': 3, 'z.spec.ts': 3 }, overhead: { jobMinutes: 0, testFactor: 1 } };
  const reports = [night({ 'heavy.spec.ts': [done(600_000)] })];
  const plan = planNightly({ suite, table, reports, shards: 2 });
  assert.deepEqual(plan.shardSpecs.flat().sort(), suite);
  // Weighed right, heavy runs alone and the three others share the second runner.
  assert.deepEqual(plan.shardSpecs, [['heavy.spec.ts'], ['x.spec.ts', 'y.spec.ts', 'z.spec.ts']]);
  assert.deepEqual(plan.predicted, [10, 9]);
  assert.deepEqual(plan.matrix, { shardIndex: [1, 2], shardTotal: [2] });
  assert.deepEqual(plan.weights, { nightly: 1, table: 3, median: 0 });
});

test('with no earlier night the table alone weighs it, and an unmeasured spec is still assigned', () => {
  const suite = ['a.spec.ts', 'new.spec.ts'];
  const plan = planNightly({ suite, table: { minutes: { 'a.spec.ts': 2 } }, reports: [], shards: 8 });
  assert.deepEqual(plan.shardSpecs.flat().sort(), suite);
  assert.equal(plan.shardSpecs.length, 2);
  assert.deepEqual(plan.weights, { nightly: 0, table: 1, median: 1 });
});
