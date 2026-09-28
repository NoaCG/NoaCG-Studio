// guards: src/control/serverPlayout.ts, src/control/serverPlayoutStore.ts, src/control/playoutSlots.ts, src/control/serverState.ts, src/control/serverStatePoll.ts, src/control/cuePlayback.ts
//
// What a server cue sends, what the page then believes is up on the playout server, and what a
// reading of the server does to that belief (docs/BRIDGE.md §5, docs/CLIP_PLAYBACK_PLAN.md §6.4 and
// §6.7), run in Node with the Bridge faked. The rules moved out of ProductionPage in the clip
// playback plan's phase 0 are pinned here as they were; phase 2 added the readings, the clip clock
// and the generations. The browser half - that the page wires them - is e2e/playout-cues.spec.ts
// and e2e/playout-clock.spec.ts. Node strips the modules' types on import, and they import nothing
// that needs a browser.

import test from 'node:test';
import assert from 'node:assert/strict';

const { runServerVerb, serverAction, serverCueLive, serverLayers, withTaken, withoutItem } = await import(
  '../src/control/serverPlayout.ts'
);
const { createServerPlayoutStore } = await import('../src/control/serverPlayoutStore.ts');
const { NO_OWNERSHIP, applyAccepted, applyReading, clipClock, clockText, followedClip, isEstimated, namesItem, remainingAt, STALE_MS } =
  await import('../src/control/serverState.ts');

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
const clip = { id: 'clip', adapter: 'casparcg', kind: 'media', name: 'GIORNO', layer: 10, channel: 2, frames: 1500, fps: 25 };
const strap = { id: 'strap', adapter: 'casparcg', kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP', layer: 21 };
const cue = (id, sourceId, label = id) => ({ id, sourceId, source: 'playout', label, values: {} });

/** A Bridge that records every action and answers each with the next scripted state. An accepted
 *  one carries a generation, the session, and for a take an instance, as the real Bridge's does. */
function fakeAct(...states) {
  const sent = [];
  let generation = 0;
  const act = async (action) => {
    sent.push(action);
    const state = states.shift() ?? 'ok';
    if (state !== 'ok') return { state, detail: `refused (${state})` };
    generation += 1;
    return { state, detail: 'connected', generation, session: 's1', ...(action.verb === 'take' ? { instance: `s1.${generation}` } : {}) };
  };
  return { act, sent };
}

/** Fold a verb's accepted actions into both parts, the way the page does. */
const fold = (parts, outcome, extra) =>
  outcome.accepted.reduce((p, a) => applyAccepted(p, { ...a, now: 1000, readable: true, ...extra }), parts);
const START = { ownership: NO_OWNERSHIP, timing: {} };

test('each verb sends exactly one action, in the shape the Bridge has always been sent', () => {
  const values = { f0: 'Anna' };
  assert.deepEqual(serverAction('take', clip, slot(2, 10), values), { verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: slot(2, 10) });
  assert.deepEqual(serverAction('take', { ...clip, loop: true }, slot(2, 10), values), {
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: slot(2, 10),
    loop: true,
  });
  assert.deepEqual(serverAction('take', strap, slot(1, 21), values), {
    verb: 'take',
    item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' },
    slot: slot(1, 21),
    data: { f0: 'Anna' },
  });
  // A take names its cue when it has one; nothing else ever does.
  assert.deepEqual(serverAction('take', clip, slot(2, 10), values, 'c1').cueId, 'c1');
  assert.deepEqual(serverAction('update', strap, slot(1, 21), values), { verb: 'update', slot: slot(1, 21), data: { f0: 'Anna' } });
  for (const verb of ['next', 'out', 'pause', 'resume']) {
    assert.deepEqual(serverAction(verb, clip, slot(2, 10), values, 'c1'), { verb, slot: slot(2, 10), item: { kind: 'media', name: 'GIORNO' } });
  }
});

test('a take replaces whatever else was up on its slot, and only there', () => {
  const onAir = { a: { cueId: 'ca', slot: slot(2, 10) }, b: { cueId: 'cb', slot: slot(1, 21) } };
  assert.deepEqual(withTaken(onAir, 'c', 'cc', slot(2, 10)), { b: { cueId: 'cb', slot: slot(1, 21) }, c: { cueId: 'cc', slot: slot(2, 10) } });
  assert.deepEqual(withoutItem(onAir, 'a'), { b: { cueId: 'cb', slot: slot(1, 21) } });
  assert.notEqual(withoutItem(onAir, 'nothing'), onAir, 'forgetting always hands back a new map');
  assert.equal(serverCueLive(onAir, { id: 'a' }, { id: 'ca' }), true);
  assert.equal(serverCueLive(onAir, { id: 'a' }, { id: 'cb' }), false);
  assert.equal(serverCueLive(onAir, null, { id: 'ca' }), false);
});

test('the server cues up are listed by channel and then front to back, and a removed cue drops out', () => {
  const items = [clip, strap, { ...clip, id: 'bed', name: 'BED', layer: 5 }];
  const cues = [cue('c-clip', 'clip'), cue('c-strap', 'strap'), cue('c-bed', 'bed')];
  const onAir = {
    clip: { cueId: 'c-clip', slot: slot(2, 10) },
    strap: { cueId: 'c-strap', slot: slot(1, 21) },
    bed: { cueId: 'c-bed', slot: slot(2, 5) },
  };
  assert.deepEqual(
    serverLayers(onAir, items, cues).map((l) => `${l.label} ${l.slot.channel}-${l.slot.layer}`),
    ['c-strap 1-21', 'c-clip 2-10', 'c-bed 2-5'],
  );
  assert.deepEqual(serverLayers(onAir, items, cues.slice(1)).map((l) => l.label), ['c-strap', 'c-bed']);
});

test('an accepted take marks the cue up where it went; Out forgets it; the other verbs move nothing', async () => {
  const bridge = fakeAct();
  const take = await runServerVerb({ verb: 'take', cue: cue('c1', 'clip'), item: clip, label: 'Take', live: undefined, slotNow: slot(2, 10), values: () => ({}), act: bridge.act });
  assert.equal(take.ok, true);
  assert.equal(take.note, '✓ Take: GIORNO on 2-10');
  assert.equal(bridge.sent[0].cueId, 'c1', 'the take names its cue');
  let parts = fold(START, take, { itemId: 'clip', cueId: 'c1', length: 60 });
  assert.deepEqual(parts.ownership.onAir, { clip: { cueId: 'c1', slot: slot(2, 10), instance: 's1.1', takenAt: 1000 } });
  assert.deepEqual(parts.ownership.generations, { '2-10': { generation: 1, session: 's1' } });
  // Every later verb goes where the take WENT, even after the item was moved to another channel.
  const live = parts.ownership.onAir.clip;
  const pause = await runServerVerb({ verb: 'pause', cue: cue('c1', 'clip'), item: clip, label: 'Pause', live, slotNow: slot(3, 10), values: () => ({}), act: bridge.act });
  assert.deepEqual(bridge.sent[1].slot, slot(2, 10));
  const afterPause = fold(parts, pause, { itemId: 'clip', cueId: 'c1' });
  assert.equal(afterPause.ownership.onAir, parts.ownership.onAir, 'a pause moves no cue on or off air');
  assert.equal(afterPause.timing['2-10'].paused, true);
  const out = await runServerVerb({ verb: 'out', cue: cue('c1', 'clip'), item: clip, label: 'Out', live, slotNow: slot(3, 10), values: () => ({}), act: bridge.act });
  parts = fold(afterPause, out, { itemId: 'clip', cueId: 'c1' });
  assert.deepEqual(parts.ownership.onAir, {});
  assert.equal(parts.timing['2-10'], undefined);
  assert.equal(bridge.sent.length, 3);
});

test('a re-take after a move takes the old copy off first, and reads the values after it', async () => {
  const bridge = fakeAct();
  const live = { cueId: 'c1', slot: slot(1, 21) };
  let read = -1;
  const outcome = await runServerVerb({
    verb: 'take',
    cue: cue('c1', 'strap'),
    item: strap,
    label: 'Take',
    live,
    slotNow: slot(2, 21),
    values: () => {
      read = bridge.sent.length;
      return { f0: 'Ben' };
    },
    act: bridge.act,
  });
  assert.deepEqual(bridge.sent, [
    { verb: 'out', slot: slot(1, 21), item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' } },
    { verb: 'take', item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' }, slot: slot(2, 21), data: { f0: 'Ben' }, cueId: 'c1' },
  ]);
  assert.equal(read, 1, 'the values are read once the old copy is off');
  const parts = fold({ ownership: { ...NO_OWNERSHIP, onAir: { strap: live } }, timing: {} }, outcome, { itemId: 'strap', cueId: 'c1' });
  assert.deepEqual(parts.ownership.onAir, { strap: { cueId: 'c1', slot: slot(2, 21), instance: 's1.2', takenAt: 1000 } });
});

test('a refused move-off leaves everything where it was; a refused take after it forgets the item', async () => {
  const live = { cueId: 'c1', slot: slot(1, 21) };
  const before = { ownership: { ...NO_OWNERSHIP, onAir: { strap: live, other: { cueId: 'x', slot: slot(1, 5) } } }, timing: {} };
  const stuck = fakeAct('target');
  const first = await runServerVerb({ verb: 'take', cue: cue('c1', 'strap'), item: strap, label: 'Re-take', live, slotNow: slot(2, 21), values: () => ({}), act: stuck.act });
  assert.equal(first.ok, false);
  assert.deepEqual(first.accepted, []);
  assert.equal(stuck.sent.length, 1, 'nothing more is sent once the old copy would not come off');
  assert.match(first.note, /^Re-take did not reach the playout server: HOUSE_STRAP\/HOUSE_STRAP is still on 1-21 - refused/);

  const refused = fakeAct('ok', 'target');
  const second = await runServerVerb({ verb: 'take', cue: cue('c1', 'strap'), item: strap, label: 'Re-take', live, slotNow: slot(2, 21), values: () => ({}), act: refused.act });
  assert.equal(second.ok, false);
  // The old copy came off and the new take was refused: nothing of this item is up anywhere now.
  assert.deepEqual(fold(before, second, { itemId: 'strap', cueId: 'c1' }).ownership.onAir, { other: { cueId: 'x', slot: slot(1, 5) } });

  // A plain refusal with nothing moved changes nothing.
  const plain = await runServerVerb({ verb: 'take', cue: cue('c2', 'clip'), item: clip, label: 'Take', live: undefined, slotNow: slot(2, 10), values: () => ({}), act: fakeAct('bridge').act });
  assert.deepEqual(plain.accepted, []);
  assert.equal(plain.note, 'Take did not reach the playout server: refused (bridge)');
});

test('the store\'s two parts notify only their own subscribers, and only on a real change', () => {
  const store = createServerPlayoutStore();
  let owners = 0;
  let clocks = 0;
  store.ownership.subscribe(() => (owners += 1));
  const stop = store.timing.subscribe(() => (clocks += 1));
  store.timing.set({ '2-10': { position: 1, segment: { start: 0, length: 60 }, paused: false, loop: false, at: 1000, source: 'server' } });
  store.timing.set((t) => ({ ...t, '2-10': { ...t['2-10'], position: 1.5, at: 1500 } }));
  assert.equal(clocks, 2);
  assert.equal(owners, 0, 'a position moving never reaches what decides the verbs');
  const same = store.ownership.get();
  store.ownership.set(same);
  store.ownership.set((m) => m);
  assert.equal(owners, 0, 'an unchanged part notifies nobody');
  store.apply((p) => applyAccepted(p, { verb: 'take', itemId: 'clip', cueId: 'c1', slot: slot(2, 10), generation: 1, session: 's1', instance: 's1.1', length: 60, now: 2000, readable: true }));
  assert.equal(owners, 1);
  assert.equal(clocks, 3);
  stop();
  store.timing.set({});
  assert.equal(clocks, 3, 'an unsubscribed listener hears nothing more');
  assert.deepEqual(store.ownership.get().onAir, { clip: { cueId: 'c1', slot: slot(2, 10), instance: 's1.1', takenAt: 2000 } });
});

// ── Readings of the server (plan §6.7) ──────────────────────────────────────────────────────

const items = [clip, { ...clip, id: 'vt', name: 'INTRO_VT', frames: 500 }];
const cues = [cue('c-clip', 'clip'), cue('c-vt', 'vt')];
const ctx = (now) => ({ channel: 2, now, cues, items, slotOf: (i) => slot(i.channel ?? 1, i.layer) });
const reading = (over = {}) => ({ layer: 10, producer: 'video', file: 'GIORNO', segment: { start: 0, length: 60 }, position: 5, paused: false, loop: false, generation: 1, ...over });
const reply = (slots, session = 's1') => ({ ok: true, channel: 2, session, observedAt: 0, slots });
const taken = () => applyAccepted(START, { verb: 'take', itemId: 'clip', cueId: 'c-clip', slot: slot(2, 10), generation: 1, session: 's1', instance: 's1.1', length: 60, now: 1000, readable: true });

test('a reading that only moves the clip hands back the SAME ownership - the page does not re-render', () => {
  const parts = taken();
  const next = applyReading(parts, reply([reading({ instance: 's1.1', cueId: 'c-clip' })]), ctx(1500));
  assert.equal(next.ownership, parts.ownership);
  assert.notEqual(next.timing, parts.timing);
  assert.deepEqual(next.timing['2-10'], {
    producer: 'video',
    file: 'GIORNO',
    segment: { start: 0, length: 60 },
    position: 5,
    paused: false,
    loop: false,
    at: 1500,
    source: 'server',
  });
});

test('a reading older than the last accepted action on its slot is ignored whole (case 14)', () => {
  // OPENER was taken under generation 1; GIORNO's take moved the slot to 2 before this answer came.
  const parts = applyAccepted(taken(), { verb: 'take', itemId: 'vt', cueId: 'c-vt', slot: slot(2, 10), generation: 2, session: 's1', instance: 's1.2', length: 20, now: 2000, readable: true });
  const stale = applyReading(parts, reply([reading({ instance: 's1.1', cueId: 'c-clip', generation: 1 })]), ctx(2100));
  assert.equal(stale.ownership, parts.ownership, 'nothing about the slot moved');
  assert.equal(stale.timing['2-10'], parts.timing['2-10']);
  assert.deepEqual(Object.keys(stale.ownership.replaced), []);
  // The same generation from a Bridge that has restarted (another session) is not "older".
  const restarted = applyReading(parts, reply([reading({ generation: 0 })], 'other'), ctx(2100));
  assert.deepEqual(restarted.ownership.onAir, {}, 'what the new session reports is taken at its word');
});

test('a clip ended on the server leaves ON AIR; another client\'s take is "replaced"; a restart is unidentified', () => {
  const parts = taken();
  const ended = applyReading(parts, reply([reading({ producer: 'empty', file: undefined, segment: undefined, position: undefined })]), ctx(1500));
  assert.deepEqual(ended.ownership.onAir, {});
  assert.deepEqual(ended.ownership.replaced, {});

  const replaced = applyReading(parts, reply([reading({ instance: undefined })]), ctx(1500));
  assert.deepEqual(replaced.ownership.onAir, {});
  assert.deepEqual(replaced.ownership.replaced, { clip: { cueId: 'c-clip', slot: slot(2, 10), file: 'GIORNO' } });
  // ...and a later reading of the same slot does not add it again as an unidentified item.
  assert.deepEqual(applyReading(replaced, reply([reading({ instance: undefined })]), ctx(2000)).ownership.unidentified, []);

  const restarted = applyReading(parts, reply([reading({ instance: 'z9.1' })], 'z9'), ctx(1500));
  assert.deepEqual(restarted.ownership.onAir, {});
  assert.deepEqual(restarted.ownership.unidentified, [{ slot: slot(2, 10), producer: 'video', file: 'GIORNO' }]);
});

test('a clip the server has not put on the layer yet stays up, with the take\'s own count', () => {
  // The server answers PLAY before the clip is on the layer, and the Bridge keeps vouching for its
  // instance through that moment: an empty reading carrying it is "arriving", not "ended".
  const parts = taken();
  const arriving = applyReading(parts, reply([{ layer: 10, producer: 'empty', paused: false, loop: false, generation: 1, instance: 's1.1', cueId: 'c-clip' }]), ctx(1100));
  assert.equal(arriving.ownership, parts.ownership);
  assert.equal(arriving.timing['2-10'], parts.timing['2-10'], 'the take\'s estimate stands');
  // Without the instance the same empty reading is the clip gone.
  assert.deepEqual(applyReading(parts, reply([{ layer: 10, producer: 'empty', paused: false, loop: false, generation: 1 }]), ctx(1100)).ownership.onAir, {});
});

test('after a reload the instance and its cue match the row exactly; nothing is guessed from a name', () => {
  const matched = applyReading(START, reply([reading({ instance: 's1.4', cueId: 'c-clip' })]), ctx(500));
  assert.deepEqual(matched.ownership.onAir, { clip: { cueId: 'c-clip', slot: slot(2, 10), instance: 's1.4', takenAt: 500 } });
  // The same file with no instance - another client's, or one from before a restart - is only
  // described, never pinned on the GIORNO row by its name.
  const unknown = applyReading(START, reply([reading()]), ctx(500));
  assert.deepEqual(unknown.ownership.onAir, {});
  assert.deepEqual(unknown.ownership.unidentified, [{ slot: slot(2, 10), producer: 'video', file: 'GIORNO' }]);
  // A cue id the rundown does not have is not a match either.
  assert.deepEqual(applyReading(START, reply([reading({ instance: 's1.4', cueId: 'gone' })]), ctx(500)).ownership.onAir, {});
});

test('this Bridge\'s own take of a cue is that cue wherever it plays: a re-take, another tab, a moved layer', () => {
  // A re-take's reading can land before the Take's own answer does. A new instance of this
  // Bridge's, for this rundown's cue, is that cue still up - never "replaced on the server".
  const parts = taken();
  const retaken = applyReading(parts, reply([reading({ instance: 's1.2', cueId: 'c-clip', generation: 2 })]), ctx(1500));
  assert.deepEqual(retaken.ownership.onAir, { clip: { cueId: 'c-clip', slot: slot(2, 10), instance: 's1.2', takenAt: 1500 } });
  assert.deepEqual(retaken.ownership.replaced, {});
  // After a reload, a clip moved to layer 11 while it was up is found on 10, where it still plays,
  // although no item of the rundown says 10 any more.
  const moved = { ...ctx(500), items: [{ ...clip, layer: 11 }, { ...items[1], layer: 12 }] };
  const found = applyReading(START, reply([reading({ instance: 's1.4', cueId: 'c-clip' })]), moved);
  assert.deepEqual(found.ownership.onAir, { clip: { cueId: 'c-clip', slot: slot(2, 10), instance: 's1.4', takenAt: 500 } });
});

test('a file the server reports names its item whatever the case, the slashes or the extension', () => {
  assert.equal(namesItem('NOACG_FIXTURE/COUNT30', 'NOACG_FIXTURE/COUNT30.mp4'), true, '2.3 adds the extension');
  assert.equal(namesItem('GIORNO', 'media\\giorno.jpg'), true, 'a still reads back by its path');
  assert.equal(namesItem('INTRO_VT', 'intro_vt'), true);
  assert.equal(namesItem('COUNT30', 'COUNT300'), false);
});

test('what waits behind a clip is kept per slot, for NEXT ON SERVER', () => {
  const parts = applyReading(taken(), reply([reading({ instance: 's1.1', queued: { file: 'INTRO_VT', auto: true } })]), ctx(1500));
  assert.deepEqual(parts.ownership.queued, { '2-10': { file: 'INTRO_VT', auto: true } });
  assert.deepEqual(applyReading(parts, reply([reading({ instance: 's1.1' })]), ctx(2000)).ownership.queued, {});
});

// ── The clip clock (plan §6.4) ──────────────────────────────────────────────────────────────

test('the clock counts the segment down between readings, warns at 10 and 5, then holds and counts up', () => {
  let parts = applyReading(taken(), reply([reading({ instance: 's1.1', position: 45 })]), ctx(1000));
  const at = (now) => clipClock(parts.ownership, parts.timing, items, cues, now);
  assert.deepEqual([at(1000).phase, at(1000).remaining], ['counting', 15]);
  assert.equal(at(1000).estimated, false);
  assert.deepEqual([at(6000).phase, at(6000).remaining], ['warning', 10]);
  assert.deepEqual([at(11500).phase, at(11500).remaining], ['final', 4.5]);
  assert.equal(at(16000).phase, 'holding');
  // The reading that says it ended places the end where the one before predicted it.
  parts = applyReading(parts, reply([reading({ instance: 's1.1', position: 60 })]), ctx(17000));
  const holding = clipClock(parts.ownership, parts.timing, items, cues, 19000);
  assert.equal(holding.phase, 'holding');
  assert.equal(holding.over, 3, 'HOLDING counts from the end (at 16 s), not from the reading');
  assert.equal(clockText(holding.over, 'down'), '0:03');
});

test('paused stops the count; a loop never warns; an old estimate and a stale reading say estimated', () => {
  const paused = applyReading(taken(), reply([reading({ instance: 's1.1', position: 55, paused: true })]), ctx(1000));
  const p = clipClock(paused.ownership, paused.timing, items, cues, 9000);
  assert.deepEqual([p.phase, p.remaining], ['paused', 5]);
  // A paused LOOP says PAUSED too, and still that it loops.
  const pausedLoop = applyReading(taken(), reply([reading({ instance: 's1.1', position: 20, loop: true, paused: true })]), ctx(1000));
  const pl = clipClock(pausedLoop.ownership, pausedLoop.timing, items, cues, 5000);
  assert.deepEqual([pl.phase, pl.end, pl.remaining], ['paused', 'loop', 40]);
  const looping = applyReading(taken(), reply([reading({ instance: 's1.1', position: 58, loop: true })]), ctx(1000));
  const l = clipClock(looping.ownership, looping.timing, items, cues, 4000);
  assert.equal(l.phase, 'looping');
  assert.equal(l.end, 'loop');
  assert.equal(Math.round(l.remaining), 59, 'it wrapped round to its start');
  // The page's own count from its Take: provisional for a Bridge that reads the server, then
  // estimated once no reading has replaced it; always estimated for one that cannot.
  const t = taken().timing['2-10'];
  assert.equal(isEstimated(t, 1000 + STALE_MS - 1), false);
  assert.equal(isEstimated(t, 1000 + STALE_MS + 1), true);
  assert.equal(isEstimated({ ...t, provisional: undefined }, 1001), true);
  assert.equal(remainingAt(t, 11_000), 50);
});

test('one clock, one clip: it follows the clip taken last', () => {
  let parts = taken();
  parts = applyAccepted(parts, { verb: 'take', itemId: 'vt', cueId: 'c-vt', slot: slot(2, 5), generation: 1, session: 's1', instance: 's1.2', length: 20, now: 3000, readable: true });
  assert.equal(clipClock(parts.ownership, parts.timing, [...items.slice(0, 1), { ...items[1], layer: 5 }], cues, 3000).label, 'c-vt');
  assert.equal(clipClock(NO_OWNERSHIP, {}, items, cues, 0), null);
});

test('a still gets no clock: the server says what plays, and before it does the list\'s length', () => {
  const still = { id: 'still', adapter: 'casparcg', kind: 'media', name: 'LOGO', layer: 10, channel: 2, frames: 0, fps: 0 };
  const all = [clip, still];
  const allCues = [cue('c-clip', 'clip'), cue('c-still', 'still')];
  const take = (parts, itemId, at, generation, now) =>
    applyAccepted(parts, { verb: 'take', itemId, cueId: `c-${itemId}`, slot: at, generation, session: 's1', instance: `s1.${generation}`, length: itemId === 'clip' ? 60 : undefined, now, readable: true });
  const onlyStill = take(START, 'still', slot(2, 10), 1, 1000);
  assert.equal(clipClock(onlyStill.ownership, onlyStill.timing, all, allCues, 1000), null, 'a still lists no length: no clock');
  assert.equal(followedClip(onlyStill.ownership, all).itemId, 'still', 'PROGRAM still shows its picture');
  // One that lists a single frame is a still all the same once the server says what plays.
  const oneFrame = [clip, { ...still, frames: 1, fps: 25 }];
  const read = applyReading(onlyStill, reply([{ layer: 10, producer: 'still', file: 'media\\logo.png', paused: false, loop: false, generation: 1, instance: 's1.1', cueId: 'c-still' }]), {
    ...ctx(1200),
    items: oneFrame,
    cues: allCues,
  });
  assert.equal(clipClock(read.ownership, read.timing, oneFrame, allCues, 1200), null);
  // A clip up beside it keeps the clock, although the still was taken after it.
  const both = take(take(START, 'clip', slot(2, 5), 1, 500), 'still', slot(2, 10), 1, 1000);
  assert.equal(clipClock(both.ownership, both.timing, all, allCues, 1000).itemId, 'clip');
  assert.equal(followedClip(both.ownership, all).itemId, 'still');
});

test('a countdown shows the second it is in, and reaches 0:00 exactly at the end', () => {
  assert.equal(clockText(9.2), '0:10');
  assert.equal(clockText(9), '0:09');
  assert.equal(clockText(0.001), '0:01');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(3725), '1:02:05');
  assert.equal(clockText(3.9, 'down'), '0:03');
});

// ── The poll (src/control/serverStatePoll.ts) ─────────────────────────────────────────────────

const { pollServerState } = await import('../src/control/serverStatePoll.ts');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stateOf = (channel) => ({ ok: true, channel, session: 's1', observedAt: 0, slots: [] });

test('the poll never has two readings out, and a wake during one reads once more after it', async () => {
  let out = 0;
  let most = 0;
  let reads = 0;
  let release;
  const poll = pollServerState({
    read: async (channel) => {
      reads += 1;
      out += 1;
      most = Math.max(most, out);
      await new Promise((r) => (release = r));
      out -= 1;
      return { result: { state: 'ok', detail: '' }, reply: stateOf(channel) };
    },
    channels: () => [2],
    busy: () => true,
    onReading: () => {},
    busyMs: 10_000,
  });
  await wait(5);
  poll.wake();
  poll.wake();
  poll.wake();
  release();
  await wait(5);
  release();
  await wait(5);
  poll.stop();
  assert.equal(most, 1, 'two readings were out at once');
  assert.equal(reads, 2, 'three wakes during one reading ask once more, not three times');
});

test('a reading the page cannot fold ends that round, never the poll', async () => {
  let readings = 0;
  const poll = pollServerState({
    read: async (channel) => ({ result: { state: 'ok', detail: '' }, reply: stateOf(channel) }),
    channels: () => [2],
    busy: () => true,
    onReading: () => {
      readings += 1;
      if (readings === 1) throw new TypeError('a slot in a shape this page does not know');
    },
    busyMs: 5,
  });
  await wait(60);
  poll.stop();
  assert.ok(readings >= 3, `the poll stopped after the throw (${readings} readings)`);
  const after = readings;
  await wait(30);
  assert.equal(readings, after, 'nothing reads after stop');
});

// ── Phase 3: a clip's settings, Play next and TO STUDIO (docs/CLIP_PLAYBACK_PLAN.md §6.4-§6.9, §7) ──

const playback = await import('../src/control/cuePlayback.ts');
const { playNextTarget, sequenceMembers, sequenceAction, nextClipWords, takeBlocker } = await import('../src/control/serverPlayout.ts');
const { pauseTarget, toStudioSeconds } = await import('../src/control/serverState.ts');

const vt = (id, seconds, extra = {}) => ({ id, adapter: 'casparcg', kind: 'media', name: id.toUpperCase(), layer: 10, channel: 2, mediaKind: 'movie', frames: seconds * 25, fps: 25, ...extra });
const withPlayback = (c, p) => ({ ...c, playback: p });
const graphic = (id) => ({ id, sourceId: `g-${id}`, label: id, values: {} });
const address = (item) => `${item.channel}-${item.layer}`;

test('THE LOOP RULE: the cue\'s own ending, else the legacy loop, else hold; a still holds', () => {
  const item = vt('a', 10);
  assert.equal(playback.effectiveEnd({}, item), 'hold');
  // An older build's Loop box turns a loop on for every cue that has no ending of its own...
  assert.equal(playback.effectiveEnd({}, { ...item, loop: true }), 'loop');
  // ...and never overrules one chosen here, which is how this build turns a loop OFF.
  assert.equal(playback.effectiveEnd({ playback: { end: 'hold' } }, { ...item, loop: true }), 'hold');
  assert.equal(playback.effectiveEnd({ playback: { end: 'clear' } }, { ...item, loop: true }), 'clear');
  assert.equal(playback.effectiveEnd({ playback: { end: 'next' } }, item), 'next');
  // A still never ends, so an ending that waits for its end is a Hold.
  assert.equal(playback.effectiveEnd({ playback: { end: 'clear' } }, { ...item, mediaKind: 'still' }), 'hold');
  assert.equal(playback.effectiveEnd({ playback: { end: 'next' } }, { ...item, mediaKind: 'still' }), 'hold');
});

test('a legacy cue sends exactly today\'s action; the settings go out as the playback descriptor', () => {
  const item = vt('a', 10);
  const at = slot(2, 10);
  assert.deepEqual(serverAction('take', item, at, {}, 'c1', {}), { verb: 'take', item: { kind: 'media', name: 'A' }, slot: at, cueId: 'c1' });
  assert.deepEqual(serverAction('take', { ...item, loop: true }, at, {}, 'c1', {}), { verb: 'take', item: { kind: 'media', name: 'A' }, slot: at, loop: true, cueId: 'c1' });
  // A Loop chosen here goes out as the old field, which every Bridge understands.
  assert.deepEqual(serverAction('take', item, at, {}, 'c1', { playback: { end: 'loop' } }), { verb: 'take', item: { kind: 'media', name: 'A' }, slot: at, loop: true, cueId: 'c1' });
  assert.deepEqual(
    serverAction('take', item, at, {}, 'c1', { playback: { end: 'clear', fadeIn: 'short', fadeOut: 'long', levelDb: -12, trimIn: 1, trimOut: 8 } }).playback,
    { end: 'clear', fadeOut: 1, fadeIn: 0.5, gain: 10 ** (-12 / 20), trim: { in: 1, out: 8 } },
  );
  // A fade out on a clip that holds is Out's: the take does not carry it, the Out does.
  assert.equal(serverAction('take', item, at, {}, 'c1', { playback: { fadeOut: 'short' } }).playback, undefined);
  assert.deepEqual(serverAction('out', item, at, {}, undefined, { playback: { fadeOut: 'short' } }), { verb: 'out', slot: at, item: { kind: 'media', name: 'A' }, fadeOut: 0.5 });
  assert.deepEqual(serverAction('out', item, at, {}, undefined, {}), { verb: 'out', slot: at, item: { kind: 'media', name: 'A' } });
  // 0 dB is the file as it is.
  assert.equal(serverAction('take', item, at, {}, 'c1', { playback: { levelDb: 0 } }).playback, undefined);
});

test('a cue the running Bridge or server cannot honour is not taken, and says why (§18 case 12)', () => {
  const item = vt('a', 10);
  const ok = { state: 'ok', features: ['state', 'playback', 'sequence'], capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'], version: '2.5.0 69e8ad5 Stable' };
  const clearFade = { playback: { end: 'clear', fadeOut: 'short' } };
  assert.equal(playback.playbackBlocker(playback.playbackNeeds(clearFade, item), ok), null);
  // A legacy cue, and a loop, need nothing any v2 Bridge lacks.
  assert.deepEqual(playback.playbackNeeds({}, { ...item, loop: true }), []);
  // A 0.4 Bridge lists no features.
  assert.equal(
    playback.playbackBlocker(playback.playbackNeeds(clearFade, item), { state: 'ok', version: '2.5.0' }),
    'This cue clears at its end and fades. Update NoaCG Bridge to take it, or set it to Hold and set its fades to Cut.',
  );
  // A server that cannot: a CasparCG older than 2.3 can clear but not fade.
  assert.equal(
    playback.playbackBlocker(playback.playbackNeeds(clearFade, item), { ...ok, capabilities: ['end'], version: '2.2.0 Dev' }),
    'This cue fades, which CasparCG 2.2.0 cannot do. To take it, set its fades to Cut.',
  );
  assert.equal(playback.playbackBlocker(playback.playbackNeeds({ playback: { levelDb: -12 } }, item), { state: 'ok' }), 'This cue plays at −12 dB. Update NoaCG Bridge to take it, or reset its level.');
  // Not asked yet: it waits rather than risking the old way.
  assert.equal(playback.playbackBlocker(playback.playbackNeeds(clearFade, item), null), 'Asking NoaCG Bridge what it can play…');
  // A control is offered only when both say yes.
  assert.equal(playback.offerBlocked(ok, playback.NEEDS.fade), null);
  assert.equal(playback.offerBlocked({ state: 'ok', capabilities: ok.capabilities }, playback.NEEDS.fade), 'Update NoaCG Bridge to set this.');
  assert.equal(playback.offerBlocked({ ...ok, capabilities: [] }, playback.NEEDS.next), 'CasparCG 2.5.0 cannot do this.');
});

test('a Take is held up by a setting nobody here can honour, and by a Play next that cannot be played', () => {
  const a = vt('a', 10);
  const b = vt('b', 10);
  const ok = { state: 'ok', features: ['state', 'playback', 'sequence'], capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'], version: '2.5.0' };
  const next = withPlayback(cue('1', 'a'), { end: 'next' });
  assert.equal(takeBlocker(next, [next, cue('2', 'b')], [a, b], address, ok), null);
  // A graphic and a legacy clip are never held up.
  assert.equal(takeBlocker(graphic('lt'), [], [a], address, null), null);
  assert.equal(takeBlocker(cue('1', 'a'), [cue('1', 'a')], [a], address, null), null);
  assert.equal(
    takeBlocker(next, [next], [a], address, ok),
    'This cue plays the next clip, but no clip after this one plays on 2-10. Set another ending to take it.',
  );
  // A clip it plays next with a setting the server cannot do holds up the Take too, named.
  const faded = withPlayback(cue('2', 'b', 'Studio'), { fadeIn: 'short' });
  assert.equal(
    takeBlocker(next, [next, faded], [a, b], address, { ...ok, capabilities: ['end', 'sequence'], version: '2.2.0' }),
    'Studio, which this cue plays next: This cue fades, which CasparCG 2.2.0 cannot do. To take it, set its fades to Cut.',
  );
});

test('a sequence member is a movie or audio file of known length, at least 2 seconds after the first', () => {
  const plain = {};
  assert.equal(playback.memberProblem(plain, vt('a', 10), false), null);
  assert.equal(playback.memberProblem(plain, vt('a', 10, { mediaKind: 'audio' }), false), null);
  assert.equal(playback.memberProblem(plain, vt('a', 10, { mediaKind: 'still' }), false), 'still');
  assert.equal(playback.memberProblem(plain, vt('a', 10, { mediaKind: undefined }), false), 'kind');
  assert.equal(playback.memberProblem(plain, vt('a', 10, { frames: undefined, fps: undefined }), false), 'length');
  // A trim that plays nothing has no length; one that plays a second is too short to follow...
  assert.equal(playback.memberProblem({ playback: { trimIn: 10 } }, vt('a', 10), true), 'length');
  assert.equal(playback.memberProblem({ playback: { trimIn: 9 } }, vt('a', 10), false), 'short');
  // ...but the first clip is already running when the next is queued.
  assert.equal(playback.memberProblem({ playback: { trimIn: 9 } }, vt('a', 10), true), null);
  assert.equal(playback.memberProblem({ playback: { trimOut: 2 } }, vt('a', 10), false), null);
});

test('the clip clock says the ending the Take sent, not one chosen for the cue since', () => {
  const a = vt('a', 10);
  const timing = { '2-10': { producer: 'video', file: 'A', segment: { start: 0, length: 10 }, position: 2, paused: false, loop: false, at: 0, source: 'server' } };
  const cues = [withPlayback(cue('1', 'a'), { end: 'clear' })];
  const taken = { ...NO_OWNERSHIP, onAir: { a: { cueId: '1', slot: slot(2, 10), takenAt: 0, end: 'hold' } } };
  assert.equal(clipClock(taken, timing, [a], cues, 0).end, 'hold');
  // After a reload the page has only the cue to go on.
  const reloaded = { ...NO_OWNERSHIP, onAir: { a: { cueId: '1', slot: slot(2, 10), takenAt: 0 } } };
  assert.equal(clipClock(reloaded, timing, [a], cues, 0).end, 'clear');
  const accepted = applyAccepted(START, { verb: 'take', slot: slot(2, 10), generation: 1, itemId: 'a', cueId: '1', length: 10, now: 0, readable: true, end: 'clear' });
  assert.equal(accepted.ownership.onAir.a.end, 'clear');
});

test('a trim is checked against itself and the file; times read the way an operator writes them (§18 case 6)', () => {
  const item = vt('a', 30);
  assert.equal(playback.trimProblem({ trimIn: 5, trimOut: 20 }, item), null);
  assert.equal(playback.trimProblem({ trimIn: 20, trimOut: 5 }, item), 'The end comes after the start.');
  assert.equal(playback.trimProblem({ trimIn: 31 }, item), 'The start lies past the end of the 0:30 file.');
  assert.equal(playback.trimProblem({ trimOut: 45 }, item), 'The end lies past the end of the 0:30 file.');
  assert.equal(playback.trimProblem({ trimIn: -1 }, item), 'The start is a time from 0:00.');
  // A file of unknown length is checked against itself only.
  assert.equal(playback.trimProblem({ trimOut: 45 }, { frames: undefined, fps: undefined }), null);
  assert.deepEqual(['0:05', '1:05.5', '65.5', '', 'x'].map(playback.parseClock), [5, 65.5, 65.5, null, null]);
  assert.deepEqual([5, 65.5, 0].map(playback.clockOf), ['0:05', '1:05.5', '0:00']);
  assert.equal(playback.segmentSeconds({ playback: { trimIn: 5, trimOut: 20 } }, item), 15);
  assert.equal(playback.segmentSeconds({ playback: { trimIn: 25 } }, item), 5);
  assert.equal(playback.segmentSeconds({}, { frames: 0, fps: 0 }), undefined);
});

test('PLAY NEXT: the next clip on the same slot, past graphics and other slots, named with what it skipped', () => {
  const a = vt('a', 10);
  const sting = vt('sting', 3, { layer: 5, mediaKind: 'audio' });
  const b = vt('b', 10);
  const items = [a, sting, b];
  const cues = [cue('1', 'a'), graphic('lt'), cue('2', 'sting', 'STING'), graphic('bug'), cue('3', 'b', 'B')];
  const t = playNextTarget(cues, items, '1', address);
  assert.equal(t.ok, true);
  assert.equal(t.next.cue.id, '3');
  assert.equal(nextClipWords(t.next), 'B (cue 5, after 2 graphics and STING on 2-5)');
  assert.deepEqual(playNextTarget(cues, items, '3', address), { ok: false, reason: 'no clip after this one plays on 2-10' });
  // The reasons it is off, each in words (plan §6.6).
  const still = vt('s', 10, { mediaKind: 'still', frames: 0 });
  assert.equal(playNextTarget([cue('1', 'a'), cue('2', 's')], [a, still], '1', address).reason, 'the next cue on 2-10 is a still, which never ends');
  const short = vt('short', 1.5);
  assert.equal(playNextTarget([cue('1', 'a'), cue('2', 'short')], [a, short], '1', address).reason, 'the next clip is shorter than 2 seconds');
  // A trim counts: a long file played for a second is a short clip.
  assert.equal(
    playNextTarget([cue('1', 'a'), withPlayback(cue('2', 'b'), { trimIn: 9 })], [a, b], '1', address).reason,
    'the next clip is shorter than 2 seconds',
  );
  // §18 case 5: an old item whose kind nobody has resolved does not join.
  const old = vt('old', 10, { mediaKind: undefined });
  assert.equal(playNextTarget([cue('1', 'a'), cue('2', 'old')], [a, old], '1', address).reason, "the next clip on 2-10 is not in the server's list yet, so its kind is not known");
  const unknownLength = vt('u', 10, { frames: undefined, fps: undefined });
  assert.equal(playNextTarget([cue('1', 'a'), cue('2', 'u')], [a, unknownLength], '1', address).reason, 'the next clip on 2-10 has no known length');
  // §18 case 4: a still offers no Play next at all.
  assert.equal(playNextTarget([cue('1', 's'), cue('2', 'a')], [still, a], '1', address).reason, 'a still never ends, so nothing plays after it');
});

test('a Take of a cue that plays next is a sequence, each clip with its own settings and the last with its own ending', () => {
  const a = vt('a', 10);
  const b = vt('b', 10);
  const c = vt('c', 20, { mediaKind: 'audio' });
  const items = [a, b, c];
  const cues = [
    withPlayback(cue('1', 'a'), { end: 'next', levelDb: -6 }),
    withPlayback(cue('2', 'b'), { end: 'next', fadeIn: 'long' }),
    withPlayback(cue('3', 'c'), { end: 'loop', fadeIn: 'short', trimIn: 2 }),
  ];
  const chain = sequenceMembers(cues, items, '1', address);
  assert.deepEqual(chain.members.map((m) => m.cue.id), ['1', '2', '3']);
  assert.deepEqual(sequenceAction(chain.members, slot(2, 10)), {
    verb: 'sequence',
    slot: slot(2, 10),
    entries: [
      { item: { kind: 'media', name: 'A' }, cueId: '1', playback: { gain: 10 ** (-6 / 20) }, media: { kind: 'movie', seconds: 10 } },
      { item: { kind: 'media', name: 'B' }, cueId: '2', playback: { fadeIn: 1 }, media: { kind: 'movie', seconds: 10 } },
      { item: { kind: 'media', name: 'C' }, cueId: '3', playback: { end: 'loop', fadeIn: 0.5, trim: { in: 2 } }, media: { kind: 'audio', seconds: 20 } },
    ],
  });
  // The taken cue's own Play next must be found; a later member whose next cannot be simply holds.
  assert.deepEqual(sequenceMembers([withPlayback(cue('1', 'a'), { end: 'next' })], [a], '1', address), { ok: false, reason: 'no clip after this one plays on 2-10' });
  const holdsAtTheEnd = sequenceMembers([withPlayback(cue('1', 'a'), { end: 'next' }), withPlayback(cue('2', 'b'), { end: 'next' })], [a, b], '1', address);
  assert.deepEqual(holdsAtTheEnd.members.map((m) => m.cue.id), ['1', '2']);
  // A cue that does not play next is a single clip, not a sequence.
  assert.equal(sequenceMembers([cue('1', 'a'), cue('2', 'b')], [a, b], '1', address).members.length, 1);
});

test('TO STUDIO: every remaining segment, less every MIX it comes in on; unknown when a length is (§18 case 18)', () => {
  const entry = (seconds, playback) => ({ item: { kind: 'media', name: 'X' }, media: { kind: 'movie', seconds }, ...(playback ? { playback } : {}) });
  // Three 10-second clips joined by two 1-second fades end after 28 seconds, not 30.
  assert.equal(toStudioSeconds(10, [entry(10, { fadeIn: 1 }), entry(10, { fadeIn: 1 })]), 28);
  assert.equal(toStudioSeconds(4.5, [entry(20, { trim: { in: 5, out: 15 } })]), 14.5);
  assert.equal(toStudioSeconds(null, [entry(10)]), null);
  assert.equal(toStudioSeconds(3, [{ item: { kind: 'media', name: 'X' }, media: { kind: 'movie', seconds: 0 } }]), null);
});

test('the clip clock of a sequence: TO STUDIO big, warned on; the clip small; loops and clears say so', () => {
  const a = vt('a', 10);
  const b = vt('b', 10);
  const cues = [withPlayback(cue('1', 'a', 'Opener'), { end: 'next' }), withPlayback(cue('2', 'b', 'Studio'), { end: 'clear' })];
  const next = [{ item: { kind: 'media', name: 'B' }, cueId: '2', playback: { end: 'clear', fadeIn: 1 }, media: { kind: 'movie', seconds: 10 } }];
  const own = { ...NO_OWNERSHIP, onAir: { a: { cueId: '1', slot: slot(2, 10), instance: 's1.1', takenAt: 0 } }, sequences: { '2-10': { next } } };
  const timing = (position) => ({ '2-10': { producer: 'video', file: 'A', segment: { start: 0, length: 10 }, position, paused: false, loop: false, at: 0, source: 'server' } });
  let c = clipClock(own, timing(2), [a, b], cues, 0);
  assert.deepEqual([c.end, c.finally, c.remaining, c.toStudio, c.phase, c.next], ['next', 'clear', 8, 17, 'counting', { label: 'Studio', length: 10 }]);
  // The clip's own last seconds do not warn: a clip follows. TO STUDIO does, at ten and five.
  c = clipClock(own, timing(9), [a, b], cues, 0);
  assert.deepEqual([c.remaining, c.toStudio, c.phase], [1, 10, 'warning']);
  // Paused, TO STUDIO stops with the clip.
  c = clipClock(own, { '2-10': { ...timing(5)['2-10'], paused: true } }, [a, b], cues, 60_000);
  assert.deepEqual([c.phase, c.toStudio], ['paused', 14]);
  // A sequence that ends in a loop has no studio time: the clip's own time, and no warning.
  const loops = { ...own, sequences: { '2-10': { next: [{ ...next[0], playback: { end: 'loop' } }] } } };
  c = clipClock(loops, timing(9), [a, b], cues, 0);
  assert.deepEqual([c.toStudio, c.phase, c.finally], [undefined, 'looping', 'loop']);
  // A single clip that clears says it clears.
  const single = { ...NO_OWNERSHIP, onAir: { b: { cueId: '2', slot: slot(2, 10), takenAt: 0 } } };
  c = clipClock(single, timing(2), [a, b], cues, 0);
  assert.deepEqual([c.end, c.toStudio], ['clear', undefined]);
});

test('a reading that shows the sequence\'s next entry moves ON AIR to that cue, and carries what is left', () => {
  const a = vt('a', 10);
  const b = vt('b', 10);
  const cues = [withPlayback(cue('1', 'a'), { end: 'next' }), cue('2', 'b')];
  const entryB = { item: { kind: 'media', name: 'B' }, cueId: '2', media: { kind: 'movie', seconds: 10 } };
  const taken = applyAccepted(START, { verb: 'take', slot: slot(2, 10), generation: 1, session: 's1', instance: 's1.1', itemId: 'a', cueId: '1', length: 10, now: 0, readable: true, sequence: { next: [entryB] } });
  assert.deepEqual(taken.ownership.sequences, { '2-10': { next: [entryB] } });
  const ctx = { channel: 2, now: 500, cues, items: [a, b], slotOf: (i) => slot(i.channel, i.layer) };
  const reading = (s) => ({ ok: true, channel: 2, session: 's1', observedAt: 0, slots: [{ layer: 10, paused: false, loop: false, generation: 1, instance: 's1.1', ...s }] });
  let parts = applyReading(taken, reading({ producer: 'video', file: 'A', segment: { start: 0, length: 10 }, position: 5, cueId: '1', sequence: { next: [entryB] } }), ctx);
  assert.deepEqual(Object.keys(parts.ownership.onAir), ['a']);
  // The server switched by itself: the same instance, now naming cue 2.
  parts = applyReading(parts, reading({ producer: 'video', file: 'B', segment: { start: 0, length: 10 }, position: 1, cueId: '2' }), { ...ctx, now: 11_000 });
  // Its ending is what the Take sent for it: the entry says none, so it holds.
  assert.deepEqual(parts.ownership.onAir, { b: { cueId: '2', slot: slot(2, 10), instance: 's1.1', takenAt: 0, end: 'hold' } });
  assert.deepEqual(parts.ownership.sequences, {});
  // Out ends it on the page at once.
  const out = applyAccepted(taken, { verb: 'out', slot: slot(2, 10), generation: 2, session: 's1', itemId: 'a', cueId: '1', now: 1 });
  assert.deepEqual(out.ownership.sequences, {});
});

test('a Bridge restart during Play next leaves an unidentified item that says the sequence stopped (§18 case 11)', () => {
  const a = vt('a', 10);
  const cues = [withPlayback(cue('1', 'a'), { end: 'next' })];
  const entry = { item: { kind: 'media', name: 'B' }, media: { kind: 'movie', seconds: 10 } };
  const taken = applyAccepted(START, { verb: 'take', slot: slot(2, 10), generation: 1, session: 'old', instance: 'old.1', itemId: 'a', cueId: '1', length: 10, now: 0, readable: true, sequence: { next: [entry] } });
  const ctx = { channel: 2, now: 5000, cues, items: [a], slotOf: (i) => slot(i.channel, i.layer) };
  const parts = applyReading(taken, { ok: true, channel: 2, session: 'new', observedAt: 0, slots: [{ layer: 10, producer: 'video', file: 'A', paused: false, loop: false, generation: 0 }] }, ctx);
  // It names the cue that was up, so the row can name the folder it played in.
  assert.deepEqual(parts.ownership.unidentified, [{ slot: slot(2, 10), producer: 'video', file: 'A', sequenceStopped: true, cueId: '1' }]);
});

test('P pauses the clip the operator is looking at: the selected cue when it is up, else the clock\'s', () => {
  const a = vt('a', 10);
  const b = vt('b', 10, { layer: 11 });
  const own = { ...NO_OWNERSHIP, onAir: { a: { cueId: '1', slot: slot(2, 10), takenAt: 0 }, b: { cueId: '2', slot: slot(2, 11), takenAt: 5 } } };
  const t = (paused) => ({ producer: 'video', segment: { start: 0, length: 10 }, position: 1, paused, loop: false, at: 0, source: 'server' });
  const timing = { '2-10': t(false), '2-11': t(true) };
  assert.deepEqual(pauseTarget(own, timing, [a, b], '1'), { itemId: 'a', cueId: '1', paused: false });
  // Nothing selected that is up: the clip the clock follows, the one taken last.
  assert.deepEqual(pauseTarget(own, timing, [a, b], 'other'), { itemId: 'b', cueId: '2', paused: true });
  assert.equal(pauseTarget(NO_OWNERSHIP, {}, [a, b], null), null);
});
