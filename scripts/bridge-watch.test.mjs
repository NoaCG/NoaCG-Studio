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
      // A held reading answers with the slot as it is when the test lets it go.
      const reply = () => ({ result: { state: 'ok', detail: '' }, reply: { ok: true, channel, session: 'b1', observedAt: 0, slots: channel === s.channel ? [slotLayer] : [] } });
      if (!hold) return Promise.resolve(reply());
      return new Promise((resolve) => held.push(() => resolve(reply())));
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
  /** What a reload answers; set by a test. By default, as the page's: the slot holds ours again. */
  const reloading = { answer: () => ({ state: 'ok', detail: '' }), refill: true };
  let watch;
  watch = startBridgeWatch(session, io, {
    rundown: () => rundown,
    slots: {
      itemSlot: (s, item) => ({ adapter: 'casparcg', channel: item.channel ?? s.channel, layer: item.layer }),
      folderSlot: (s) => ({ adapter: 'casparcg', channel: s.channel, layer: 10 }),
    },
    serverPlayout,
    settingsChanged: () => calls.push('settings changed'),
    learnt: (showId, facts) => learnt.push([showId, facts]),
    // The page's half (useProductionPublish.ts `reloadOnSlot`), the load alone: a sent load reaches the watch
    // through `onAirChanged`, which drops reads already out, owns the slot and reads it again.
    reload: async () => {
      calls.push('reload');
      const result = await reloading.answer();
      if (!result) return null;
      watch.slotActed();
      if (result.state === 'ok') {
        if (reloading.refill) slotLayer = ourPage;
        watch.slotOwned(true, inputs.casparTarget);
      }
      // setSlotRev: the page reads the slot again at its next render, after the load returned.
      setImmediate(() => {
        inputs.slotRev += 1;
        watch.update({ ...inputs });
      });
      return result;
    },
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
    checkAgain: 0,
    settingsRev: 0,
    slotRev: 0,
  };
  return {
    watch, session, io, calls, subs, everys, visibles, held, learnt, inputs, state, rundown, reloading,
    /** The slot poll's 10 s tick, on the poll running now. */
    readSlot: async () => {
      everys.filter((e) => e.live && e.ms === SLOT_READ_MS).at(-1).run();
      await settle();
    },
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
  assert.deepEqual(NO_BRIDGE, { status: null, outputSlot: undefined, serverFiles: null, slotSeenOurs: false, learntFacts: null, slotReload: null });
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
  t.update({ playoutItems: [] });
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

// ── A LOST OUTPUT COMES BACK BY ITSELF (issue #1657) ────────────────────────────────────────────

/** A published page that loaded its output and saw it on the slot. */
async function loadedRig() {
  const t = rig({ items: [] });
  t.watch.slotOwned(true, t.inputs.casparTarget);
  t.update();
  t.answer(OK);
  await settle();
  assert.equal(t.session.bridge.get().slotSeenOurs, true);
  t.take();
  return t;
}

/** CasparCG restarts: the Bridge says the server is gone, every layer is wiped, then it answers. */
async function restartServer(t) {
  t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  t.setSlot({ layer: 20, producer: 'empty', paused: false, loop: false });
  t.answer(OK);
  await settle();
}

test('after a server restart the output this page loaded goes back on its slot by itself, once', async () => {
  const t = await loadedRig();
  await restartServer(t);
  assert.deepEqual(t.take().filter((c) => c === 'reload' || c.startsWith('state')), ['state 1', 'state 1', 'reload', 'state 1'], 'read empty, read once more, loaded once, read again');
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'ours' });
  assert.equal(t.session.bridge.get().slotReload, null, 'back on its slot: nothing left to say');
  await t.readSlot();
  await t.readSlot();
  assert.ok(!t.take().includes('reload'), 'ours again: no more loads');
});

