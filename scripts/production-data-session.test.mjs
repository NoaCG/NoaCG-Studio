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
function fakeIo({ local = {}, backendConfigured = true, relative = true } = {}) {
  const calls = { saved: [], keyReads: [], fetched: [], patched: [], slugPatched: [], adjusted: [], notes: [] };
  const answers = { keys: [], fetches: [], patches: [], slugPatches: [], adjusts: [] };
  // The clock and the timers the press queue runs on, stepped by hand.
  const clock = { at: 1_000_000, timers: [] };
  let ids = 0;
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
    patchProductionData: (key, patch, ownerShowId) => {
      calls.patched.push(ownerShowId === undefined ? [key, patch] : [key, patch, ownerShowId]);
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
    ...(relative ? {
      adjustProductionDataBySlug: (slug, presses, signal) => {
        calls.adjusted.push([slug, presses, signal]);
        return next(answers.adjusts);
      },
    } : {}),
    now: () => clock.at,
    after: (ms, run) => {
      const timer = { due: clock.at + ms, run, live: true };
      clock.timers.push(timer);
      return () => (timer.live = false);
    },
    pressId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  };
  const otherTab = (id, data) => {
    store[id] = data;
    for (const listener of [...storage]) listener();
  };
  /** Move the clock by `ms`, firing every timer that falls due, in order. */
  const tick = async (ms) => {
    clock.at += ms;
    for (const timer of clock.timers.filter((x) => x.live && x.due <= clock.at).sort((a, b) => a.due - b.due)) {
      timer.live = false;
      timer.run();
    }
    await flush();
  };
  return { io, calls, answers, storage, otherTab, clock, tick };
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
  assert.deepEqual(t.session.data.get(), { liveData: { home: 1, away: 0 }, dataKey: null, treeRead: false, unsent: 0 });
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
  assert.deepEqual(t.session.data.get(), { liveData: { home: 4, away: 2 }, dataKey: 'key-1', treeRead: true, unsent: 0 });
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
  // The owner's own edit names its production, so it goes through the owner's door and airs while
  // Another system is paused (data-sources C5, migration 0100).
  assert.deepEqual(t.calls.patched, [['key-1', { home: 2, away: null }, 'prod-1']]);
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
  assert.deepEqual(t.session.data.get(), { liveData: {}, dataKey: undefined, treeRead: false, unsent: 0 }, 'first publish: not yet known');
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

test('the source writer, published: goes through the operator door by slug and holds the answer; a refusal is reported as not landed', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  const write = t.data.applySourcePatch({ sheet: { s1: { lines: 'a' } } });
  assert.deepEqual(t.calls.slugPatched, [['slug-1', { sheet: { s1: { lines: 'a' } } }]]);
  assert.deepEqual(t.calls.patched, [], 'never the owner key road: a reader is the operator');
  t.answers.slugPatches[0].resolve({ home: 1, sheet: { s1: { lines: 'a' } }, feed: 9 });
  assert.equal(await write, true);
  assert.deepEqual(t.session.data.get().liveData, { home: 1, sheet: { s1: { lines: 'a' } }, feed: 9 });

  const refused = t.data.applySourcePatch({ sheet: { s1: { lines: 'b' } } });
  t.answers.slugPatches[1].reject(new Error('unknown control slug'));
  assert.equal(await refused, false, 'the reader keeps its snapshot and tries again');
  assert.match(t.calls.notes.at(-1), /Sheet’s change was not written: unknown control slug/);
});

test('the source writer: an answer from an earlier mode is not landed, and an empty patch writes nothing', async () => {
  const t = setup();
  t.data.published('slug-1');
  const write = t.data.applySourcePatch({ sheet: { s1: { lines: 'a' } } });
  t.data.published(null); // unpublished meanwhile
  t.answers.slugPatches[0].resolve({ sheet: { s1: { lines: 'a' } } });
  assert.equal(await write, false);
  assert.deepEqual(t.session.data.get().liveData, {}, 'the old mode’s answer is not held');
  assert.equal(await t.data.applySourcePatch({}), true);
  assert.equal(t.calls.slugPatched.length, 1);
});

