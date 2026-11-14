// The nightly's shard plan: earlier nightlies weigh the packing ahead of the durations table, a
// file a night did not finish is left to the other nights rather than weighed by its partial
// minutes, and the runner count grows with the suite instead of letting a shard overrun.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NIGHTLY_MAX_SHARDS, NIGHTLY_PLAN_LINE_MINUTES, nightlyMinutes, planNightly, suiteFor, devServerWeights } from './nightly-shards.mjs';

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
    // The window is per file, over the nights that FINISHED it: the fourth night is past a's three
    // and inside b's (the first did not finish b) and c's (only two nights measured c).
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
  const table = { minutes, overhead: { jobMinutes: 0.4, testFactor: 1.01 } };
  const plan = planNightly({ suite, table });
  assert.ok(plan.shardSpecs.length > 8, `asked for ${plan.shardSpecs.length} runners`);
  assert.ok(plan.fits && Math.max(...plan.predicted) <= NIGHTLY_PLAN_LINE_MINUTES, `worst shard planned at ${Math.max(...plan.predicted)}`);
  // And no more than it needs: one runner fewer would put a shard over the line.
  const fewer = planNightly({ suite, table, shards: plan.shardSpecs.length - 1 });
  assert.ok(Math.max(...fewer.predicted) > NIGHTLY_PLAN_LINE_MINUTES);
  assert.deepEqual(plan.shardSpecs.flat().sort(), suite);
});

test('a night that failed a file says nothing about it', () => {
  const failing = { status: 'unexpected', expectedStatus: 'passed', results: [{ duration: 60_000 * 15 }] };
  const nights = [
    { suites: [{ file: 'x.spec.ts', specs: [{ ok: false, tests: [failing] }] }] },
    night({ 'x.spec.ts': [min(2)] }),
  ];
  assert.deepEqual(nightlyMinutes(nights), { 'x.spec.ts': 2 });
});

test('a file heavier than the line does not drive the count to the ceiling', () => {
  const minutes = { 'huge.spec.ts': 30, 'a.spec.ts': 2, 'b.spec.ts': 2 };
  const plan = planNightly({ suite: Object.keys(minutes), table: { minutes, overhead: { jobMinutes: 0, testFactor: 1 } } });
  assert.equal(plan.shardSpecs.length, 2);
  assert.equal(plan.fits, false);
});

test('a small suite asks for few runners, and a huge one stops at the ceiling', () => {
  const small = planNightly({ suite: ['a.spec.ts', 'b.spec.ts'], table: { minutes: { 'a.spec.ts': 1, 'b.spec.ts': 1 } } });
  assert.equal(small.shardSpecs.length, 1);
  const minutes = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`s${i}.spec.ts`, 2]));
  const huge = planNightly({ suite: Object.keys(minutes), table: { minutes } });
  assert.equal(huge.shardSpecs.length, NIGHTLY_MAX_SHARDS);
});

test('--only plans just the named specs that are on disk', () => {
  const onDisk = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts'];
  assert.deepEqual(suiteFor(onDisk), onDisk);
  assert.deepEqual(suiteFor(onDisk, ['e2e/c.spec.ts', 'e2e/a.spec.ts', 'e2e/gone.spec.ts']), ['a.spec.ts', 'c.spec.ts']);
  assert.deepEqual(suiteFor(onDisk, ['e2e/gone.spec.ts']), []);
});

/** A Playwright JSON report: { file: [minutes, status] }; status 'unfinished' is a test never reached. */
function report(files) {
  return {
    suites: Object.entries(files).map(([file, [minutes, status = 'passed']]) => ({
      file,
      specs: [{
        file,
        ok: status !== 'failed',
        tests: status === 'unfinished'
          ? [{ status: 'expected', results: [{ duration: minutes * 60_000, status: 'passed' }] }, { expectedStatus: 'passed', status: 'skipped', results: [{ duration: 0, status: 'skipped' }] }]
          : [{ status: status === 'passed' ? 'expected' : 'unexpected', results: [{ duration: minutes * 60_000, status }] }],
      }],
    })),
  };
}