test('an output this page only saw, another production, an Unload here or elsewhere, or an unpublish is never loaded again', async () => {
  // Seen on the slot but loaded by another browser: that browser brings it back.
  const seen = rig({ items: [] });
  seen.update();
  seen.answer(OK);
  await settle();
  await restartServer(seen);
  assert.ok(!seen.calls.includes('reload'), 'not loaded here');

  // Another production took the slot: it asks before replacing, and the slot is no longer ours to take back.
  const other = await loadedRig();
  other.setSlot({ ...ourPage, file: 'https://noacg.studio/output?production=xyz' });
  await other.readSlot();
  other.setSlot({ layer: 20, producer: 'empty', paused: false, loop: false });
  await other.readSlot();
  assert.ok(!other.calls.includes('reload'), 'another production');

  // Emptied with no outage: another browser's Unload or unpublish, or a client's CLEAR. This page
  // hears of it only through the slot, and leaves it alone.
  const cleared = await loadedRig();
  cleared.setSlot({ layer: 20, producer: 'empty', paused: false, loop: false });
  await cleared.readSlot();
  await cleared.readSlot();
  assert.ok(!cleared.calls.includes('reload'), 'emptied while the server kept answering');
  assert.equal(cleared.session.bridge.get().slotReload, null);
  // ...and a later outage does not bring back what someone took off.
  await restartServer(cleared);
  assert.ok(!cleared.calls.includes('reload'), 'a later outage');

  // During the outage another client put a clip on the layer: the slot is theirs, never covered.
  const clip = await loadedRig();
  clip.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  clip.setSlot({ layer: 20, producer: 'video', file: 'AMB', paused: false, loop: true });
  clip.answer(OK);
  await settle();
  clip.setSlot({ layer: 20, producer: 'empty', paused: false, loop: false });
  await restartServer(clip);
  assert.ok(!clip.calls.includes('reload'), 'another client\'s clip, and the slot after it');

  // Unloaded on purpose (onAirChanged('stop') clears what was seen and gives the slot up).
  const unloaded = await loadedRig();
  unloaded.watch.slotOwned(false, unloaded.inputs.casparTarget);
  await restartServer(unloaded);
  assert.ok(!unloaded.calls.includes('reload'), 'unloaded');

  // Unpublished and published again without a Load: nothing comes back by itself.
  const unpublished = await loadedRig();
  unpublished.update({ hostedSlug: null });
  unpublished.update({ hostedSlug: 'abc' });
  await settle();
  await restartServer(unpublished);
  assert.ok(!unpublished.calls.includes('reload'), 'unpublished');
});

test('Publish\'s own load, landing before the page renders it published, is still brought back', async () => {
  const t = rig({ items: [] });
  t.update({ hostedSlug: null });
  t.answer(OK);
  await settle();
  // Publish loads the output and then the page renders with the production published.
  t.watch.slotOwned(true, t.inputs.casparTarget);
  t.update({ hostedSlug: 'abc', slotRev: 1 });
  await settle();
  assert.equal(t.session.bridge.get().slotSeenOurs, true);
  await restartServer(t);
  assert.ok(t.calls.includes('reload'));
});

test('an Unload during a reload leaves nothing saying it reloads', async () => {
  const t = await loadedRig();
  let release;
  t.reloading.answer = () => new Promise((resolve) => {
    release = () => resolve({ state: 'ok', detail: '' });
  });
  await restartServer(t);
  assert.deepEqual(t.session.bridge.get().slotReload, { state: 'reloading' });
  t.watch.slotOwned(false, t.inputs.casparTarget);
  assert.equal(t.session.bridge.get().slotReload, null);
  release();
  await settle();
  assert.equal(t.session.bridge.get().slotReload, null, 'the late answer writes nothing');
});