test('the source writer, published: a path the row does not bind yet is left out and reported, and the connections that work still land', async () => {
  const t = setup();
  t.data.published('slug-1');
  const write = t.data.applySourcePatch({ sheet: { s1: { values: { f0: 'A', f9: 'new' } } } });
  t.answers.slugPatches[0].reject(new Error('not a bound path: sheet.s1.values.f9'));
  await flush();
  assert.deepEqual(t.calls.slugPatched[1], ['slug-1', { sheet: { s1: { values: { f0: 'A' } } } }], 'the rest is sent again without it');
  t.answers.slugPatches[1].resolve({ sheet: { s1: { values: { f0: 'A' } } } });
  assert.deepEqual(await write, ['sheet.s1.values.f9']);
  assert.equal(t.calls.notes.length, 1);
  // The next write leaves it out at once, and a patch of only that path sends nothing.
  const next = t.data.applySourcePatch({ sheet: { s1: { values: { f0: 'B', f9: 'newer' } } } });
  assert.deepEqual(t.calls.slugPatched[2], ['slug-1', { sheet: { s1: { values: { f0: 'B' } } } }]);
  t.answers.slugPatches[2].resolve({ sheet: { s1: { values: { f0: 'B' } } } });
  assert.deepEqual(await next, ['sheet.s1.values.f9']);
  assert.deepEqual(await t.data.applySourcePatch({ sheet: { s1: { values: { f9: 'x' } } } }), ['sheet.s1.values.f9']);
  assert.equal(t.calls.slugPatched.length, 3);
  assert.equal(t.calls.notes.length, 1, 'said once');
});

test('the source writer: a refused path with spaces is left out whole, and is tried again after a minute (a republish keeps the slug)', async () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const t = setup();
    t.data.published('slug-1');
    const write = t.data.applySourcePatch({ sheet: { s1: { values: { 'Home score': '3', Away: '1' } } } });
    t.answers.slugPatches[0].reject(new Error('not a bound path: sheet.s1.values.Home score'));
    await flush();
    assert.deepEqual(t.calls.slugPatched[1], ['slug-1', { sheet: { s1: { values: { Away: '1' } } } }]);
    t.answers.slugPatches[1].resolve({});
    assert.deepEqual(await write, ['sheet.s1.values.Home score']);
    // A minute on, the production was published again: the path is tried, and now it lands.
    now += 61_000;
    const later = t.data.applySourcePatch({ sheet: { s1: { values: { 'Home score': '4' } } } });
    assert.deepEqual(t.calls.slugPatched[2], ['slug-1', { sheet: { s1: { values: { 'Home score': '4' } } } }]);
    t.answers.slugPatches[2].resolve({ sheet: { s1: { values: { 'Home score': '4' } } } });
    assert.equal(await later, true);
    assert.equal(t.calls.notes.length, 1);
  } finally {
    Date.now = realNow;
  }
});

test('the source writer, published: a value the row refuses never enters the local tree, even when every path is refused', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { match: 1 } });
  await flush();
  const write = t.data.applySourcePatch({ sheet: { s1: { values: { Score: '9' } } } });
  assert.deepEqual(t.session.data.get().liveData, { match: 1 }, 'nothing optimistic while the row decides');
  t.answers.slugPatches[0].reject(new Error('not a bound path: sheet.s1.values.Score'));
  assert.deepEqual(await write, ['sheet.s1.values.Score']);
  assert.deepEqual(t.session.data.get().liveData, { match: 1 }, 'PREVIEW and Take cannot see the refused value');
  assert.equal(t.calls.slugPatched.length, 1, 'nothing left to send');
});

test('a published lease write: the page holds only the server tree its own slug answered', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  t.data.holdServerTree('slug-1', { home: 1, sheet: { s1: { lines: 'a' } } });
  assert.deepEqual(t.session.data.get().liveData, { home: 1, sheet: { s1: { lines: 'a' } } });
  // An answer for another slug, or after the production left the slug, is not held.
  t.data.holdServerTree('slug-2', { other: 1 });
  t.data.published(null);
  t.data.holdServerTree('slug-1', { late: 1 });
  assert.equal(t.session.data.get().liveData.other, undefined);
  assert.equal(t.session.data.get().liveData.late, undefined);
});

