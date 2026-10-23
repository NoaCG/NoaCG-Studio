// guards: src/control/bridgeWatch.ts
//
// THE BRIDGE WATCH, run in Node with the Bridge, the timers and the tab faked (production-page
// refactor spec §2, AC-6): what a start asks first, which poll each restart key restarts and which it
// leaves alone, that a stop leaves no timer, subscription or listener live, and that an answer landing
// after a stop or a restart writes nothing. The browser half is e2e/bridge-connect.spec.ts,
// e2e/playout-clock.spec.ts and e2e/studio-evening-reliability.spec.ts.

import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const { startBridgeWatch, SLOT_READ_MS } = await import('../src/control/bridgeWatch.ts');
const { createPlayoutSession, NO_BRIDGE } = await import('../src/control/playoutSession.ts');
const { createServerPlayoutStore } = await import('../src/control/serverPlayoutStore.ts');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await tick();
};

const OK = { state: 'ok', detail: 'answers', features: ['state'], capabilities: ['state'] };
const OLD = { state: 'ok', detail: 'answers', features: [], capabilities: [] };
const SETTINGS = { agentUrl: 'http://127.0.0.1:8750', agentToken: 't', host: 'caspar', amcpPort: 5250, channel: 1, layer: 20, studioPending: false };
const vt = (id, extra = {}) => ({ id, adapter: 'casparcg', kind: 'media', name: id.toUpperCase(), layer: 10, channel: 2, ...extra });
const cue = (id, sourceId) => ({ id, sourceId, source: 'playout', label: id, values: {} });
const ourPage = { layer: 20, producer: 'html', file: 'https://noacg.studio/output?production=abc', paused: false, loop: false };

/** Every watch a test started, stopped after it so no real timer keeps Node running. */
const started = [];
afterEach(() => {
  for (const watch of started.splice(0)) watch.stop();
});

/** A watch on a fresh session, with every request recorded in order. */
function rig({ settings = SETTINGS, items = [vt('clip', { frames: 250, fps: 25, mediaKind: 'movie' })], library } = {}) {
  const calls = [];
  const subs = [];
  const everys = [];
  const visibles = [];
  /** Readings held by the test: `hold` makes the next `/state` wait until the test answers it. */
  const held = [];
  let hold = false;
  let slotLayer = ourPage;
  const state = { settings: { ...settings } };
  const lists = library ?? { media: [{ name: 'CLIP', kind: 'movie', frames: 250, fps: 25 }, { name: 'OLD', kind: 'movie', frames: 100, fps: 25 }] };
  const io = {
    loadSettings: () => state.settings,
    configured: (s) => Boolean(s.agentUrl && s.agentToken && s.host),
    readable: (s) => s?.state === 'ok' && !!s.features?.includes('state') && !!s.capabilities?.includes('state'),
    subscribeTargetStatus: (s, onStatus) => {
      const sub = { settings: s, onStatus, live: true };
      subs.push(sub);
      calls.push('status');
      return () => {
        sub.live = false;
        calls.push('status off');
      };
    },
    readState: (s, channel) => {
      calls.push(`state ${channel}`);
      const reply = { result: { state: 'ok', detail: '' }, reply: { ok: true, channel, session: 'b1', observedAt: 0, slots: channel === s.channel ? [slotLayer] : [] } };
      if (!hold) return Promise.resolve(reply);
      return new Promise((resolve) => held.push(() => resolve(reply)));
    },
    listLibrary: (s, kind) => {
      calls.push(`list ${kind}`);
      return Promise.resolve({ result: { state: 'ok', detail: '' }, items: lists[kind] });
    },
    syncStudio: () => {
      calls.push('sync');
      return Promise.resolve({ keeper: 'bridge', changed: false });
    },
    rememberOutput: (showId, target) => calls.push(`remember ${showId} ${target}`),
    every: (ms, run) => {
      const e = { ms, run, live: true };
      everys.push(e);
      return () => {
        e.live = false;
      };
    },
    onVisible: (run) => {
      const v = { run, live: true };
      visibles.push(v);
      return () => {
        v.live = false;
      };
    },
  };
  const session = createPlayoutSession('prod-1');
  const serverPlayout = createServerPlayoutStore();
  const rundown = { cues: [cue('c1', items[0]?.id)], playoutItems: items, folders: [] };
  const learnt = [];
  const watch = startBridgeWatch(session, io, {
    rundown: () => rundown,
    slots: {
      itemSlot: (s, item) => ({ adapter: 'casparcg', channel: item.channel ?? s.channel, layer: item.layer }),
      folderSlot: (s) => ({ adapter: 'casparcg', channel: s.channel, layer: 10 }),
    },
    serverPlayout,
    settingsChanged: () => calls.push('settings changed'),
    learnt: (showId, facts) => learnt.push([showId, facts]),
  });
  started.push(watch);
  const inputs = {
    target: 'http://127.0.0.1:8750 t caspar 5250',
    hostedSlug: 'abc',
    casparOn: true,
    outputSlug: 'abc',
    showId: 'show-1',
    casparTarget: '["caspar",5250,1,20]',
    serverFiles: JSON.stringify({ show: 'show-1', items: items.map(({ id, kind, name }) => ({ id, kind, name })), refs: items.map((i) => i.id) }),
    playoutItems: items,
    hasServerItems: items.length > 0,
    checkAgain: 0,
    settingsRev: 0,
    slotRev: 0,
  };
  return {
    watch, session, io, calls, subs, everys, visibles, held, learnt, inputs, state, rundown,
    /** The live status subscription answers. */
    answer: (result) => subs.filter((s) => s.live).at(-1).onStatus(result),
    update: (change = {}) => {
      Object.assign(inputs, change);
      watch.update({ ...inputs });
    },
    setHold: (on) => {
      hold = on;
    },
    setSlot: (s) => {
      slotLayer = s;
    },
    live: () => ({
      subs: subs.filter((s) => s.live).length,
      everys: everys.filter((e) => e.live).length,
      visibles: visibles.filter((v) => v.live).length,
    }),
    take: () => calls.splice(0),
  };
}

