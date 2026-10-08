// guards: src/output/swapPlan.ts
//
// PER-GRAPHIC REPLACEMENT (docs/work-specs/per-graphic-replacement/spec.md): which graphics a
// publish builds, adds and removes on one output, given the digests it holds and the ones the new
// stamp names, and which of them take over now and which wait, given what is on air. Pure, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { planPublish, swapMoment, swapsNow, swapStatus } = await import('../src/output/swapPlan.ts');

const keys = (o) => Object.keys(o);

test('a publish builds only the graphics whose digest moved, and adds and removes the rest', () => {
  const held = { Scorebug: 'a1', Strap: 'b1', Bug: 'c1' };
  const next = { Scorebug: 'a1', Strap: 'b2', Ticker: 'd1' };
  assert.deepEqual(planPublish({ held, ready: {} }, next, keys(next)), {
    build: ['Strap'],
    add: ['Ticker'],
    remove: ['Bug'],
    drop: [],
  });
  // Nothing moved: nothing to do.
  assert.deepEqual(planPublish({ held, ready: {} }, held, keys(held)), { build: [], add: [], remove: [], drop: [] });
});

test('a frame already prepared for the published digest is kept; one made stale is dropped', () => {
  const held = { Scorebug: 'a1', Strap: 'b1' };
  // Scorebug's v2 waits for clear; the next publish names the same v2: nothing to build again.
  assert.deepEqual(planPublish({ held, ready: { Scorebug: 'a2' } }, { Scorebug: 'a2', Strap: 'b1' }, ['Scorebug', 'Strap']).build, []);
  // …moved on to v3: the waiting frame goes, a new one is built.
  assert.deepEqual(planPublish({ held, ready: { Scorebug: 'a2' } }, { Scorebug: 'a3', Strap: 'b1' }, ['Scorebug', 'Strap']), {
    build: ['Scorebug'],
    add: [],
    remove: [],
    drop: ['Scorebug'],
  });
  // …or back to what airs: the waiting frame goes, nothing is built.
  assert.deepEqual(planPublish({ held, ready: { Scorebug: 'a2' } }, { Scorebug: 'a1', Strap: 'b1' }, ['Scorebug', 'Strap']), {
    build: [],
    add: [],
    remove: [],
    drop: ['Scorebug'],
  });
  // …or removed altogether: it leaves, and so does the waiting frame.
  assert.deepEqual(planPublish({ held, ready: { Scorebug: 'a2' } }, { Strap: 'b1' }, ['Strap']), {
    build: [],
    add: [],
    remove: ['Scorebug'],
    drop: ['Scorebug'],
  });
});

test('a digest nobody knows (a boot payload without a stamp) is always built again', () => {
  const held = { Scorebug: '', Strap: '' };
  assert.deepEqual(planPublish({ held, ready: {} }, { Scorebug: 'a1', Strap: 'b1' }, ['Scorebug', 'Strap']).build, ['Scorebug', 'Strap']);
});

test('an off-air change takes over once its frame stands still; an on-air one waits', () => {
  assert.equal(swapMoment({ onAir: false, still: true }), 'swap');
  assert.equal(swapMoment({ onAir: false, still: false }), 'settle');
  assert.equal(swapMoment({ onAir: true, still: true }), 'wait');
  assert.equal(swapMoment({ onAir: true, still: false }), 'wait');
  // A scorebug on air and a lower third off air, both changed: the lower third goes, the scorebug waits.
  const air = { Scorebug: true, Strap: false, Bug: false };
  const still = { Strap: true, Bug: false };
  assert.deepEqual(
    swapsNow(['Scorebug', 'Strap', 'Bug'], (g) => ({ onAir: air[g], still: still[g] ?? false })),
    { swap: ['Strap'], settle: ['Bug'], wait: ['Scorebug'] },
  );
});

test('the status names what waits and what failed, and says nothing once every graphic holds the version', () => {
  const version = { n: 13, h: 'h13' };
  const base = { version, of: 2, id: 'p1', waiting: [], failed: [], holds: false };
  assert.equal(swapStatus({ ...base, holds: true }), undefined);
  assert.deepEqual(swapStatus({ ...base, waiting: ['Scorebug'] }), { s: 'waiting', v: version, of: 2, n: 2, id: 'p1', air: 1, w: ['Scorebug'] });
  const issue = { k: 'script', g: 'Quiz', d: 'boom' };
  // A failure leads; what waits rides along with it.
  assert.deepEqual(swapStatus({ ...base, failed: [issue], waiting: ['Scorebug'] }), { s: 'failed', v: version, of: 2, n: 2, id: 'p1', is: [issue], w: ['Scorebug'] });
  // Built and about to take over (a frame finishing its exit): still preparing, briefly.
  assert.deepEqual(swapStatus(base), { s: 'preparing', v: version, of: 2, n: 2, id: 'p1' });
});
