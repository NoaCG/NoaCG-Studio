// The launch ledger's arithmetic: percentile edges, joining a launch to its queueing and landing,
// and the per-size stats the horizon reads. The point of the file is that a night can MEASURE how
// long a unit takes instead of the loop guessing, so what is pinned is that the join takes the
// right merge job and the stats count only finished rows.
import assert from 'node:assert/strict';
import test from 'node:test';

import { joinDurations, percentile, statsBySize } from './wave-launch.mjs';

const T = (min) => Date.parse('2026-09-04T20:00:00Z') + min * 60_000;

test('percentile is nearest-rank and empty answers null, never zero', () => {
  assert.equal(percentile([], 0.9), null);
  assert.equal(percentile([5], 0.9), 5);
  assert.equal(percentile([10, 20, 30, 40, 50], 0.9), 50);
  assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
});

test('repair attempts preserve original elapsed time, even when the ledger is out of order', () => {
  const launches = [
    { branch: 'claude/a', at: T(123), letter: 'A', size: 'small' },
    { branch: 'claude/a', at: T(0), letter: 'A', size: 'standard' },
  ];
  const jobs = [
    { kind: 'merge', branch: 'claude/a', enqueuedAt: T(-3) }, // before the task - ignored
    { kind: 'merge', branch: 'claude/a', enqueuedAt: T(128) },
  ];
  const landings = [{ branch: 'claude/a', at: T(160) }];
  const [row] = joinDurations(launches, jobs, landings);
  assert.equal(row.toQueueMin, 128);
  assert.equal(row.toLandMin, 160);
  assert.equal(row.size, 'standard', 'a small repair does not reclassify the entire task');
  assert.deepEqual(row.attempts.map((attempt) => attempt.launchedAt), [T(0), T(123)]);
});

test('a repair after queueing retains first declaration and separately records attempts', () => {
  const launches = [0, 123, 123].map((min) => ({ v: 1, branch: 'claude/a', at: T(min), size: 'standard' }));
  const jobs = [95, 128].map((min) => ({ kind: 'merge', branch: 'claude/a', enqueuedAt: T(min) }));
  const [row] = joinDurations(launches, jobs, []);
  assert.equal(row.toQueueMin, 95);
  assert.equal(row.attempts.length, 2, 'duplicate records do not inflate the attempt count');
  assert.equal(row.toLandMin, null);
});

test('a launched row with no merge yet reports null, so the caller can count what is still running', () => {
  const [row] = joinDurations([{ branch: 'claude/b', at: T(0), size: 'small' }], [], []);
  assert.equal(row.toQueueMin, null);
  assert.equal(row.toLandMin, null);
});

test('statsBySize counts only finished rows, per size', () => {
  const rows = [
    { size: 'small', toQueueMin: 60 },
    { size: 'small', toQueueMin: 90 },
    { size: 'small', toQueueMin: null }, // still running - not counted
    { size: 'standard', toQueueMin: 150 },
  ];
  const stats = statsBySize(rows);
  assert.equal(stats.small.n, 2);
  assert.equal(stats.small.p90, 90);
  assert.equal(stats.standard.n, 1);
  assert.equal(stats.large.n, 0);
  assert.equal(stats.large.p90, null);
});