test('a new session holds the bridge part at "nothing said yet"', () => {
  const session = createPlayoutSession('prod-1');
  assert.equal(session.bridge.get(), NO_BRIDGE);
  assert.deepEqual(NO_BRIDGE, { status: null, outputSlot: undefined, serverFiles: null, slotSeenOurs: false, learntFacts: null });
});

test('the first update asks the status and the studio setup, and nothing else until the Bridge answers', async () => {
  const t = rig();
  t.update();
  await settle();
  assert.deepEqual(t.take(), ['status', 'sync']);
  assert.equal(t.subs[0].settings, t.state.settings, 'the status is asked with the settings of the start');
  assert.equal(t.session.bridge.get().status, null);
  assert.equal(t.session.bridge.get().outputSlot, undefined);
  t.update();
  await settle();
  assert.deepEqual(t.take(), [], 'the same inputs again restart nothing and do not ask the studio again');
});

test('no Bridge set up: no status is asked and no studio sync is made', async () => {
  const t = rig({ settings: { ...SETTINGS, agentUrl: '' } });
  t.update({ target: null });
  await settle();
  assert.deepEqual(t.take(), []);
});

test('a studio sync that changed the setup tells the page to re-read its settings', async () => {
  const t = rig();
  t.io.syncStudio = () => {
    t.calls.push('sync');
    return Promise.resolve({ keeper: 'bridge', changed: true });
  };
  t.update();
  await settle();
  assert.deepEqual(t.take(), ['status', 'sync', 'settings changed']);
});

test('an answering Bridge starts the slot, the file check, the older clips and the server state, in that order, once', async () => {
  const items = [vt('clip', { frames: 250, fps: 25, mediaKind: 'movie' }), vt('old')];
  const t = rig({ items });
  t.update();
  await settle();
  t.take();
  t.answer(OK);
  await settle();
  assert.deepEqual(t.take(), ['state 1', 'list media', 'list media', 'state 2', 'remember show-1 ["caspar",5250,1,20]']);
  const part = t.session.bridge.get();
  assert.equal(part.status, OK);
  assert.deepEqual(part.outputSlot, { holds: 'ours' });
  assert.equal(part.slotSeenOurs, true);
  assert.deepEqual(part.serverFiles, { key: t.inputs.serverFiles, check: null });
  assert.equal(part.learntFacts, 'show-1 0');
  assert.equal(t.learnt.length, 1);
  assert.deepEqual([...t.learnt[0][1]], [['old', { mediaKind: 'movie', frames: 100, fps: 25 }]]);
  assert.deepEqual(t.live(), { subs: 1, everys: 1, visibles: 1 });
  assert.equal(t.everys[0].ms, SLOT_READ_MS);

  // The status answers again every few seconds: nothing restarts for an unchanged answer.
  t.answer({ ...OK });
  t.update();
  await settle();
  assert.deepEqual(t.take(), []);
});

