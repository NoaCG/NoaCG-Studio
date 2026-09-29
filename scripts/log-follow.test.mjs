// guards: src/control/logFollow.ts, src/backend/realtimeReconnect.ts
//
// The command-log follower's cursor (docs/PLAYOUT_ISOLATION_RESEARCH.md §16 items 8 and 9): a row
// that commits late below the cursor is applied once, duplicates from either road are dropped, the
// window behind the cursor is bounded, and refills after a rejoin (and the socket's own reconnects)
// are spread. Run in Node with the clock and the log faked. The wiring - Realtime, the 30 s poll
// and the fast road's stand-down - is read in followControlLog (src/control/hostedControl.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

const { CONTROL_TAIL_PAGE, LATE_COMMIT_WINDOW_MS, REJOIN_REFILL_SPREAD_MS, REORDER_WINDOW_MS, SEEN_MAX, createLogFollower } =
  await import('../src/control/logFollow.ts');
const { realtimeReconnectAfterMs } = await import('../src/backend/realtimeReconnect.ts');

/**
 * A follower over a fake log. `commit` makes rows visible to the tail read (which, like the RPC,
 * never returns an uncommitted row), `offer` delivers one on the live channel, `wait` moves the
 * clock and the timers together and lets the walk's awaits settle.
 */
function rig(t, { from = 100, random } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 1_000_000;
  const committed = new Map();
  const applied = [];
  const reads = [];
  const walks = [];
  const follower = createLogFollower({
    from,
    tail: async (after) => {
      reads.push(after);
      return [...committed.values()]
        .filter((row) => row.id > after)
        .sort((a, b) => a.id - b.id)
        .slice(0, CONTROL_TAIL_PAGE);
    },
    onRow: (row) => applied.push(row.id),
    onWalk: (walking) => walks.push(walking),
    now: () => clock,
    random,
  });
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    follower,
    applied,
    reads,
    walks,
    commit: (...ids) => ids.forEach((id) => committed.set(id, { id })),
    offer: (...ids) => ids.forEach((id) => follower.offer({ id })),
    settle,
    wait: async (ms) => {
      clock += ms;
      t.mock.timers.tick(ms);
      await settle();
    },
  };
}

test('a Take that commits after a later Update is still applied, once (the §5.3 skip)', async (t) => {
  const r = rig(t);
  // 101-103 are a Take whose ids were taken first, waiting on the held control_shows row; 104 is
  // another operator's Update, which does not wait for that row and commits first.
  r.commit(104);
  r.offer(104);
  await r.wait(REORDER_WINDOW_MS);
  // The gap stayed open, so the follower read the tail - which cannot return uncommitted rows.
  assert.deepEqual(r.reads, [100]);
  assert.deepEqual(r.applied, [104]);
  assert.equal(r.follower.last, 104);
  // The Take commits 2.4 s later and its rows arrive below the cursor, one transaction shuffled.
  await r.wait(2_400);
  r.commit(101, 102, 103);
  r.offer(102, 101, 103);
  assert.deepEqual(r.applied, [104, 102, 101, 103]);
  // ...and the same rows again, from the live channel and from the poll's re-read, change nothing.
  r.offer(101, 102, 103, 104);
  await r.follower.refill('behind');
  assert.deepEqual(r.applied, [104, 102, 101, 103]);
});

test('the poll re-reads behind the cursor and applies a late row the live channel never brought', async (t) => {
  const r = rig(t);
  r.commit(101, 104);
  r.offer(101, 104);
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.applied, [101, 104]);
  // 102 and 103 commit while the socket is not delivering.
  await r.wait(5_000);
  r.commit(102, 103);
  await r.follower.refill('behind');
  assert.deepEqual(r.applied, [101, 104, 102, 103]);
  // A follower younger than the window re-reads from its baseline.
  assert.equal(r.reads.at(-1), 100);
  await r.follower.refill('behind');
  assert.deepEqual(r.applied, [101, 104, 102, 103]);
});

test('the window is time behind the cursor: inside it a late row applies, past it the row is settled', async (t) => {
  const r = rig(t);
  r.commit(103);
  r.offer(103);
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.applied, [103]);
  await r.wait(30_000);
  r.commit(102);
  r.offer(102);
  assert.deepEqual(r.applied, [103, 102], 'thirty seconds late is inside the window');
  await r.wait(LATE_COMMIT_WINDOW_MS);
  // The cursor has stood at 103 for longer than the window, so the re-read starts there...
  await r.follower.refill('behind');
  assert.equal(r.reads.at(-1), 103);
  // ...and a row below it now is past any commit delay the window allows for.
  r.commit(101);
  r.offer(101);
  assert.deepEqual(r.applied, [103, 102]);
});

