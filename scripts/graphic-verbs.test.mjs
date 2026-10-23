// guards: src/control/graphicVerbs.ts, src/control/cueItems.ts, src/control/liveCue.ts, src/control/allOut.ts, src/control/playoutSession.ts
//
// THE PRODUCTION PAGE'S WEB-GRAPHIC VERBS, run in Node with a scripted page and a scripted wire
// (production-page refactor spec §4.2, phase 12). Every answer here is held until the test releases
// it, so each row is driven with answers that come late, out of order, or after the session's end:
// what a verb captures at the press, what it waits on, what it reads after the wait, and how it
// treats the answer (the marker moves only for a graphic the send left alone, §4.1 R3). The browser
// half - that the page wires them - is e2e/playout-air-contract.spec.ts, e2e/playout-drills.spec.ts
// and the specs listed in the spec's §5.3.

import test from 'node:test';
import assert from 'node:assert/strict';

const { createGraphicVerbs } = await import('../src/control/graphicVerbs.ts');
const { createPlayoutSession } = await import('../src/control/playoutSession.ts');

/** A promise the test settles. */
function held() {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
/** Let every settled promise run its continuations. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const graphicCue = (id, graphic, values = {}, extra = {}) => ({ id, sourceId: `g-${graphic}`, label: id.toUpperCase(), values, ...extra, graphic });
const serverCue = (id) => ({ id, sourceId: `item-${id}`, source: 'playout', label: id.toUpperCase(), values: {} });
const noneLeft = { skipped: [], superseded: [], pressedAgain: [] };
/** A selection as the verb bar's view draws it. */
const sel = (extra = {}) => ({
  selectedCue: null,
  selectedGraphic: null,
  selectedLayerLive: false,
  selectedPlayoutLive: false,
  editingCue: null,
  editingIsLive: false,
  airCue: null,
  ...extra,
});

/**
 * One session, one verbs module, a scripted page and wire. `wire` answers each send with a held
 * promise; `flushes` holds each save wait. `log` records every call in order.
 */
function rig({ published = 'slug-1', flushHeld = false, liveCue = {}, aired = {}, bound = {}, tree = {} } = {}) {
  const session = createPlayoutSession('p1');
  const log = [];
  const sends = [];
  const flushes = [];
  const draft = {};
  const resolved = {};
  const notes = [];
  const debtCalls = [];
  let sending = 0;
  const inFlight = [];
  const timers = [];
  const debts = {
    landed: (items) => {
      debtCalls.push(['landed', items.length]);
      return (shown) => shown;
    },
    failed: (items, note) => debtCalls.push(['failed', items.map((i) => `${i.graphic}:${i.msg.t}`), note]),
    owed: () => 0,
  };
  const sender = {
    published,
    showId: 'show-1',
    here: (batch) => log.push(['here', batch.map((i) => i.msg.t).join('+')]),
    logSent: (items) => log.push(['logSent', items.length]),
    armSpecFor: (cueId) => (cueId === 'timed' ? { auto: { then: 'out', after: 2.5 }, next: null } : null),
    applyHere: () => {},
    fastEvent: () => false,
    debts: () => debts,
    outputUsable: () => true,
    sending: (d) => {
      sending += d;
      inFlight.push(sending);
    },
    owed: (o) => log.push(['owed', o]),
    loggedAt: (at) => log.push(['loggedAt', at]),
    noOutput: () => log.push(['noOutput']),
    // A landed send hands the note line a fold over what it shows; only sentences are recorded.
    note: (n) => typeof n === 'string' && notes.push(n),
  };
  const page = {
    graphics: [{ name: 'Strap' }, { name: 'Score' }, { name: 'Clock' }],
    liveCue,
    aired,
    liveLayers: Object.keys(liveCue).map((graphic) => ({ graphic })),
    livePlayoutLayers: [],
    graphicOf: (cue) => cue.graphic ?? null,
    cueView: (cue) => ({ values: { ...cue.values, ...(draft[cue.id] ?? {}) } }),
    resolvedOf: (graphic) => resolved[graphic] ?? {},
    flush: () => {
      log.push(['flush']);
      if (!flushHeld) return Promise.resolve();
      const h = held();
      flushes.push(h);
      return h.promise;
    },
    boundFields: (graphic) => bound[graphic] ?? {},
    boundNow: (graphic) => ({ ...(tree[graphic] ?? {}) }),
    boundReady: () => true,
    patchBound: async (writes) => {
      log.push(['patch', writes.map((w) => `${w.path}=${w.text}`).join(',')]);
    },
    writeCue: (cueId, values) => log.push(['writeCue', cueId, JSON.stringify(values)]),
    writeLive: (cueId, values) => log.push(['writeLive', cueId, JSON.stringify(values)]),
    playoutVerb: async (cue, verb, label, options) => {
      log.push(['playoutVerb', cue.id, verb, label, JSON.stringify(options ?? {})]);
      return true;
    },
    clearMisses: (ids) => log.push(['clearMisses', ids.join(',')]),
    noteStep: (cue) => log.push(['noteStep', cue.id]),
    stopFolders: () => log.push(['stopFolders']),
    outUnnamed: async () => log.push(['outUnnamed']),
    clearThroughBridge: async (note) => `bridge: ${note}`,
    clearing: (on) => log.push(['clearing', on]),
  };
  const heads = { say: null, stillOn: [] };
  const io = {
    sendControlVerbs: (opts) => {
      const h = held();
      sends.push({ ...opts, answer: h });
      log.push(['send', opts.batches.map((b) => b.map((i) => `${i.graphic}:${i.msg.t}`).join('+')).join(' | ')]);
      return h.promise;
    },
    verbStale: (e) => e.stale === true,
    verbAired: (e) => e.aired === true,
    verbsLanded: (e) => e.landed ?? 0,
    verbSentItems: (e) => e.items ?? null,
    headsSay: (slug) => {
      log.push(['headsSay', slug]);
      return heads.say;
    },
    headsStillOn: async (slug, graphics, ms) => {
      log.push(['headsStillOn', slug, graphics.join(','), ms]);
      return heads.stillOn;
    },
    adjustedValue: (current, delta) => String(Number(current ?? 0) + delta),
    movedKeys: (button) => Object.keys(button.adjust ?? {}),
    pressSend: (button, boundMap, valueOf) => {
      const fields = {};
      const treeWrites = [];
      for (const [key, delta] of Object.entries(button.adjust ?? {})) {
        const next = String(Number(valueOf(key) ?? 0) + delta);
        if (boundMap[key]) treeWrites.push({ path: boundMap[key], text: next, verb: 'adjust' });
        else fields[key] = next;
      }
      const payload = button.payload ? Object.fromEntries(button.payload.map((k) => [k, valueOf(k)])) : undefined;
      return { payload, fields, tree: treeWrites };
    },
    nameList: (names) => names.join(' and '),
    now: () => 1234,
    // The bound presses' fallback timer: held until the test fires it.
    setTimeout: (run, ms) => {
      log.push(['timer', ms]);
      timers.push(run);
      return timers.length;
    },
    clearTimeout: () => {},
  };
  const state = { sender };
  const verbs = createGraphicVerbs(session, io, () => state.sender, () => page);
  return { timers, inFlight, state, session, verbs, log, sends, flushes, draft, resolved, notes, debtCalls, sender, page, heads, liveCue: () => session.air.get().liveCue, moves: () => session.air.get().moves };
}

// ── The sender ──────────────────────────────────────────────────────────────────────────────────

test('unpublished, a send moves PROGRAM batch by batch and logs what went, and nothing leaves the machine', async () => {
  const r = rig({ published: null });
  const sent = await r.verbs.send([[{ graphic: 'Strap', msg: { t: 'play' } }], [{ graphic: 'Score', msg: { t: 'stop' } }]], 'Take');
  assert.deepEqual(sent, { ok: true, skipped: [], superseded: [], pressedAgain: [] });
  assert.deepEqual(r.log, [['here', 'play'], ['here', 'stop'], ['logSent', 2]]);
  assert.equal(r.sends.length, 0);
});

test('published, a send counts itself in flight until the answer, then settles its debts and says when the log took it', async () => {
  const r = rig();
  const sending = r.verbs.send([[{ graphic: 'Strap', msg: { t: 'play' } }]], 'Take');
  assert.deepEqual(r.log.at(-1), ['send', 'Strap:play']);
  assert.deepEqual(r.inFlight, [1]);
  r.sends[0].answer.resolve({ ...noneLeft });
  const sent = await sending;
  assert.equal(sent.ok, true);
  assert.deepEqual(r.debtCalls, [['landed', 1]]);
  assert.deepEqual(r.log.slice(-2), [['owed', false], ['loggedAt', 1234]]);
  assert.deepEqual(r.inFlight, [1, 0]);
  assert.equal(r.sends[0].slug, 'slug-1');
  assert.equal(r.sends[0].showId, 'show-1');
  assert.equal(r.sends[0].allOut, false);
});

test('a play sent while nothing reports that could air it says No output; All out never does', async () => {
  const r = rig();
  r.state.sender = { ...r.sender, outputUsable: () => false };
  const a = r.verbs.send([[{ graphic: 'Strap', msg: { t: 'play' } }]], 'Take');
  r.sends[0].answer.resolve({ ...noneLeft });
  await a;
  assert.equal(r.log.filter(([k]) => k === 'noOutput').length, 1);
  const b = r.verbs.send([[{ graphic: 'Strap', msg: { t: 'play' } }]], 'All out', true);
  r.sends[1].answer.resolve({ ...noneLeft });
  await b;
  assert.equal(r.log.filter(([k]) => k === 'noOutput').length, 1);
});

test('a failed send says which failure it was, owes the failed batch and those after it, and still leaves the in-flight count at zero', async () => {
  const r = rig();
  const batches = [[{ graphic: 'A', msg: { t: 'update' } }], [{ graphic: 'B', msg: { t: 'play' } }], [{ graphic: 'C', msg: { t: 'cue' } }]];
  const plain = r.verbs.send(batches, 'Take');
  r.sends[0].answer.reject(Object.assign(new Error('boom'), { landed: 1 }));
  assert.deepEqual(await plain, { ok: false, note: 'Take failed: boom' });
  assert.deepEqual(r.debtCalls.at(-1), ['failed', ['B:play', 'C:cue'], 'Take failed: boom']);
  assert.deepEqual(r.log.at(-1), ['owed', true]);
  assert.deepEqual(r.inFlight, [1, 0]);

  const aired = r.verbs.send(batches, 'Update');
  r.sends[1].answer.reject(Object.assign(new Error('timeout'), { aired: true, items: [{ graphic: 'Z', msg: { t: 'update' } }] }));
  assert.equal((await aired).note, 'Update is on this monitor only. It may not have reached the screens or the log (timeout). Send it again.');
  assert.deepEqual(r.debtCalls.at(-1)[1], ['Z:update', 'B:play', 'C:cue']);

  const stale = r.verbs.send(batches, 'Out');
  r.sends[2].answer.reject(Object.assign(new Error('stale'), { stale: true, reason: 'x' }));
  const staleNote = (await stale).note;
  assert.notEqual(staleNote, 'Out failed: stale');
  assert.ok(!staleNote.includes('on this monitor only'));
});

test("a timed cue's Take marker carries what it arms, published only; a marker that already arms or a direct one is left alone", async () => {
  const r = rig();
  const marker = (cue, extra = {}) => [{ graphic: 'Strap', msg: { t: 'cue', cue, ...extra } }];
  void r.verbs.send([marker('timed'), marker('plain'), marker('timed', { direct: true }), marker('timed', { auto: { then: 'out', ms: 1 } })], 'Take');
  const msgs = r.sends[0].batches.map((b) => b[0].msg);
  assert.deepEqual(msgs[0].auto, { then: 'out', ms: 2500 });
  assert.equal(msgs[1].auto, undefined);
  assert.equal(msgs[2].auto, undefined);
  assert.deepEqual(msgs[3].auto, { then: 'out', ms: 1 });
});

test('after the session ends nothing more is sent, local or published, and the press is told why', async () => {
  for (const published of [null, 'slug-1']) {
    const r = rig({ published });
    r.session.dispose();
    const sent = await r.verbs.send([[{ graphic: 'Strap', msg: { t: 'play' } }]], 'Take');
    assert.deepEqual(sent, { ok: false, note: 'This production is closed, so nothing was sent.' });
    assert.equal(r.sends.length, 0);
    assert.deepEqual(r.log, []);
  }
});

// ── Take graphic, and Re-take (§4.2 rows 1 and 3) ─────────────────────────────────────────────

test('Take waits for the save, then reads the draft and the bound values as they stand after the wait', async () => {
  const r = rig({ flushHeld: true });
  const cue = graphicCue('c1', 'Strap', { f0: 'stored', f1: 'kept' });
  r.draft.c1 = { f0: 'typed before' };
  r.resolved.Strap = { f2: '1-0' };
  const taking = r.verbs.take(cue);
  await settle();
  // Nothing goes before the save has landed.
  assert.equal(r.sends.length, 0);
  // Typed and moved during the wait: the Take carries what is newest.
  r.draft.c1 = { f0: 'typed during' };
  r.resolved.Strap = { f2: '3-2', f0: 'bound wins' };
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(r.sends[0].batches, [
    [
      { graphic: 'Strap', msg: { t: 'update', data: { f0: 'bound wins', f1: 'kept', f2: '3-2' } } },
      { graphic: 'Strap', msg: { t: 'play' } },
      { graphic: 'Strap', msg: { t: 'cue', cue: 'c1' } },
    ],
  ]);
  // The marker moves on the answer, not before it.
  assert.deepEqual(r.liveCue(), {});
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  assert.deepEqual(r.log.filter(([k]) => k === 'clearMisses' || k === 'noteStep'), [['clearMisses', 'c1'], ['noteStep', 'c1']]);
});

test('Take marks nothing for a graphic the send left alone: skipped, superseded or pressed again', async () => {
  for (const left of ['skipped', 'superseded', 'pressedAgain']) {
    const r = rig();
    const taking = r.verbs.take(graphicCue('c1', 'Strap'));
    await settle();
    r.sends[0].answer.resolve({ ...noneLeft, [left]: ['Strap'] });
    await taking;
    assert.deepEqual(r.liveCue(), {}, left);
    assert.equal(r.moves(), 0, left);
    // The Take still landed: its misses are forgotten and its step noted.
    assert.deepEqual(r.log.filter(([k]) => k === 'clearMisses').length, 1, left);
  }
});

test('two Takes on one layer answered out of order: the later press stands', async () => {
  const r = rig();
  const first = r.verbs.take(graphicCue('c1', 'Strap'));
  await settle();
  const second = r.verbs.take(graphicCue('c2', 'Strap'));
  await settle();
  // The later press lands first; the earlier one comes back saying it was pressed again since.
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
  assert.deepEqual(r.liveCue(), { Strap: 'c2' });
  r.sends[0].answer.resolve({ ...noneLeft, pressedAgain: ['Strap'] });
  await first;
  assert.deepEqual(r.liveCue(), { Strap: 'c2' });
});

test('a failed Take marks nothing, forgets no misses, notes no step and says why once', async () => {
  const r = rig();
  const taking = r.verbs.take(graphicCue('c1', 'Strap'));
  await settle();
  r.sends[0].answer.reject(new Error('refused'));
  await taking;
  assert.deepEqual(r.liveCue(), {});
  assert.deepEqual(r.notes, ['Take failed: refused']);
  assert.equal(r.log.filter(([k]) => k === 'clearMisses' || k === 'noteStep').length, 0);
});

test('a Take whose answer comes after the session ended changes nothing here; one pressed after it is never sent', async () => {
  const r = rig();
  const taking = r.verbs.take(graphicCue('c1', 'Strap'));
  await settle();
  r.session.dispose();
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  assert.deepEqual(r.liveCue(), {});
  assert.equal(r.moves(), 0);
  // The next press: the save wait ends after the end, and the send refuses.
  const r2 = rig({ flushHeld: true });
  const later = r2.verbs.take(graphicCue('c1', 'Strap'));
  await settle();
  r2.session.dispose();
  r2.flushes[0].resolve();
  await later;
  assert.equal(r2.sends.length, 0);
  assert.deepEqual(r2.notes, ['This production is closed, so nothing was sent.']);
});

test('Re-take sends a live cue whole again and keeps its marker', async () => {
  const r = rig();
  const cue = graphicCue('c1', 'Strap', { f0: 'A' });
  const one = r.verbs.take(cue);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await one;
  const again = r.verbs.take(cue);
  await settle();
  assert.deepEqual(r.sends[1].batches[0].map((i) => i.msg.t), ['update', 'play', 'cue']);
  r.sends[1].answer.resolve({ ...noneLeft });
  await again;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  assert.equal(r.moves(), 2);
});

test('a direct trigger carries `direct` and arms only its own timed end; a cue whose graphic is gone sends nothing', async () => {
  const r = rig();
  const cue = graphicCue('c1', 'Strap', {}, { auto: { then: 'out', after: 3 } });
  const taking = r.verbs.takeGraphic(cue, 'Trigger C1', true);
  await settle();
  assert.deepEqual(r.sends[0].batches[0][2].msg, { t: 'cue', cue: 'c1', direct: true, auto: { then: 'out', ms: 3000 } });
  r.sends[0].answer.resolve({ ...noneLeft });
  assert.deepEqual(await taking, { ok: true, note: '✓ Trigger C1: C1' });
  assert.equal(await r.verbs.takeGraphic({ id: 'x', label: 'X', values: {} }, 'Take'), null);
  assert.equal(r.sends.length, 1);
});

test("a server cue's Take goes to the server verb, and forgets its misses and notes its step only when it went", async () => {
  const r = rig();
  await r.verbs.take(serverCue('v1'));
  assert.deepEqual(r.log, [['playoutVerb', 'v1', 'take', 'Take', '{}'], ['clearMisses', 'v1'], ['noteStep', 'v1']]);
  const r2 = rig();
  r2.page.playoutVerb = async () => false;
  await r2.verbs.take(serverCue('v1'));
  assert.deepEqual(r2.log, []);
  assert.equal(r2.sends.length, 0);
});

// ── Out, and taking a removed graphic off (§4.2 row 4) ─────────────────────────────────────────

test('Out sends at once, with no save wait, and clears the marker on the answer unless a later press stands', async () => {
  const r = rig({ flushHeld: true });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1', Score: 's1' } } }));
  const live = sel({ selectedCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', selectedLayerLive: true });
  const out = r.verbs.out(live);
  assert.equal(r.flushes.length, 0);
  assert.deepEqual(r.log.at(-1), ['send', 'Strap:stop+Strap:cue']);
  assert.deepEqual(r.liveCue(), { Strap: 'c1', Score: 's1' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await out;
  assert.deepEqual(r.liveCue(), { Score: 's1' });

  const again = r.verbs.out(sel({ selectedGraphic: 'Score', selectedLayerLive: true }));
  r.sends[1].answer.resolve({ ...noneLeft, skipped: ['Score'] });
  await again;
  assert.deepEqual(r.liveCue(), { Score: 's1' });
});

test('Out of a layer that is not up sends nothing; a server cue goes off through the server verb only while it is up', async () => {
  const r = rig();
  await r.verbs.out(sel({ selectedGraphic: 'Strap', selectedLayerLive: false }));
  await r.verbs.out(sel({ selectedCue: serverCue('v1'), selectedPlayoutLive: false, selectedLayerLive: true, selectedGraphic: 'Strap' }));
  assert.equal(r.sends.length, 0);
  assert.deepEqual(r.log, []);
  await r.verbs.out(sel({ selectedCue: serverCue('v1'), selectedPlayoutLive: true }));
  assert.deepEqual(r.log, [['playoutVerb', 'v1', 'out', 'Out', '{}']]);
});

test('a failed Out keeps the marker and says why; an Out answered after the end changes nothing', async () => {
  const r = rig();
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1' } } }));
  const live = sel({ selectedGraphic: 'Strap', selectedLayerLive: true });
  const failing = r.verbs.out(live);
  r.sends[0].answer.reject(new Error('down'));
  await failing;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  assert.deepEqual(r.notes, ['Out failed: down']);
  const late = r.verbs.out(live);
  r.session.dispose();
  r.sends[1].answer.resolve({ ...noneLeft });
  await late;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
});

test('taking a graphic off before removing it goes only when the render had it up', async () => {
  const r = rig({ liveCue: { Strap: 'c1' } });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1' } } }));
  await r.verbs.takeOff('Score');
  assert.equal(r.sends.length, 0);
  const off = r.verbs.takeOff('Strap');
  r.sends[0].answer.resolve({ ...noneLeft });
  await off;
  assert.deepEqual(r.liveCue(), {});
});

// ── All out (§4.2 row 5) ──────────────────────────────────────────────────────────────────────

test('All out stops the folders first, cuts each server cue in turn, clears the unnamed slots, then sends one clear and waits for the heads', async () => {
  const r = rig({ liveCue: { Strap: 'c1' } });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1', Score: 's1' } } }));
  r.page.livePlayoutLayers = [{ cue: serverCue('v1') }, { cue: serverCue('v2') }];
  const outs = [];
  r.page.playoutVerb = (cue, verb, label, options) => {
    r.log.push(['playoutVerb', cue.id, verb, label, JSON.stringify(options)]);
    const h = held();
    outs.push(h);
    return h.promise;
  };
  r.heads.say = new Map([['Score', true], ['Clock', false]]);
  r.heads.stillOn = ['Score'];
  const clearing = r.verbs.allOut();
  // The folders stop before anything is awaited.
  assert.deepEqual(r.log, [['stopFolders'], ['playoutVerb', 'v1', 'out', 'All out', '{"cut":true}']]);
  // Held: the second server cue waits for the first.
  await settle();
  assert.equal(outs.length, 1);
  outs[0].resolve(true);
  await settle();
  assert.deepEqual(r.log.at(-1), ['playoutVerb', 'v2', 'out', 'All out', '{"cut":true}']);
  r.log.length = 0;
  outs[1].resolve(true);
  await settle();
  // What the heads say is read after the server cues went, not at the press.
  assert.deepEqual(r.log, [['outUnnamed'], ['headsSay', 'slug-1'], ['clearing', true], ['send', 'Strap:stop+Strap:cue+Score:stop+Score:cue']]);
  assert.equal(r.sends[0].allOut, true);
  // A clear sounds nothing.
  assert.deepEqual(r.sends[0].batches[0][0].msg, { t: 'stop', sound: false });
  // Clearing… holds until the answer; the marker moves only on it.
  assert.deepEqual(r.liveCue(), { Strap: 'c1', Score: 's1' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await clearing;
  assert.deepEqual(r.liveCue(), {});
  assert.deepEqual(r.log.filter(([k]) => k === 'headsStillOn' || k === 'clearing').slice(-2), [['headsStillOn', 'slug-1', 'Strap,Score', 5000], ['clearing', false]]);
  assert.deepEqual(r.notes, ['bridge: All out did not clear Score']);
});

test('All out answered with a graphic pressed again keeps that graphic up; a failed All out says it through the Bridge and stops Clearing…', async () => {
  const r = rig({ liveCue: { Strap: 'c1', Score: 's1' } });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1', Score: 's1' } } }));
  const a = r.verbs.allOut();
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft, pressedAgain: ['Score'] });
  await a;
  assert.deepEqual(r.liveCue(), { Score: 's1' });
  assert.deepEqual(r.log.find(([k]) => k === 'headsStillOn'), ['headsStillOn', 'slug-1', 'Strap', 5000]);

  const r2 = rig({ liveCue: { Strap: 'c1' } });
  r2.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1' } } }));
  const b = r2.verbs.allOut();
  await settle();
  r2.sends[0].answer.reject(new Error('down'));
  await b;
  assert.deepEqual(r2.liveCue(), { Strap: 'c1' });
  assert.deepEqual(r2.notes, ['bridge: All out failed: down']);
  assert.deepEqual(r2.log.at(-1), ['clearing', false]);
  assert.equal(r2.log.filter(([k]) => k === 'headsStillOn').length, 0);
});

test('All out with nothing to clear sends nothing; unpublished it asks no heads and waits for none', async () => {
  const r = rig({ liveCue: {} });
  r.heads.say = new Map([['Strap', false], ['Score', false], ['Clock', false]]);
  await r.verbs.allOut();
  assert.equal(r.sends.length, 0);
  assert.equal(r.log.filter(([k]) => k === 'clearing').length, 0);

  const r2 = rig({ published: null, liveCue: { Strap: 'c1' } });
  r2.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1' } } }));
  await r2.verbs.allOut();
  assert.equal(r2.log.filter(([k]) => k === 'headsSay' || k === 'headsStillOn').length, 0);
  assert.deepEqual(r2.liveCue(), {});
});

test('a published All out that knows of nothing clears every graphic the heads have no word on', async () => {
  const r = rig({ liveCue: {} });
  r.heads.say = new Map([['Clock', false]]);
  const a = r.verbs.allOut();
  await settle();
  assert.deepEqual(r.log.find(([k]) => k === 'send'), ['send', 'Strap:stop+Strap:cue+Score:stop+Score:cue']);
  r.sends[0].answer.resolve({ ...noneLeft });
  await a;
});

// ── Update (§4.2 row 6) ───────────────────────────────────────────────────────────────────────

test('Update waits for the save and sends the full set, bound values over the draft, as they stand after the wait', async () => {
  const r = rig({ flushHeld: true });
  const cue = graphicCue('c1', 'Strap', { f0: 'A', f1: 'B' });
  const updating = r.verbs.update(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }));
  await settle();
  assert.equal(r.sends.length, 0);
  r.draft.c1 = { f1: 'typed' };
  r.resolved.Strap = { f0: 'tree' };
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(r.sends[0].batches, [[{ graphic: 'Strap', msg: { t: 'update', data: { f0: 'tree', f1: 'typed' } } }]]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await updating;
  // Update never moves the marker.
  assert.equal(r.moves(), 0);
});

test('Update of a cue not on air sends nothing; a server cue updates through the server verb while it is up', async () => {
  const r = rig();
  await r.verbs.update(sel({ editingCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', editingIsLive: false }));
  await r.verbs.update(sel({ editingCue: serverCue('v1'), selectedPlayoutLive: false }));
  assert.deepEqual(r.log, []);
  await r.verbs.update(sel({ editingCue: serverCue('v1'), selectedPlayoutLive: true }));
  assert.deepEqual(r.log, [['playoutVerb', 'v1', 'update', 'Update', '{}']]);
});

// ── ± bump (§4.2 row 7) ───────────────────────────────────────────────────────────────────────

test('an unbound bump counts from what the render showed on air, writes the cue, then sends that one field', async () => {
  const r = rig({ flushHeld: true, aired: { Strap: { f3: '7' } } });
  const cue = graphicCue('c1', 'Strap', { f3: '1', f0: 'Name' });
  const bumping = r.verbs.bump(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }), 'f3', 1);
  await settle();
  // The save comes first.
  assert.deepEqual(r.log, [['flush']]);
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(r.log.slice(1, 3), [['writeCue', 'c1', '{"f3":"8"}'], ['send', 'Strap:update']]);
  assert.deepEqual(r.sends[0].batches[0][0].msg, { t: 'update', data: { f3: '8' } });
  r.sends[0].answer.resolve({ ...noneLeft });
  await bumping;
});

test('an unbound bump with nothing aired counts from the cue as typed, then from 0', async () => {
  const r = rig();
  const cue = graphicCue('c1', 'Strap', { f3: '4' });
  r.draft.c1 = { f3: '5' };
  const one = r.verbs.bump(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }), 'f3', -1);
  await settle();
  assert.deepEqual(r.sends[0].batches[0][0].msg.data, { f3: '4' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await one;
  const two = r.verbs.bump(sel({ editingCue: graphicCue('c2', 'Strap'), selectedGraphic: 'Strap', editingIsLive: true }), 'f9', 2);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { f9: '2' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await two;
});

test('a bound bump moves the tree, counted from the tree after the save, and writes nothing into the cue', async () => {
  const tree = { Score: { home: '2' } };
  const r = rig({ flushHeld: true, bound: { Score: { home: 'match.home' } }, tree });
  const bumping = r.verbs.bump(sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true }), 'home', 1);
  await settle();
  // A feed moved the figure during the save: the press counts from it.
  tree.Score.home = '5';
  r.flushes[0].resolve();
  await bumping;
  assert.deepEqual(r.log.filter(([k]) => k !== 'flush'), [['patch', 'match.home=6']]);
  assert.equal(r.sends.length, 0);
});

test('a bound bump refused while the tree is unread moves nothing', async () => {
  const r = rig({ bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '2' } } });
  r.page.boundReady = () => false;
  await r.verbs.bump(sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true }), 'home', 1);
  assert.equal(r.log.filter(([k]) => k === 'patch').length, 0);
});

