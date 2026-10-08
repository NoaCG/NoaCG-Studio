// The nightly's shard plan: earlier nightlies weigh the packing ahead of the durations table, a
// file a night did not finish is left to the other nights rather than weighed by its partial
// minutes, and the runner count grows with the suite instead of letting a shard overrun.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NIGHTLY_MAX_SHARDS, NIGHTLY_PLAN_LINE_MINUTES, nightlyMinutes, planNightly } from './nightly-shards.mjs';

const done = (ms) => ({ status: 'expected', expectedStatus: 'passed', results: [{ duration: ms }] });
const unreached = { status: 'skipped', expectedStatus: 'passed', results: [] };
const night = (files) => ({
  suites: Object.entries(files).map(([file, tests]) => ({ file, specs: tests.map((x) => ({ ok: true, tests: [x] })) })),
});
const min = (m) => done(m * 60_000);

test('a file weighs the slowest of the newest three nights that finished it', () => {
  const nights = [
    night({ 'a.spec.ts': [min(1)], 'b.spec.ts': [min(1), unreached] }),
    night({ 'a.spec.ts': [min(2)], 'b.spec.ts': [min(3)], 'c.spec.ts': [min(2)] }),
    night({ 'a.spec.ts': [min(1.5)], 'b.spec.ts': [min(2)] }),
    // A fourth night is past the window for a and c, and the third finished b for it.
    night({ 'a.spec.ts': [min(9)], 'b.spec.ts': [min(4)], 'c.spec.ts': [min(9)] }),
  ];
  assert.deepEqual(nightlyMinutes(nights), { 'a.spec.ts': 2, 'b.spec.ts': 4, 'c.spec.ts': 9 });
});

test('the plan covers every spec exactly once and weighs nightly minutes over the table', () => {
  const suite = ['heavy.spec.ts', 'x.spec.ts', 'y.spec.ts', 'z.spec.ts'];
  // The table thinks heavy is light; last night measured it at ten minutes.
  const table = { minutes: { 'heavy.spec.ts': 0.5, 'x.spec.ts': 3, 'y.spec.ts': 3, 'z.spec.ts': 3 }, overhead: { jobMinutes: 0, testFactor: 1 } };
  const reports = [night({ 'heavy.spec.ts': [min(10)] })];
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

test('the runner count grows until every shard is planned under the line', () => {
  // 160 minutes of tests, as the suite measured on 2026-10-08: eight runners would plan each at 20.
  const minutes = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${String(i).padStart(2, '0')}.spec.ts`, 2]));
  const suite = Object.keys(minutes);
  const plan = planNightly({ suite, table: { minutes, overhead: { jobMinutes: 0.4, testFactor: 1.01 } } });
  assert.ok(plan.shardSpecs.length > 8, `asked for ${plan.shardSpecs.length} runners`);
  assert.ok(Math.max(...plan.predicted) <= NIGHTLY_PLAN_LINE_MINUTES, `worst shard planned at ${Math.max(...plan.predicted)}`);
  // And no more than it needs: one runner fewer would put a shard over the line.
  const fewer = planNightly({ suite, table: { minutes, overhead: { jobMinutes: 0.4, testFactor: 1.01 } }, shards: plan.shardSpecs.length - 1 });
  assert.ok(Math.max(...fewer.predicted) > NIGHTLY_PLAN_LINE_MINUTES);
  assert.deepEqual(plan.shardSpecs.flat().sort(), suite);
});

test('a small suite asks for few runners, and a huge one stops at the ceiling', () => {
  const small = planNightly({ suite: ['a.spec.ts', 'b.spec.ts'], table: { minutes: { 'a.spec.ts': 1, 'b.spec.ts': 1 } } });
  assert.equal(small.shardSpecs.length, 1);
  const minutes = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`s${i}.spec.ts`, 2]));
  const huge = planNightly({ suite: Object.keys(minutes), table: { minutes } });
  assert.equal(huge.shardSpecs.length, NIGHTLY_MAX_SHARDS);
});