test('published: a read that started earlier and answers later never puts the older tree back (E7.1)', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  void t.data.refresh();
  assert.equal(t.answers.fetches.length, 2, 'the key\'s own read, then the refresh');
  t.answers.fetches[1].resolve({ data: { revision: 2 } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { revision: 2 });
  t.answers.fetches[0].resolve({ data: { revision: 1 } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { revision: 2 }, 'the slow read is older than the tree held');
  void t.data.refresh();
  t.answers.fetches[2].resolve({ data: { revision: 3 } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { revision: 3 }, 'a later read still lands');
});

/** Published with a key and a first tree held, the way a press or an owner edit finds the page. */
async function publishedWith(tree) {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.answers.fetches[0].resolve({ data: tree });
  await flush();
  return t;
}

test('published: a press answer older than a read already held is passed over, and a later press still lands (#1572)', async () => {
  const t = await publishedWith({ home: 1 });
  const press = t.data.patchBoundValues([{ path: 'home', text: '2', verb: 'adjust' }]);
  void t.data.refresh(); // a feed row arrived after the press left
  t.answers.fetches[1].resolve({ data: { home: 2, away: 3 } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 2, away: 3 });
  t.answers.slugPatches[0].resolve({ home: 2, away: 0 });
  assert.equal(await press, true, 'the press itself landed');
  assert.deepEqual(t.session.data.get().liveData, { home: 2, away: 3 }, 'the press answer is older than the read held');
  assert.equal(t.calls.fetched.length, 3, 'a write answer passed over is followed by a fresh read');
  const next = t.data.patchBoundValues([{ path: 'home', text: '3', verb: 'adjust' }]);
  t.answers.slugPatches[1].resolve({ home: 3, away: 3 });
  await next;
  assert.deepEqual(t.session.data.get().liveData, { home: 3, away: 3 });
});

test('published: an owner edit answer older than a read already held is passed over (#1572)', async () => {
  const t = await publishedWith({ home: 1 });
  t.data.setLiveData({ home: 5 });
  void t.data.refresh();
  t.answers.fetches[1].resolve({ data: { home: 5, clock: '10:01' } });
  await flush();
  t.answers.patches[0].resolve({ home: 5, clock: '10:00' });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 5, clock: '10:01' });
});

test('published: a write answer passed over reads again, since an unbound edit appends no row to start one (#1572)', async () => {
  const t = await publishedWith({ note: 'a' });
  void t.data.refresh(); // left before the edit landed: it answers the old value
  t.data.setLiveData({ note: 'b' });
  void t.data.refresh();
  t.answers.fetches[2].resolve({ data: { note: 'a' } });
  await flush();
  t.answers.patches[0].resolve({ note: 'b' });
  await flush();
  assert.equal(t.calls.fetched.length, 4, 'the passed-over answer asks again');
  t.answers.fetches[3].resolve({ data: { note: 'b' } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { note: 'b' });
  assert.equal(t.calls.fetched.length, 4, 'a read answer passed over asks nothing more');
});

test('published: an edit that changes nothing sends nothing and never passes over the first read (#1572)', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.data.setLiveData({}); // Clear before the first read answered
  assert.equal(t.calls.patched.length, 0);
  t.answers.fetches[0].resolve({ data: { home: 1 } });
  await flush();
  assert.deepEqual(t.session.data.get(), { liveData: { home: 1 }, dataKey: 'key-1', treeRead: true, unsent: 0 });
});

test('published: a read that left before a press cannot undo the press on screen (#1572)', async () => {
  const t = await publishedWith({ home: 1 });
  void t.data.refresh();
  const press = t.data.patchBoundValues([{ path: 'home', text: '2', verb: 'adjust' }]);
  t.answers.fetches[1].resolve({ data: { home: 1 } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 2 }, 'the next press counts from 2, not 1');
  t.answers.slugPatches[0].resolve({ home: 2 });
  await press;
  assert.deepEqual(t.session.data.get().liveData, { home: 2 });
});

