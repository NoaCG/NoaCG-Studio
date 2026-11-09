// guards: src/control/bridgeWatch.ts
//
// THE BRIDGE WATCH, run in Node with the Bridge, the timers and the tab faked (production-page
// refactor spec §2, AC-6): what a start asks first, which poll each restart key restarts and which it
// leaves alone, that a stop leaves no timer, subscription or listener live, and that an answer landing
// after a stop or a restart writes nothing. The browser half is e2e/bridge-connect.spec.ts,
// e2e/playout-clock.spec.ts and e2e/studio-evening-reliability.spec.ts.

import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const { startBridgeWatch, SLOT_READ_MS, FRESH_LOAD_MS, RECOVERY_WINDOW_MS } = await import('../src/control/bridgeWatch.ts');
const { createPlayoutSession, NO_BRIDGE } = await import('../src/control/playoutSession.ts');
const { createServerPlayoutStore } = await import('../src/control/serverPlayoutStore.ts');
const { loadReadyMemory, saveReadyMemory } = await import('../src/model/readyMemory.ts');

/** A kept Load as the page reads it back: through the real record (model/readyMemory.ts), so a field
 *  the record would drop is dropped here too. */
function throughStorage(loaded) {
  if (!loaded) return null;
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) };
  try {
    saveReadyMemory('show', { outputs: [], stamp: null, casparLoaded: loaded });
    return loadReadyMemory('show').casparLoaded ?? null;
  } finally {
    globalThis.localStorage = previous;
  }
}

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

/** One browser's storage (model/readyMemory.ts `casparLoaded`) and its Web Locks, which its tabs share. */
function newBrowser() {
  return { loaded: new Map(), locks: new Map(), refuses: false, clock: Date.now(), step: 1 };
}

/** Every watch a test started, stopped after it so no real timer keeps Node running. */
const started = [];
afterEach(() => {
  for (const watch of started.splice(0)) watch.stop();
});

