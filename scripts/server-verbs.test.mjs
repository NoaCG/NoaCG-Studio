// guards: src/control/serverVerbs.ts
//
// ONE VERB ON THE PLAYOUT SERVER AND ITS FOLD, run in Node with the Bridge faked (docs/BRIDGE.md §5,
// docs/CLIP_PLAYBACK_PLAN.md §6.6): the refusal said at the press, the draft's head start, the
// settings and the store read after the wait, a Play-through folder's stray copies taken off first,
// each accepted action folded, and the server read again once. The order is pinned, since the page's
// verbs depend on it. Moved out of ProductionPage in the production-page refactor's phase 5; what
// each action looks like is scripts/server-playout.test.mjs, and the browser half is
// e2e/playout-cues.spec.ts, e2e/playout-clock.spec.ts and e2e/playout-folders.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { LOCAL_SAVE_HEAD_START_MS, runAndRecord } = await import('../src/control/serverVerbs.ts');
const { throughPlaces } = await import('../src/control/serverPlayout.ts');
const { rundownView } = await import('../src/model/rundownRows.ts');
const { createServerPlayoutStore } = await import('../src/control/serverPlayoutStore.ts');
const { NO_OWNERSHIP } = await import('../src/control/serverState.ts');

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
const SETTINGS = { channel: 1, layer: 20, clipChannel: 2 };
const SLOTS = {
  itemSlot: (s, item) => slot(item.channel ?? s.channel, item.layer),
  folderSlot: (s, folder) => slot(folder.slot?.channel ?? s.clipChannel, folder.slot?.layer ?? 10),
};
const vt = (id, extra = {}) => ({ id, adapter: 'casparcg', kind: 'media', name: id.toUpperCase(), layer: 10, channel: 2, mediaKind: 'movie', frames: 250, fps: 25, ...extra });
const strap = { id: 's', adapter: 'casparcg', kind: 'template', name: 'STRAP', layer: 21, channel: 1 };
const cue = (id, sourceId, extra = {}) => ({ id, sourceId, source: 'playout', label: id.toUpperCase(), values: {}, ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function rundownOf(cues, items, folders = []) {
  const { members } = rundownView({ cues, folders });
  return { cues, items, folders, members, places: throughPlaces(cues, items, folders), itemOf: (c) => items.find((i) => i.id === c.sourceId) ?? null, slots: SLOTS };
}

/** The page's io with every call written to `log`, in order. `states` script the Bridge's answers. */
function harness({ states = [], flush, settings = () => SETTINGS, values = () => ({ f0: 'Anna' }), onAir = {} } = {}) {
  const log = [];
  const sent = [];
  let generation = 0;
  let clock = 1000;
  const store = createServerPlayoutStore();
  store.apply((parts) => ({ ...parts, ownership: { ...NO_OWNERSHIP, onAir } }));
  const apply = store.apply;
  const recorded = {
    ownership: store.ownership,
    timing: store.timing,
    apply: (fold) => {
      log.push('fold');
      apply(fold);
    },
  };
  const io = {
    act: async (s, action) => {
      log.push(`act ${action.verb} ${action.slot.channel}-${action.slot.layer}`);
      sent.push({ settings: s, action });
      const state = states.shift() ?? 'ok';
      if (state !== 'ok') return { state, detail: `refused (${state})` };
      generation += 1;
      return { state, detail: 'connected', generation, session: 's1', ...(action.verb === 'take' || action.verb === 'sequence' ? { instance: `s1.${generation}` } : {}) };
    },
    loadSettings: () => {
      log.push('settings');
      return settings();
    },
    now: () => {
      log.push('now');
      return (clock += 1);
    },
    wake: () => log.push('wake'),
    flush: () => {
      log.push('flush');
      return flush ? flush() : Promise.resolve();
    },
    cueView: (c) => {
      log.push(`view ${c.id}`);
      return { values: values() };
    },
  };
  return { store, recorded, io, log, sent };
}

const intentOf = (rundown, c, verb, extra = {}) => ({ cue: c, item: rundown.itemOf(c), verb, label: 'Take', blocked: null, readable: true, rundown, ...extra });

test('a refused Take is said at once: nothing saved, read, sent, folded or woken', async () => {
  const r = rundownOf([cue('a', 'a')], [vt('a')]);
  const h = harness();
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take', { blocked: 'CasparCG is off for this production.' }));
  assert.deepEqual(outcome, { ok: false, note: 'Take was not sent: CasparCG is off for this production.', accepted: [] });
  assert.deepEqual(h.log, []);
});

test('the refusal holds up only a Take: Out goes whatever it says', async () => {
  const r = rundownOf([cue('a', 'a')], [vt('a')]);
  const h = harness({ onAir: { a: { cueId: 'a', slot: slot(2, 10) } } });
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'out', { label: 'Out', blocked: 'CasparCG is off for this production.' }));
  assert.equal(outcome.ok, true);
  assert.deepEqual(h.sent.map((s) => s.action.verb), ['out']);
});