test('a missing server file and a refused library are named', async () => {
  const t = rig({ items: [vt('gone', { frames: 1, fps: 25, mediaKind: 'movie' })] });
  t.update();
  t.answer(OK);
  await settle();
  assert.equal(t.session.bridge.get().serverFiles.check.short, 'Server files missing');
  assert.match(t.session.bridge.get().serverFiles.check.label, /GONE/);
  const u = rig({ library: { media: undefined } });
  u.update();
  u.answer(OK);
  await settle();
  assert.equal(u.session.bridge.get().serverFiles.check.short, 'Server files unavailable');
});

test('a Bridge too old to read state: the slot reads unreadable and no state is polled', async () => {
  const t = rig();
  t.update();
  t.answer(OLD);
  await settle();
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'unreadable' });
  assert.ok(!t.take().some((c) => c.startsWith('state')));
  assert.deepEqual(t.live(), { subs: 1, everys: 0, visibles: 0 });
});

test('a pending studio change goes to the Bridge when it answers, again after each return', async () => {
  const t = rig();
  t.state.settings.studioPending = true;
  t.update();
  await settle();
  t.take();
  t.answer(OK);
  await settle();
  assert.equal(t.take().filter((c) => c === 'sync').length, 1);
  t.answer({ state: 'bridge', detail: 'away' });
  t.answer(OK);
  await settle();
  assert.equal(t.take().filter((c) => c === 'sync').length, 1);
});

test('the slot is read every 10 s, never two at once, and an unchanged reading keeps the part', async () => {
  const t = rig();
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  const before = t.session.bridge.get();
  t.everys[0].run();
  await settle();
  assert.deepEqual(t.take(), ['state 1', 'remember show-1 ["caspar",5250,1,20]']);
  assert.equal(t.session.bridge.get(), before, 'the same reading moves nothing');
  t.setHold(true);
  t.setSlot({ ...ourPage, file: 'https://noacg.studio/output?production=xyz' });
  t.everys[0].run();
  t.everys[0].run();
  assert.deepEqual(t.take(), ['state 1'], 'a slow Bridge: the second read waits');
  t.held.shift()();
  await settle();
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'other' });
  assert.equal(t.session.bridge.get().slotSeenOurs, true, 'losing the slot keeps what was seen');
});

test('Check again restarts the status and, through it, every poll that waits on an answer', async () => {
  const t = rig();
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  t.update({ checkAgain: 1 });
  assert.equal(t.session.bridge.get().status, null, 'the status is cleared at the restart');
  assert.equal(t.session.bridge.get().outputSlot, undefined);
  assert.deepEqual(t.live(), { subs: 1, everys: 0, visibles: 0 });
  t.answer(OK);
  await settle();
  assert.deepEqual(t.take(), ['status off', 'status', 'state 1', 'list media', 'state 2', 'remember show-1 ["caspar",5250,1,20]']);
  assert.deepEqual(t.live(), { subs: 1, everys: 1, visibles: 1 });
});

test('the slot rev restarts the slot read only', async () => {
  const t = rig();
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  t.update({ slotRev: 1 });
  await settle();
  assert.deepEqual(t.take(), ['state 1', 'remember show-1 ["caspar",5250,1,20]']);
  assert.equal(t.everys.filter((e) => e.live).length, 1, 'the old interval is stopped');
  assert.deepEqual(t.live(), { subs: 1, everys: 1, visibles: 1 });
});

test('the settings rev restarts the server state and asks the older clips again, never the status', async () => {
  const items = [vt('clip', { frames: 250, fps: 25, mediaKind: 'movie' }), vt('old')];
  const t = rig({ items });
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  t.update({ settingsRev: 1 });
  await settle();
  assert.deepEqual(t.take(), ['list media', 'state 2']);
  assert.equal(t.session.bridge.get().learntFacts, 'show-1 1');
  assert.deepEqual(t.live(), { subs: 1, everys: 1, visibles: 1 });
  t.update({ settingsRev: 1 });
  await settle();
  assert.deepEqual(t.take(), [], 'the older clips are asked once per production and rev');
});