/** A watch on a fresh session, with every request recorded in order. */
function rig({ settings = SETTINGS, items = [vt('clip', { frames: 250, fps: 25, mediaKind: 'movie' })], library, browser = newBrowser(), server = { layer: ourPage }, asyncLocks = false } = {}) {
  const calls = [];
  const subs = [];
  const everys = [];
  const visibles = [];
  const hiddens = [];
  let outOfView = false;
  /** Readings held by the test: `hold` makes the next `/state` wait until the test answers it. */
  const held = [];
  let hold = false;
  let asSent = false;
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
      // A held reading answers with the slot as it is when the test lets it go, or, held with
      // `asSent`, as it was when it went out (a slow Bridge).
      const reply = () => ({ result: { state: 'ok', detail: '' }, reply: { ok: true, channel, session: 'b1', ...(server.link ? { link: server.link } : {}), observedAt: 0, slots: channel === s.channel ? [server.layer] : [] } });
      if (!hold) return Promise.resolve(reply());
      const sent = reply();
      return new Promise((resolve) => held.push(() => resolve(asSent ? sent : reply())));
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
    loadedOutput: (showId) => throughStorage(browser.loaded.get(showId)),
    keepLoaded: (showId, next) => {
      // A full or private-window storage refuses every write.
      if (browser.refuses) return false;
      if (next === null) browser.loaded.delete(showId);
      else browser.loaded.set(showId, next);
      return true;
    },
    lead: (key) => {
      // Web Locks: one holder per key, the next asker's when it lets go.
      const queue = browser.locks.get(key) ?? [];
      browser.locks.set(key, queue);
      const lead = { on: false, held: () => lead.on, waiting: async () => queue.length > 1 && queue[0] === lead, release: () => {
        const at = queue.indexOf(lead);
        if (at >= 0) queue.splice(at, 1);
        lead.on = false;
        if (queue[0]) queue[0].on = true;
      } };
      queue.push(lead);
      // A real browser grants a lock on a later task, never inside the request.
      const grant = () => {
        if (queue[0] === lead) lead.on = true;
      };
      if (asyncLocks) setImmediate(grant);
      else grant();
      return lead;
    },
    every: (ms, run) => {
      const e = { ms, run, live: true };
      everys.push(e);
      return () => {
        e.live = false;
      };
    },
    // One clock for the whole browser, a millisecond on at every look, so "after" is never a tie.
    now: () => (browser.clock += browser.step),
    hidden: () => outOfView,
    onHidden: (run) => {
      const h = { run, live: true };
      hiddens.push(h);
      return () => {
        h.live = false;
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
        if (reloading.refill) server.layer = ourPage;
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
    /** The tab goes out of view. */
    hide: () => {
      outOfView = true;
      for (const h of hiddens.filter((x) => x.live)) h.run();
    },
    /** The tab comes back into view. */
    show: () => {
      outOfView = false;
    },
    /** The live status subscription answers. */
    answer: (result) => subs.filter((s) => s.live).at(-1).onStatus(result),
    update: (change = {}) => {
      Object.assign(inputs, change);
      watch.update({ ...inputs });
    },
    setHold: (on, { asSent: sentAnswers = false } = {}) => {
      hold = on;
      asSent = on && sentAnswers;
    },
    setSlot: (s) => {
      server.layer = s;
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
  assert.equal(t.everys[0].ms, 10_000);

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

  // The setup change is still pending. A render and another OK answer must not send it again.
  t.update();
  await settle();
  assert.equal(t.take().filter((c) => c === 'sync').length, 0, 'a render under the same answer does not sync');
  t.answer({ ...OK });
  await settle();
  assert.equal(t.take().filter((c) => c === 'sync').length, 0, 'another OK answer does not sync');

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
async function loadedRig(opts = {}) {
  const t = rig({ items: [], ...opts });
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

// ── WHAT THIS BROWSER LOADED OUTLIVES THE PAGE (issue #2245) ────────────────────────────────────

const EMPTY = { layer: 20, producer: 'empty', paused: false, loop: false };

/** The same browser opens the production page again (a reload, or back from Home): a new watch on
 *  the same storage, which has seen the slot once. */
async function reopened(browser, server, opts = {}) {
  const t = rig({ items: [], browser, server, ...opts });
  t.update();
  t.answer(OK);
  await settle();
  t.take();
  return t;
}

test('a page reloaded after the Load still puts the output back after a server restart, once', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const first = await loadedRig({ browser, server });
  assert.equal(browser.loaded.get('show-1')?.target, first.inputs.casparTarget, 'the Load is kept in this browser');
  first.watch.stop();
  const t = await reopened(browser, server);
  await restartServer(t);
  assert.deepEqual(t.take().filter((c) => c === 'reload' || c.startsWith('state')), ['state 1', 'state 1', 'reload', 'state 1'], 'read empty, read once more, loaded once, read again');
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'ours' });
  await t.readSlot();
  assert.ok(!t.take().includes('reload'), 'ours again: no more loads');
});

test('after a page reload, a server that keeps failing still gets exactly three tries, then red', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const t = await reopened(browser, server);
  t.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  await restartServer(t);
  for (let n = 0; n < 30; n += 1) await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 3);
  assert.deepEqual(t.session.bridge.get().slotReload, { state: 'failed', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
});

test('what gives the slot up is forgotten in this browser too, so a reloaded page never undoes it', async () => {
  const gaveUp = async (name, act) => {
    const browser = newBrowser();
    const server = { layer: ourPage };
    const t = await loadedRig({ browser, server });
    await act(t, server);
    assert.equal(browser.loaded.get('show-1'), undefined, `${name}: forgotten`);
    t.watch.stop();
    const again = await reopened(browser, server);
    server.layer = ourPage;
    await again.readSlot();
    await restartServer(again);
    assert.ok(!again.calls.includes('reload'), `${name}: a reloaded page does not bring it back`);
  };
  await gaveUp('Unload here', async (t) => t.watch.slotOwned(false, t.inputs.casparTarget));
  await gaveUp('another client\'s CLEAR while the server answers', async (t, server) => {
    server.layer = EMPTY;
    await t.readSlot();
  });
  await gaveUp('another production', async (t, server) => {
    server.layer = { ...ourPage, file: 'https://noacg.studio/output?production=xyz' };
    await t.readSlot();
  });
  await gaveUp('unpublished', async (t) => {
    t.update({ hostedSlug: null });
    await settle();
  });
});

test('a page reloaded during the outage still puts the output back, once (#2249)', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const first = await loadedRig({ browser, server });
  first.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  assert.ok(browser.loaded.get('show-1')?.outageAt, 'the tab that saw the output noted the outage');
  // The operator presses F5 while the header says CasparCG is not answering. The browser grants
  // the lock a moment after it is asked, as a real one does.
  first.watch.stop();
  server.layer = EMPTY;
  const t = rig({ items: [], browser, server, asyncLocks: true });
  t.update();
  t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  t.answer(OK);
  await settle();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1, 'loaded again once, on the first empty reading');
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'ours' });
  await t.readSlot();
  await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1, 'ours again: no more loads');

  // Out of tries before the reload: the page says so and leaves Load to the operator.
  const spent = newBrowser();
  const s2 = { layer: ourPage };
  const a = await loadedRig({ browser: spent, server: s2 });
  a.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  a.watch.stop();
  spent.loaded.set('show-1', { ...spent.loaded.get('show-1'), tries: 3, reason: 'refused' });
  s2.layer = EMPTY;
  const u = rig({ items: [], browser: spent, server: s2 });
  u.update();
  u.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  u.answer(OK);
  await settle();
  await u.readSlot();
  assert.ok(!u.calls.includes('reload'), 'three tries already made');
  assert.deepEqual(u.session.bridge.get().slotReload, { state: 'failed', detail: 'refused' }, 'and says why, as the tab that tried would');
});