test('the order: save started, settings read after it, the action built and sent, folded, then the server woken', async () => {
  const r = rundownOf([cue('s', 's')], [strap]);
  const h = harness();
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.note, '✓ Take: STRAP on 1-21');
  assert.deepEqual(h.log, ['flush', 'settings', 'view s', 'act take 1-21', 'fold', 'now', 'wake']);
});

test('the settings, the store and the values are read after the wait, not at the press', async () => {
  let release;
  let settings = SETTINGS;
  let values = { f0: 'typed before' };
  const r = rundownOf([cue('s', 's')], [{ ...strap, channel: undefined }]);
  const h = harness({ flush: () => new Promise((resolve) => (release = resolve)), settings: () => settings, values: () => values });
  const pending = runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  await tick();
  assert.deepEqual(h.log, ['flush'], 'nothing is read or sent while the save has its head start');
  settings = { ...SETTINGS, channel: 3 };
  values = { f0: 'typed after' };
  release();
  await pending;
  assert.equal(h.sent[0].settings, settings, 'the Bridge is asked with the settings as they stand after the wait');
  assert.deepEqual(h.sent[0].action.slot, slot(3, 21), 'the item\'s slot comes from them');
  assert.deepEqual(h.sent[0].action.data, { f0: 'typed after' });

  // Out goes where the take WENT, as the store says after the wait.
  const r2 = rundownOf([cue('a', 'a')], [vt('a')]);
  let let2;
  const h2 = harness({ flush: () => new Promise((resolve) => (let2 = resolve)), onAir: { a: { cueId: 'a', slot: slot(2, 10) } } });
  const out = runAndRecord(h2.recorded, h2.io, intentOf(r2, r2.cues[0], 'out', { label: 'Out' }));
  await tick();
  h2.store.apply((parts) => ({ ...parts, ownership: { ...parts.ownership, onAir: { a: { cueId: 'a', slot: slot(2, 7) } } } }));
  let2();
  await out;
  assert.deepEqual(h2.sent.map((s) => s.action.slot), [slot(2, 7)]);
});

test('a save that takes long gets its head start and no more; a failed save holds nothing up', async (t) => {
  assert.equal(LOCAL_SAVE_HEAD_START_MS, 250);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rundownOf([cue('a', 'a')], [vt('a')]);
  const h = harness({ flush: () => new Promise(() => {}) });
  const pending = runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  await tick();
  t.mock.timers.tick(LOCAL_SAVE_HEAD_START_MS - 1);
  await tick();
  assert.deepEqual(h.sent, [], 'not before the head start is over');
  t.mock.timers.tick(1);
  await tick();
  assert.equal(h.sent.length, 1, 'and not after it either, with the save still running');
  assert.equal((await pending).ok, true);

  // A save that has already failed: the Take goes with no time passing at all.
  const failed = harness({ flush: () => Promise.reject(new Error('offline')) });
  assert.equal((await runAndRecord(failed.recorded, failed.io, intentOf(r, r.cues[0], 'take'))).ok, true);
});

