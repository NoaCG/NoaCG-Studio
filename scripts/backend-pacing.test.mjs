// guards: src/backend/pacing.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay, focusPassDue, oneAtATime } from '../src/backend/pacing.ts';

test('backoff doubles to its ceiling, and no failure means no wait', () => {
  const middle = () => 0.5;
  assert.equal(backoffDelay(0, 15_000, 120_000, middle), 0);
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(n => backoffDelay(n, 15_000, 120_000, middle)), [15_000, 30_000, 60_000, 120_000, 120_000, 120_000]);
});

test('backoff spreads pages that failed together', () => {
  assert.equal(backoffDelay(1, 1_000, 1_000, () => 0), 750);
  assert.equal(backoffDelay(1, 1_000, 1_000, () => 1), 1_250);
});

test('a hung renewal holds later beats back, and the third beat goes inside the 15 s lease', () => {
  let now = 0;
  const gate = oneAtATime(10_000, () => now);
  assert.ok(gate.begin());
  for (now = 4_000; now < 12_000; now += 4_000) assert.equal(gate.begin(), null, `beat at ${now} stacked up`);
  now = 11_990; // A timer that fires slightly early must not push the renewal to 16 s.
  assert.ok(gate.begin(), 'a lost answer must not stop the beat');
});

test('an answered renewal lets the very next beat go', () => {
  let now = 0;
  const gate = oneAtATime(10_000, () => now);
  gate.begin()();
  now = 4_000;
  assert.ok(gate.begin());
});

test('a stale request answering late does not release the newer one out now', () => {
  let now = 0;
  const gate = oneAtATime(10_000, () => now);
  const stale = gate.begin();
  now = 10_000;
  assert.ok(gate.begin());
  stale();
  now = 12_000;
  assert.equal(gate.begin(), null);
});

test('focus runs a pass at most once per gap', () => {
  assert.equal(focusPassDue(0, 30_000, 1_000_000), true);
  assert.equal(focusPassDue(1_000_000, 30_000, 1_029_999), false);
  assert.equal(focusPassDue(1_000_000, 30_000, 1_030_000), true);
});
