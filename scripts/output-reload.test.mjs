// guards: src/output/reload.ts, src/output/prepare.ts, src/control/outputRecovery.ts
//
// A TAKE AT THE MOMENT AN OUTPUT RELOADS IS NEVER LOST (issue #757). Prepare for Live and a new
// renderer build reload the output page once nothing is on air, after probing its own URL. A Take
// that lands while that probe is out stays on air and the reload waits; a Take that reaches the log
// after the reload has started is replayed by the reloaded page. A URL that never answers holds
// nothing up: the probe gives up in bounded time and the output says why it waits (issue #1051).
// Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// prepare.ts imports without extensions, as Vite does, and its whole-page path builds frames in a
// stage this test never reaches: resolve the one, stand in for the other.
const STAGE = new URL('../src/output/stage.ts', import.meta.url).href;
registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec)) {
      const url = new URL(`${spec}.ts`, ctx.parentURL);
      if (url.href === STAGE) return { url: 'data:text/javascript,export const FRAME_LOAD_MS = 0; export function createOutputStage() { throw new Error("no stage in Node"); }', shortCircuit: true };
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});

const { reloadWhenClear } = await import('../src/output/reload.ts');
const { createPreparer } = await import('../src/output/prepare.ts');
const { planOutputRecovery, seqBaselines, alreadyInSnapshot } = await import('../src/control/outputRecovery.ts');

/** An output page whose URL probe is held open until `answer` is called. */
function page() {
  let air = 0;
  let reloads = 0;
  let answer;
  const pending = new Promise((resolve) => {
    answer = resolve;
  });
  const doors = { probe: () => pending, onAir: () => air, reload: () => (reloads += 1) };
  return { doors, answer: (ok) => answer(ok), take: () => (air += 1), get reloads() { return reloads; } };
}

test('a Take that lands while the URL probe is out keeps the page up', async () => {
  const p = page();
  // Prepare for Live found nothing on air and asked for the reload.
  const reloading = reloadWhenClear(p.doors);
  p.take();
  p.answer(true);
  assert.equal(await reloading, 'on-air', 'the caller is told it did not reload, and waits for air to clear');
  assert.equal(p.reloads, 0);
});

test('with nothing on air, the page reloads once its URL answers', async () => {
  const p = page();
  const reloading = reloadWhenClear(p.doors);
  assert.equal(p.reloads, 0, 'not before the probe answers');
  p.answer(true);
  assert.equal(await reloading, 'reloaded');
  assert.equal(p.reloads, 1);
});

test('a URL that does not answer, or throws, never reloads', async () => {
  const p = page();
  const reloading = reloadWhenClear(p.doors);
  p.answer(false);
  assert.equal(await reloading, 'unreachable');
  assert.equal(p.reloads, 0);

  let reloads = 0;
  const thrown = await reloadWhenClear({ probe: () => Promise.reject(new TypeError('Failed to fetch')), onAir: () => 0, reload: () => (reloads += 1) });
  assert.equal(thrown, 'unreachable');
  assert.equal(reloads, 0);
});

test('a URL that connects but never answers gives up within the probe time, and the request is aborted', async () => {
  let signal;
  let reloads = 0;
  const started = Date.now();
  const outcome = await reloadWhenClear({
    // A fetch on a network that connects and then says nothing: it never settles on its own.
    probe: (s) => {
      signal = s;
      return new Promise(() => {});
    },
    onAir: () => 0,
    reload: () => (reloads += 1),
    probeMs: 40,
  });
  assert.equal(outcome, 'unreachable');
  assert.ok(Date.now() - started < 1000, 'not held until the browser gives up');
  assert.equal(signal.aborted, true, 'the request itself is let go');
  assert.equal(reloads, 0);
});

/** A preparer whose next version needs a whole-page reload (another stage resolution, no graphic
 *  changed) and whose own URL never answers: `probe` runs when it is asked, and never settles. */
function wholePage({ resolve = async () => PAYLOAD, onAir = () => 0, probe = () => {}, newBuild = async () => false, now } = {}) {
  const reports = [];
  let probes = 0;
  const preparer = createPreparer({
    held: { n: 1, at: '', h: 'aaaa', g: { Strap: 's1' } },
    resolution: { width: 1920, height: 1080 },
    resolve,
    onAir,
    swapper: { tick() {}, holds: () => false, waiting: () => [], failed: () => [], apply: async () => 0 },
    newBuild,
    recheck: async () => {},
    report: (chg) => reports.push(chg),
    reload: () =>
      reloadWhenClear({
        probe: () => {
          probes += 1;
          probe();
          return new Promise(() => {});
        },
        onAir,
        reload: () => assert.fail('no reload'),
        probeMs: 20,
      }),
    adopt: () => true,
    ...(now ? { now } : {}),
  });
  return { preparer, reports, get probes() { return probes; } };
}
const PAYLOAD = { ver: { n: 2, at: '', h: 'bbbb', g: { Strap: 's1' } }, resolution: { width: 3840, height: 2160 }, graphics: [{ key: 'Strap' }], cues: [] };