test('an accepted take is folded with the page\'s clock, the clip\'s length and what the Bridge said', async () => {
  const r = rundownOf([cue('a', 'a', { playback: { end: 'loop' } })], [vt('a')]);
  const h = harness();
  await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  assert.deepEqual(h.store.ownership.get().onAir, { a: { cueId: 'a', slot: slot(2, 10), instance: 's1.1', takenAt: 1001, end: 'loop' } });
  assert.deepEqual(h.store.ownership.get().generations, { '2-10': { generation: 1, session: 's1' } });
  assert.deepEqual(h.store.timing.get()['2-10'], { segment: { start: 0, length: 10 }, position: 0, paused: false, loop: true, at: 1001, source: 'estimate', provisional: true });

  // A Bridge that cannot read the server: the estimate is not provisional. A stamped take keeps its stamp.
  const blind = harness();
  await runAndRecord(blind.recorded, blind.io, intentOf(r, r.cues[0], 'take', { readable: false, options: { takenAt: 42 } }));
  assert.equal(blind.store.timing.get()['2-10'].provisional, undefined);
  assert.equal(blind.store.ownership.get().onAir.a.takenAt, 42);
});

test('a refused action folds nothing and wakes nothing; its sentence is the Bridge\'s', async () => {
  const r = rundownOf([cue('a', 'a')], [vt('a')]);
  const h = harness({ states: ['server'] });
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  assert.deepEqual(outcome, { ok: false, note: 'Take did not reach the playout server: refused (server)', accepted: [] });
  assert.equal(h.log.includes('fold'), false);
  assert.equal(h.log.includes('wake'), false);
  assert.deepEqual(h.store.ownership.get().onAir, {});
});

test('a re-take after a move folds the Out and then the Take, in that order, and wakes the server once', async () => {
  const r = rundownOf([cue('a', 'a')], [vt('a')]);
  const h = harness({ onAir: { a: { cueId: 'a', slot: slot(2, 7) } } });
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  assert.deepEqual(outcome.accepted.map((a) => a.verb), ['out', 'take']);
  assert.deepEqual(h.log, ['flush', 'settings', 'act out 2-7', 'view a', 'act take 2-10', 'fold', 'now', 'fold', 'now', 'wake']);
  assert.deepEqual(h.store.ownership.get().onAir, { a: { cueId: 'a', slot: slot(2, 10), instance: 's1.2', takenAt: 1002, end: 'hold' } });
});

test('Play next sends the chain and the clock counts the clips ahead', async () => {
  const r = rundownOf([cue('p', 'p', { playback: { end: 'next' } }), cue('q', 'q')], [vt('p'), vt('q')]);
  const h = harness();
  await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take'));
  assert.equal(h.sent[0].action.verb, 'sequence');
  assert.deepEqual(h.sent[0].action.entries.map((e) => e.cueId), ['p', 'q']);
  assert.deepEqual(h.store.ownership.get().sequences['2-10'].next.map((e) => e.cueId), ['q']);
  // Triggered directly, the cue plays alone.
  const direct = harness();
  await runAndRecord(direct.recorded, direct.io, intentOf(r, r.cues[0], 'take', { options: { direct: true } }));
  assert.equal(direct.sent[0].action.verb, 'take');
  assert.equal(direct.store.ownership.get().sequences['2-10'], undefined);
});

test('All out cuts: the cue\'s fade out is not sent', async () => {
  const r = rundownOf([cue('a', 'a', { playback: { fadeOut: 'long' } })], [vt('a')]);
  const faded = harness({ onAir: { a: { cueId: 'a', slot: slot(2, 10) } } });
  await runAndRecord(faded.recorded, faded.io, intentOf(r, r.cues[0], 'out'));
  assert.equal(faded.sent[0].action.fadeOut, 1);
  const cut = harness({ onAir: { a: { cueId: 'a', slot: slot(2, 10) } } });
  await runAndRecord(cut.recorded, cut.io, intentOf(r, r.cues[0], 'out', { options: { cut: true } }));
  assert.equal(cut.sent[0].action.fadeOut, undefined);
  assert.deepEqual(cut.store.ownership.get().onAir, {});
});

// ── A Play-through folder moved while it plays (docs/CLIP_PLAYBACK_PLAN.md §6.6) ──────────────────

