// guards: src/control/productionDataSession.ts
//
// The production's live tree on the page (production-page refactor phase 7, spec §2, §5.3 "published
// data: no local dispatch; the key resolves before any dispatch"): the dataKey gate (a key not yet
// read, `undefined`, dispatches nothing; a published key dispatches nothing; only `null` does), the
// two write roads (the owner's key and the operator's slug, each holding the server's answer), the
// other tab's write, and disposal (a late answer changes nothing, nothing more is sent).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayoutSession } from '../src/control/playoutSession.ts';
import { createProductionDataSession } from '../src/control/productionDataSession.ts';
import { resolveBindings } from '../src/model/productionData.ts';

/** A promise the test settles by hand, so an answer can arrive late, or after disposal. */
function held() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Fake browser doors, recording every call. `keys`, `fetches`, `patches` and `slugPatches` are
 *  queues of held answers the test settles. */
function fakeIo({ local = {}, backendConfigured = true } = {}) {
  const calls = { saved: [], keyReads: [], fetched: [], patched: [], slugPatched: [], notes: [] };
  const answers = { keys: [], fetches: [], patches: [], slugPatches: [] };
  const storage = new Set();
  const store = { ...local };
  const next = (queue) => {
    const h = held();
    queue.push(h);
    return h.promise;
  };
  const io = {
    backendConfigured,
    loadLiveData: (id) => store[id] ?? {},
    saveLiveData: (id, data) => {
      store[id] = data;
      calls.saved.push([id, data]);
    },
    productionDataKey: (id) => {
      calls.keyReads.push(id);
      return next(answers.keys);
    },
    fetchProductionData: (key) => {
      calls.fetched.push(key);
      return next(answers.fetches);
    },
    patchProductionData: (key, patch) => {
      calls.patched.push([key, patch]);
      return next(answers.patches);
    },
    patchProductionDataBySlug: (slug, patch) => {
      calls.slugPatched.push([slug, patch]);
      return next(answers.slugPatches);
    },
    onStorage: (listener) => {
      storage.add(listener);
      return () => storage.delete(listener);
    },
    note: (text) => calls.notes.push(text),
  };
  const otherTab = (id, data) => {
    store[id] = data;
    for (const listener of [...storage]) listener();
  };
  return { io, calls, answers, storage, otherTab };
}

function setup(opts) {
  const fake = fakeIo(opts);
  const session = createPlayoutSession('prod-1');
  const data = createProductionDataSession(session, fake.io);
  const sent = [];
  const send = (batches, label) => {
    sent.push({ batches, label });
    return Promise.resolve(null);
  };
  return { ...fake, session, data, sent, send };
}

const bindings = { Score: { f0: 'home', f1: 'away' } };

/** Dispatch as the page does after a render: what the part's tree resolves to, with that tree. */
function dispatchNow(t, b) {
  const tree = t.session.data.get().liveData;
  t.data.dispatch(resolveBindings(tree, b), tree, t.send);
}

test('unpublished: the local tree seeds, its changes dispatch once each, and only the changes', () => {
  const t = setup({ local: { 'prod-1': { home: 1, away: 0 } } });
  t.data.published(null);
  assert.deepEqual(t.session.data.get(), { liveData: { home: 1, away: 0 }, dataKey: null, treeRead: false });
  assert.deepEqual(t.calls.keyReads, [], 'an unpublished production reads no key');

  dispatchNow(t, bindings);
  assert.deepEqual(t.sent, [{ label: 'Data', batches: [[{ graphic: 'Score', msg: { t: 'update', data: { f0: '1', f1: '0' } } }]] }]);
  dispatchNow(t, bindings);
  assert.equal(t.sent.length, 1, 'nothing moved, nothing sent');

  t.data.setLiveData({ home: 2, away: 0 });
  assert.deepEqual(t.calls.saved, [['prod-1', { home: 2, away: 0 }]], 'the local road saves');
  dispatchNow(t, bindings);
  assert.deepEqual(t.sent[1].batches, [[{ graphic: 'Score', msg: { t: 'update', data: { f0: '2' } } }]], 'one moving value is one field');
});