test('a page reloaded during a failing recovery goes on with the tries, then says it failed (#2253)', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const a = await loadedRig({ browser, server });
  a.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'one try failed');
  assert.equal(a.session.bridge.get().slotReload?.state, 'reloading');
  // The operator presses F5 now, with the server answering.
  a.watch.stop();
  const t = rig({ items: [], browser, server });
  t.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  t.update();
  t.answer(OK);
  await settle();
  for (let n = 0; n < 30; n += 1) await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 2, 'the two tries left, never three more');
  assert.deepEqual(t.session.bridge.get().slotReload, { state: 'failed', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  assert.ok(browser.loaded.get('show-1'), 'the Load is still kept, for the operator to load again');

  // Reloaded once the tries are spent: the failed state, no try.
  t.watch.stop();
  const b = rig({ items: [], browser, server });
  b.update();
  b.answer(OK);
  await settle();
  await b.readSlot();
  assert.ok(!b.calls.includes('reload'));
  assert.equal(b.session.bridge.get().slotReload?.state, 'failed');
});

test('two quick reloads of the page during the wait before the last try still make it, then say failed', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const refused = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  const a = await loadedRig({ browser, server });
  a.reloading.answer = refused;
  await restartServer(a);
  await a.readSlot();
  await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 2, 'two tries made');
  a.watch.stop();
  /** A page opened `afterMs` after the last try, reading once on opening and then every 10 s. */
  const open = async (afterMs, reads) => {
    browser.clock = browser.loaded.get('show-1').triedAt + afterMs;
    const t = rig({ items: [], browser, server });
    t.reloading.answer = refused;
    t.update();
    t.answer(OK);
    await settle();
    for (let n = 0; n < reads; n += 1) {
      browser.clock += SLOT_READ_MS;
      await t.readSlot();
    }
    return t;
  };
  // F5 40 s after try 2: the page makes try 3 when the last gap is up, 60 s after try 2.
  const first = await open(40_000, 2);
  assert.equal(first.calls.filter((c) => c === 'reload').length, 1, 'try 3, on time');
  first.watch.stop();
  // F5 again: the tries are spent, and the page says so.
  const second = await open(35_000, 1);
  assert.ok(!second.calls.includes('reload'), 'three in all');
  assert.deepEqual(second.session.bridge.get().slotReload, { state: 'failed', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
});

test('a tab taking the lead over counts the wait from the last try, whichever tab made it', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const refused = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  a.reloading.answer = refused;
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'try 1');
  // B opens 40 s after try 1 and waits for the lock, reading meanwhile.
  browser.clock += 40_000;
  const b = rig({ items: [], browser, server });
  b.reloading.answer = refused;
  b.update();
  b.answer(OK);
  await settle();
  await b.readSlot();
  // A makes try 2 (two readings after try 1), then goes into the background and hands over.
  for (let n = 0; n < 2 && a.calls.filter((c) => c === 'reload').length < 2; n += 1) {
    browser.clock += SLOT_READ_MS;
    await a.readSlot();
  }
  assert.equal(a.calls.filter((c) => c === 'reload').length, 2, 'try 2, from A');
  const try2 = browser.loaded.get('show-1').triedAt;
  a.hide();
  // B leads now. Try 3 comes six readings after try 2, not sooner.
  let at = null;
  for (let n = 0; n < 10 && at === null; n += 1) {
    browser.clock += SLOT_READ_MS;
    await b.readSlot();
    if (b.calls.includes('reload')) at = browser.clock;
  }
  assert.ok(at !== null, 'B makes try 3');
  assert.ok(at - try2 >= 6 * SLOT_READ_MS, `try 3 came ${(at - try2) / 1000} s after try 2`);
  assert.equal([...a.calls, ...b.calls].filter((c) => c === 'reload').length, 3, 'three in all');
});

test('a page reloaded while a try is still out counts it: three PLAYs in all, never four', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const refused = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  const a = await loadedRig({ browser, server });
  a.reloading.answer = refused;
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'try 1, refused');
  let answerTry;
  a.reloading.answer = () => new Promise((resolve) => {
    answerTry = () => resolve(refused());
  });
  for (let n = 0; n < 4 && a.calls.filter((c) => c === 'reload').length < 2; n += 1) {
    browser.clock += SLOT_READ_MS;
    await a.readSlot();
  }
  assert.equal(a.calls.filter((c) => c === 'reload').length, 2, 'try 2 is out');
  // F5 now. A real browser frees the old page's lock as it unloads, and its try's answer never
  // reaches it.
  assert.equal(typeof answerTry, 'function');
  a.watch.stop();
  for (const lead of [...browser.locks.get('noacg-caspar-reload show-1')]) lead.release();
  const t = rig({ items: [], browser, server });
  t.reloading.answer = refused;
  t.update();
  t.answer(OK);
  await settle();
  for (let n = 0; n < 30; n += 1) {
    browser.clock += SLOT_READ_MS;
    await t.readSlot();
  }
  assert.equal([...a.calls, ...t.calls].filter((c) => c === 'reload').length, 3, 'three in all');
  assert.equal(t.session.bridge.get().slotReload?.state, 'failed');
});

