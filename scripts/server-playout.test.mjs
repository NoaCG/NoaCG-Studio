// guards: src/control/serverPlayout.ts, src/control/serverPlayoutStore.ts, src/control/playoutSlots.ts, src/control/serverState.ts
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
const { NO_OWNERSHIP, applyAccepted, applyReading, clipClock, clockText, isEstimated, remainingAt, STALE_MS } = await import(
  '../src/control/serverState.ts'
);

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
  assert.deepEqual(next.timing['2-10'], { file: 'GIORNO', segment: { start: 0, length: 60 }, position: 5, paused: false, loop: false, at: 1500, source: 'server' });
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

test('a countdown shows the second it is in, and reaches 0:00 exactly at the end', () => {
  assert.equal(clockText(9.2), '0:10');
  assert.equal(clockText(9), '0:09');
  assert.equal(clockText(0.001), '0:01');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(3725), '1:02:05');
  assert.equal(clockText(3.9, 'down'), '0:03');
});
