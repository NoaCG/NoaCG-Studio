// guards: src/control/autoPublish.ts
//
// AUTOMATIC UPDATES (docs/work-specs/live-publishing/designs/G3.md section 3, rules R6 to R9, R18).
// A small simulated world: a server holding the record's revision and the published one, with the
// guard's rule (a publish of an older revision changes nothing), a virtual clock, and pages that save,
// fail, close and open. The checks are the rules' own words, not the module's algorithm.

import test from 'node:test';
import assert from 'node:assert/strict';

const { createAutoPublisher, OTHERS_GRACE_MS, RED_AFTER_MS, RED_HEADER } = await import('../src/control/autoPublish.ts');
assert.equal(RED_HEADER, 'Saved, not on the outputs');

/** A virtual clock with timers. */
function clock() {
  let now = 0;
  let timers = [];
  return {
    now: () => now,
    setTimer(ms, run) {
      const t = { at: now + ms, run, live: true };
      timers.push(t);
      return () => { t.live = false; };
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        timers = timers.filter((t) => t.live);
        const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        next.live = false;
        next.run();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** The server: the record's revision and the published one, with the guard. */
function server() {
  return {
    rev: 1,
    published: null,
    publishes: [],
    save() { this.rev += 1; return this.rev; },
    land(rev) {
      this.publishes.push(rev);
      if (this.published !== null && rev < this.published) return false;
      this.published = rev;
      return true;
    },
  };
}

/** A page holding a record that is `held` (a revision it has confirmed, or null while catching up). */
function page(world, c, opts = {}) {
  const p = {
    held: world.rev,
    views: [],
    fail: opts.fail ?? (() => null),
    calls: 0,
  };
  p.pub = createAutoPublisher({
    now: c.now,
    setTimer: c.setTimer,
    confirmed: async () => (p.held === world.rev ? { rev: p.held } : { wait: p.held > world.rev ? 'local' : 'server' }),
    stored: async () => ({ rev: world.rev, published: world.published }),
    catchUp: async () => { p.held = world.rev; },
    publish: async (rev) => {
      p.calls += 1;
      const failed = p.fail(rev, p.calls);
      if (failed) return failed;
      return world.land(rev) ? { kind: 'published', rev } : { kind: 'superseded' };
    },
    changed: (v) => p.views.push(v),
  });
  p.save = () => { p.held = world.save(); p.pub.saved(); };
  return p;
}

test('R6: one publish at a time; saves meanwhile are published after it, newest only', async () => {
  const c = clock();
  const world = server();
  let release;
  const p = page(world, c);
  const slow = createAutoPublisher({
    now: c.now, setTimer: c.setTimer,
    confirmed: async () => ({ rev: world.rev }),
    stored: async () => ({ rev: world.rev, published: world.published }),
    catchUp: async () => {},
    publish: (rev) => new Promise((r) => { release = () => r(world.land(rev) ? { kind: 'published', rev } : { kind: 'superseded' }); }),
    changed: () => {},
  });
  p.pub.stop();
  world.save(); slow.saved(); await settle();
  world.save(); slow.saved(); world.save(); slow.saved(); await settle();
  assert.deepEqual(world.publishes, []);
  release(); await settle();
  assert.equal(world.publishes.length, 1);
  release(); await settle();
  assert.deepEqual(world.publishes, [2, 4], 'the second publish is the newest save, not each one');
  assert.equal(world.published, 4);
  slow.stop();
});

test('R7: a transient failure retries 2, 4, 8 s and reads red after the second; the save is kept', async () => {
  const c = clock();
  const world = server();
  const p = page(world, c, { fail: (rev, n) => (n <= 3 ? { kind: 'transient', reason: 'the server did not answer' } : null) });
  p.save(); await settle();
  assert.equal(p.calls, 1);
  assert.equal(p.pub.view().tone, 'amber');
  await c.advance(2_000);
  assert.equal(p.calls, 2);
  assert.equal(p.pub.view().tone, 'red');
  assert.match(p.pub.view().line, /the server did not answer/);
  await c.advance(4_000);
  assert.equal(p.calls, 3);
  await c.advance(8_000);
  assert.equal(p.calls, 4);
  assert.equal(world.published, world.rev);
  assert.equal(p.pub.view().tone, 'idle');
  p.pub.stop();
});

test('R7: a refusal is not retried until a newer save, and reads red at once with its line', async () => {
  const c = clock();
  const world = server();
  let refuse = true;
  const p = page(world, c, { fail: () => (refuse ? { kind: 'refused', refusal: 'gate', reason: 'Scorebug cannot go on air: it has a script error. Fix it and the next save publishes.' } : null) });
  p.save(); await settle();
  assert.equal(p.pub.view().tone, 'red');
  assert.match(p.pub.view().line, /Scorebug cannot go on air/);
  await c.advance(120_000);
  assert.equal(p.calls, 1, 'no retry of a refusal');
  refuse = false;
  p.save(); await settle();
  assert.equal(world.published, world.rev);
  assert.equal(p.pub.view().tone, 'idle');
  p.pub.stop();
});

test('R8: a save whose page closed is published at once by the next page that opens', async () => {
  const c = clock();
  const world = server();
  const a = page(world, c, { fail: () => ({ kind: 'transient', reason: 'offline' }) });
  a.save(); await settle();
  a.pub.stop(); // the page closes
  assert.equal(world.published, null);
  const b = page(world, c);
  b.held = world.rev - 1; // it opens holding an older record
  b.pub.check(true); await settle();
  assert.equal(world.published, world.rev);
  b.pub.stop();
});

test('R8: an open page publishes another page\'s save after the grace, not before', async () => {
  const c = clock();
  const world = server();
  const watcher = page(world, c);
  world.save(); // another page saved and then went silent
  watcher.pub.check(false); await settle();
  assert.equal(world.published, null);
  assert.equal(watcher.pub.view().tone, 'amber');
  await c.advance(OTHERS_GRACE_MS - 1);
  assert.equal(world.published, null);
  await c.advance(1);
  assert.equal(world.published, world.rev);
  watcher.pub.stop();
});

test('R18: a revision waiting 20 s reads red', async () => {
  const c = clock();
  const world = server();
  const p = page(world, c);
  p.held = world.rev + 1; // a save of this page still on its way
  p.pub.saved(); await settle();
  assert.equal(p.pub.view().tone, 'amber');
  await c.advance(RED_AFTER_MS);
  assert.equal(p.pub.view().tone, 'red');
  p.pub.stop();
});

test('R3 and R8: random saves, failures, closes and opens end with the newest save published, never going down', async () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let round = 0; round < 200; round++) {
    const c = clock();
    const world = server();
    const pages = [];
    const open = () => {
      const p = page(world, c, { fail: () => (rnd() < 0.3 ? { kind: 'transient', reason: 'x' } : null) });
      p.held = world.rev;
      pages.push(p);
      p.pub.check(true);
    };
    open(); open();
    let last = null;
    for (let step = 0; step < 30; step++) {
      const live = pages.filter((p) => !p.closed);
      const r = rnd();
      if (r < 0.5 && live.length) { const p = live[Math.floor(rnd() * live.length)]; p.save(); }
      else if (r < 0.6 && live.length > 1) { const p = live[0]; p.closed = true; p.pub.stop(); }
      else if (r < 0.7) open();
      await c.advance(Math.floor(rnd() * 5_000));
      if (last !== null && world.published !== null) assert.ok(world.published >= last, 'the published revision never goes down');
      last = world.published;
    }
    const survivor = pages.find((p) => !p.closed);
    survivor.fail = () => null;
    await c.advance(120_000);
    assert.equal(world.published, world.rev, `round ${round}: the newest save is published`);
    for (const p of pages) p.pub.stop();
  }
});