test('a second bound press on a graphic waits for the first, then counts from the tree the first left (S1)', async () => {
  const tree = { Score: { home: '2' } };
  const r = rig({ bound: { Score: { home: 'match.home' } }, tree });
  const writes = [];
  r.page.patchBound = (w) => {
    const h = held();
    writes.push({ w, h });
    return h.promise;
  };
  const view = sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true });
  const first = r.verbs.bump(view, 'home', 1);
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].w[0].text, '3');
  // Its fallback is a send's window and two attempts: 4 s + 2 x 1.5 s.
  assert.deepEqual(r.log.filter(([k]) => k === 'timer'), [['timer', 7000]]);
  tree.Score.home = '3';
  writes[0].h.resolve();
  await first;
  await settle();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].w[0].text, '4');
  writes[1].h.resolve();
  await second;
});

test('a bound press whose predecessor never answers goes once the fallback passes, and a failed one still frees the next', async () => {
  const r = rig({ bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '2' } } });
  let calls = 0;
  r.page.patchBound = () => {
    calls += 1;
    return calls === 1 ? new Promise(() => {}) : Promise.resolve();
  };
  const view = sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true });
  void r.verbs.bump(view, 'home', 1);
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.equal(calls, 1);
  r.timers[0]();
  await second;
  assert.equal(calls, 2);

  const r2 = rig({ bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '2' } } });
  let n = 0;
  r2.page.patchBound = async () => {
    n += 1;
    if (n === 1) throw new Error('refused');
  };
  await assert.rejects(r2.verbs.bump(view, 'home', 1));
  await r2.verbs.bump(view, 'home', 1);
  assert.equal(n, 2);
  // The failed press had settled, so the next one did not wait for anything.
  assert.equal(r2.log.filter(([k]) => k === 'timer').length, 0);
});