test('an old record of tries acts on nothing: a CLEAR made since stays, and nothing says failed', async () => {
  // A try went through, and the page closed before any tab saw the output back: the record keeps
  // its try. A client clears the slot; the page is opened again later.
  const browser = newBrowser();
  const server = { layer: ourPage };
  const a = await loadedRig({ browser, server });
  a.reloading.refill = false;
  await restartServer(a);
  assert.equal(browser.loaded.get('show-1')?.tries, 1);
  a.watch.stop();
  server.layer = EMPTY;
  browser.clock += RECOVERY_WINDOW_MS + 1000;
  const t = rig({ items: [], browser, server });
  t.update();
  t.answer(OK);
  await settle();
  for (let n = 0; n < 10; n += 1) await t.readSlot();
  assert.ok(!t.calls.includes('reload'), 'the CLEAR stays');
  assert.equal(t.session.bridge.get().slotReload, null, 'and nothing says it failed');

  // Refused tries, the browser closed, opened again days later onto an empty slot.
  const days = newBrowser();
  const s2 = { layer: ourPage };
  const b = await loadedRig({ browser: days, server: s2 });
  b.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  await restartServer(b);
  for (let n = 0; n < 30; n += 1) await b.readSlot();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 3);
  b.watch.stop();
  days.clock += 3 * 24 * 60 * 60 * 1000;
  const u = rig({ items: [], browser: days, server: s2 });
  u.update();
  u.answer(OK);
  await settle();
  await u.readSlot();
  assert.ok(!u.calls.includes('reload'));
  assert.equal(u.session.bridge.get().slotReload, null, 'an old failure is not shown as a new one');
});

test('a recovery that ended, then a CLEAR, then a reload of the page: nothing comes back', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const a = await loadedRig({ browser, server });
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  assert.equal(browser.loaded.get('show-1')?.tries, undefined, 'back on the slot: the recovery is over');
  a.watch.stop();
  server.layer = EMPTY; // a client clears it while no page is open
  const t = rig({ items: [], browser, server });
  t.update();
  t.answer(OK);
  await settle();
  await t.readSlot();
  await t.readSlot();
  assert.ok(!t.calls.includes('reload'));
});

test('a page opened while everything answers never arms from an old outage note, so a CLEAR stays', async () => {
  // The Bridge went down with the output on air, the tab that noted it closed, and with no page open
  // a client cleared the slot. A page opened later must not take the old note for its own outage,
  // then, nor after a later outage it sees itself.
  const browser = newBrowser();
  const server = { layer: ourPage };
  const first = await loadedRig({ browser, server });
  first.answer({ state: 'agent', detail: 'Start NoaCG Bridge on this machine' });
  await settle();
  first.watch.stop();
  assert.equal(browser.loaded.get('show-1')?.seen, true, 'the note says the output was seen');
  server.layer = EMPTY;
  const t = await reopened(browser, server);
  await t.readSlot();
  assert.ok(!t.calls.includes('reload'), 'the CLEAR is left alone');
  await restartServer(t);
  assert.ok(!t.calls.includes('reload'), 'and a later outage does not bring it back');
});

test('a page opened during an outage no tab that saw the output noted loads nothing', async () => {
  // The Load is kept, but the page that made it closed before the outage: a CLEAR may have
  // happened since, so the note a fresh page writes itself arms nothing.
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  server.layer = EMPTY;
  const t = rig({ items: [], browser, server });
  t.update();
  t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  t.answer(OK);
  await settle();
  await t.readSlot();
  assert.ok(!t.calls.includes('reload'));
});

// ── A RESTART NO POLL SAW (issue #2252) ─────────────────────────────────────────────────────────

test('a restart no poll saw: emptied on another link, the output is loaded again, once', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage, link: 'b1.1' };
  const t = await loadedRig({ browser, server });
  await t.readSlot();
  assert.equal(browser.loaded.get('show-1')?.link, 'b1.1', 'the link ours was found under is kept');
  // CasparCG restarts between two readings: the status kept answering, the Bridge's link changed.
  server.layer = EMPTY;
  server.link = 'b1.2';
  await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1, 'loaded again once');
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'ours' });
  assert.equal(browser.loaded.get('show-1')?.link, 'b1.2');
  await t.readSlot();
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1, 'ours again: no more loads');
});

test('a CLEAR on the same link is still a CLEAR: left alone and forgotten', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage, link: 'b1.1' };
  const t = await loadedRig({ browser, server });
  await t.readSlot();
  server.layer = EMPTY;
  await t.readSlot();
  await t.readSlot();
  assert.ok(!t.calls.includes('reload'));
  assert.equal(browser.loaded.get('show-1'), undefined);
});

test('a reading on the new link that lands after another tab brought the output back forgets nothing', async () => {
  // B's reading goes out under the old link, finds the slot wiped after the restart, and lands after
  // A has reloaded and kept the new link. It is from before the recovery, never a CLEAR.
  const browser = newBrowser();
  const server = { layer: ourPage, link: 'b1.1' };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  await a.readSlot();
  server.layer = EMPTY;
  server.link = 'b1.2';
  b.setHold(true, { asSent: true });
  b.everys.filter((e) => e.live && e.ms === SLOT_READ_MS).at(-1).run();
  await settle();
  await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'A brings it back');
  b.held.shift()();
  await settle();
  assert.ok(browser.loaded.get('show-1'), 'B does not forget the Load');
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0);
});