test('a server that keeps failing is tried three times, spaced out, then left to Load', async () => {
  const t = await loadedRig();
  t.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  await restartServer(t);
  const loads = () => t.calls.filter((c) => c === 'reload').length;
  assert.equal(loads(), 1, 'the first try at once');
  assert.deepEqual(t.session.bridge.get().slotReload, { state: 'reloading' });
  await t.readSlot();
  assert.equal(loads(), 2, 'the second after the reading straight after the first and one 10 s on');
  // The reading straight after the second try is the first of six.
  for (let n = 0; n < 4; n += 1) await t.readSlot();
  assert.equal(loads(), 2, 'the third waits six readings');
  await t.readSlot();
  assert.equal(loads(), 3);
  assert.deepEqual(t.session.bridge.get().slotReload, { state: 'failed', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  for (let n = 0; n < 20; n += 1) await t.readSlot();
  assert.equal(loads(), 3, 'no loop: the rest is the operator\'s');
  // The operator's own Load starts afresh.
  t.watch.slotOwned(true, t.inputs.casparTarget);
  assert.equal(t.session.bridge.get().slotReload, null);
});

test('a load that went through and left the slot empty is out of tries too, and says so', async () => {
  const t = await loadedRig();
  t.reloading.refill = false;
  await restartServer(t);
  for (let n = 0; n < 10; n += 1) await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 3);
  assert.deepEqual(t.session.bridge.get().slotReload, { state: 'failed', detail: '' });
});

test('no double load: a reload that found the operator\'s Load already out is not a try', async () => {
  const t = await loadedRig();
  let skip = true;
  t.reloading.answer = () => (skip ? null : { state: 'ok', detail: '' });
  t.setHold(true);
  await restartServer(t);
  // A reading still out when the next tick comes is never stacked, so nothing loads twice at once.
  t.held.shift()();
  await settle();
  // The reload reads the slot once more before it sends.
  t.held.shift()();
  await settle();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1);
  t.setHold(false);
  skip = false;
  await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 2, 'the next empty reading tries for real');
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'ours' });
});

test('a reload is for the slot it was loaded on, and for a page still open', async () => {
  // The settings move the output to an empty 2-30: this page never loaded anything there.
  const moved = await loadedRig();
  moved.state.settings = { ...moved.state.settings, channel: 2, layer: 30 };
  moved.update({ casparTarget: '["caspar",5250,2,30]' });
  await settle();
  await restartServer(moved);
  assert.ok(!moved.calls.includes('reload'), 'another slot');

  // The page goes, the settings move the slot, the operator's own Load lands, another client plays
  // a clip there or another browser already put it back, while the reload reads the slot once
  // more: nothing is sent.
  for (const cut of ['stop', 'moved', 'acted', 'clip', 'back']) {
    const t = await loadedRig();
    await restartServer(t);
    t.take();
    t.setHold(true);
    // The first try already went (the rig answers ok and fills the slot); empty it again after an
    // outage and catch the next try in its read.
    t.setSlot({ layer: 20, producer: 'empty', paused: false, loop: false });
    t.answer({ state: 'server', detail: 'gone' });
    await settle();
    t.answer(OK);
    await settle();
    for (const answer of t.held.splice(0)) answer();
    await settle();
    assert.equal(t.session.bridge.get().slotReload?.state, 'reloading', `${cut}: a try is out`);
    if (cut === 'stop') t.watch.stop();
    if (cut === 'moved') t.state.settings = { ...t.state.settings, channel: 2, layer: 30 };
    if (cut === 'acted') t.watch.slotActed();
    if (cut === 'clip') t.setSlot({ layer: 20, producer: 'video', file: 'AMB', paused: false, loop: true });
    if (cut === 'back') t.setSlot(ourPage);
    for (const answer of t.held.splice(0)) answer();
    await settle();
    assert.ok(!t.take().includes('reload'), `${cut}: nothing sent`);
    if (cut === 'clip' || cut === 'back') {
      // Another client's slot now, or back (another browser reloaded it): cleared again with
      // everything answering, it is not this page's to fill.
      t.setHold(false);
      t.setSlot({ layer: 20, producer: 'empty', paused: false, loop: false });
      await t.readSlot();
      assert.ok(!t.take().includes('reload'), `${cut}: cleared on purpose afterwards`);
    }
  }
});
