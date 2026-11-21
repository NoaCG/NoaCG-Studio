// guards: src/control/seqSend.ts
//
// #2655 R7 AGAINST A REFERENCE MODEL (docs/work-specs/live-publishing/evidence/fix-2655.md). The
// lanes of `createGraphicFifo` are driven through random scenarios: presses of one or two graphics,
// each held or not, each replacing or only modifying its graphics, each ending after its own time
// or never. The oracle does not compute a schedule the way the code does; it states each Rule as
// a property of the schedule the code produced, and checks every scenario against all of them:
//
//   lane order   no press leaves before an earlier press of a shared graphic has left (R7);
//   modifying    a press that only modifies a graphic never leaves while an earlier press of it
//                that is held, or that waited behind a held press, is still out (R7, transitive);
//   replacing    a press that replaces its graphics leaves no later than 1.5 s after each earlier
//                press of them left, or when it ended if sooner (R7, newest wins);
//   no hold      a lane with no held press keeps today's release: 1.5 s after the press ahead left;
//   at once      a press sharing no graphic with an earlier press still out leaves at once;
//   live         every press whose predecessors all end leaves (no deadlock).
//
// As hostedControl.ts does (`laneEnders`), a replacing press ends every earlier press still out on
// the graphics it shares, the moment it is pressed.

import test from 'node:test';
import assert from 'node:assert/strict';

const { createGraphicFifo } = await import('../src/control/seqSend.ts');

const RELEASE = 1500;
const STEP = 10;

/** A small seeded random source, so a failing scenario can be replayed by its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function scenario(seed) {
  const random = rng(seed);
  const graphics = ['A', 'B', 'C'];
  const presses = [];
  let at = 0;
  const count = 3 + Math.floor(random() * 6);
  for (let i = 0; i < count; i += 1) {
    at += Math.floor(random() * 6) * 250;
    const keys = random() < 0.3 ? [graphics[Math.floor(random() * 3)], graphics[Math.floor(random() * 3)]] : [graphics[Math.floor(random() * 3)]];
    const unique = [...new Set(keys)];
    const replaces = random() < 0.5;
    const held = random() < 0.6;
    // How long it is out once it leaves: quick, slow, or (rarely) until the scenario ends.
    const roll = random();
    // Never a multiple of the press spacing, so no send ends at the very instant a press is made.
    const out = roll < 0.4 ? 210 : roll < 0.85 ? 1010 + Math.floor(random() * 9) * 1000 : Infinity;
    presses.push({ i, at, keys: unique, replaces, held, out });
  }
  return presses;
}

async function run(t, presses) {
  const fifo = createGraphicFifo(RELEASE);
  const started = new Map();
  const ended = new Map();
  const waitedBehindHeld = new Map();
  const enders = new Map();
  let now = 0;
  const flush = async () => {
    for (let k = 0; k < 5; k += 1) await new Promise((r) => setImmediate(r));
  };
  for (const p of presses) {
    setTimeout(() => {
      if (p.replaces) {
        for (const q of presses) if (q.i < p.i && q.keys.some((k) => p.keys.includes(k)) && !ended.has(q.i)) enders.get(q.i)?.();
      }
      let endEarly = () => {};
      const endedEarly = new Promise((resolve) => (endEarly = resolve));
      const stop = new AbortController();
      enders.set(p.i, () => {
        if (!ended.has(p.i)) ended.set(p.i, now);
        endEarly();
        stop.abort(new Error('replaced'));
      });
      void fifo
        .run(
          p.keys,
          (lane) => {
            started.set(p.i, now);
            waitedBehindHeld.set(p.i, lane.waitedBehindHeld);
            const own = p.out === Infinity ? new Promise(() => {}) : new Promise((resolve) => setTimeout(resolve, p.out));
            return Promise.race([own, endedEarly]).then(() => {
              if (!ended.has(p.i)) ended.set(p.i, now);
            });
          },
          { held: p.held, replaces: () => p.replaces, stop: stop.signal },
        )
        .catch(() => {});
    }, p.at);
  }
  await flush();
  const horizon = Math.max(...presses.map((p) => p.at)) + 60_000;
  while (now < horizon) {
    now += STEP;
    t.mock.timers.tick(STEP);
    await flush();
  }
  return { started, ended, waitedBehindHeld };
}

function check(presses, { started, ended }) {
  const shares = (a, b) => a.keys.some((k) => b.keys.includes(k));
  const endOf = (j) => (ended.has(j) ? ended.get(j) : Infinity);
  // Which presses are "slow" for a later modifying press: held, or waited behind a slow one.
  const slow = new Map();
  for (const p of presses) {
    const behindSlow = presses.some((q) => q.i < p.i && shares(p, q) && slow.get(q.i) && endOf(q.i) > p.at);
    slow.set(p.i, p.held || behindSlow);
  }
  for (const p of presses) {
    const s = started.get(p.i);
    const earlier = presses.filter((q) => q.i < p.i && shares(p, q));
    const out = earlier.filter((q) => endOf(q.i) > p.at);
    // live: every press whose earlier presses all end, or which replaces, leaves.
    const blocked = earlier.some((q) => !p.replaces && slow.get(q.i) && endOf(q.i) === Infinity);
    // A later press that replaces one of its graphics may end it before it leaves (R7).
    const endedWaiting = presses.some((q) => q.i > p.i && q.replaces && shares(p, q)) && ended.has(p.i);
    if (!blocked && !endedWaiting) assert.ok(s !== undefined, `press ${p.i} never left (no deadlock)`);
    if (s === undefined) continue;
    for (const q of earlier) {
      const qs = started.get(q.i);
      // An earlier press ended before it ever left is out of the lane: nothing waits for it.
      if (qs === undefined && ended.has(q.i) && endOf(q.i) <= s) continue;
      assert.ok(qs !== undefined && qs <= s, `lane order: press ${p.i} left before earlier press ${q.i}`);
      if (!p.replaces && slow.get(q.i)) {
        assert.ok(endOf(q.i) <= s || endOf(q.i) <= p.at, `modifying press ${p.i} left while slow press ${q.i} was out`);
      }
      if (p.replaces) {
        const bound = Math.max(p.at, Math.min(endOf(q.i), qs + RELEASE));
        assert.ok(s <= bound + STEP * 2, `replacing press ${p.i} waited past 1.5 s behind ${q.i} (${s} > ${bound})`);
      }
    }
    const latest = Math.max(p.at, ...earlier.map((q) => {
      const qs = started.get(q.i) ?? Infinity;
      return !p.replaces && slow.get(q.i) ? endOf(q.i) : Math.min(endOf(q.i), qs + RELEASE);
    }));
    if (Number.isFinite(latest)) assert.ok(s <= latest + STEP * 2, `press ${p.i} waited longer than the Rules allow (${s} > ${latest})`);
    if (out.length === 0) assert.ok(s <= p.at + STEP, `press ${p.i} shared nothing still out and should leave at once`);
  }
}

test('R7 lanes hold every Rule over 300 random scenarios', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (let seed = 1; seed <= 300; seed += 1) {
    const presses = scenario(seed);
    const result = await run(t, presses);
    try {
      check(presses, result);
    } catch (e) {
      e.message = `seed ${seed}: ${e.message}\n${JSON.stringify(presses)}`;
      throw e;
    }
    t.mock.timers.reset();
    t.mock.timers.enable({ apis: ['setTimeout'] });
  }
});
