// guards: src/control/storePart.ts
//
// The part primitive every page store is made of (production-page refactor D1, AC-6): `get` and
// `subscribe` keep their identity for the part's life, which `useSyncExternalStore` needs, and a
// listener hears only an actual change, which is what lets a part move without re-rendering a
// surface that did not read it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { storePart } from '../src/control/storePart.ts';

test('get and subscribe keep their identity across writes', () => {
  const part = storePart({ n: 1 });
  const { get, subscribe, set } = part;
  set({ n: 2 });
  set((prev) => ({ n: prev.n + 1 }));
  assert.equal(part.get, get);
  assert.equal(part.subscribe, subscribe);
  assert.deepEqual(get(), { n: 3 });
});

test('a listener hears a change, and only a change', () => {
  const value = { n: 1 };
  const part = storePart(value);
  let heard = 0;
  part.subscribe(() => (heard += 1));
  part.set(value);
  part.set((prev) => prev);
  assert.equal(heard, 0, 'the same value is no change');
  part.set({ n: 1 });
  assert.equal(heard, 1, 'a new object is a change, even with equal contents');
  part.set(NaN);
  part.set(NaN);
  assert.equal(heard, 2, 'Object.is: NaN equals itself');
});

test('an updater reads the newest value', () => {
  const part = storePart(0);
  part.set((n) => n + 1);
  part.set((n) => n + 1);
  assert.equal(part.get(), 2);
});

test('unsubscribe stops the listener, and a listener may unsubscribe while being told', () => {
  const part = storePart(0);
  const heard = [];
  const offA = part.subscribe(() => {
    heard.push('a');
    offA();
  });
  const offB = part.subscribe(() => heard.push('b'));
  part.set(1);
  part.set(2);
  assert.deepEqual(heard, ['a', 'b', 'b']);
  offB();
  part.set(3);
  assert.deepEqual(heard, ['a', 'b', 'b']);
  assert.equal(part.get(), 3, 'the value still moves with nobody listening');
});

test('the server playout store still builds on it', async () => {
  const { createServerPlayoutStore } = await import('../src/control/serverPlayoutStore.ts');
  const store = createServerPlayoutStore();
  let ownership = 0;
  let timing = 0;
  store.ownership.subscribe(() => (ownership += 1));
  store.timing.subscribe(() => (timing += 1));
  store.apply((parts) => ({ ...parts, timing: { 'casparcg:1-10': { at: 1 } } }));
  assert.equal(timing, 1);
  assert.equal(ownership, 0, 'a timing move reaches only the timing listeners');
});