test('a render\'s older tree is passed over, so it cannot pair with a newer key', () => {
  const t = setup({ local: { 'prod-1': { home: 1 } } });
  t.data.published('slug-1');
  const published = t.session.data.get().liveData;
  t.data.published(null); // unpublished: the key is null now, and the tree is the local one
  t.data.dispatch(resolveBindings({ home: 7 }, { Score: { f0: 'home' } }), published, t.send);
  assert.deepEqual(t.sent, [], 'the tree the render resolved is not the one the part holds');
  dispatchNow(t, { Score: { f0: 'home' } });
  assert.deepEqual(t.sent[0].batches, [[{ graphic: 'Score', msg: { t: 'update', data: { f0: '1' } } }]]);
});

test('unpublished: a write in another tab moves this tab\'s tree', () => {
  const t = setup({ local: { 'prod-1': { home: 1 } } });
  t.data.published(null);
  t.otherTab('prod-1', { home: 5 });
  assert.deepEqual(t.session.data.get().liveData, { home: 5 });
});

test('dataKey undefined: while the key is being read nothing dispatches, whatever the tree holds', async () => {
  const t = setup({ local: { 'prod-1': { home: 9, away: 9 } } });
  t.data.published('slug-1');
  assert.equal(t.session.data.get().dataKey, undefined);
  assert.deepEqual(t.session.data.get().liveData, {}, 'published, the local tree does not seed');
  assert.equal(t.storage.size, 0, 'published, no other tab is listened to');

  // An edit on the Data workspace while the key is unread moves this tab's tree (and its local
  // copy); it still must not reach the wire.
  t.data.setLiveData({ home: 3, away: 1 });
  assert.deepEqual(t.session.data.get().liveData, { home: 3, away: 1 });
  dispatchNow(t, bindings);
  assert.deepEqual(t.sent, [], 'an unread key is not "unpublished"');

  // The key arrives: published, the server dispatches, so this page still sends nothing.
  t.answers.keys[0].resolve('key-1');
  await flush();
  assert.equal(t.session.data.get().dataKey, 'key-1');
  dispatchNow(t, bindings);
  assert.deepEqual(t.sent, []);
  assert.deepEqual(t.calls.fetched, ['key-1'], 'the key brings the server\'s tree');
  t.answers.fetches[0].resolve({ data: { home: 4, away: 2 } });
  await flush();
  assert.deepEqual(t.session.data.get(), { liveData: { home: 4, away: 2 }, dataKey: 'key-1', treeRead: true });
  dispatchNow(t, bindings);
  assert.deepEqual(t.sent, []);
});

test('a published production whose key read finds none is dispatched here', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve(null);
  await flush();
  assert.equal(t.session.data.get().dataKey, null);
  assert.deepEqual(t.calls.fetched, []);
  t.data.setLiveData({ home: 1 });
  dispatchNow(t, { Score: { f0: 'home' } });
  assert.equal(t.sent.length, 1);
});

test('no backend: a published production reads no key and is local', () => {
  const t = setup({ backendConfigured: false });
  t.data.published('slug-1');
  assert.equal(t.session.data.get().dataKey, null);
  assert.deepEqual(t.calls.keyReads, []);
});

test('the key road: an owner edit is a PATCH naming its removals, and the answer is held', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { home: 1, away: 0 } });
  await flush();

  t.data.setLiveData({ home: 2 });
  assert.deepEqual(t.session.data.get().liveData, { home: 2 }, 'optimistic');
  assert.deepEqual(t.calls.patched, [['key-1', { home: 2, away: null }]]);
  assert.deepEqual(t.calls.saved, [], 'published, nothing goes to localStorage');
  // A feed tick landed in the same moment: the server's merge is what stands.
  t.answers.patches[0].resolve({ home: 2, clock: '10:00' });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 2, clock: '10:00' });

  t.data.setLiveData({ home: 2, clock: '10:00' });
  assert.equal(t.calls.patched.length, 1, 'no change, no PATCH');
});

