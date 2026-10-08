// guards: src/control/allOut.ts
//
// What All out clears (docs/work-specs/playout-workflow-simplification D11, AC-13): what this page
// has up and what the server's heads say is on, and on a quiet published production every graphic
// the heads have no word on, so the panic control never leaves one up. And how it leaves: never
// more of its rows in one window than the server's burst cap leaves room for.
import test from 'node:test';
import assert from 'node:assert/strict';

const { allOutTargets, allOutWaves, ALL_OUT_ROWS_PER_WINDOW } = await import('../src/control/allOut.ts');

const heads = (entries) => new Map(Object.entries(entries));
/** control_send_seq refuses a press that takes the production past 50 command rows in 5 s. */
const BURST_CAP = 50;
/** clearCueItems: a stop and a cue row per graphic, four graphics to a batch (clearAllCueBatches). */
const batchRows = (graphics) => Array.from({ length: Math.ceil(graphics / 4) }, (_, i) => 2 * Math.min(4, graphics - i * 4));

test('All out clears what the page has up and what the heads say is on, once each', () => {
  assert.deepEqual(allOutTargets({ local: ['A'], heads: heads({ B: true, A: true, C: false }), all: ['A', 'B', 'C'], published: true }), ['A', 'B']);
  assert.deepEqual(allOutTargets({ local: [], heads: heads({ B: true }), all: ['A', 'B'], published: true }), ['B'], 'a graphic whose cue marker went missing');
});

test('published with nothing known to be on, it clears every graphic the heads have no word on; unpublished, nothing', () => {
  assert.deepEqual(allOutTargets({ local: [], heads: heads({}), all: ['A', 'B', 'A'], published: true }), ['A', 'B'], 'after a republish no head remembers any');
  assert.deepEqual(allOutTargets({ local: [], heads: null, all: ['A', 'B'], published: true }), ['A', 'B'], 'no head to ask');
  assert.deepEqual(allOutTargets({ local: [], heads: heads({ A: false }), all: ['A', 'B'], published: true }), ['B'], 'A was stopped in this log');
  assert.deepEqual(allOutTargets({ local: [], heads: null, all: ['A'], published: false }), []);
  assert.deepEqual(allOutTargets({ local: ['A'], heads: null, all: ['A', 'B'], published: false }), ['A'], 'rehearsal clears what it put up');
});

test('pressing All out again on a quiet production sends nothing the first press already cleared', () => {
  const all = Array.from({ length: 15 }, (_, i) => `G${i}`);
  const first = allOutTargets({ local: [], heads: heads({}), all, published: true });
  assert.equal(first.length, 15);
  // The first press's answer tells the heads each one is off.
  const second = allOutTargets({ local: [], heads: new Map(first.map((g) => [g, false])), all, published: true });
  assert.deepEqual(second, [], `two presses within 5 s would have sent ${(first.length + 15) * 2} rows`);
});

test('one All out press never puts more rows in a window than the burst cap allows', () => {
  const all = Array.from({ length: 30 }, (_, i) => `G${i}`);
  const rows = batchRows(allOutTargets({ local: [], heads: heads({}), all, published: true }).length);
  assert.equal(rows.reduce((a, b) => a + b, 0), 60, 'the fallback over 30 graphics is more than the cap in one go');
  const waves = allOutWaves(rows);
  const perWave = waves.reduce((acc, wave, i) => ((acc[wave] = (acc[wave] ?? 0) + rows[i]), acc), []);
  assert.deepEqual(perWave, [40, 20]);
  for (const n of perWave) assert.ok(n <= ALL_OUT_ROWS_PER_WINDOW && ALL_OUT_ROWS_PER_WINDOW < BURST_CAP);
  assert.deepEqual(waves, [0, 0, 0, 0, 0, 1, 1, 1], 'batches stay in order, the next wave after the last of the one before');
});

test('an All out within one window leaves at once', () => {
  assert.deepEqual(allOutWaves(batchRows(20)), [0, 0, 0, 0, 0]);
  assert.deepEqual(allOutWaves([]), []);
});