test('published: a read that left before a lease write\'s tree arrived cannot put the older tree back (#1572)', async () => {
  const t = await publishedWith({ home: 1, sheet: 'a' });
  void t.data.refresh();
  t.data.holdServerTree('slug-1', { home: 1, sheet: 'b' });
  t.answers.fetches[1].resolve({ data: { home: 1, sheet: 'a' } });
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 1, sheet: 'b' });
});

test('published: a lease write\'s tree before the first read answers is the server\'s tree, so presses are not refused (#1572)', async () => {
  const t = setup();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  t.data.holdServerTree('slug-1', { home: 1, sheet: 'b' });
  t.answers.fetches[0].resolve({ data: { home: 1, sheet: 'a' } });
  await flush();
  assert.deepEqual(t.session.data.get(), { liveData: { home: 1, sheet: 'b' }, dataKey: 'key-1', treeRead: true, unsent: 0 });
});

test('published, a poll reads the tree on its cadence until stopped; unpublished it reads nothing (E7.1)', async () => {
  const t = setup();
  const timers = [];
  t.io.every = (ms, run) => {
    const timer = { ms, run, live: true };
    timers.push(timer);
    return () => (timer.live = false);
  };
  const stopLocal = t.data.poll(5000);
  t.data.published(null);
  timers[0].run();
  assert.equal(t.calls.fetched.length, 0, 'an unpublished production has no tree to read');
  stopLocal();
  t.data.published('slug-1');
  t.answers.keys[0].resolve('key-1');
  await flush();
  const before = t.calls.fetched.length;
  const stop = t.data.poll(5000);
  assert.equal(timers[1].ms, 5000);
  timers[1].run();
  assert.equal(t.calls.fetched.length, before + 1);
  stop();
  assert.equal(timers[1].live, false);
  let wanted = false;
  t.data.poll(5000, () => wanted);
  timers[2].run();
  assert.equal(t.calls.fetched.length, before + 1, 'nothing to follow: no read');
  wanted = true;
  timers[2].run();
  assert.equal(t.calls.fetched.length, before + 2);
});

// ── A BOUND PRESS IS A RELATIVE OPERATION, LANDED ONCE (#2617; evidence/fix-2617.md) ──────────────

/** What the server took from one call: `path+by` or `path=text`, each with its id. */
const wire = (call) => call[1].map((q) => `${q.id.slice(-2)}:${q.path}${'by' in q ? `+${q.by}` : `=${q.text}`}`);
const idsOf = (call) => call[1].map((q) => q.id);
const retryError = () => Object.assign(new Error('canceling statement due to statement timeout'), { press: 'retry' });

test('stacked presses survive a failed call: nothing resets the tree or drops a press, and the resend carries each press once, by its id (R3, R4, R5)', async () => {
  const t = await publishedWith({ home: 4 });
  const fetchesBefore = t.answers.fetches.length;
  const first = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  // One call out at a time: the first press goes alone, the next two wait in order.
  const second = t.data.pressBound([{ path: 'home', by: 1 }]);
  const third = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  assert.equal(t.calls.adjusted.length, 1);
  assert.deepEqual(wire(t.calls.adjusted[0]), ['01:home+1']);
  assert.equal(t.session.data.get().unsent, 3);
  assert.deepEqual(t.session.data.get().liveData, { home: 4 }, 'a queued press is never in the tree (R5)');
  // The database is slow: the call fails with nothing recorded.
  t.answers.adjusts[0].reject(retryError());
  await flush();
  assert.deepEqual(t.session.data.get().liveData, { home: 4 }, 'a failure never resets the tree');
  assert.equal(t.session.data.get().unsent, 3, 'and never drops a press');
  assert.equal(t.answers.fetches.length, fetchesBefore, 'nor reads the tree over the queue');
  assert.equal(t.calls.adjusted.length, 1, 'the resend waits for its backoff');
  await t.tick(500);
  // The resend carries all three, the first with the SAME id: a call that did commit counts once.
  assert.deepEqual(wire(t.calls.adjusted[1]), ['01:home+1', '02:home+1', '03:home+1']);
  t.answers.adjusts[1].resolve({ data: { home: 7 }, landed: idsOf(t.calls.adjusted[1]), refused: [] });
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.equal(t.session.data.get().unsent, 0);
  assert.deepEqual(t.session.data.get().liveData, { home: 7 }, 'the server\'s answer is the tree');
  assert.deepEqual(t.calls.notes, []);
});