test('a hole reads from the cursor, not the window: on a busy instance nearly every row has one', async (t) => {
  const r = rig(t);
  r.commit(101, 102);
  r.offer(101, 102);
  r.commit(110);
  r.offer(110);
  await r.wait(REORDER_WINDOW_MS);
  assert.deepEqual(r.reads, [102]);
  assert.deepEqual(r.applied, [101, 102, 110]);
});

test('rows of one transaction shuffled inside the reorder window cost no tail read', async (t) => {
  const r = rig(t);
  r.offer(102, 101, 103);
  assert.deepEqual(r.applied, [101, 102, 103]);
  await r.wait(REORDER_WINDOW_MS * 4);
  assert.deepEqual(r.reads, []);
});

test('the ids remembered are bounded, and the re-read starts above the ones forgotten', async (t) => {
  const r = rig(t, { from: 0 });
  const ids = Array.from({ length: SEEN_MAX + 50 }, (_, i) => i + 1);
  r.commit(...ids);
  r.offer(...ids);
  assert.equal(r.applied.length, ids.length);
  await r.follower.refill('behind');
  assert.equal(r.reads.at(-1), 50, 'the oldest 50 were forgotten, so the floor is their newest');
  assert.equal(r.applied.length, ids.length);
  // A row the follower can no longer tell from one it applied is not applied.
  r.offer(20);
  assert.equal(r.applied.length, ids.length);
});

test('a full page continues from its last row until a short page', async (t) => {
  const r = rig(t, { from: 0 });
  r.commit(...Array.from({ length: 1_200 }, (_, i) => i + 1));
  await r.follower.refill('ahead');
  assert.deepEqual(r.reads, [0, 500, 1_000]);
  assert.equal(r.applied.length, 1_200);
  assert.deepEqual(r.walks, [true, false], 'one walk, announced so the fast road stands down');
});

test('the first join refills at once; a rejoin waits a random spread, and rejoins coalesce', async (t) => {
  const r = rig(t, { random: () => 0.999 });
  r.follower.joined();
  await r.settle();
  assert.equal(r.reads.length, 1, 'the boot is not a herd');
  r.follower.joined();
  r.follower.joined();
  const delay = Math.floor(0.999 * REJOIN_REFILL_SPREAD_MS);
  assert.ok(delay < REJOIN_REFILL_SPREAD_MS);
  await r.wait(delay - 1);
  assert.equal(r.reads.length, 1);
  await r.wait(1);
  assert.equal(r.reads.length, 2, 'two rejoins, one read');
  // A pending rejoin refill dies with the follower.
  r.follower.joined();
  r.follower.stop();
  await r.wait(REJOIN_REFILL_SPREAD_MS);
  assert.equal(r.reads.length, 2);
});

test('ten followers that rejoin together do not all read in the same second', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // A fixed spread of draws, so the test says what the spread does rather than what a seed did.
  const draws = [0.03, 0.12, 0.25, 0.31, 0.47, 0.52, 0.66, 0.74, 0.88, 0.97];
  const readAt = [];
  let now = 0;
  const followers = draws.map((draw) =>
    createLogFollower({
      from: 0,
      tail: async () => {
        readAt.push(now);
        return [];
      },
      onRow: () => {},
      random: () => draw,
    }),
  );
  followers.forEach((f) => f.joined());
  assert.equal(readAt.length, 10, 'each boot read at once');
  readAt.length = 0;
  // Realtime restarts under all ten: they rejoin in the same instant.
  followers.forEach((f) => f.joined());
  for (; now < REJOIN_REFILL_SPREAD_MS; now += 100) t.mock.timers.tick(100);
  assert.equal(readAt.length, 10);
  const perSecond = new Map();
  for (const ms of readAt) perSecond.set(Math.floor(ms / 1000), (perSecond.get(Math.floor(ms / 1000)) ?? 0) + 1);
  assert.ok(Math.max(...perSecond.values()) <= 3, `at most three reads in any one second: ${[...perSecond]}`);
});

test('the socket reconnect keeps the library steps on average and spreads each one', () => {
  const steps = [1_000, 2_000, 5_000, 10_000, 10_000, 10_000];
  steps.forEach((step, i) => {
    assert.equal(realtimeReconnectAfterMs(i + 1, () => 0.5), step, 'the midpoint is the library step');
    assert.equal(realtimeReconnectAfterMs(i + 1, () => 0), step / 2);
    assert.ok(realtimeReconnectAfterMs(i + 1, () => 0.999_999) < step * 1.5);
  });
});