test('a reading of ours from before another tab\'s recovery never puts the old link back', async () => {
  // B's reading finds ours before the restart and lands after A brought the output back under the
  // new link. Kept as the old link, a later CLEAR on the new one would read as a restart.
  const browser = newBrowser();
  const server = { layer: ourPage, link: 'b1.1' };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  await a.readSlot();
  b.setHold(true, { asSent: true });
  b.everys.filter((e) => e.live && e.ms === SLOT_READ_MS).at(-1).run();
  await settle();
  server.layer = EMPTY;
  server.link = 'b1.2';
  await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  assert.equal(browser.loaded.get('show-1')?.link, 'b1.2');
  b.held.shift()();
  await settle();
  b.setHold(false);
  assert.equal(browser.loaded.get('show-1')?.link, 'b1.2', 'the new link stays');
  // A client clears the slot on the current connection: left alone.
  server.layer = EMPTY;
  await a.readSlot();
  await b.readSlot();
  assert.equal([...a.calls, ...b.calls].filter((c) => c === 'reload').length, 1, 'no second load');
});

test('a slow reading sent under the old link, landing empty after a recovery and a CLEAR, reloads nothing', async () => {
  // B's reading goes out under the old link and lands after A brought the output back under the
  // new one and a client then cleared it. The kept link moved while it was out: no restart.
  const browser = newBrowser();
  const server = { layer: ourPage, link: 'b1.1' };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  await a.readSlot();
  b.setHold(true);
  b.everys.filter((e) => e.live && e.ms === SLOT_READ_MS).at(-1).run();
  await settle();
  server.layer = EMPTY;
  server.link = 'b1.2';
  await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'A brings it back');
  server.layer = EMPTY; // the CLEAR, on the current connection
  b.held.shift()();
  await settle();
  b.setHold(false);
  await a.readSlot();
  await b.readSlot();
  assert.equal([...a.calls, ...b.calls].filter((c) => c === 'reload').length, 1, 'the CLEAR stays');
});

test('a reloaded page that has not seen the output on its slot yet loads nothing', async () => {
  // Cleared by another client while this browser had no page open, then the page opens onto an
  // empty slot: it arms only once it has seen the output there, as after a Load, so a later outage
  // brings nothing back.
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  server.layer = EMPTY;
  const t = await reopened(browser, server);
  await t.readSlot();
  await restartServer(t);
  assert.ok(!t.calls.includes('reload'));
});

test('two tabs of one browser: only one reloads the slot and counts the tries; the other takes over when it closes', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  const refused = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  a.reloading.answer = refused;
  b.reloading.answer = refused;
  const loads = () => [...a.calls, ...b.calls].filter((c) => c === 'reload').length;
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  for (const t of [a, b]) t.answer(OK);
  await settle();
  assert.equal(loads(), 1, 'one PLAY at once, from one tab');
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0, 'tab B waits');
  for (let n = 0; n < 30; n += 1) {
    await a.readSlot();
    await b.readSlot();
  }
  assert.equal(loads(), 3, 'three tries in all, never three per tab');
  assert.equal(a.session.bridge.get().slotReload?.state, 'failed');
  // The reloading tab closes: the other one takes over, once the slot holds the output again.
  a.watch.stop();
  b.reloading.answer = () => ({ state: 'ok', detail: '' });
  server.layer = ourPage;
  await b.readSlot();
  b.answer({ state: 'server', detail: 'gone' });
  await settle();
  server.layer = EMPTY;
  b.answer(OK);
  await settle();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 1, 'tab B reloads now');
});

test('an Unload in one tab disarms every tab of the browser, even one that saw an outage', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const a = await loadedRig({ browser, server });
  const b = await reopened(browser, server);
  a.watch.slotOwned(false, a.inputs.casparTarget);
  server.layer = EMPTY;
  await restartServer(b);
  await restartServer(a);
  assert.ok(![...a.calls, ...b.calls].includes('reload'));
});

test('a tab that read the slot empty before a newer Load in another tab does not erase that Load', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const a = await loadedRig({ browser, server });
  const b = await reopened(browser, server);
  // B's reading goes out while the slot is empty after A's Unload, and lands after A loaded again.
  a.watch.slotOwned(false, a.inputs.casparTarget);
  server.layer = EMPTY;
  b.setHold(true);
  b.everys.filter((e) => e.live && e.ms === SLOT_READ_MS).at(-1).run();
  await settle();
  server.layer = { layer: 20, producer: 'video', file: 'AMB', paused: false, loop: true };
  b.held.shift()();
  server.layer = ourPage;
  a.watch.slotOwned(true, a.inputs.casparTarget);
  const kept = browser.loaded.get('show-1');
  await settle();
  assert.deepEqual(browser.loaded.get('show-1'), kept, 'the newer Load is still kept');
});

