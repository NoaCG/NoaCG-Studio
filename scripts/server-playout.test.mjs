// guards: src/control/serverPlayout.ts, src/control/serverPlayoutStore.ts, src/control/playoutSlots.ts
//
// What a server cue sends and what the page then believes is up on the playout server
// (docs/BRIDGE.md §5), run in Node with the Bridge faked: the rules moved out of ProductionPage in
// the clip playback plan's phase 0 (docs/CLIP_PLAYBACK_PLAN.md §10), pinned here as they were.
// The browser half - that the page wires them - is e2e/playout-cues.spec.ts. Node strips the
// modules' types on import, and they import nothing that needs a browser.

import test from 'node:test';
import assert from 'node:assert/strict';

const { runServerVerb, serverAction, serverCueLive, serverLayers, withTaken, withoutItem } = await import(
  '../src/control/serverPlayout.ts'
);
const { createServerPlayoutStore } = await import('../src/control/serverPlayoutStore.ts');

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
const clip = { id: 'clip', adapter: 'casparcg', kind: 'media', name: 'GIORNO', layer: 10, channel: 2 };
const strap = { id: 'strap', adapter: 'casparcg', kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP', layer: 21 };
const cue = (id, sourceId, label = id) => ({ id, sourceId, source: 'playout', label, values: {} });

/** A Bridge that records every action and answers each with the next scripted state. */
function fakeAct(...states) {
  const sent = [];
  const act = async (action) => {
    sent.push(action);
    const state = states.shift() ?? 'ok';
    return state === 'ok' ? { state, detail: 'connected' } : { state, detail: `refused (${state})` };
  };
  return { act, sent };
}

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
  assert.deepEqual(serverAction('update', strap, slot(1, 21), values), { verb: 'update', slot: slot(1, 21), data: { f0: 'Anna' } });
  for (const verb of ['next', 'out', 'pause', 'resume']) {
    assert.deepEqual(serverAction(verb, clip, slot(2, 10), values), { verb, slot: slot(2, 10), item: { kind: 'media', name: 'GIORNO' } });
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
  const onAir = take.onAir({});
  assert.deepEqual(onAir, { clip: { cueId: 'c1', slot: slot(2, 10) } });
  // Every later verb goes where the take WENT, even after the item was moved to another channel.
  const pause = await runServerVerb({ verb: 'pause', cue: cue('c1', 'clip'), item: clip, label: 'Pause', live: onAir.clip, slotNow: slot(3, 10), values: () => ({}), act: bridge.act });
  assert.equal(pause.onAir, undefined);
  assert.deepEqual(bridge.sent[1].slot, slot(2, 10));
  const out = await runServerVerb({ verb: 'out', cue: cue('c1', 'clip'), item: clip, label: 'Out', live: onAir.clip, slotNow: slot(3, 10), values: () => ({}), act: bridge.act });
  assert.deepEqual(out.onAir(onAir), {});
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
    { verb: 'take', item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' }, slot: slot(2, 21), data: { f0: 'Ben' } },
  ]);
  assert.equal(read, 1, 'the values are read once the old copy is off');
  assert.deepEqual(outcome.onAir({ strap: live }), { strap: { cueId: 'c1', slot: slot(2, 21) } });
});

test('a refused move-off leaves everything where it was; a refused take after it forgets the item', async () => {
  const live = { cueId: 'c1', slot: slot(1, 21) };
  const stuck = fakeAct('target');
  const first = await runServerVerb({ verb: 'take', cue: cue('c1', 'strap'), item: strap, label: 'Re-take', live, slotNow: slot(2, 21), values: () => ({}), act: stuck.act });
  assert.equal(first.ok, false);
  assert.equal(first.onAir, undefined);
  assert.equal(stuck.sent.length, 1, 'nothing more is sent once the old copy would not come off');
  assert.match(first.note, /^Re-take did not reach the playout server: HOUSE_STRAP\/HOUSE_STRAP is still on 1-21 - refused/);

  const refused = fakeAct('ok', 'target');
  const second = await runServerVerb({ verb: 'take', cue: cue('c1', 'strap'), item: strap, label: 'Re-take', live, slotNow: slot(2, 21), values: () => ({}), act: refused.act });
  assert.equal(second.ok, false);
  assert.deepEqual(second.onAir({ strap: live, other: { cueId: 'x', slot: slot(1, 5) } }), { other: { cueId: 'x', slot: slot(1, 5) } });

  // A plain refusal with nothing moved changes nothing on the map.
  const plain = await runServerVerb({ verb: 'take', cue: cue('c2', 'clip'), item: clip, label: 'Take', live: undefined, slotNow: slot(2, 10), values: () => ({}), act: fakeAct('bridge').act });
  assert.equal(plain.onAir, undefined);
  assert.equal(plain.note, 'Take did not reach the playout server: refused (bridge)');
});

test('the store\'s two parts notify only their own subscribers, and only on a real change', () => {
  const store = createServerPlayoutStore();
  let owners = 0;
  let clocks = 0;
  store.ownership.subscribe(() => (owners += 1));
  const stop = store.timing.subscribe(() => (clocks += 1));
  store.timing.set({ '2-10': { position: 1, length: 60, paused: false, observedAt: 1000 } });
  store.timing.set((t) => ({ ...t, '2-10': { ...t['2-10'], position: 1.5, observedAt: 1500 } }));
  assert.equal(clocks, 2);
  assert.equal(owners, 0, 'a position moving never reaches what decides the verbs');
  const same = store.ownership.get();
  store.ownership.set(same);
  store.ownership.set((m) => m);
  assert.equal(owners, 0, 'an unchanged map notifies nobody');
  store.ownership.set((m) => withTaken(m, 'clip', 'c1', slot(2, 10)));
  assert.equal(owners, 1);
  assert.equal(clocks, 2);
  stop();
  store.timing.set({});
  assert.equal(clocks, 2, 'an unsubscribed listener hears nothing more');
  assert.deepEqual(store.ownership.get(), { clip: { cueId: 'c1', slot: slot(2, 10) } });
});