test('the key road: a refused PATCH says so and re-reads the server', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  t.data.setLiveData({ home: 5 });
  t.answers.patches[0].reject(new Error('over budget'));
  await flush();
  assert.deepEqual(t.calls.notes, ['Production data not saved: over budget']);
  assert.deepEqual(t.calls.fetched, ['key-1', 'key-1']);
  t.answers.fetches[1].resolve({ data: { home: 1 } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 1 });
});

test('the slug road: a bound press patches by slug, counts from its own optimistic tree, and holds the answer', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve(null); // the slug decides the road, not the key
  await flush();
  t.session.apply((parts) => ({ ...parts, data: { ...parts.data, liveData: { home: 1 } } }));

  const first = t.data.patchBoundValues([{ path: 'home', text: '2', verb: 'adjust' }]);
  assert.deepEqual(t.session.data.get().liveData, { home: 2 }, 'the next press counts from this');
  assert.deepEqual(t.calls.slugPatched, [['slug-1', { home: 2 }]]);
  assert.deepEqual(t.calls.saved, [], 'a published tree never lands in localStorage');
  t.answers.slugPatches[0].resolve({ home: 2, away: 7 });
  await first;
  assert.deepEqual(t.session.data.get().liveData, { home: 2, away: 7 });

  await t.data.patchBoundValues([]);
  await t.data.patchBoundValues([{ path: 'home', text: '2', verb: 'adjust' }]);
  assert.equal(t.calls.slugPatched.length, 1, 'no writes, or no change, is no call');
});

test('the slug road: a refused press says so and re-reads; unpublished, a press saves locally', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  const press = t.data.patchBoundValues([{ path: 'home', text: '2', verb: 'adjust' }]);
  t.answers.slugPatches[0].reject(new Error('no backend'));
  await press;
  assert.deepEqual(t.calls.notes, ['The shared value did not move: no backend']);
  assert.equal(t.calls.fetched.length, 2);

  const local = setup({ local: { 'prod-1': { home: 1 } } });
  local.data.published(null);
  await local.data.patchBoundValues([{ path: 'home', text: '2', verb: 'adjust' }]);
  assert.deepEqual(local.calls.saved, [['prod-1', { home: 2 }]]);
  assert.deepEqual(local.calls.slugPatched, []);
});

test('a mode change re-seeds the tree and the baseline, and an answer from the old mode is ignored', async () => {
  const t = setup({ local: { 'prod-1': { home: 1 } } });
  const stopLocal = t.data.published(null);
  dispatchNow(t, { Score: { f0: 'home' } });
  assert.equal(t.sent.length, 1);
  stopLocal();
  assert.equal(t.storage.size, 0, 'the other-tab listener goes with its mode');

  const stopPublished = t.data.published('slug-1');
  assert.deepEqual(t.session.data.get(), { liveData: {}, dataKey: undefined, treeRead: false }, 'first publish: not yet known');
  stopPublished();
  t.data.published(null);
  t.answers.keys[0].resolve('key-1');
  await flush();
  assert.equal(t.session.data.get().dataKey, null, 'the published mode\'s late key does not land');
  assert.deepEqual(t.calls.fetched, []);
  dispatchNow(t, { Score: { f0: 'home' } });
  assert.equal(t.sent.length, 2, 'the new mode reconciles every bound field from scratch');
});