const T = { id: 'T', name: 'Opening', mode: 'through' };
const folderRundown = () => rundownOf([cue('a', 'a', { folderId: 'T', playback: { fadeOut: 'long' } }), cue('b', 'b', { folderId: 'T' }), cue('x', 'a')], [vt('a'), vt('b')], [T]);

test('a folder moved while it plays: its clip on the old slot is cut first and folded, then the run goes', async () => {
  const r = folderRundown();
  const h = harness({ onAir: { a: { cueId: 'a', slot: slot(3, 10) } } });
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[1], 'take', { label: 'Take of Opening' }));
  assert.equal(outcome.ok, true);
  assert.deepEqual(h.log, ['flush', 'settings', 'act out 3-10', 'fold', 'now', 'view b', 'act take 2-10', 'fold', 'now', 'wake']);
  assert.deepEqual(h.sent[0].action, { verb: 'out', slot: slot(3, 10), item: { kind: 'media', name: 'A' } }, 'a cut: no fade out');
  assert.deepEqual(h.store.ownership.get().onAir, { b: { cueId: 'b', slot: slot(2, 10), instance: 's1.2', takenAt: 1002, end: 'hold' } });
});

test('the move-off refused: the run does not go, and the sentence is the Out\'s', async () => {
  const r = folderRundown();
  const h = harness({ states: ['server'], onAir: { a: { cueId: 'a', slot: slot(3, 10) } } });
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[1], 'take', { label: 'Take of Opening' }));
  assert.deepEqual(outcome, { ok: false, note: 'Take of Opening did not reach the playout server: refused (server)', accepted: [] });
  assert.equal(h.sent.length, 1);
  assert.equal(h.log.includes('wake'), false);
});

test('no move-off for a clip already on the folder\'s slot, one up by another cue, or a direct trigger', async () => {
  const r = folderRundown();
  const here = harness({ onAir: { a: { cueId: 'a', slot: slot(2, 10) } } });
  await runAndRecord(here.recorded, here.io, intentOf(r, r.cues[1], 'take'));
  assert.deepEqual(here.sent.map((s) => s.action.verb), ['take']);

  const other = harness({ onAir: { a: { cueId: 'x', slot: slot(3, 10) } } });
  await runAndRecord(other.recorded, other.io, intentOf(r, r.cues[1], 'take'));
  assert.deepEqual(other.sent.map((s) => s.action.verb), ['take']);

  const direct = harness({ onAir: { a: { cueId: 'a', slot: slot(3, 10) } } });
  await runAndRecord(direct.recorded, direct.io, intentOf(r, r.cues[1], 'take', { options: { direct: true } }));
  assert.deepEqual(direct.sent.map((s) => s.action.verb), ['take']);
});

test('a Play-through folder plays from the clip taken, on the folder\'s own slot, and loops when it is set to', async () => {
  const loop = { ...T, end: 'loop', slot: { channel: 4, layer: 12 } };
  const r = rundownOf([cue('a', 'a', { folderId: 'T' }), cue('b', 'b', { folderId: 'T' })], [vt('a'), vt('b')], [loop]);
  const h = harness();
  await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[1], 'take'));
  assert.equal(h.sent[0].action.verb, 'sequence');
  assert.deepEqual(h.sent[0].action.slot, slot(4, 12), 'on the folder\'s own slot, not the clip\'s');
  assert.deepEqual(h.sent[0].action.entries.map((e) => e.cueId), ['b', 'a']);
  assert.equal(h.sent[0].action.loop, true);
  assert.deepEqual(h.store.ownership.get().sequences['4-12'], { next: h.sent[0].action.entries.slice(1), loop: true });
});

test('a folder whose run cannot be played is not sent, and says why', async () => {
  const r = rundownOf([cue('a', 'a', { folderId: 'T' }), cue('b', 'b', { folderId: 'T' })], [vt('a'), vt('b', { frames: undefined })], [T]);
  const h = harness();
  const outcome = await runAndRecord(h.recorded, h.io, intentOf(r, r.cues[0], 'take', { label: 'Take of Opening' }));
  assert.equal(outcome.ok, false);
  assert.match(outcome.note, /^Take of Opening was not sent: .+/);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.log, ['flush', 'settings']);
});