test('a bump on a cue not on air does nothing', async () => {
  const r = rig({ bound: { Score: { home: 'match.home' } } });
  await r.verbs.bump(sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: false }), 'home', 1);
  assert.deepEqual(r.log, []);
});

// ── Next (§4.2 row 8) ────────────────────────────────────────────────────────────────────────

test('Next sends at once on a live layer and moves no marker; a server cue goes through the server verb', async () => {
  const r = rig({ flushHeld: true });
  const going = r.verbs.next(sel({ selectedGraphic: 'Strap', selectedLayerLive: true }));
  assert.equal(r.flushes.length, 0);
  assert.deepEqual(r.sends[0].batches, [[{ graphic: 'Strap', msg: { t: 'next' } }]]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await going;
  assert.equal(r.moves(), 0);
  await r.verbs.next(sel({ selectedGraphic: 'Strap', selectedLayerLive: false }));
  assert.equal(r.sends.length, 1);
  await r.verbs.next(sel({ selectedCue: serverCue('v1'), selectedPlayoutLive: true }));
  assert.deepEqual(r.log.at(-1), ['playoutVerb', 'v1', 'next', 'Next', '{}']);
});

// ── ⚡ event (§4.2 row 9) ─────────────────────────────────────────────────────────────────────

const goal = { event: 'goal', adjust: { home: 1 } };
const reveal = { event: 'reveal', payload: ['answer'] };

test('an event waits for the save, carries the ON-AIR cue as typed after the wait, and moves an adjusted figure from air', async () => {
  const airCue = graphicCue('a1', 'Score', { answer: 'stored', home: '0' });
  const r = rig({ flushHeld: true, aired: { Score: { home: '4' } } });
  const view = sel({ selectedGraphic: 'Score', selectedLayerLive: true, airCue });
  const pressing = r.verbs.event(view, { event: 'both', adjust: { home: 1 }, payload: ['answer'] });
  await settle();
  r.draft.a1 = { answer: 'typed' };
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(r.log.slice(1, 3), [['writeLive', 'a1', '{"home":"5"}'], ['send', 'Score:event']]);
  assert.deepEqual(r.sends[0].batches[0][0].msg, { t: 'event', event: 'both', payload: { answer: 'typed' } });
  r.sends[0].answer.resolve({ ...noneLeft });
  await pressing;
});

test('an event with no payload sends the bare event, and nothing on a layer that is not up', async () => {
  const r = rig();
  const going = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), { event: 'go' });
  await settle();
  assert.deepEqual(r.sends[0].batches[0][0].msg, { t: 'event', event: 'go' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await going;
  await r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: false }), { event: 'go' });
  assert.equal(r.sends.length, 1);
});

