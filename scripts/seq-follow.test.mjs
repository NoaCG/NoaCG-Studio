// guards: src/control/seqFollow.ts
//
// The sequence follower (Phase 6 Step 2, migration 0070): numbered rows are applied once and in
// seq order; a frame ahead of the cursor is held for the reorder window and drains when the gap
// closes; a gap still open is ONE tail read; a tail answer is authoritative over gaps (a prune);
// another epoch (unpublish + republish) starts the log again; and a refill leaves out only the
// animations a later play/stop of the same graphic replaces. Run in Node with the clock and the
// log faked. The wiring - Realtime, the poll, the renderer and the pages - is read in
// src/control/hostedControl.ts (followLiveSeq) and src/output/main.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { REORDER_WINDOW_MS, REJOIN_REFILL_SPREAD_MS, SEQ_TAIL_PAGE, createSeqFollower, supersededAnimations } =
  await import('../src/control/seqFollow.ts');

const row = (seq, graphic = 'G', t = 'update') => ({ id: 1000 + seq, seq, graphic, msg: { t } });

/**
 * A follower over a fake numbered log. `commit` makes rows readable by the tail (which, like the
 * RPC, answers rows after the cursor in seq order), `frame` delivers one on the live channel,
 * `wait` moves the timers and lets the walk's awaits settle.
 */
function rig(t, { from = 0, epoch = 'E1', random } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const log = { epoch, rows: new Map() };
  const applied = [];
  const batches = [];
  const reads = [];
  const epochs = [];
  const heads = [];
  let failNext = 0;
  const follower = createSeqFollower({
    from,
    epoch,
    tail: async (after, asked) => {
      reads.push([after, asked]);
      if (failNext > 0) {
        failNext -= 1;
        return null;
      }
      if (asked !== null && asked !== log.epoch) return { epoch: log.epoch, rows: [], reset: true };
      const rows = [...log.rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, SEQ_TAIL_PAGE);
      return { epoch: log.epoch, rows };
    },
    onRows: (rows, replayed) => {
      batches.push({ seqs: rows.map((r) => r.seq), replayed });
      applied.push(...rows.map((r) => r.seq));
    },
    onEpoch: (e) => epochs.push(e),
    onHead: (head, e) => heads.push([head.seq, e]),
    random,
  });
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    follower,
    log,
    applied,
    batches,
    reads,
    epochs,
    heads,
    failNext: (n) => (failNext = n),
    commit: (...seqs) => seqs.forEach((s) => log.rows.set(s, row(s))),
    frame: (seqs, e = log.epoch, head) => follower.offer({ epoch: e, rows: seqs.map((s) => row(s)), ...(head ? { head } : {}) }),
    settle,
    wait: async (ms) => {
      t.mock.timers.tick(ms);
      await settle();
    },
  };
}

test('contiguous frames apply at once, in seq order, and nothing is read', async (t) => {
  const r = rig(t);
  r.frame([1, 2, 3]);
  r.frame([4]);
  assert.deepEqual(r.applied, [1, 2, 3, 4]);
  assert.equal(r.follower.cursor, 4);
  await r.wait(1000);
  assert.deepEqual(r.reads, []);
});

test('a frame whose rows arrive shuffled is applied in seq order', (t) => {
  const r = rig(t);
  r.follower.offer({ epoch: 'E1', rows: [row(2), row(3), row(1)] });
  assert.deepEqual(r.applied, [1, 2, 3]);
});

test('a frame ahead of the cursor is HELD and drains the moment the gap closes, with no read', async (t) => {
  const r = rig(t);
  r.frame([3, 4]);
  assert.deepEqual(r.applied, []);
  await r.wait(REORDER_WINDOW_MS - 5);
  r.frame([1, 2]);
  assert.deepEqual(r.applied, [1, 2, 3, 4]);
  await r.wait(REORDER_WINDOW_MS * 4);
  assert.deepEqual(r.reads, [], 'a reorder inside the window costs no RPC');
});

test('a gap still open after the window is ONE tail read from the cursor, which fills it', async (t) => {
  const r = rig(t);
  r.commit(1, 2, 3);
  r.frame([3]);
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.reads, [[0, 'E1']]);
  assert.deepEqual(r.applied, [1, 2, 3]);
  assert.deepEqual(r.batches, [{ seqs: [1, 2, 3], replayed: true }]);
});

test('a duplicate or older frame is dropped, so a row applies once whichever road brought it', async (t) => {
  const r = rig(t, { from: 5 });
  r.frame([4, 5]);
  r.frame([6]);
  r.frame([6]);
  assert.deepEqual(r.applied, [6]);
});

test('a tail answer is authoritative: the cursor moves over a pruned gap and never waits on it', async (t) => {
  const r = rig(t, { from: 10 });
  // Rows 11..19 were pruned (7-day retention); the log holds 20 and 21.
  r.commit(20, 21);
  r.frame([21]);
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.applied, [20, 21]);
  assert.equal(r.follower.cursor, 21);
  r.frame([22]);
  assert.deepEqual(r.applied, [20, 21, 22], 'the next frame is contiguous with the moved cursor');
});