test('a reopened page forgets a kept Load it finds taken off while everything answers, unless it is fresh', async () => {
  const target = '["caspar",5250,1,20]';
  // Cleared while no page of this browser was open: the page opens onto a healthy empty slot.
  const browser = newBrowser();
  const server = { layer: EMPTY };
  browser.loaded.set('show-1', { target, at: Date.now() - FRESH_LOAD_MS - 1000 });
  const t = await reopened(browser, server);
  await t.readSlot();
  assert.equal(browser.loaded.get('show-1'), undefined, 'forgotten');
  // Another browser loads the production there later: this browser does not take it for its own.
  server.layer = ourPage;
  await t.readSlot();
  await restartServer(t);
  assert.ok(!t.calls.includes('reload'), 'another browser\'s Load is not brought back from here');

  // A Load still fresh (another tab just loaded it, and the slot does not show it yet) is kept.
  const fresh = newBrowser();
  const at = Date.now();
  fresh.loaded.set('show-1', { target, at });
  const u = await reopened(fresh, { layer: EMPTY });
  await u.readSlot();
  assert.equal(fresh.loaded.get('show-1')?.at, at, 'a fresh Load is kept');

  // A page opened while CasparCG is down does not forget it on the first empty reading after.
  const down = newBrowser();
  down.loaded.set('show-1', { target, at: Date.now() - FRESH_LOAD_MS - 1000 });
  const v = rig({ items: [], browser: down, server: { layer: EMPTY } });
  v.update();
  v.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  v.answer(OK);
  await settle();
  assert.ok(down.loaded.get('show-1'), 'kept through an outage');
});

test('a browser whose storage refuses writes still brings the output back while the page stays open', async () => {
  const browser = newBrowser();
  browser.refuses = true;
  const t = await loadedRig({ browser });
  assert.equal(browser.loaded.get('show-1'), undefined, 'nothing was kept');
  await restartServer(t);
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1, 'loaded again once, from the page\'s own word');
  // ...and an Unload is still never undone.
  const u = await loadedRig({ browser });
  u.watch.slotOwned(false, u.inputs.casparTarget);
  await restartServer(u);
  assert.ok(!u.calls.includes('reload'));
});

test('two tabs that saw the outage differently: one that missed it never cancels the reload', async () => {
  // A: the lead, saw the outage. B: a background tab whose slowed poll missed it, and reads the
  // empty slot first. B must not take it for a CLEAR and forget the Load for the whole browser.
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  a.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  await b.readSlot();
  assert.ok(browser.loaded.get('show-1'), 'B keeps the Load: A noted the outage');
  a.answer(OK);
  await settle();
  assert.equal([...a.calls, ...b.calls].filter((c) => c === 'reload').length, 1, 'A reloads, once');

  // The other way round: the lead missed the outage, a background tab saw it. The lead still reloads.
  const browser2 = newBrowser();
  const server2 = { layer: ourPage };
  (await loadedRig({ browser: browser2, server: server2 })).watch.stop();
  const lead = await reopened(browser2, server2);
  const other = await reopened(browser2, server2);
  other.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server2.layer = EMPTY;
  await lead.readSlot();
  assert.equal(lead.calls.filter((c) => c === 'reload').length, 1, 'the lead reloads on the outage another tab noted');
  assert.equal(other.calls.filter((c) => c === 'reload').length, 0);
});

test('a lead tab going out of view hands the reload to a tab in view', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  a.hide();
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  b.answer(OK);
  await settle();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 1, 'the tab in view reloads');
  assert.equal(a.calls.filter((c) => c === 'reload').length, 0);
  // Alone and out of view, a tab keeps the lead: a background tab still brings it back.
  const solo = newBrowser();
  const s2 = { layer: ourPage };
  (await loadedRig({ browser: solo, server: s2 })).watch.stop();
  const c = await reopened(solo, s2);
  c.hide();
  await restartServer(c);
  assert.equal(c.calls.filter((x) => x === 'reload').length, 1);
});

test('a lead that went out of view before another tab opened hands the reload to it (#2251)', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  // A leads, then goes into the background while no other tab is open: it keeps the lock.
  const a = await reopened(browser, server);
  a.hide();
  // B opens later, in view, sees the output and waits for the lock.
  const b = await reopened(browser, server);
  // A's next (slowed) reading finds nothing to do and lets B lead.
  await a.readSlot();
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  b.answer(OK);
  await settle();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 1, 'the tab in view reloads');
  assert.equal(a.calls.filter((c) => c === 'reload').length, 0);
  // In view, a lead keeps the lock whoever waits.
  const browser2 = newBrowser();
  const s2 = { layer: ourPage };
  (await loadedRig({ browser: browser2, server: s2 })).watch.stop();
  const c = await reopened(browser2, s2);
  const d = await reopened(browser2, s2);
  await c.readSlot();
  await restartServer(c);
  await d.readSlot();
  assert.equal(c.calls.filter((x) => x === 'reload').length, 1, 'the lead in view still reloads');
  assert.equal(d.calls.filter((x) => x === 'reload').length, 0);
});

test('the three tries are the browser\'s: a tab taking the lead over goes on from them', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  for (const t of [a, b]) t.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  for (const t of [a, b]) t.answer(OK);
  await settle();
  for (let n = 0; n < 10; n += 1) await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 3);
  a.hide();
  for (let n = 0; n < 20; n += 1) await b.readSlot();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0, 'no fresh three from the next tab');
  assert.deepEqual(b.session.bridge.get().slotReload, { state: 'failed', detail: 'CasparCG refused the command: 404 PLAY FAILED.' }, 'with the reason A got');
});

