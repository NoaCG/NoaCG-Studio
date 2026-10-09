// The worker count is now a DECISION rather than a constant, and a wrong one is expensive in
// both directions - too many makes the machine unusable, too few makes every run drag. It is
// pure arithmetic over one input, so it is cheap to pin exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseWorkers } from './e2e-workers.mjs';
import { POLICY } from './jobs-store.mjs';

// What one targeted spec took out of free memory at each count, worst measured (e2e-workers.mjs).
const TAKEN_MB = { 2: 2114, 3: 2800, 4: 3100, 6: 4100 };

test('an explicit E2E_WORKERS always wins, however little memory is free', () => {
  const { workers, reason } = chooseWorkers({ freeMb: 300, override: '8' });
  assert.equal(workers, 8);
  assert.match(reason, /pinned/);
});

test('a junk or non-positive override is ignored rather than obeyed', () => {
  // '0', 'yes' and '-2' must not silently produce a zero or negative worker count, which
  // Playwright would either reject or interpret as something nobody intended.
  for (const override of ['0', 'yes', '-2', '']) {
    const { workers } = chooseWorkers({ freeMb: 4549, override });
    assert.equal(workers, 4, `override ${JSON.stringify(override)} should fall through`);
  }
});

test('the benchmarked points reproduce the counts they were measured at', () => {
  // 5794 MB free, 6 workers: 125.7 s, the fastest run recorded, 1669 MB still free.
  assert.equal(chooseWorkers({ freeMb: 5794 }).workers, 6);
  // 4549 MB free, 4 workers: 137.7 s, 1488 MB still free.
  assert.equal(chooseWorkers({ freeMb: 4549 }).workers, 4);
  // 4535 MB free was also where 6 workers went SLOWER (157.1 s) and left 401 MB - the ladder
  // must not pick 6 down here, which is the whole reason it is memory-keyed.
  assert.ok(chooseWorkers({ freeMb: 4535 }).workers < 6);
});

test('more free memory buys more workers, up to the measured ceiling', () => {
  assert.equal(chooseWorkers({ freeMb: 5300 }).workers, 6);
  // 8 workers measured SLOWER than 6 from the same memory AND drove the box to 293 MB free,
  // so the ladder stops at 6 however much RAM there is.
  assert.equal(chooseWorkers({ freeMb: 32_000 }).workers, 6);
});

test('a busy machine scales down instead of taking what is left', () => {
  // Premiere with a project open, or a second heavy app, is exactly this case. 3076 MB is the
  // figure actually observed with a 2.9 GB allocation held against this machine.
  assert.equal(chooseWorkers({ freeMb: 4000 }).workers, 3);
  assert.equal(chooseWorkers({ freeMb: 3400 }).workers, 2);
  assert.equal(chooseWorkers({ freeMb: 3076 }).workers, 1);
  assert.equal(chooseWorkers({ freeMb: 2300 }).workers, 1);
});

test('every rung above one leaves at least a gigabyte behind', () => {
  // The promise this module makes to the person at the keyboard, checked against the measured
  // take of each count rather than against the thresholds themselves. One worker is what is left
  // when even two do not fit, so it promises nothing.
  for (const freeMb of [3200, 3900, 4200, 5300, 8000]) {
    const { workers } = chooseWorkers({ freeMb });
    const left = freeMb - TAKEN_MB[workers];
    assert.ok(left >= 1000, `${freeMb} MB free -> ${workers} workers would leave only ${left} MB`);
  }
});

test('a browser job admitted at either queue floor leaves a gigabyte free (#855)', { skip: process.env.NOACG_JOBS_FREE_MB && 'the floor is pinned by NOACG_JOBS_FREE_MB' }, () => {
  // The queue admits a browser job at its floor and this ladder then picks the workers, so only
  // the two numbers together keep the machine out of the page file. At the away floor three
  // workers left 0.7-1.1 GB; two leave about 1.4.
  for (const [presence, freeMb] of Object.entries(POLICY.freeMemFloorMb)) {
    const { workers } = chooseWorkers({ freeMb });
    const left = freeMb - TAKEN_MB[workers];
    assert.ok(left >= 1000, `${presence} floor ${freeMb} MB -> ${workers} workers would leave only ${left} MB`);
  }
  assert.equal(chooseWorkers({ freeMb: POLICY.freeMemFloorMb.away }).workers, 2);
});

test('the ladder is monotonic - more memory never yields fewer workers', () => {
  // A step table is easy to mis-edit into a non-monotonic mess, and the symptom would be a
  // worker count that jumps around for no reason anyone could explain.
  let previous = 0;
  for (let freeMb = 0; freeMb <= 12_000; freeMb += 100) {
    const { workers } = chooseWorkers({ freeMb });
    assert.ok(workers >= previous, `${freeMb} MB free gave ${workers} after ${previous}`);
    previous = workers;
  }
});

test('the count is never zero or negative, however full the machine is', () => {
  // The floor is 1: the run still happens, it just stops competing for the last of the memory.
  // A zero or negative count would be a crash, not a slow run.
  for (const freeMb of [1800, 1200, 800, 200, 0]) {
    const { workers } = chooseWorkers({ freeMb });
    assert.equal(workers, 1, `${freeMb} MB free`);
  }
  assert.match(chooseWorkers({ freeMb: 200 }).reason, /nearly full/);
  assert.match(chooseWorkers({ freeMb: 2300 }).reason, /only enough for one worker/);
});

test('the reason always names the free memory it decided from', () => {
  // A variable worker count with no explanation makes every "why was that run slow?" a guess.
  assert.match(chooseWorkers({ freeMb: 4535 }).reason, /4535 MB free/);
});