test('the resend waits double each time, from half a second to eight, and a landing resets it (R4)', async () => {
  const t = await publishedWith({ home: 0 });
  void t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  const waits = [];
  for (let i = 0; i < 6; i += 1) {
    t.answers.adjusts[i].reject(retryError());
    await flush();
    const due = t.clock.timers.filter((x) => x.live).map((x) => x.due - t.clock.at);
    waits.push(Math.min(...due));
    await t.tick(waits[i]);
  }
  assert.deepEqual(waits, [500, 1000, 2000, 4000, 8000, 8000]);
  t.answers.adjusts[6].resolve({ data: { home: 1 }, landed: idsOf(t.calls.adjusted[6]), refused: [] });
  await flush();
  void t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[7].reject(retryError());
  await flush();
  assert.equal(Math.min(...t.clock.timers.filter((x) => x.live).map((x) => x.due - t.clock.at)), 500);
});

test('a call with no answer in 15 s is given up and sent again; an id already held is answered landed and counts once (R2, R3, R4)', async () => {
  const t = await publishedWith({ home: 0 });
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  const [, , signal] = t.calls.adjusted[0];
  await t.tick(15_000);
  assert.equal(signal.aborted, true, 'the attempt is cancelled');
  t.answers.adjusts[0].reject(Object.assign(new Error('AbortError'), { press: 'retry' }));
  await flush();
  await t.tick(500);
  assert.deepEqual(idsOf(t.calls.adjusted[1]), idsOf(t.calls.adjusted[0]));
  // The first had committed: the server holds its id and answers it landed, applied once.
  t.answers.adjusts[1].resolve({ data: { home: 1 }, landed: idsOf(t.calls.adjusted[1]), refused: [] });
  assert.equal(await pressing, true);
  assert.deepEqual(t.session.data.get().liveData, { home: 1 });
});