test('a tab going out of view with its reload under way finishes it, then hands over: one PLAY', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  let release;
  a.reloading.answer = () => new Promise((resolve) => {
    release = () => resolve({ state: 'ok', detail: '' });
  });
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'A\'s load is out');
  a.hide();
  // Every state B's slot row goes through, however briefly.
  const bSaid = [];
  b.session.bridge.subscribe(() => bSaid.push(b.session.bridge.get().slotReload?.state ?? null));
  // B comes back while A's load is still out, and reads the slot empty twice.
  b.answer(OK);
  await settle();
  await b.readSlot();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0, 'B sends no second load beside it');
  assert.ok(!bSaid.includes('reloading'), 'and never says it reloads, not even for a moment');
  release();
  await settle();
  // Back on the slot; the lead is B's now, for the next restart.
  await b.readSlot();
  await restartServer(b);
  assert.equal(b.calls.filter((c) => c === 'reload').length, 1, 'B leads the next one');
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
});

test('a tab that saw the outage but not the recovery never undoes a later CLEAR', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  // Both see the outage; A, leading, brings the output back and sees it; B reads nothing meanwhile.
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  assert.deepEqual(a.session.bridge.get().outputSlot, { holds: 'ours' });
  // A client clears the slot while everything answers. A goes to the background; B leads now.
  server.layer = EMPTY;
  a.hide();
  b.answer(OK);
  await settle();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0, 'B leaves the CLEAR alone');
  assert.equal(browser.loaded.get('show-1'), undefined, 'and forgets the Load');
});

test('a page opened during another tab\'s recovery does not forget the Load', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const a = await loadedRig({ browser, server });
  browser.loaded.set('show-1', { ...browser.loaded.get('show-1'), at: browser.clock - FRESH_LOAD_MS - 1000 });
  await a.readSlot(); // seen with that stamp
  a.reloading.answer = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  const c = await reopened(browser, server);
  await c.readSlot();
  assert.ok(browser.loaded.get('show-1'), 'still kept while A recovers');
  await a.readSlot();
  await a.readSlot();
  assert.equal(a.calls.filter((x) => x === 'reload').length, 2, 'A goes on trying');
});

test('once the output is back, a stale outage note never undoes a later CLEAR', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  // B is a background tab: it misses the whole restart and A brings the output back.
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  assert.equal(browser.loaded.get('show-1')?.outageAt, undefined, 'recovery over: the note is cleared');
  // A client clears the slot while everything answers; A goes to the background, B leads.
  server.layer = EMPTY;
  a.hide();
  await b.readSlot();
  assert.ok(!b.calls.includes('reload'), 'B leaves the CLEAR alone');
  assert.equal(browser.loaded.get('show-1'), undefined, 'and forgets the Load');
});

test('a reading of ours sent before the outage does not end the recovery', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  b.setHold(true);
  b.everys.filter((e) => e.live && e.ms === SLOT_READ_MS).at(-1).run();
  await settle();
  a.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  b.held.shift()(); // it answers ours: the server as it was before it went
  await settle();
  assert.ok(browser.loaded.get('show-1')?.outageAt, 'the outage note stays');
  // B's next reading finds the slot wiped by the restart: still an outage to B, never a CLEAR.
  b.setHold(false);
  server.layer = EMPTY;
  await b.readSlot();
  assert.ok(browser.loaded.get('show-1'), 'the Load is kept');
});

test('a page left with its reload under way keeps the lock until the load lands: one PLAY', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  let release;
  a.reloading.answer = () => new Promise((resolve) => {
    release = () => resolve({ state: 'ok', detail: '' });
  });
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'A\'s load is out');
  // The operator goes Home from A while its load is out.
  a.watch.stop();
  b.answer(OK);
  await settle();
  await b.readSlot();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0, 'B sends no second load beside it');
  release();
  await settle();
  await b.readSlot();
  await restartServer(b);
  assert.equal(b.calls.filter((c) => c === 'reload').length, 1, 'B has the lock once A\'s load landed');
});

test('a try sent from a page left before it landed still counts: three in all', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  const refused = { state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' };
  let release;
  a.reloading.answer = () => refused;
  b.reloading.answer = () => refused;
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 2, 'two refused tries');
  a.reloading.answer = () => new Promise((resolve) => {
    release = () => resolve(refused);
  });
  for (let n = 0; n < 6; n += 1) await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 3, 'the third is out');
  a.watch.stop();
  release();
  await settle();
  assert.equal(browser.loaded.get('show-1')?.tries, 3, 'counted for the browser');
  b.answer(OK);
  await settle();
  for (let n = 0; n < 20; n += 1) await b.readSlot();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 0, 'no fourth from the next tab');
  assert.equal(b.session.bridge.get().slotReload?.state, 'failed');
});

test('an outage seen in the same millisecond as the last reading of ours still counts', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const t = await loadedRig({ browser, server });
  browser.step = 0; // the wall clock does not move between the reading and the outage
  await t.readSlot();
  await restartServer(t);
  assert.equal(t.calls.filter((c) => c === 'reload').length, 1, 'loaded again, not taken for a CLEAR');
});

