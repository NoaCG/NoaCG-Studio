// guards: src/output/hold.ts
//
// HELD TAKES (live-publishing G2 section 3, R3 to R8): what a held queue does when its graphic
// releases. The rules are checked against a small reference model written from the design's words,
// not from the module: random queues of Take, update, event, Next, Out and release times.

import test from 'node:test';
import assert from 'node:assert/strict';

const { ENTRANCE_MS, compact, heldLate, isCancelled, lastLifecycle, releaseMode, surviving } = await import('../src/output/hold.ts');

const row = (at, t, receivedAt = 0, extra = {}) => ({ at, msg: { t, ...extra }, receivedAt });

test('a queue ending in an Out, or holding no Take, is cancelled (R6)', () => {
  assert.equal(isCancelled([row(1, 'play'), row(2, 'stop')]), true);
  assert.equal(isCancelled([row(1, 'update'), row(2, 'next')]), true);
  assert.equal(isCancelled([row(1, 'stop'), row(2, 'play')]), false);
  assert.equal(lastLifecycle([row(1, 'snap'), row(2, 'update')]), 'take');
  assert.equal(releaseMode([row(1, 'play', 0), row(2, 'stop', 0)], 1, false), 'cancelled');
});

test('S4: on time with its entrance up to 5 s after the surviving Take reached the output, late after (R7)', () => {
  const rows = [row(1, 'play', 1_000), row(2, 'stop', 1_200), row(3, 'play', 4_000)];
  assert.equal(surviving(rows), 4_000, 'the newest Take counts');
  assert.equal(releaseMode(rows, 4_000 + ENTRANCE_MS, false), 'onTime');
  assert.equal(releaseMode(rows, 4_001 + ENTRANCE_MS, false), 'late');
  assert.equal(heldLate(rows, 4_001 + ENTRANCE_MS), true);
  assert.equal(heldLate(rows, 4_000 + ENTRANCE_MS), false);
  // A boot frame's history never plays on air, even a moment after the Take.
  assert.equal(releaseMode(rows, 4_000, true), 'late');
});

test('making room merges plain updates and drops superseded entrances, else fails (R8 limit)', () => {
  const rows = [row(1, 'update', 0, { data: { a: '1' } }), row(2, 'update', 0, { data: { b: '2' } }), row(3, 'play'), row(4, 'play'), row(5, 'update', 0, { data: { a: '3' } })];
  const out = compact(rows, 3, false);
  assert.deepEqual(out.map((r) => r.msg.t), ['update', 'play', 'update']);
  assert.deepEqual(out[0].msg.data, { a: '1', b: '2' });
  assert.equal(out[1].at, 4, 'the later Take survives');
  // A graphic with a clock keeps its updates apart: merging would change its clock fields.
  assert.equal(compact(rows, 3, true), null);
  // Updates on different data roads, or carrying a look, are never merged.
  const roads = [row(1, 'update', 0, { data: { a: '1' }, src: 'api' }), row(2, 'update', 0, { data: { a: '2' } }), row(3, 'update', 0, { data: {}, appearance: {} })];
  assert.equal(compact(roads, 2, false), null);
  assert.equal(compact(roads, 3, false).length, 3, 'within the limit nothing changes');
});

// ── The reference model: what each rule says reaches the document, written from G2's words. ──
function model(rows, now, history) {
  const lifecycle = rows.filter((r) => ['play', 'snap', 'stop'].includes(r.msg.t));
  const last = lifecycle[lifecycle.length - 1];
  if (!last || last.msg.t === 'stop') return history ? 'late' : 'cancelled';
  if (history) return 'late';
  let take = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].msg.t === 'stop') break;
    if (rows[i].msg.t === 'play' || rows[i].msg.t === 'snap') {
      take = rows[i].receivedAt;
      break;
    }
  }
  return now - take <= 5_000 ? 'onTime' : 'late';
}

test('random queues: the release plan agrees with the reference model', () => {
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  const verbs = ['play', 'snap', 'stop', 'update', 'event', 'next'];
  for (let trial = 0; trial < 2_000; trial += 1) {
    const rows = [];
    let at = 1;
    let clock = 0;
    rows.push(row(at++, rand(2) ? 'play' : 'snap', clock));
    for (let i = rand(8); i > 0; i -= 1) {
      clock += rand(3_000);
      rows.push(row(at++, verbs[rand(verbs.length)], clock));
    }
    const now = clock + rand(9_000);
    const history = rand(5) === 0;
    const got = releaseMode(rows, now, history);
    assert.equal(got, model(rows, now, history), JSON.stringify({ rows: rows.map((r) => `${r.msg.t}@${r.receivedAt}`), now, history }));
  }
});