test('dispose: late answers change nothing, nothing more is sent, and the listener goes', async () => {
  const t = setup({ local: { 'prod-1': { home: 1 } } });
  t.data.published(null);
  assert.equal(t.storage.size, 1);
  t.session.dispose();
  assert.equal(t.storage.size, 0, 'disposal stops the mode');
  t.otherTab('prod-1', { home: 9 });
  assert.deepEqual(t.session.data.get().liveData, { home: 1 });
  dispatchNow(t, { Score: { f0: 'home' } });
  assert.deepEqual(t.sent, [], 'a disposed session sends nothing');
  assert.equal(typeof t.data.published('slug-1'), 'function');
  assert.deepEqual(t.calls.keyReads, [], 'a disposed session enters no mode');

  const p = setup();
  p.data.published('slug-1');
  p.answers.keys[0].resolve('key-1');
  await flush();
  p.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  p.data.setLiveData({ home: 2 });
  const press = p.data.patchBoundValues([{ path: 'home', text: '3', verb: 'adjust' }]);
  p.session.dispose();
  p.answers.patches[0].resolve({ home: 20 });
  p.answers.slugPatches[0].reject(new Error('late'));
  await press;
  await flush();
  assert.deepEqual(p.session.data.get().liveData, { home: 3 }, 'the answers that came back after disposal are ignored');
  assert.deepEqual(p.calls.notes, [], 'and say nothing');
  assert.equal(p.calls.fetched.length, 1, 'nor re-read');
});

// ── The Sheet reader's writer (data-sources C1b): applySourcePatch ─────────────────────────────

test('the source writer, unpublished: merges onto the newest tree, saves it, and the dispatch sends one update', async () => {
  const t = setup({ local: { 'prod-1': { home: 4, sheet: { s1: { lines: 'old' } } } } });
  t.data.published(null);
  const b = { Ticker: { f0: 'sheet.s1.lines' }, Score: { f1: 'home' } };
  dispatchNow(t, b);
  t.sent.length = 0;
  const landed = await t.data.applySourcePatch({ sheet: { s1: { lines: 'one\ntwo' } } });
  assert.equal(landed, true);
  // A merge, never a replacement: the operator's own value is untouched.
  assert.deepEqual(t.session.data.get().liveData, { home: 4, sheet: { s1: { lines: 'one\ntwo' } } });
  assert.deepEqual(t.calls.saved.at(-1), ['prod-1', { home: 4, sheet: { s1: { lines: 'one\ntwo' } } }]);
  dispatchNow(t, b);
  assert.deepEqual(t.sent.map((s) => s.batches), [[[{ graphic: 'Ticker', msg: { t: 'update', data: { f0: 'one\ntwo' } } }]]]);
  // An empty list read writes "", which is a value: it goes on the wire and clears the field.
  await t.data.applySourcePatch({ sheet: { s1: { lines: '' } } });
  dispatchNow(t, b);
  assert.deepEqual(t.sent.at(-1).batches, [[{ graphic: 'Ticker', msg: { t: 'update', data: { f0: '' } } }]]);
});

test('the source writer, published: writes nothing itself, and holds only the server tree its own slug answered', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  // Published, a reader writes under its lease on the row (control/hostedControl.ts), never here.
  assert.equal(await t.data.applySourcePatch({ sheet: { s1: { lines: 'a' } } }), false);
  assert.deepEqual(t.calls.slugPatched, []);
  assert.deepEqual(t.session.data.get().liveData, { home: 1 }, 'nothing optimistic');
  t.data.holdServerTree('slug-1', { home: 1, sheet: { s1: { lines: 'a' } } });
  assert.deepEqual(t.session.data.get().liveData, { home: 1, sheet: { s1: { lines: 'a' } } });
  // An answer for another slug, or after the production left the slug, is not held.
  t.data.holdServerTree('slug-2', { other: 1 });
  t.data.published(null);
  t.data.holdServerTree('slug-1', { late: 1 });
  assert.equal(t.session.data.get().liveData.other, undefined);
  assert.equal(t.session.data.get().liveData.late, undefined);
});