test('Prepare for Live: a reload refused for a silent URL says so, and the next request runs', async () => {
  let clock = 0;
  let resolves = 0;
  let serverAnswers = true;
  const { preparer, reports } = wholePage({
    resolve: async () => {
      resolves += 1;
      return serverAnswers ? PAYLOAD : null;
    },
    now: () => clock,
  });

  preparer.request({ id: 'p1' });
  await until(() => reports.some((r) => r?.s === 'waiting'));
  assert.deepEqual(reports.at(-1), { s: 'waiting', v: { n: 2, h: 'bbbb' }, of: 0, n: 0, air: 0, why: 'unreachable', id: 'p1' });

  // On the same dead network the server may not answer the retry either: it stays a retry, as
  // READY says, and is asked again on a later tick.
  serverAnswers = false;
  for (const asked of [2, 3]) {
    clock += 15_000;
    preparer.tick();
    await until(() => resolves === asked);
    await new Promise((r) => setTimeout(r, 10));
  }

  // The preparer is free: the next request runs.
  serverAnswers = true;
  clock += 15_000;
  preparer.request({ id: 'p2' });
  await until(() => resolves === 4);
  await until(() => reports.at(-1)?.id === 'p2' && reports.at(-1).s === 'waiting');
});

test('a Take during a probe that never answers: the output says it waits for air, not for its page', async () => {
  let air = 0;
  // The Take lands while the probe is out.
  const { preparer, reports } = wholePage({ onAir: () => air, probe: () => (air = 1) });
  preparer.request({ id: 'p1' });
  await until(() => reports.some((r) => r?.s === 'waiting'));
  assert.deepEqual(reports.at(-1), { s: 'waiting', v: { n: 2, h: 'bbbb' }, of: 0, n: 0, air: 1, id: 'p1' });
});

test('a new build and another resolution at once: one silent probe per run, not two', async () => {
  const page = wholePage({ newBuild: async () => true });
  page.preparer.request({ id: 'p1' });
  await until(() => page.reports.some((r) => r?.s === 'waiting'));
  assert.equal(page.reports.at(-1).why, 'unreachable');
  assert.equal(page.probes, 1);
});

/** Resolves once `ready()` holds; fails the test after a second. */
async function until(ready) {
  const end = Date.now() + 1000;
  while (!ready()) {
    if (Date.now() > end) assert.fail('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

test('a Take that reaches the log after the reload started is replayed by the reloaded page', () => {
  // Both graphics last reported at seq 40. The Take of Strap is row 41: the old page never reported
  // it (a report waits 800 ms), or never applied it before it unloaded.
  const live = { Scorebug: { seq: 40, event: 900 }, Strap: { seq: 40, event: 900 } };
  const plan = planOutputRecovery(['Scorebug', 'Strap'], seqBaselines(live));
  assert.equal(plan.followFrom, 40, 'the boot reads the log after the oldest report');
  assert.equal(alreadyInSnapshot(plan.snapshotAt, 'Strap', 41), false, 'the Take is replayed');

  // The old page did report Strap after the Take: its pose comes back from the report, and the
  // row is not played a second time.
  const reported = planOutputRecovery(['Scorebug', 'Strap'], seqBaselines({ ...live, Strap: { seq: 41, event: 901 } }));
  assert.equal(reported.followFrom, 40);
  assert.equal(alreadyInSnapshot(reported.snapshotAt, 'Strap', 41), true);
});

test('a version other than the one held is prepared at once; a re-check of the held one keeps the 15 s spacing (G3 section 6)', async () => {
  let clock = 1_000_000;
  let resolves = 0;
  const { preparer } = wholePage({
    resolve: async () => {
      resolves += 1;
      return null; // nothing to take: each run ends at once
    },
    now: () => clock,
  });
  preparer.request({ id: 'v2', n: 2, h: 'bbbb' });
  await until(() => resolves === 1);
  await new Promise((r) => setTimeout(r, 10));
  preparer.request({ id: 'v3', n: 3, h: 'cccc' });
  await until(() => resolves === 2);
  await new Promise((r) => setTimeout(r, 10));
  // Neither was taken (the server gave nothing), so a later check asks again.
  assert.deepEqual(preparer.version(), { n: 1, h: 'aaaa' });
  preparer.request({ id: 'again', n: 1, h: 'aaaa' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(resolves, 2, 'a re-check of the version held waits for its spacing');
  assert.deepEqual(preparer.version(), { n: 1, h: 'aaaa' });
  // Its turn comes once the spacing has passed (the timer it set fires on the real clock).
  clock += 15_000;
});