test('a new target restarts the status; unpublishing stops the slot; no server items stop the state poll', async () => {
  const t = rig();
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  t.update({ hostedSlug: null });
  await settle();
  assert.deepEqual(t.take(), []);
  assert.equal(t.session.bridge.get().outputSlot, undefined);
  assert.deepEqual(t.live(), { subs: 1, everys: 0, visibles: 1 });
  t.update({ hasServerItems: false });
  assert.deepEqual(t.live(), { subs: 1, everys: 0, visibles: 0 });
  t.update({ target: 'elsewhere' });
  assert.deepEqual(t.take(), ['status off', 'status']);
  assert.equal(t.session.bridge.get().status, null);
});

test('the visibility listener and wake read the server state at once', async () => {
  const t = rig();
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  t.visibles[0].run();
  await settle();
  assert.deepEqual(t.take(), ['state 2']);
  t.watch.wake();
  await settle();
  assert.deepEqual(t.take(), ['state 2']);
});

test('stop leaves no subscription, interval, listener or state poll live', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = rig();
    t.update();
    t.answer(OK);
    await settle();
    t.take();
    t.watch.stop();
    assert.deepEqual(t.live(), { subs: 0, everys: 0, visibles: 0 });
    mock.timers.tick(60_000);
    await settle();
    assert.deepEqual(t.take(), ['status off'], 'the state poll asks nothing more');
    t.update({ checkAgain: 5 });
    t.watch.wake();
    await settle();
    assert.deepEqual(t.take(), [], 'a stopped watch starts nothing');
  } finally {
    mock.timers.reset();
  }
});

test('the state poll keeps its pace while running and stops with a restart', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = rig();
    t.update();
    t.answer(OK);
    await settle();
    t.take();
    mock.timers.tick(3000);
    await settle();
    assert.deepEqual(t.take(), ['state 2'], 'idle: every few seconds');
    t.update({ settingsRev: 1 });
    await settle();
    assert.deepEqual(t.take(), ['state 2'], 'the restart reads at once');
    mock.timers.tick(3000);
    await settle();
    assert.deepEqual(t.take(), ['state 2'], 'and only the new poll keeps reading');
  } finally {
    mock.timers.reset();
  }
});

test('a slot answer that lands after a stop, a restart or an output action writes nothing', async () => {
  for (const cut of ['stop', 'restart', 'acted']) {
    const t = rig();
    t.update();
    t.setHold(true);
    t.answer(OK);
    await settle();
    const before = t.session.bridge.get();
    assert.equal(before.outputSlot, undefined);
    if (cut === 'stop') t.watch.stop();
    if (cut === 'restart') t.update({ hostedSlug: null });
    if (cut === 'acted') t.watch.slotActed();
    for (const answer of t.held.splice(0)) answer();
    await settle();
    const after = t.session.bridge.get();
    assert.equal(after.outputSlot, undefined, `${cut}: the late reading is dropped`);
    assert.equal(after.slotSeenOurs, false, `${cut}: and says nothing about our slot`);
    assert.ok(!t.calls.some((c) => c.startsWith('remember')), `${cut}: nothing is remembered`);
  }
});

test('a file check or a status that lands after a stop writes nothing', async () => {
  const t = rig();
  let release;
  t.io.listLibrary = (s, kind) => {
    t.calls.push(`list ${kind}`);
    return new Promise((resolve) => {
      release = () => resolve({ result: { state: 'ok', detail: '' }, items: [] });
    });
  };
  t.update();
  const sub = t.subs[0];
  t.answer(OK);
  t.watch.stop();
  release();
  await settle();
  assert.equal(t.session.bridge.get().serverFiles, null);
  sub.onStatus({ state: 'bridge', detail: 'late' });
  assert.notEqual(t.session.bridge.get().status?.detail, 'late', 'the unsubscribe holds');
});

test('a disposed session takes no write from a watch still running', async () => {
  const t = rig();
  t.update();
  t.session.dispose();
  t.answer(OK);
  await settle();
  assert.equal(t.session.bridge.get(), NO_BRIDGE);
});
