// guards: src/output/versionCheck.ts
//
// A NEW OUTPUT CHECKS THE PUBLISHED VERSION ITSELF (live-publishing designs/G3.md section 6, R13,
// R14): on boot, on a poke, every 30 s, retrying 2, 4, 8 s, asking only for a version it does not
// hold or take, and stopping where the server has no such function.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { createVersionCheck, CHECK_EVERY_MS } = await import('../src/output/versionCheck.ts');

function clock() {
  let now = 0;
  let timers = [];
  return {
    now: () => now,
    setTimer(ms, run) { const t = { at: now + ms, run, live: true }; timers.push(t); return () => { t.live = false; }; },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        timers = timers.filter((t) => t.live);
        const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at; next.live = false; next.run(); await settle();
      }
      now = end; await settle();
    },
  };
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function world(c, answer = 'ok') {
  const w = { published: { n: 1, h: 'a' }, held: { n: 1, h: 'a' }, probes: [], requests: [], answer };
  w.check = createVersionCheck({
    setTimer: c.setTimer,
    probe: async () => {
      w.probes.push(c.now());
      if (w.answer === 'absent') return 'absent';
      if (w.answer === 'none') return null;
      return { ver: w.published };
    },
    current: () => w.held,
    request: (v) => { w.requests.push(v); w.held = v; },
  });
  return w;
}

test('checks on boot and every 30 s, asking only for a version it does not hold', async () => {
  const c = clock();
  const w = world(c);
  await settle();
  assert.deepEqual(w.probes, [0]);
  assert.deepEqual(w.requests, []);
  w.published = { n: 2, h: 'b' };
  await c.advance(CHECK_EVERY_MS);
  assert.deepEqual(w.probes, [0, CHECK_EVERY_MS]);
  assert.deepEqual(w.requests, [{ n: 2, h: 'b' }]);
  await c.advance(CHECK_EVERY_MS);
  assert.equal(w.requests.length, 1, 'the version taken is not asked for again');
  w.check.stop();
});

test('a poke checks at once (rejoin, online, request)', async () => {
  const c = clock();
  const w = world(c);
  await settle();
  w.published = { n: 3, h: 'c' };
  await c.advance(1_000);
  w.check.poke(); await settle();
  assert.deepEqual(w.requests, [{ n: 3, h: 'c' }]);
  w.check.stop();
});

test('an unanswered probe retries after 2, 4 and 8 s, then waits for the period; within 90 s once answered', async () => {
  const c = clock();
  const w = world(c, 'none');
  await settle();
  await c.advance(14_000);
  assert.deepEqual(w.probes, [0, 2_000, 6_000, 14_000]);
  w.answer = 'ok';
  w.published = { n: 4, h: 'd' };
  await c.advance(90_000 - 14_000);
  assert.deepEqual(w.requests, [{ n: 4, h: 'd' }]);
  w.check.stop();
});

test('an instance without the function stops the checks', async () => {
  const c = clock();
  const w = world(c, 'absent');
  await settle();
  await c.advance(5 * CHECK_EVERY_MS);
  assert.deepEqual(w.probes, [0]);
  w.check.poke(); await settle();
  assert.deepEqual(w.probes, [0]);
});
