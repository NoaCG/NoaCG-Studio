// guards: src/app/deploySkew.ts
//
// A PAGE LEFT OPEN ACROSS A DEPLOY RELOADS ONLY AT A SAFE MOMENT (issue #758). When it cannot load
// a code file, it reloads once nothing on it is on air, its own URL answers and saved work is on
// disk; a second failure right after such a reload, on the same build, is a blocked network, not a
// deploy, and the page stays. Pure, run here in Node; scripts/deploy-skew-build.test.mjs drives the
// built app.

import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec)) {
      const url = new URL(`${spec}.ts`, ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});

const { createSkewRecovery, holdReload, reloadHeld, LOOP_MS, RETRY_MS } = await import('../src/app/deploySkew.ts');

function page({ held = () => false, served = () => true, last = null, saved = () => true } = {}) {
  const log = [];
  let clock = 1_000_000;
  let stamp = last;
  const doors = {
    held,
    probe: async () => served(),
    settle: async () => {
      log.push('settle');
      return saved();
    },
    reload: () => log.push('reload'),
    now: () => clock,
    build: 'b1',
    lastReload: () => stamp,
    markReload: (mark) => {
      stamp = mark;
    },
    wait: async (ms) => {
      log.push(`wait ${ms}`);
      clock += ms;
    },
  };
  return { log, doors, stamp: () => stamp, at: () => clock };
}

test('nothing on air: settles, then reloads once and remembers when', async () => {
  const p = page();
  const recover = createSkewRecovery(p.doors);
  assert.equal(await recover(), 'reloaded');
  assert.deepEqual(p.log, ['settle', 'reload']);
  assert.deepEqual(p.stamp(), { at: p.at(), build: 'b1' });
});

test('a graphic on air holds the reload until air clears', async () => {
  let up = 3;
  const p = page({ held: () => up-- > 0 });
  assert.equal(await createSkewRecovery(p.doors)(), 'reloaded');
  assert.deepEqual(p.log, [`wait ${RETRY_MS}`, `wait ${RETRY_MS}`, `wait ${RETRY_MS}`, 'settle', 'reload']);
});

test('a Take that lands while the probe is out holds the reload', async () => {
  let air = false;
  let probes = 0;
  const p = page({
    held: () => air,
    served: () => {
      if (++probes === 1) air = true; // the Take lands during the first probe
      return true;
    },
  });
  const wait = p.doors.wait;
  p.doors.wait = async (ms) => {
    air = false; // and is taken out while the page waits
    await wait(ms);
  };
  assert.equal(await createSkewRecovery(p.doors)(), 'reloaded');
  assert.deepEqual(p.log, ['settle', `wait ${RETRY_MS}`, 'settle', 'reload']);
});

test('a page whose own URL does not answer waits instead of reloading into an error page', async () => {
  let answers = 0;
  const p = page({
    served: () => {
      answers += 1;
      if (answers === 1) throw new Error('offline'); // a throw counts as no answer
      return answers > 2;
    },
  });
  assert.equal(await createSkewRecovery(p.doors)(), 'reloaded');
  assert.equal(p.log.filter((l) => l === 'reload').length, 1);
  assert.equal(p.log.filter((l) => l.startsWith('wait')).length, 2);
});

test('a second failure soon after a recovery reload into the same build stands down: no loop', async () => {
  const fresh = page({ last: { at: 1_000_000 - 1_000, build: 'b1' } });
  assert.equal(await createSkewRecovery(fresh.doors)(), 'looped');
  assert.deepEqual(fresh.log, []);
  const later = page({ last: { at: 1_000_000 - LOOP_MS - 1, build: 'b1' } });
  assert.equal(await createSkewRecovery(later.doors)(), 'reloaded');
});

test('a reload that came back on a new build may reload again for the next deploy', async () => {
  const p = page({ last: { at: 1_000_000 - 1_000, build: 'b0' } });
  assert.equal(await createSkewRecovery(p.doors)(), 'reloaded');
});

test('a refused recovery is not remembered: a later failure asks afresh', async () => {
  const p = page({ last: { at: 1_000_000 - 1_000, build: 'b1' } });
  const recover = createSkewRecovery(p.doors);
  assert.equal(await recover(), 'looped');
  await p.doors.wait(LOOP_MS);
  assert.equal(await recover(), 'reloaded');
});

test('a save that failed refuses the reload, and a later failure asks afresh', async () => {
  let ok = false;
  const p = page({ saved: () => ok });
  const recover = createSkewRecovery(p.doors);
  assert.equal(await recover(), 'unsaved');
  assert.deepEqual(p.log, ['settle']);
  ok = true;
  assert.equal(await recover(), 'reloaded');
});

test('several failures at once make one recovery', async () => {
  const p = page();
  const recover = createSkewRecovery(p.doors);
  const [a, b] = await Promise.all([recover(), recover()]);
  assert.equal(a, 'reloaded');
  assert.equal(b, 'reloaded');
  assert.equal(p.log.filter((l) => l === 'reload').length, 1);
});

test('holds: any registered page on air holds, and unregistering lets go', () => {
  assert.equal(reloadHeld(), false);
  let up = true;
  const release = holdReload(() => up);
  const idle = holdReload(() => false);
  assert.equal(reloadHeld(), true);
  up = false;
  assert.equal(reloadHeld(), false);
  up = true;
  release();
  idle();
  assert.equal(reloadHeld(), false);
});