test('a slow empty reading sent before another tab saw the output back never forgets the Load', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  // B's reading goes out while the slot is still empty and comes back late, as it was when sent.
  b.setHold(true, { asSent: true });
  b.answer(OK);
  await settle();
  // Meanwhile A reloads and sees the output back.
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  assert.deepEqual(a.session.bridge.get().outputSlot, { holds: 'ours' });
  for (const answer of b.held.splice(0)) answer();
  await settle();
  assert.ok(browser.loaded.get('show-1'), 'the Load is kept');
  // So the next restart is recovered too.
  b.setHold(false);
  await restartServer(a);
  assert.equal(a.calls.filter((c) => c === 'reload').length, 2);
});

test('a tab that missed another tab\'s recovery starts the next outage with three tries', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  const refused = () => ({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  a.reloading.answer = refused;
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  for (const t of [a, b]) t.answer(OK);
  await settle();
  await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 2, 'A: two refused tries');
  // A goes to the background; B leads and brings the output back. A reads nothing meanwhile.
  a.hide();
  for (let n = 0; n < 6 && !b.calls.includes('reload'); n += 1) await b.readSlot();
  assert.equal(b.calls.filter((c) => c === 'reload').length, 1);
  await b.readSlot();
  assert.equal(browser.loaded.get('show-1')?.tries, undefined, 'recovery over');
  // B goes to the background, A leads again; the next outage gets its own three tries, the first at once.
  b.hide();
  a.reloading.answer = refused;
  a.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 3, 'the first try at once');
  for (let n = 0; n < 10; n += 1) await a.readSlot();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 5, 'three for this outage in all');
});

test('a try that lands after a newer Load is not counted against it', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  let release;
  a.reloading.answer = () => new Promise((resolve) => {
    release = () => resolve({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  });
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'A\'s try is out');
  // The operator presses Load in B, which lands, and B sees the output.
  server.layer = ourPage;
  b.watch.slotOwned(true, b.inputs.casparTarget);
  b.answer(OK);
  await settle();
  const fresh = browser.loaded.get('show-1');
  // A's status is down when its try lands, so A reads nothing that would clean up after it.
  a.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  release();
  await settle();
  assert.equal(browser.loaded.get('show-1')?.at, fresh.at);
  assert.equal(browser.loaded.get('show-1')?.tries, undefined, 'the newer Load keeps all three tries');
});

test('a slow empty reading never forgets the Load, even when the clocks tie with the recovery', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  browser.step = 0; // every look at the clock from here gives the same millisecond
  b.setHold(true, { asSent: true });
  b.answer(OK);
  await settle();
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1);
  for (const answer of b.held.splice(0)) answer();
  await settle();
  assert.ok(browser.loaded.get('show-1'), 'the Load is kept');
});

test('a try that lands after another tab saw the output back is not counted against the next outage', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  let release;
  a.reloading.answer = () => new Promise((resolve) => {
    release = () => resolve({ state: 'server', detail: 'CasparCG refused the command: 404 PLAY FAILED.' });
  });
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.answer(OK);
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 1, 'A\'s try is out');
  // The load got through after all; B sees the output back, which ends the recovery.
  server.layer = ourPage;
  b.answer(OK);
  await settle();
  assert.equal(browser.loaded.get('show-1')?.outageAt, undefined);
  a.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  const noted = browser.loaded.get('show-1')?.outageAt;
  release();
  await settle();
  assert.equal(browser.loaded.get('show-1')?.tries, undefined, 'the next outage keeps all three tries');
  assert.equal(browser.loaded.get('show-1')?.outageAt, noted);
});

test('an Unload in another tab while the reloading tab reads the slot once more sends nothing', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  (await loadedRig({ browser, server })).watch.stop();
  const a = await reopened(browser, server);
  const b = await reopened(browser, server);
  for (const t of [a, b]) t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  server.layer = EMPTY;
  a.setHold(true);
  a.answer(OK);
  await settle();
  a.held.shift()(); // the watch's reading: empty; the reload reads once more
  await settle();
  assert.equal(a.held.length, 1, 'the reload\'s own read is out');
  b.watch.slotOwned(false, b.inputs.casparTarget);
  a.held.shift()();
  await settle();
  assert.equal(a.calls.filter((c) => c === 'reload').length, 0, 'the Unload is never undone');
});

test('a recovery read in the same millisecond as the outage note still ends the recovery', async () => {
  const browser = newBrowser();
  const server = { layer: ourPage };
  const t = await loadedRig({ browser, server });
  browser.step = 0; // the outage note and the reading that finds the output back tie
  t.answer({ state: 'server', detail: 'CasparCG did not answer' });
  await settle();
  t.answer(OK);
  await settle();
  assert.deepEqual(t.session.bridge.get().outputSlot, { holds: 'ours' }, 'a short outage: the output is still there');
  assert.equal(browser.loaded.get('show-1')?.outageAt, undefined, 'recovery over');
  browser.step = 1;
  // A client clears the slot while everything answers: left alone.
  server.layer = EMPTY;
  await t.readSlot();
  assert.ok(!t.calls.includes('reload'), 'the CLEAR is never undone');
});
