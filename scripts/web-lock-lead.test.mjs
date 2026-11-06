// guards: src/control/webLockLead.ts
//
// THE RELOAD LOCK AMONG A BROWSER'S TABS (#2250): a grant that runs after the watch let go of its
// lead lets the lock go at once, so another tab can lead. Against a lock manager that grants late
// on purpose (the window the issue names, which a real browser rarely opens), and against Node's
// own Web Locks for the plain order: ask, let go at once, ask again.

import test from 'node:test';
import assert from 'node:assert/strict';

const { webLockLead } = await import('../src/control/webLockLead.ts');

/** A lock manager whose grants the test runs by hand, aborted or not. */
function lateLocks() {
  const asks = [];
  return {
    asks,
    request: (key, options, callback) => {
      const ask = { key, options, settled: null };
      asks.push(ask);
      ask.grant = () => {
        ask.settled = Promise.resolve(callback({ name: key, mode: 'exclusive' }));
        return ask.settled;
      };
      return new Promise(() => {});
    },
  };
}

test('a grant that runs after release lets the lock go at once', async () => {
  const locks = lateLocks();
  const lead = webLockLead(locks, 'noacg-caspar-reload show-1');
  lead.release();
  // The browser had granted it already: the callback runs now.
  let freed = false;
  void locks.asks[0].grant().then(() => (freed = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(freed, true, 'the lock is handed back, not held until the tab closes');
  assert.equal(lead.held(), false);
});

test('a grant before release holds the lock until release', async () => {
  const locks = lateLocks();
  const lead = webLockLead(locks, 'k');
  let freed = false;
  void locks.asks[0].grant().then(() => (freed = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lead.held(), true);
  assert.equal(freed, false);
  lead.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lead.held(), false);
  assert.equal(freed, true);
});

test('with real Web Locks: asked, let go at once, asked again: the second is granted', async () => {
  assert.ok(globalThis.navigator?.locks, 'Node has Web Locks');
  const first = webLockLead(navigator.locks, 'reload-again');
  first.release();
  const second = webLockLead(navigator.locks, 'reload-again');
  for (let i = 0; i < 20 && !second.held(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(second.held(), true);
  second.release();
});

test('with real Web Locks: the holder knows when another tab waits for the same lock, and only that one (#2251)', async () => {
  const a = webLockLead(navigator.locks, 'reload-wait');
  for (let i = 0; i < 20 && !a.held(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await a.waiting(), false, 'alone');
  const other = webLockLead(navigator.locks, 'another production');
  assert.equal(await a.waiting(), false, 'the lock of another production is not this one');
  const b = webLockLead(navigator.locks, 'reload-wait');
  assert.equal(await a.waiting(), true, 'B waits');
  a.release();
  for (let i = 0; i < 20 && !b.held(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(b.held(), true, 'and leads once A lets go');
  b.release();
  other.release();
});

test('without Web Locks every tab holds it, as before #2245', async () => {
  const lead = webLockLead(undefined, 'k');
  assert.equal(lead.held(), true);
  assert.equal(await lead.waiting(), false);
  lead.release();
});