test('refills are single-flight: a hole during a walk runs one more walk, not one per frame', async (t) => {
  const r = rig(t);
  r.commit(1, 2, 3, 4, 5, 6);
  const walking = r.follower.refill();
  r.follower.refill();
  r.follower.refill();
  await walking;
  await r.settle();
  assert.equal(r.reads.length, 2, 'one walk, then exactly one more for the calls made during it');
  assert.deepEqual(r.applied, [1, 2, 3, 4, 5, 6]);
});

test('a full page keeps reading from the last row until a short page', async (t) => {
  const r = rig(t);
  const total = SEQ_TAIL_PAGE + 3;
  for (let s = 1; s <= total; s += 1) r.commit(s);
  await r.follower.refill();
  assert.equal(r.follower.cursor, total);
  assert.deepEqual(r.reads.map((x) => x[0]), [0, SEQ_TAIL_PAGE]);
});

test('a failed read changes nothing, and the held frame is still there for the next read', async (t) => {
  const r = rig(t);
  r.commit(1, 2);
  r.failNext(1);
  r.frame([2]);
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.applied, []);
  assert.equal(r.follower.cursor, 0);
  await r.follower.refill();
  assert.deepEqual(r.applied, [1, 2]);
});

test('another epoch in a frame (unpublish + republish) starts the log again from 1', async (t) => {
  const r = rig(t, { from: 900 });
  r.log.epoch = 'E2';
  r.frame([1, 2], 'E2');
  assert.deepEqual(r.epochs, ['E2']);
  assert.deepEqual(r.applied, [1, 2], 'seq 1 of the new log is not "older than 900"');
  assert.equal(r.follower.epoch, 'E2');
});

test('a reset answer (the poll found another epoch) re-reads the new log from 0', async (t) => {
  const r = rig(t, { from: 900 });
  r.log.epoch = 'E2';
  r.log.rows.clear();
  r.commit(1, 2, 3);
  await r.follower.refill();
  assert.deepEqual(r.epochs, ['E2']);
  assert.deepEqual(r.reads, [[900, 'E1'], [0, 'E2']]);
  assert.deepEqual(r.applied, [1, 2, 3]);
});

test('a follower that knew no epoch (no head at resolve) adopts the first one without a reset', async (t) => {
  const r = rig(t, { from: 0, epoch: null });
  r.log.epoch = 'E7';
  r.commit(1);
  await r.follower.refill();
  assert.equal(r.follower.epoch, 'E7');
  assert.deepEqual(r.applied, [1]);
});

test('the head a frame carries is handed on as data, and never makes the follower act', async (t) => {
  const r = rig(t);
  r.frame([], 'E1', { seq: 9, graphics: { G: { rev: 3, on: true } } });
  await r.wait(1000);
  assert.deepEqual(r.heads, [[9, 'E1']]);
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.reads, [], 'a summary ahead of the cursor is not a hole');
});

test('the first join refills at once; a rejoin refills after a random spread', async (t) => {
  const r = rig(t, { random: () => 0.5 });
  r.follower.joined();
  await r.settle();
  assert.equal(r.reads.length, 1);
  r.follower.joined();
  await r.wait(REJOIN_REFILL_SPREAD_MS / 2 - 1);
  assert.equal(r.reads.length, 1);
  await r.wait(1);
  assert.equal(r.reads.length, 2);
});

test('stop() ends everything: no timer fires and no read starts afterwards', async (t) => {
  const r = rig(t);
  r.commit(1, 2);
  r.frame([2]);
  r.follower.stop();
  await r.wait(REORDER_WINDOW_MS * 10);
  assert.deepEqual(r.reads, []);
  r.frame([1]);
  assert.deepEqual(r.applied, []);
});

test('a refill elides only animations a later play/stop of the same graphic replaces', () => {
  const rows = [
    row(1, 'A', 'play'),
    row(2, 'A', 'update'),
    row(3, 'A', 'stop'),
    row(4, 'B', 'play'),
    row(5, 'A', 'play'),
  ];
  assert.deepEqual([...supersededAnimations(rows)].sort(), [1, 3], 'A ends on air with one entrance; B keeps its own');
});

test('an event, next or snap between them fences the earlier animation: the machine needed it', () => {
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'event'), row(3, 'A', 'stop')])], []);
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'next'), row(3, 'A', 'stop')])], []);
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'stop'), row(2, 'A', 'snap'), row(3, 'A', 'play')])], []);
  assert.deepEqual(
    [...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'event'), row(3, 'A', 'stop'), row(4, 'A', 'play')])],
    [3],
    'only the pair after the fence',
  );
});

test('a batch with one animation per graphic elides nothing', () => {
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'update'), row(2, 'A', 'play'), row(3, 'A', 'cue')])], []);
});