test('a bound event moves the tree only once it went, and not when the server skipped or superseded it', async () => {
  for (const [answer, patched] of [
    [{ ...noneLeft }, true],
    [{ ...noneLeft, pressedAgain: ['Score'] }, true],
    [{ ...noneLeft, skipped: ['Score'] }, false],
    [{ ...noneLeft, superseded: ['Score'] }, false],
    [null, false],
  ]) {
    const r = rig({ bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '2' } } });
    const pressing = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
    await settle();
    // Not before the answer.
    assert.equal(r.log.filter(([k]) => k === 'patch').length, 0);
    if (answer) r.sends[0].answer.resolve(answer);
    else r.sends[0].answer.reject(new Error('down'));
    await pressing;
    assert.deepEqual(r.log.filter(([k]) => k === 'patch'), patched ? [['patch', 'match.home=3']] : [], JSON.stringify(answer));
    // A bound field is not a cue value: nothing is written into the cue.
    assert.equal(r.log.filter(([k]) => k === 'writeLive').length, 0);
  }
});

test('a bound event waits for the press before it on its graphic; one that moves no bound field does not', async () => {
  const tree = { Score: { home: '2' } };
  const r = rig({ bound: { Score: { home: 'match.home' } }, tree });
  const first = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
  const second = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
  const free = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), reveal);
  await settle();
  // The first goal and the reveal are out; the second goal waits.
  assert.deepEqual(r.sends.map((s) => s.batches[0][0].msg.event).sort(), ['goal', 'reveal']);
  const goalAt = r.sends.findIndex((s) => s.batches[0][0].msg.event === 'goal');
  tree.Score.home = '3';
  r.sends[goalAt].answer.resolve({ ...noneLeft });
  await first;
  await settle();
  assert.equal(r.sends.length, 3);
  assert.equal(r.sends[2].batches[0][0].msg.event, 'goal');
  r.sends[2].answer.resolve({ ...noneLeft });
  await second;
  assert.deepEqual(r.log.filter(([k]) => k === 'patch'), [['patch', 'match.home=3'], ['patch', 'match.home=4']]);
  r.sends[1 - goalAt].answer.resolve({ ...noneLeft });
  await free;
});