test('a refused press is dropped and said with its count, the rest land; a whole call refused drops its presses (R2, R4)', async () => {
  const t = await publishedWith({ home: 0, label: 'x' });
  const good = t.data.pressBound([{ path: 'home', by: 1 }]);
  const bad = t.data.pressBound([{ path: 'label', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(retryError());
  await flush();
  await t.tick(500);
  const [a, b] = idsOf(t.calls.adjusted[1]);
  t.answers.adjusts[1].resolve({ data: { home: 1, label: 'x' }, landed: [a], refused: [{ id: b, reason: 'not a bound path: label' }] });
  assert.equal(await good, true);
  assert.equal(await bad, false);
  assert.deepEqual(t.calls.notes, ['1 press not moved: not a bound path: label']);
  assert.equal(t.session.data.get().unsent, 0);

  const next = t.data.pressBound([{ path: 'home', by: 1 }, { path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[2].reject(Object.assign(new Error('hosted control is switched off for this page'), { press: 'refused' }));
  assert.equal(await next, false);
  assert.equal(t.calls.notes[1], '2 presses not moved: hosted control is switched off for this page');
  assert.equal(t.session.data.get().unsent, 0);
});

test('an answer the read numbering passes over still settles its presses (R5)', async () => {
  const t = await publishedWith({ home: 4 });
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  void t.data.refresh();
  t.answers.fetches.at(-1).resolve({ data: { home: 6 } });
  await flush();
  t.answers.adjusts[0].resolve({ data: { home: 5 }, landed: idsOf(t.calls.adjusted[0]), refused: [] });
  assert.equal(await pressing, true);
  assert.equal(t.session.data.get().unsent, 0);
  assert.deepEqual(t.session.data.get().liveData, { home: 6 }, 'the older answer is passed over');
});

test('a press older than an hour is dropped, not sent, and said (R3)', async () => {
  const t = await publishedWith({ home: 0 });
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(retryError());
  await flush();
  t.clock.at += 60 * 60_000;
  await t.tick(1);
  assert.equal(await pressing, false);
  assert.equal(t.calls.adjusted.length, 1);
  assert.deepEqual(t.calls.notes, ['1 press not moved: not sent within an hour.']);
  assert.equal(t.session.data.get().unsent, 0);
});

test('a new address drops the old one\'s presses and says so; a republish on the same slug keeps them (R9)', async () => {
  const t = await publishedWith({ home: 0 });
  const kept = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(retryError());
  await flush();
  t.data.published('slug-1');
  await flush();
  assert.equal(t.session.data.get().unsent, 1);
  t.data.published('slug-2');
  assert.equal(await kept, false);
  assert.deepEqual(t.calls.notes, ['1 press not moved: the production is no longer published at that address (one already on its way may have landed).']);
  assert.equal(t.session.data.get().unsent, 0);
});

test('the session ending settles every queued press as not landed', async () => {
  const t = await publishedWith({ home: 0 });
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.session.dispose();
  assert.equal(await pressing, false);
});

test('unpublished, a relative press moves the local tree at once, in the leaf\'s own type', async () => {
  const t = setup({ local: { 'prod-1': { home: 4, label: '07', flag: true } } });
  t.data.published(null);
  assert.equal(await t.data.pressBound([{ path: 'home', by: 2 }, { path: 'label', by: 1 }, { path: 'away', by: 1 }]), true);
  assert.deepEqual(t.session.data.get().liveData, { home: 6, label: '8', flag: true, away: 1 });
  assert.equal(await t.data.pressBound([{ path: 'home', text: '0' }]), true);
  assert.equal(t.session.data.get().liveData.home, 0);
  assert.equal(t.calls.adjusted.length, 0);
});

test('a database without the relative door: each figure is computed once and resent unchanged until it lands (R10)', async () => {
  const t = await publishedWith({ home: 4 });
  const first = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(Object.assign(new Error('Could not find the function'), { press: 'missing' }));
  await flush();
  const second = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  assert.deepEqual(t.calls.slugPatched.map(([, p]) => p), [{ home: 5 }], 'the first figure');
  t.answers.slugPatches[0].reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  await flush();
  await t.tick(500);
  assert.deepEqual(t.calls.slugPatched.map(([, p]) => p), [{ home: 5 }, { home: 5 }], 'the same figure again, never 6 for the same press');
  t.answers.slugPatches[1].resolve({ home: 5 });
  assert.equal(await first, true);
  await flush();
  assert.deepEqual(t.calls.slugPatched.at(-1)[1], { home: 6 }, 'then the next press, from the server\'s answer');
  t.answers.slugPatches[2].resolve({ home: 6 });
  assert.equal(await second, true);
  assert.equal(t.calls.adjusted.length, 1, 'the relative door is not asked again');
});

test('a list write is refused while a press of this page is queued inside that list, and goes once none is (R1, Codex on #2630)', async () => {
  const t = await publishedWith({ board: { called: ['A1'], n: 0 } });
  const pressing = t.data.pressBound([{ path: 'board.n', by: 1 }]);
  await flush();
  // Its value was computed from the tree before the press landed: written later, it would undo it.
  assert.equal(await t.data.patchBoundValues([{ path: 'board', text: 'A1\nB2', verb: 'list' }]), false);
  assert.equal(t.calls.slugPatched.length, 0, 'never written over a press still sending');
  assert.match(t.calls.notes.at(-1), /presses on that list are still sending/);
  t.answers.adjusts[0].resolve({ data: { board: { called: ['A1'], n: 1 } }, landed: idsOf(t.calls.adjusted[0]), refused: [] });
  assert.equal(await pressing, true);
  // A press elsewhere does not hold a list write back.
  void t.data.pressBound([{ path: 'other', by: 1 }]);
  await flush();
  const listing = t.data.patchBoundValues([{ path: 'board', text: 'A1\nB2', verb: 'list' }]);
  await flush();
  assert.equal(t.calls.slugPatched.length, 1);
  t.answers.slugPatches[0].resolve({ board: { called: ['A1', 'B2'], n: 1 } });
  assert.equal(await listing, true);
});

test('R10\'s figure is counted only from a tree read from the server, never from the {} a republish holds before its read (review of #2617)', async () => {
  const t = await publishedWith({ home: 54 });
  // A republish on the same slug: its tree is {} and unread until the key and the read answer.
  t.data.published('slug-1');
  await flush();
  assert.equal(t.session.data.get().treeRead, false);
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(Object.assign(new Error('Could not find the function'), { press: 'missing' }));
  await flush();
  await t.tick(500);
  assert.equal(t.calls.slugPatched.length, 0, 'nothing counted from {}');
  t.answers.keys.at(-1).resolve('key-1');
  await flush();
  t.answers.fetches.at(-1).resolve({ data: { home: 54 } });
  await flush();
  await t.tick(8_000);
  assert.deepEqual(t.calls.slugPatched.map(([, p]) => p), [{ home: 55 }]);
  t.answers.slugPatches[0].resolve({ home: 55 });
  assert.equal(await pressing, true);
});

test('R10\'s call is given up after the attempt\'s time and resent with the same figure', async () => {
  const t = await publishedWith({ home: 4 });
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(Object.assign(new Error('Could not find the function'), { press: 'missing' }));
  await flush();
  await t.tick(15_000);
  await t.tick(500);
  assert.deepEqual(t.calls.slugPatched.map(([, p]) => p), [{ home: 5 }, { home: 5 }]);
  t.answers.slugPatches[1].resolve({ home: 5 });
  assert.equal(await pressing, true);
});

test('an answer that settles none of its presses waits before asking again, and a press after the end settles at once', async () => {
  const t = await publishedWith({ home: 0 });
  const pressing = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].resolve({ data: { home: 0 }, landed: [], refused: [] });
  await flush();
  assert.equal(t.calls.adjusted.length, 1, 'no tight loop');
  await t.tick(500);
  assert.equal(t.calls.adjusted.length, 2);
  t.answers.adjusts[1].resolve({ data: { home: 1 }, landed: idsOf(t.calls.adjusted[1]), refused: [] });
  assert.equal(await pressing, true);
  t.session.dispose();
  assert.equal(await t.data.pressBound([{ path: 'home', by: 1 }]), false);
});

test('R10: a figure given up on but still on its way holds back every NEW figure until it settles, so it cannot land behind one (review of #2630)', async () => {
  const t = await publishedWith({ home: 4 });
  const first = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(Object.assign(new Error('Could not find the function'), { press: 'missing' }));
  await flush();
  // The first attempt hangs and is given up after 15 s; its resend, the same 5, lands.
  await t.tick(15_000);
  await t.tick(500);
  assert.deepEqual(t.calls.slugPatched.map(([, p]) => p), [{ home: 5 }, { home: 5 }]);
  t.answers.slugPatches[1].resolve({ home: 5 });
  assert.equal(await first, true);
  // A second press: its 6 waits while the abandoned 5 may still commit.
  const second = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  await t.tick(8_000);
  assert.equal(t.calls.slugPatched.length, 2, 'no new figure behind an attempt still on its way');
  assert.equal(t.session.data.get().unsent, 1);
  t.answers.slugPatches[0].resolve({ home: 5 });
  await flush();
  await t.tick(8_000);
  assert.deepEqual(t.calls.slugPatched.at(-1)[1], { home: 6 });
  t.answers.slugPatches.at(-1).resolve({ home: 6 });
  assert.equal(await second, true);
});

test('R10: a given-up figure that never answers holds new figures back for at most a minute', async () => {
  const t = await publishedWith({ home: 4 });
  const first = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  t.answers.adjusts[0].reject(Object.assign(new Error('Could not find the function'), { press: 'missing' }));
  await flush();
  await t.tick(15_000);
  await t.tick(500);
  t.answers.slugPatches[1].resolve({ home: 5 });
  assert.equal(await first, true);
  // The first attempt never settles. A new press waits, but not past the minute.
  const second = t.data.pressBound([{ path: 'home', by: 1 }]);
  await flush();
  for (let waited = 0; waited < 30_000; waited += 8_000) await t.tick(8_000);
  assert.equal(t.calls.slugPatched.length, 2, 'held while the database could still be writing it');
  for (let waited = 0; waited < 40_000; waited += 8_000) await t.tick(8_000);
  assert.deepEqual(t.calls.slugPatched.at(-1)[1], { home: 6 });
  t.answers.slugPatches.at(-1).resolve({ home: 6 });
  assert.equal(await second, true);
});