test('a dev_server run weighs each file by the larger of its table and its calibrated reports', () => {
  const table = { 'a.spec.ts': 2, 'b.spec.ts': 1, 'c.spec.ts': 1 };
  // A build night at half the dev minutes: factor 2. b grew past its table; d is not in the table.
  const build = report({ 'a.spec.ts': [1], 'b.spec.ts': [1], 'c.spec.ts': [0.5], 'd.spec.ts': [2] });
  const w = devServerWeights(table, [build], Object.keys(table));
  assert.equal(w['a.spec.ts'], 2); // table 2, report 1 x factor (4/2.5 = 1.6) = 1.6: the table wins
  assert.equal(w['b.spec.ts'], 1.6); // grew: 1 x 1.6
  assert.equal(w['d.spec.ts'], 3.2); // a gap, filled at the calibrated minutes, never the median
  assert.equal(w['c.spec.ts'], 1); // 0.5 x 1.6 = 0.8 under the table
});

test('the factor skips failed and unfinished files; a failed file offers nothing, an unfinished one a floor', () => {
  const table = { 'a.spec.ts': 2, 'b.spec.ts': 2, 'c.spec.ts': 2, 'd.spec.ts': 2 };
  const suite = Object.keys(table);
  // b failed early and c stopped part way: both left out of the factor ((2+2)/(1+1) = 2).
  const night = report({ 'a.spec.ts': [1], 'd.spec.ts': [1], 'b.spec.ts': [0.1, 'failed'], 'c.spec.ts': [0.2, 'unfinished'], 'g.spec.ts': [1], 'h.spec.ts': [9, 'failed'] });
  const w = devServerWeights(table, [night], suite);
  assert.equal(w['g.spec.ts'], 2);
  assert.equal(w['h.spec.ts'], undefined); // a failed gap file is not weighed from a broken night
  assert.equal(w['c.spec.ts'], 2); // the unfinished 0.2 x 2 is under its table
  assert.equal(devServerWeights({}, [report({ 'u.spec.ts': [3, 'unfinished'] })], [])['u.spec.ts'], 3); // a floor
});

test('a small report offers an unscaled floor and does not take a night; a slow night is never scaled down', () => {
  const big = { 'a.spec.ts': 1, 'b.spec.ts': 1, 'c.spec.ts': 1, 'd.spec.ts': 1, 'e.spec.ts': 1 };
  const suite = Object.keys(big);
  const small = report({ 'a.spec.ts': [0.2], 'z.spec.ts': [3] });
  assert.equal(devServerWeights(big, [small], suite)['z.spec.ts'], 3);
  // Three small nights, then a full build night at half speed: the full night is still read.
  const full = report({ 'a.spec.ts': [0.5], 'b.spec.ts': [0.5], 'c.spec.ts': [0.5], 'z.spec.ts': [3] });
  assert.equal(devServerWeights(big, [small, small, small, full], suite)['z.spec.ts'], 6);
  // A table spec since deleted does not count toward the half.
  assert.equal(devServerWeights({ ...big, 'gone.spec.ts': 1, 'gone2.spec.ts': 1 }, [full], suite)['z.spec.ts'], 6);
  const table = { 'a.spec.ts': 2, 'b.spec.ts': 2 };
  assert.equal(devServerWeights(table, [report({ 'a.spec.ts': [4], 'b.spec.ts': [4] })], Object.keys(table))['a.spec.ts'], 4);
});

test('each file reads only the newest three reports that timed it', () => {
  const table = { 'a.spec.ts': 1 };
  const reports = [5, 1, 1, 9].map((m) => report({ 'a.spec.ts': [1], 'x.spec.ts': [m] }));
  assert.equal(devServerWeights(table, reports, ['a.spec.ts', 'x.spec.ts'])['x.spec.ts'], 5); // the fourth night's 9 is not read
});

test('an unfinished night takes none of a file\'s three nights', () => {
  const table = { 'a.spec.ts': 1 };
  const night = (m, status) => report({ 'a.spec.ts': [1], 'x.spec.ts': [m, status] });
  // Three unfinished nights, then a whole one: the whole one is still read.
  const reports = [night(1, 'unfinished'), night(1, 'unfinished'), night(1, 'unfinished'), night(4)];
  assert.equal(devServerWeights(table, reports, ['a.spec.ts', 'x.spec.ts'])['x.spec.ts'], 4);
});