test('a bound event refused while the tree is unread sends nothing at all', async () => {
  const r = rig({ bound: { Score: { home: 'match.home' } } });
  r.page.boundReady = () => false;
  await r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
  assert.equal(r.sends.length, 0);
});

// ── Snap (§4.2 row 10) ────────────────────────────────────────────────────────────────────────

test('Snap waits for the save, then sends the snap and the ON-AIR values in one batch, snap first', async () => {
  const airCue = graphicCue('a1', 'Quiz', { q: 'stored' });
  const r = rig({ flushHeld: true });
  const view = sel({ selectedGraphic: 'Quiz', selectedLayerLive: true, airCue });
  const snapping = r.verbs.snap(view, 'reveal', 'shown');
  await settle();
  assert.equal(r.sends.length, 0);
  r.draft.a1 = { q: 'typed' };
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(r.sends[0].batches, [
    [
      { graphic: 'Quiz', msg: { t: 'snap', snap: { reveal: 'shown' } } },
      { graphic: 'Quiz', msg: { t: 'update', data: { q: 'typed' } } },
    ],
  ]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await snapping;
  // A null group resets every group; with no cue on air the update carries nothing.
  const reset = r.verbs.snap(sel({ selectedGraphic: 'Quiz', selectedLayerLive: true }), null, 'x');
  r.flushes[1].resolve();
  await settle();
  assert.deepEqual(r.sends[1].batches[0], [
    { graphic: 'Quiz', msg: { t: 'snap', snap: null } },
    { graphic: 'Quiz', msg: { t: 'update', data: {} } },
  ]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await reset;
  await r.verbs.snap(sel({ selectedGraphic: 'Quiz', selectedLayerLive: false }), null, 'x');
  assert.equal(r.sends.length, 2);
});

// ── One sender (§4.1 R4) ─────────────────────────────────────────────────────────────────────

test('every verb reaches the wire only through the one sender, with the page of its press', async () => {
  const r = rig();
  const live = sel({ selectedCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', selectedLayerLive: true, editingCue: graphicCue('c1', 'Strap'), editingIsLive: true });
  void r.verbs.take(graphicCue('c1', 'Strap'));
  void r.verbs.update(live);
  await settle();
  // A press made after a later render reads that render: a press keeps the page it was made with.
  r.state.sender = { ...r.sender, published: 'slug-2' };
  void r.verbs.next(live);
  await settle();
  assert.deepEqual(r.sends.map((s) => s.slug), ['slug-1', 'slug-1', 'slug-2']);
});

test('a press sends with the page of its press, even when a later render changed it during the save wait', async () => {
  const r = rig({ flushHeld: true });
  const live = sel({ editingCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', editingIsLive: true });
  const updating = r.verbs.update(live);
  await settle();
  // The first publish lands while the save is still going.
  r.state.sender = { ...r.sender, published: 'slug-2' };
  r.flushes[0].resolve();
  await settle();
  assert.equal(r.sends[0].slug, 'slug-1');
  r.sends[0].answer.resolve({ ...noneLeft });
  await updating;
});

test('a press whose save wait ends after the production closed moves nothing: no cue write, no tree write, no Bridge clear', async () => {
  // An unbound bump: the cue is not written alone.
  const a = rig({ flushHeld: true });
  const bumping = a.verbs.bump(sel({ editingCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', editingIsLive: true }), 'f3', 1);
  await settle();
  a.session.dispose();
  a.flushes[0].resolve();
  await bumping;
  assert.deepEqual(a.log, [['flush']]);
  // A bound bump: the tree is not written.
  const b = rig({ flushHeld: true, bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '2' } } });
  const bound = b.verbs.bump(sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true }), 'home', 1);
  await settle();
  b.session.dispose();
  b.flushes[0].resolve();
  await bound;
  assert.equal(b.log.filter(([k]) => k === 'patch').length, 0);
  // An adjust event: the moved figure is not written into the cue.
  const c = rig({ flushHeld: true, aired: { Score: { home: '4' } } });
  const pressing = c.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true, airCue: graphicCue('a1', 'Score') }), goal);
  await settle();
  c.session.dispose();
  c.flushes[0].resolve();
  await pressing;
  assert.equal(c.log.filter(([k]) => k === 'writeLive' || k === 'send').length, 0);
  // All out refused at the end does not clear through the Bridge.
  const d = rig({ liveCue: { Strap: 'c1' } });
  const outs = [];
  d.page.livePlayoutLayers = [{ cue: serverCue('v1') }];
  d.page.playoutVerb = () => {
    const h = held();
    outs.push(h);
    return h.promise;
  };
  const clearing = d.verbs.allOut();
  d.session.dispose();
  outs[0].resolve(true);
  await clearing;
  assert.equal(d.sends.length, 0);
  assert.ok(!d.notes.some((n) => n.startsWith('bridge:')));
});
