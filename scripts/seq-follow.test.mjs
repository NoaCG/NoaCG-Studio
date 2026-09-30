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

const { HELD_RETRY_MS, REORDER_WINDOW_MS, REJOIN_REFILL_SPREAD_MS, SEQ_TAIL_PAGE, createSeqFollower, supersededAnimations } =
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
  const busy = [];
  let failNext = 0;
  let duringRead = null;
  const follower = createSeqFollower({
    from,
    epoch,
    tail: async (after, asked) => {
      reads.push([after, asked]);
      const hook = duringRead;
      duringRead = null;
      if (hook) await hook();
      if (failNext > 0) {
        failNext -= 1;
        return null;
      }
      if (asked !== null && asked !== log.epoch) return { epoch: log.epoch, rows: [], reset: true };
      const rows = [...log.rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, SEQ_TAIL_PAGE);
      const top = Math.max(0, ...log.rows.keys());
      return { epoch: log.epoch, rows, head: { seq: top, graphics: { G: { rev: top } } } };
    },
    onRows: (rows, replayed) => {
      batches.push({ seqs: rows.map((r) => r.seq), replayed });
      applied.push(...rows.map((r) => r.seq));
    },
    onEpoch: (e, reset) => epochs.push([e, reset]),
    onHead: (head, e) => heads.push([head.seq, e]),
    onBusy: (b) => busy.push(b),
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
    busy,
    failNext: (n) => (failNext = n),
    duringNextRead: (fn) => (duringRead = fn),
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

test('a failed read with rows still held tries again a second later, not at the 30 s poll', async (t) => {
  const r = rig(t);
  r.commit(1, 2);
  r.failNext(1);
  r.frame([2]);
  await r.wait(REORDER_WINDOW_MS);
  assert.equal(r.reads.length, 1);
  assert.deepEqual(r.applied, []);
  await r.wait(HELD_RETRY_MS);
  assert.equal(r.reads.length, 2);
  assert.deepEqual(r.applied, [1, 2]);
});

test('another epoch in a frame (unpublish + republish) starts the log again from 1', async (t) => {
  const r = rig(t, { from: 900 });
  r.log.epoch = 'E2';
  r.frame([1, 2], 'E2');
  assert.deepEqual(r.epochs, [['E2', true]]);
  assert.deepEqual(r.applied, [1, 2], 'seq 1 of the new log is not "older than 900"');
  assert.equal(r.follower.epoch, 'E2');
});

test('a reset answer (the poll found another epoch) re-reads the new log from 0', async (t) => {
  const r = rig(t, { from: 900 });
  r.log.epoch = 'E2';
  r.log.rows.clear();
  r.commit(1, 2, 3);
  await r.follower.refill();
  assert.deepEqual(r.epochs, [['E2', true]]);
  assert.deepEqual(r.reads, [[900, 'E1'], [0, 'E2']]);
  assert.deepEqual(r.applied, [1, 2, 3]);
});

test('a follower that knew no epoch (no head at resolve) LEARNS the first one: no reset, no re-read', async (t) => {
  const r = rig(t, { from: 3, epoch: null });
  r.log.epoch = 'E7';
  r.commit(1, 2, 3, 4);
  r.frame([4], 'E7');
  assert.equal(r.follower.epoch, 'E7');
  assert.deepEqual(r.epochs, [['E7', false]]);
  assert.deepEqual(r.applied, [4], 'rows 1..3 were already applied (a renderer\'s catch-up) and are not replayed');
});

test('an answer read under an epoch the follower has left since is thrown away and read again', async (t) => {
  const r = rig(t, { from: 900 });
  r.commit(901);
  // While the read (asked under E1) is out, a frame of the republished log arrives.
  r.duringNextRead(async () => {
    r.log.epoch = 'E2';
    r.log.rows.clear();
    r.commit(1, 2);
    r.frame([1], 'E2');
  });
  await r.follower.refill();
  assert.equal(r.follower.epoch, 'E2');
  assert.deepEqual(r.applied, [1, 2], 'nothing of the dead log (901) is applied after the switch');
  assert.deepEqual(r.epochs, [['E2', true]], 'and the follower never flips back to E1');
});

test('a head is handed on only once every row up to it is applied, and never makes the follower act', async (t) => {
  const r = rig(t);
  r.frame([], 'E1', { seq: 9, graphics: { G: { rev: 3, on: true } } });
  await r.wait(1000);
  assert.deepEqual(r.heads, [], 'rows 1..9 are not here yet, so neither is the revision they carry');
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.reads, [], 'a summary ahead of the cursor is not a hole');
  r.frame([1, 2], 'E1', { seq: 2, graphics: { G: { rev: 2 } } });
  assert.deepEqual(r.heads, [[2, 'E1']]);
});

test('a tail answer\'s head is handed on with its rows', async (t) => {
  const r = rig(t);
  r.commit(1, 2, 3);
  await r.follower.refill();
  assert.deepEqual(r.applied, [1, 2, 3]);
  assert.deepEqual(r.heads, [[3, 'E1']]);
});

test('holding rows or reading the tail is BUSY, and level again says so', async (t) => {
  const r = rig(t);
  r.commit(1, 2, 3);
  r.frame([3]);
  assert.deepEqual(r.busy, [true], 'a held row makes the follower busy at once');
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.applied, [1, 2, 3]);
  assert.deepEqual(r.busy, [true, false]);
  r.frame([4]);
  assert.deepEqual(r.busy, [true, false], 'a contiguous frame never makes it busy');
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

test('a refill elides only ENTRANCES a later play or stop of the same graphic replaces', () => {
  const rows = [
    row(1, 'A', 'play'),
    row(2, 'A', 'update'),
    row(3, 'A', 'stop'),
    row(4, 'B', 'play'),
    row(5, 'A', 'play'),
  ];
  assert.deepEqual([...supersededAnimations(rows)], [1], 'A ends on air with one entrance; B keeps its own');
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'play')])], [1], 'a re-take replaces the take');
});

test('an exit is never elided: a stop does more than animate (a debate board halts its clocks)', () => {
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'stop'), row(2, 'A', 'play')])], []);
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'stop'), row(2, 'A', 'stop')])], []);
});

test('an event, next or snap between them fences the entrance: the machine needed it', () => {
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'event'), row(3, 'A', 'stop')])], []);
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'next'), row(3, 'A', 'stop')])], []);
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'snap'), row(3, 'A', 'play')])], []);
  assert.deepEqual(
    [...supersededAnimations([row(1, 'A', 'play'), row(2, 'A', 'event'), row(3, 'A', 'play'), row(4, 'A', 'stop')])],
    [3],
    'only the entrance after the fence',
  );
});

test('a batch with one animation per graphic elides nothing', () => {
  assert.deepEqual([...supersededAnimations([row(1, 'A', 'update'), row(2, 'A', 'play'), row(3, 'A', 'cue')])], []);
});
