// guards: src/control/graphicVerbs.ts, src/control/selectionAir.ts, src/control/cueItems.ts, src/control/liveCue.ts, src/control/allOut.ts, src/control/playoutSession.ts, src/control/liveControls.ts, src/model/ografTyped.ts
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
const { withLiveCue } = await import('../src/control/liveCue.ts');
const { OGRAF_STANDARD } = await import('../src/model/ografTyped.ts');

/** A promise the test settles. */
function held() {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
/** Let every settled promise run its continuations. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** What was sent, each figure command's own id checked and set aside: an update, an event with a
 *  payload or a stop goes with this page's id, so its row heard back is known for this page's own
 *  (graphicVerbs.ts `heard`). */
function sentAs(sent) {
  if (Array.isArray(sent)) return sent.map(sentAs);
  if (sent && typeof sent === 'object' && 'msg' in sent) return { ...sent, msg: sentAs(sent.msg) };
  if ((sent.t === 'update' && sent.data) || (sent.t === 'event' && sent.payload) || sent.t === 'stop') {
    assert.equal(typeof sent.oid, 'string', `a ${sent.t} goes with this page's id`);
    const rest = { ...sent };
    delete rest.oid;
    return rest;
  }
  return sent;
}

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
function rig({ seed = true, fast = false, published = 'slug-1', flushHeld = false, liveCue = {}, aired = {}, bound = {}, tree = {}, selections = {}, typedSends = null, typedAiring = null, candidates = {}, airedCandidates = {}, airedFields = {}, saved = {}, ioWith = {} } = {}) {
  const session = createPlayoutSession('p1');
  const log = [];
  const sends = [];
  const flushes = [];
  const draft = {};
  const resolved = {};
  const notes = [];
  const debtCalls = [];
  let sending = 0;
  let owedCount = 0;
  const inFlight = [];
  const timers = [];
  const debts = {
    landed: (items) => {
      debtCalls.push(['landed', items.length]);
      return (shown) => shown;
    },
    failed: (items, note) => debtCalls.push(['failed', items.map((i) => `${i.graphic}:${i.msg.t}`), note]),
    owed: () => owedCount,
  };
  const sender = {
    published,
    showId: 'show-1',
    here: (batch) => log.push(['here', batch.map((i) => i.msg.t).join('+')]),
    logSent: (items) => log.push(['logSent', items.length]),
    armSpecFor: (cueId) => (cueId === 'timed' ? { auto: { then: 'out', after: 2.5 }, next: null } : null),
    // The fast road: this page's monitor and marker move at the press (airState.ts `claimAndApply`).
    applyHere: (items) =>
      fast &&
      session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: items.reduce((m, i) => (i.msg.t === 'cue' ? withLiveCue(m, i.graphic, i.msg.cue) : m), parts.air.liveCue) } })),
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
    // A cue's live candidate as control/selectionAir.ts would answer it (E7.1): none by default.
    selectionFor: (cue) => selections[cue.id] ?? { status: 'none' },
    // What a typed cue sends (model/ografTyped.ts `typedForSend`, E1.2a): a page that sends none
    // has no `typedFor`, unless the test gives it answers.
    ...(typedSends ? { typedFor: (cue) => typedSends[cue.id] ?? { status: 'none' } } : {}),
    ...(typedAiring ? { typedAiring: (graphic) => typedAiring.includes(graphic) } : {}),
    selectionAired: (graphic, cueId, take) => {
      log.push(['aired', graphic, cueId, take.status]);
      return { landed: () => log.push(['landed', graphic, cueId]), undo: (failed) => log.push(['unaired', graphic, cueId, ...(failed?.uncertain ? ['uncertain'] : failed?.stale ? ['stale'] : [])]) };
    },
    selectionStale: (graphics) => log.push(['stale', graphics.join(',')]),
    candidateFields: (cue) => candidates[cue.id] ?? [],
    airedCandidate: (graphic, cueId) => airedCandidates[`${graphic}:${cueId}`] ?? null,
    airedCandidateFields: (graphic) => airedFields[graphic] ?? [],
    boundNow: (graphic) => ({ ...(tree[graphic] ?? {}) }),
    boundReady: () => true,
    patchBound: async (writes) => {
      log.push(['patch', writes.map((w) => `${w.path}=${w.text}`).join(',')]);
    },
    writeCue: (cueId, values) => log.push(['writeCue', cueId, JSON.stringify(values)]),
    savedValues: (cueId) => saved[cueId],
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
      opts.applyHere?.(opts.batches.flat());
      const h = held();
      sends.push({ ...opts, answer: h });
      log.push(['send', opts.batches.map((b) => b.map((i) => `${i.graphic}:${i.msg.t}`).join('+')).join(' | ')]);
      return h.promise;
    },
    verbStale: (e) => e.stale === true,
    verbAired: (e) => e.aired === true,
    verbsLanded: (e) => e.landed ?? 0,
    verbsSkipped: (e) => e.skipped ?? [],
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
    // A marker's id, by its number: rows and lost answers name it.
    mintOid: (n) => `oid-${n}`,
    // The bound presses' fallback timer: held until the test fires it.
    setTimeout: (run, ms) => {
      log.push(['timer', ms]);
      timers.push(run);
      return timers.length;
    },
    clearTimeout: () => {},
  };
  Object.assign(io, ioWith);
  const state = { sender };
  // What this page believes is on air starts as the rig says: the live map and what each graphic
  // was last sent (the `air` part a live press reads its instance and its base from).
  session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { ...liveCue }, aired: { ...aired } } }));
  const created = createGraphicVerbs(session, io, () => state.sender, () => page);
  // A live press is drawn for the cue on air: unless a test says otherwise (`seed: false`), the
  // cue a selection names live is what the session's marker names for its graphic, as on the page.
  const seeded = (press) => (view, ...rest) => {
    const cue = view.airCue ?? (view.editingIsLive ? view.editingCue : null);
    const graphic = view.selectedGraphic;
    if (seed && cue && graphic && !(graphic in session.air.get().liveCue)) {
      session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, graphic, cue.id) } }));
    }
    return press(view, ...rest);
  };
  const verbs = { ...created, event: seeded(created.event), bump: seeded(created.bump), snap: seeded(created.snap) };
  return { setOwed: (n) => (owedCount = n), timers, inFlight, state, session, verbs, log, sends, flushes, draft, saved, resolved, notes, debtCalls, sender, page, heads, liveCue: () => session.air.get().liveCue, moves: () => session.air.get().moves };
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
  const staleSent = await stale;
  const staleNote = staleSent.note;
  assert.notEqual(staleNote, 'Out failed: stale');
  assert.ok(!staleNote.includes('on this monitor only'));
  assert.equal(staleSent.stale, true, 'refused because another screen changed a graphic');

  // No answer in time: it may still commit, and says so to the live candidates.
  const unanswered = r.verbs.send(batches, 'Take');
  r.sends[3].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  assert.deepEqual(await unanswered, { ok: false, note: 'Take failed: the server did not answer', uncertain: true });
  assert.equal((await plain).uncertain, undefined, 'a refusal is a definite failure');
});

test('a refusal as stale on any send blocks the live candidates on the graphics it names; an answer this page cannot read may have landed (E7.1)', async () => {
  const r = rig();
  const batches = [[{ graphic: 'Strap', msg: { t: 'event', event: 'x' } }], [{ graphic: 'Score', msg: { t: 'update' } }]];
  const named = r.verbs.send(batches, 'Event');
  r.sends[0].answer.reject(Object.assign(new Error('stale'), { stale: true, graphics: ['Score'] }));
  await named;
  const bare = r.verbs.send(batches, 'Event');
  r.sends[1].answer.reject(Object.assign(new Error('stale'), { stale: true }));
  await bare;
  assert.deepEqual(r.log.filter(([k]) => k === 'stale'), [['stale', 'Score'], ['stale', 'Strap,Score']], 'the graphics it names, else every graphic it carried');
  const unread = r.verbs.send(batches, 'Event');
  r.sends[2].answer.reject(Object.assign(new Error('the server answered in a way this page cannot read'), { unread: true }));
  assert.equal((await unread).uncertain, true);
});

test('an All out with no answer tells each layer it may still have landed (E7.1)', async () => {
  const r = rig({ liveCue: { Strap: 'c1' } });
  const clearing = r.verbs.allOut();
  await settle();
  r.sends[0].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  await clearing;
  assert.deepEqual(r.log.filter(([k]) => k === 'unaired'), [['unaired', 'Strap', '', 'uncertain']]);
});

test('Take and Out tell the layer they move the marker; Out is a press on the layer, settled by its answer (E7.1)', async () => {
  const r = rig({ liveCue: { Strap: 'c1' } });
  const presses = [];
  r.page.selectionAired = (graphic, cueId, take, moves) => {
    presses.push([graphic, cueId, take.status, moves]);
    return { landed: () => presses.push(['landed', graphic]), undo: (failed) => presses.push(['undo', graphic, failed?.uncertain ?? false]) };
  };
  const taking = r.verbs.take(graphicCue('c2', 'Strap'));
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  const out = r.verbs.takeOff('Strap');
  await settle();
  assert.deepEqual(presses.at(-1), ['Strap', '', 'none', true], 'registered before the Out goes');
  r.sends[1].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  await out;
  assert.deepEqual(presses, [['Strap', 'c2', 'none', true], ['landed', 'Strap'], ['Strap', '', 'none', true], ['undo', 'Strap', true]]);
  assert.deepEqual(r.notes.at(-1), 'Out failed: the server did not answer');
});

test('a live candidate\'s correction says why it failed once, and answers how', async () => {
  const r = rig();
  const correcting = r.verbs.runSent([[{ graphic: 'Strap', msg: { t: 'update', data: { f1: '2' } } }]], 'Live candidate');
  r.sends[0].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  assert.deepEqual(await correcting, { ok: false, note: 'Live candidate failed: the server did not answer', uncertain: true });
  assert.deepEqual(r.notes, ['Live candidate failed: the server did not answer']);
});

test('a Take or an Update that failed tells its live candidate how: with no answer it may still commit; refused as stale, another screen changed it (E7.1)', async () => {
  for (const [error, kind] of [
    [Object.assign(new Error('the server did not answer'), { unanswered: true }), ['uncertain']],
    [Object.assign(new Error('stale'), { stale: true, reason: 'x' }), ['stale']],
    [new Error('refused'), []],
  ]) {
    const r = rig({ selections: { c1: { status: 'ok', selection: {}, scope: 's', entity: 'e', revision: 1, values: { f1: '1' } } } });
    const taking = r.verbs.take(graphicCue('c1', 'Strap'));
    await settle();
    r.sends[0].answer.reject(error);
    await taking;
    assert.deepEqual(r.log.find(([k]) => k === 'unaired'), ['unaired', 'Strap', 'c1', ...kind], `Take: ${error.message}`);
    const u = rig({ liveCue: { Strap: 'c1' }, selections: { c1: { status: 'ok', selection: {}, scope: 's', entity: 'e', revision: 1, values: { f1: '1' } } } });
    const updating = u.verbs.update(sel({ editingCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', editingIsLive: true }));
    await settle();
    u.sends[0].answer.reject(error);
    await updating;
    assert.deepEqual(u.log.find(([k]) => k === 'unaired'), ['unaired', 'Strap', 'c1', ...kind], `Update: ${error.message}`);
    assert.equal(u.notes.length, 1, 'the Update says why once');
  }
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
  assert.deepEqual(sentAs(r.sends[0].batches), [
    [
      { graphic: 'Strap', msg: { t: 'update', data: { f0: 'bound wins', f1: 'kept', f2: '3-2' } } },
      { graphic: 'Strap', msg: { t: 'play' } },
      { graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: 'oid-1' } },
    ],
  ]);
  // The marker moves on the answer, not before it.
  assert.deepEqual(r.liveCue(), {});
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  assert.deepEqual(r.log.filter(([k]) => k === 'clearMisses' || k === 'noteStep'), [['clearMisses', 'c1'], ['noteStep', 'c1']]);
});

test('Take marks nothing for a graphic the send left alone: skipped or superseded', async () => {
  for (const left of ['skipped', 'superseded']) {
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

test('a Take pressed again by a Next marks its cue: a Next names no cue (#1696)', async () => {
  const r = rig();
  const taking = r.verbs.take(graphicCue('c1', 'Strap'));
  await settle();
  const nexting = r.verbs.next(sel({ selectedGraphic: 'Strap', selectedLayerLive: true }));
  r.sends[0].answer.resolve({ ...noneLeft, pressedAgain: ['Strap'] });
  await taking;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await nexting;
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
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
  assert.deepEqual(r.sends[0].batches[0][2].msg, { t: 'cue', cue: 'c1', direct: true, auto: { then: 'out', ms: 3000 }, oid: 'oid-1' });
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
  // Each Out is a press on its layer before it goes (E7.1).
  assert.deepEqual(r.log, [['outUnnamed'], ['headsSay', 'slug-1'], ['clearing', true], ['aired', 'Strap', '', 'none'], ['aired', 'Score', '', 'none'], ['send', 'Strap:stop+Strap:cue+Score:stop+Score:cue']]);
  assert.equal(r.sends[0].allOut, true);
  // A clear sounds nothing.
  assert.deepEqual(sentAs(r.sends[0].batches[0][0].msg), { t: 'stop', sound: false });
  // Clearing… holds until the answer; the marker moves only on it.
  assert.deepEqual(r.liveCue(), { Strap: 'c1', Score: 's1' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await clearing;
  assert.deepEqual(r.liveCue(), {});
  assert.deepEqual(r.log.filter(([k]) => k === 'landed'), [['landed', 'Strap', ''], ['landed', 'Score', '']], 'each Out settles its press');
  assert.deepEqual(r.log.filter(([k]) => k === 'headsStillOn' || k === 'clearing').slice(-2), [['headsStillOn', 'slug-1', 'Strap,Score', 5000], ['clearing', false]]);
  assert.deepEqual(r.notes, ['bridge: All out did not clear Score']);
});

test('All out answered with a graphic pressed again keeps that graphic up; a failed All out says it through the Bridge and stops Clearing…', async () => {
  const r = rig({ liveCue: { Strap: 'c1', Score: 's1' } });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1', Score: 's1' } } }));
  const a = r.verbs.allOut();
  await settle();
  // Score is taken again while the All out is on its way.
  const retake = r.verbs.take(graphicCue('s2', 'Score'));
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft, pressedAgain: ['Score'] });
  await a;
  assert.deepEqual(r.liveCue(), { Score: 's1' });
  assert.deepEqual(r.log.find(([k]) => k === 'headsStillOn'), ['headsStillOn', 'slug-1', 'Strap', 5000]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await retake;
  assert.deepEqual(r.liveCue(), { Score: 's2' });

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
  assert.deepEqual(sentAs(r.sends[0].batches), [[{ graphic: 'Strap', msg: { t: 'update', data: { f0: 'tree', f1: 'typed' } } }]]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await updating;
  // Update never moves the marker.
  assert.equal(r.moves(), 0);
});

test('Take and Update carry the place and size read after the wait; without one their update is as it was (playout adjustments)', async () => {
  const before = { v: 1, frame: { dx: 10, dy: 0, s: 1, ox: 0, oy: 0 } };
  const after = { v: 1, frame: { dx: 20, dy: 0, s: 0.95, ox: 120, oy: 961 } };
  const r = rig({ flushHeld: true });
  let look = before;
  r.page.appearanceOf = (cue, graphic) => (cue.id === 'c1' && graphic === 'Strap' ? look : undefined);
  const cue = graphicCue('c1', 'Strap', { f0: 'A' });
  const taking = r.verbs.take(cue);
  await settle();
  // A nudge written while the Take waits for its save: the Take carries the newer one.
  look = after;
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(sentAs(r.sends[0].batches[0][0]), { graphic: 'Strap', msg: { t: 'update', data: { f0: 'A' }, appearance: after } });
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  const updating = r.verbs.update(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }));
  await settle();
  r.flushes[1].resolve();
  await settle();
  assert.deepEqual(sentAs(r.sends[1].batches), [[{ graphic: 'Strap', msg: { t: 'update', data: { f0: 'A' }, appearance: after } }]]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await updating;
  // A cue the page has nothing for: the update carries no field at all.
  look = undefined;
  const plain = r.verbs.update(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }));
  await settle();
  r.flushes[2].resolve();
  await settle();
  assert.equal('appearance' in r.sends[2].batches[0][0].msg, false);
  r.sends[2].answer.resolve({ ...noneLeft });
  await plain;
});

test('a Take waits for a box still being measured, then carries the placement it gives', async () => {
  const placed = { v: 1, frame: { dx: 1270, dy: 0, s: 1, ox: 530, oy: 961 } };
  const r = rig();
  let measuredNow;
  r.page.appearanceOf = () => new Promise((resolve) => (measuredNow = () => resolve(placed)));
  const taking = r.verbs.take(graphicCue('c1', 'Strap', { f0: 'A' }));
  await settle();
  assert.equal(r.sends.length, 0, 'nothing goes while the box is measured');
  measuredNow();
  await settle();
  assert.deepEqual(sentAs(r.sends[0].batches[0][0]).msg.appearance, placed);
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
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

test('an unbound bump counts from what air was sent, sends that one field, and writes the cue once accepted', async () => {
  const r = rig({ flushHeld: true, aired: { Strap: { f3: '7' } } });
  const cue = graphicCue('c1', 'Strap', { f3: '1', f0: 'Name' });
  const bumping = r.verbs.bump(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }), 'f3', 1);
  await settle();
  // The save comes first.
  assert.deepEqual(r.log, [['flush']]);
  r.flushes[0].resolve();
  await settle();
  assert.deepEqual(r.log.slice(1), [['send', 'Strap:update']]);
  assert.deepEqual(sentAs(r.sends[0].batches[0][0].msg), { t: 'update', data: { f3: '8' } });
  r.sends[0].answer.resolve({ ...noneLeft });
  await bumping;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue'), [['writeCue', 'c1', '{"f3":"8"}']]);
});

test('an unbound bump with nothing aired counts from the cue as stored, never a draft staged in PREP, then from 0', async () => {
  const r = rig();
  const cue = graphicCue('c1', 'Strap', { f3: '4' });
  r.draft.c1 = { f3: '50' };
  const one = r.verbs.bump(sel({ editingCue: cue, selectedGraphic: 'Strap', editingIsLive: true }), 'f3', -1);
  await settle();
  assert.deepEqual(r.sends[0].batches[0][0].msg.data, { f3: '3' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await one;
  const two = r.verbs.bump(sel({ editingCue: graphicCue('c2', 'Score'), selectedGraphic: 'Score', editingIsLive: true }), 'f9', 2);
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
  assert.deepEqual(r.log.slice(1), [['send', 'Score:event']]);
  assert.deepEqual(sentAs(r.sends[0].batches[0][0].msg), { t: 'event', event: 'both', payload: { answer: 'typed' } });
  r.sends[0].answer.resolve({ ...noneLeft });
  await pressing;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeLive' || k === 'patch'), [['writeLive', 'a1', '{"home":"5"}'], ['patch', '']]);
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

test('every live press on a graphic waits for the one before it on that graphic, bound or not; another graphic does not wait (F2)', async () => {
  const tree = { Score: { home: '2' } };
  const r = rig({ bound: { Score: { home: 'match.home' } }, tree });
  const first = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
  const second = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
  const third = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), reveal);
  const other = r.verbs.event(sel({ selectedGraphic: 'Clock', selectedLayerLive: true }), { event: 'pause' });
  await settle();
  // The first goal and the other graphic's press are out; the rest of Score's wait, in order.
  assert.deepEqual(r.sends.map((s) => s.batches[0][0].msg.event), ['goal', 'pause']);
  tree.Score.home = '3';
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  await settle();
  assert.equal(r.sends.length, 3);
  assert.equal(r.sends[2].batches[0][0].msg.event, 'goal');
  r.sends[2].answer.resolve({ ...noneLeft });
  await second;
  await settle();
  assert.deepEqual(r.log.filter(([k]) => k === 'patch'), [['patch', 'match.home=3'], ['patch', 'match.home=4']]);
  assert.equal(r.sends[3].batches[0][0].msg.event, 'reveal');
  r.sends[3].answer.resolve({ ...noneLeft });
  r.sends[1].answer.resolve({ ...noneLeft });
  await third;
  await other;
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
  assert.deepEqual(sentAs(r.sends[0].batches), [
    [
      { graphic: 'Quiz', msg: { t: 'snap', snap: { reveal: 'shown' } } },
      { graphic: 'Quiz', msg: { t: 'update', data: { q: 'typed' } } },
    ],
  ]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await snapping;
  // A null group resets every group; with no cue on air the update carries nothing.
  const reset = r.verbs.snap(sel({ selectedGraphic: 'Quiz', selectedLayerLive: true }), null, 'x');
  await settle();
  r.flushes[1].resolve();
  await settle();
  assert.deepEqual(sentAs(r.sends[1].batches[0]), [
    { graphic: 'Quiz', msg: { t: 'snap', snap: null } },
    { graphic: 'Quiz', msg: { t: 'update', data: {} } },
  ]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await reset;
  await r.verbs.snap(sel({ selectedGraphic: 'Quiz', selectedLayerLive: false }), null, 'x');
  assert.equal(r.sends.length, 2);
});

test('no live press sends from a layer airing a cue with typed data, a pinned block\'s included, and each says why (E1.1, L1)', async () => {
  const typed = { v: 1, kind: 'values', standard: OGRAF_STANDARD.commit, schema: 'x', values: { score: 3 } };
  const cue = graphicCue('t1', 'Score', { score: '3' }, { typed });
  const r = rig({ liveCue: { Score: 't1' } });
  // The selection a pinned block presses with: the cue live on its graphic's layer.
  const pinned = liveSelection('Score', [cue], { Score: 't1' });
  assert.equal(pinned.airCue, cue);
  await r.verbs.event(pinned, { event: 'goal', adjust: { score: 1 }, payload: ['score'] });
  await r.verbs.bump(pinned, 'score', 1);
  await r.verbs.snap(pinned, 'reveal', 'shown');
  await settle();
  assert.equal(r.sends.length, 0);
  assert.deepEqual(r.notes, Array(3).fill('T1: Live controls do not reach typed data yet.'));
  // A layer still airing typed data after its cue's switch went off presses nothing either (E1.2a).
  const off = graphicCue('t1', 'Score', { score: '3' });
  const airing = rig({ liveCue: { Score: 't1' }, typedAiring: ['Score'] });
  const stillTyped = liveSelection('Score', [off], { Score: 't1' });
  await airing.verbs.event(stillTyped, { event: 'goal', adjust: { score: 1 }, payload: ['score'] });
  await airing.verbs.bump(stillTyped, 'score', 1);
  await airing.verbs.snap(stillTyped, 'reveal', 'shown');
  await settle();
  assert.equal(airing.sends.length, 0);
  assert.deepEqual(airing.notes, Array(3).fill('T1: Live controls do not reach typed data yet.'));
  // A native cue on the same block presses as before.
  const native = graphicCue('n1', 'Score', { score: '3' });
  const plain = rig({ liveCue: { Score: 'n1' } });
  void plain.verbs.event(liveSelection('Score', [native], { Score: 'n1' }), { event: 'go' });
  await settle();
  assert.equal(plain.sends.length, 1);
});

test('E1.2a: Take and Update of a typed cue send its envelope beside empty native data; refused, nothing goes', async () => {
  const typed = { v: 1, kind: 'values', standard: OGRAF_STANDARD.commit, schema: 'x', values: { score: 3, teams: [{ name: 'H' }] } };
  const cue = graphicCue('t1', 'Score', { score: '3' }, { typed });
  const r = rig({ typedSends: { t1: { status: 'ok', typed } } });
  r.resolved.Score = { score: '9' };
  void r.verbs.take(cue);
  await settle();
  assert.deepEqual(sentAs(r.sends[0].batches[0]).slice(0, 2), [
    { graphic: 'Score', msg: { t: 'update', data: {}, typed } },
    { graphic: 'Score', msg: { t: 'play' } },
  ]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await settle();
  const live = sel({ selectedCue: cue, selectedGraphic: 'Score', selectedLayerLive: true, editingCue: cue, editingIsLive: true });
  void r.verbs.update(live);
  await settle();
  assert.deepEqual(sentAs(r.sends[1].batches[0]), [{ graphic: 'Score', msg: { t: 'update', data: {}, typed } }]);
  // Refused (invalid data, an output that cannot read it): nothing is sent, and the note says why.
  const no = rig({ typedSends: { t1: { status: 'refused', reason: 'score: above the maximum 9.' } } });
  await no.verbs.take(cue);
  void no.verbs.update(live);
  await settle();
  assert.equal(no.sends.length, 0);
  assert.deepEqual(no.notes, ['T1: score: above the maximum 9.', 'T1: score: above the maximum 9.']);
  // A page that sends no typed data refuses a typed cue rather than air its native strings.
  const old = rig();
  await old.verbs.take(cue);
  await settle();
  assert.equal(old.sends.length, 0);
  assert.deepEqual(old.notes, ['T1: Typed data does not go on air from here.']);
  // A native cue is sent exactly as before: no `typed` member.
  const plain = rig({ typedSends: {} });
  void plain.verbs.take(graphicCue('n1', 'Score', { score: '3' }));
  await settle();
  assert.deepEqual(sentAs(plain.sends[0].batches[0])[0], { graphic: 'Score', msg: { t: 'update', data: { score: '3' } } });
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

test('a press whose save wait ends after the production closed moves nothing here; only All out still clears what it named', async () => {
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
  // All out pressed before the end still clears what it named, and its answer moves nothing here.
  const d = rig({ liveCue: { Strap: 'c1' } });
  d.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1' } } }));
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
  await settle();
  assert.deepEqual(d.sends.map((x) => x.allOut), [true]);
  // A failed clear after the end does not go on to clear through the Bridge.
  d.sends[0].answer.reject(new Error('down'));
  await clearing;
  assert.ok(!d.notes.some((n) => n.startsWith('bridge:')));
  assert.deepEqual(d.liveCue(), { Strap: 'c1' });
});

test('the gaps the assessment found: what each press keeps, counts and says', async (t) => {
  await t.test('a Take sends with the page of its press across the save wait', async () => {
    const r = rig({ flushHeld: true });
    const taking = r.verbs.take(graphicCue('c1', 'Strap'));
    await settle();
    r.state.sender = { ...r.sender, published: 'slug-2' };
    r.flushes[0].resolve();
    await settle();
    assert.equal(r.sends[0].slug, 'slug-1');
    r.sends[0].answer.resolve({ ...noneLeft });
    await taking;
  });
  await t.test('three bound presses each count from the tree the one before left', async () => {
    const tree = { Score: { home: '2' } };
    const r = rig({ bound: { Score: { home: 'match.home' } }, tree });
    const writes = [];
    r.page.patchBound = (w) => {
      tree.Score.home = w[0].text;
      const h = held();
      writes.push(h);
      return h.promise;
    };
    const v = sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true });
    const presses = [r.verbs.bump(v, 'home', 1), r.verbs.bump(v, 'home', 1), r.verbs.bump(v, 'home', 1)];
    for (let i = 0; i < 3; i += 1) {
      await settle();
      assert.equal(writes.length, i + 1);
      writes[i].resolve();
    }
    await Promise.all(presses);
    assert.equal(tree.Score.home, '5');
  });
  await t.test('a press made after the first settled still waits for the second, still pending', async () => {
    const tree = { Score: { home: '2' } };
    const r = rig({ bound: { Score: { home: 'match.home' } }, tree });
    const writes = [];
    r.page.patchBound = (w) => {
      tree.Score.home = w[0].text;
      const h = held();
      writes.push(h);
      return h.promise;
    };
    const v = sel({ editingCue: graphicCue('s1', 'Score'), selectedGraphic: 'Score', editingIsLive: true });
    const first = r.verbs.bump(v, 'home', 1);
    const second = r.verbs.bump(v, 'home', 1);
    await settle();
    writes[0].resolve();
    await first;
    await settle();
    // The second is writing; a third pressed now waits for it.
    assert.equal(writes.length, 2);
    const third = r.verbs.bump(v, 'home', 1);
    await settle();
    assert.equal(writes.length, 2);
    writes[1].resolve();
    await second;
    await settle();
    assert.equal(writes.length, 3);
    writes[2].resolve();
    await third;
    assert.equal(tree.Score.home, '5');
  });
  await t.test('a bound key an event moves counts from the tree, not from what air shows', async () => {
    const r = rig({ bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '7' } }, aired: { Score: { home: '1' } } });
    const pressing = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), goal);
    await settle();
    r.sends[0].answer.resolve({ ...noneLeft });
    await pressing;
    assert.deepEqual(r.log.filter(([k]) => k === 'patch'), [['patch', 'match.home=8']]);
  });
  await t.test('an event that moves no bound field never waits on the tree being read', async () => {
    const r = rig();
    r.page.boundReady = () => false;
    const pressing = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true }), reveal);
    await settle();
    assert.equal(r.sends.length, 1);
    r.sends[0].answer.resolve({ ...noneLeft });
    await pressing;
  });
  await t.test('a landed send that leaves a debt keeps the owed mark; No output needs a play', async () => {
    const r = rig();
    r.setOwed(1);
    r.state.sender = { ...r.sender, outputUsable: () => false };
    const a = r.verbs.send([[{ graphic: 'Strap', msg: { t: 'update', data: {} } }]], 'Update');
    r.sends[0].answer.resolve({ ...noneLeft });
    await a;
    assert.deepEqual(r.log.filter(([k]) => k === 'owed'), [['owed', true]]);
    assert.equal(r.log.filter(([k]) => k === 'noOutput').length, 0);
  });
  await t.test('a server Next goes only while the server cue is up', async () => {
    const r = rig();
    await r.verbs.next(sel({ selectedCue: serverCue('v1'), selectedPlayoutLive: false, selectedGraphic: 'Strap', selectedLayerLive: true }));
    assert.deepEqual(r.log, []);
    assert.equal(r.sends.length, 0);
  });
  await t.test('taking a graphic off reads the render the removal was pressed in, not the part', async () => {
    const r = rig({ liveCue: {} });
    r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1' } } }));
    await r.verbs.takeOff('Strap');
    assert.equal(r.sends.length, 0);
  });
  await t.test('a failed Update or event says which press failed', async () => {
    const r = rig();
    const live = sel({ editingCue: graphicCue('c1', 'Strap'), selectedGraphic: 'Strap', editingIsLive: true, selectedLayerLive: true });
    const u = r.verbs.update(live);
    await settle();
    r.sends[0].answer.reject(new Error('x'));
    await u;
    const e = r.verbs.event(live, { event: 'go' });
    await settle();
    r.sends[1].answer.reject(new Error('y'));
    await e;
    assert.deepEqual(r.notes, ['Update failed: x', 'Event go failed: y']);
  });
  await t.test('an adjust event writes the moved figure into the on-air cue once its send is accepted', async () => {
    const r = rig({ aired: { Score: { home: '4' } } });
    const pressing = r.verbs.event(sel({ selectedGraphic: 'Score', selectedLayerLive: true, airCue: graphicCue('a1', 'Score') }), goal);
    await settle();
    assert.equal(r.log.find(([k]) => k === 'writeLive'), undefined);
    r.sends[0].answer.resolve({ ...noneLeft });
    await pressing;
    assert.deepEqual(r.log.find(([k]) => k === 'writeLive'), ['writeLive', 'a1', '{"home":"5"}']);
  });
});

// ── Live candidates (E7.1, docs/work-specs/playout-election-package/spec.md) ───────────────────

const candidate = (values, revision = 4) => ({ status: 'ok', selection: { v: 1, recipe: 'r1', key: ['D1', 7] }, entity: '["D1",7]', revision, values });

test('a Take of a live candidate airs its resolved values over the cue and the tree, and captures it at the press', async () => {
  const r = rig({ selections: { a: candidate({ f0: 'Aino Aalto', f1: '1200' }) } });
  r.resolved.Strap = { f1: 'bound', f2: 'tree' };
  const taking = r.verbs.take(graphicCue('a', 'Strap', { f0: 'prepared', f1: 'prepared', f3: 'own' }));
  await settle();
  assert.deepEqual(r.log.find(([k]) => k === 'aired'), ['aired', 'Strap', 'a', 'ok'], 'captured before the answer');
  assert.deepEqual(r.sends[0].batches[0][0].msg.data, { f0: 'Aino Aalto', f1: '1200', f2: 'tree', f3: 'own' });
  assert.equal(r.log.some(([k]) => k === 'landed'), false, 'pending until the answer');
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  assert.equal(r.log.some(([k]) => k === 'unaired'), false);
  const marked = r.log.findIndex(([k]) => k === 'landed');
  assert.ok(marked > 0, 'landed once answered');
  assert.equal(r.liveCue().Strap, 'a', 'the marker moved by then');
});

test('a Take of a candidate that is not ready sends nothing and says why; a failed send gives the capture back', async () => {
  const r = rig({ selections: { b: { status: 'refused', reason: 'Not ready: revision 4 has no district "D2", candidate 7.' } } });
  await r.verbs.take(graphicCue('b', 'Strap', { f0: 'prepared' }));
  assert.equal(r.sends.length, 0);
  assert.equal(r.log.some(([k]) => k === 'aired'), false);
  assert.deepEqual(r.notes, ['B: Not ready: revision 4 has no district "D2", candidate 7.']);

  const f = rig({ selections: { a: candidate({ f0: 'Aino Aalto' }) } });
  const taking = f.verbs.take(graphicCue('a', 'Strap', {}));
  await settle();
  f.sends[0].answer.reject(new Error('boom'));
  await taking;
  assert.deepEqual(f.log.find(([k]) => k === 'unaired'), ['unaired', 'Strap', 'a']);
});

test('Update moves an aired cue to its new selection only once the whole replacement resolves', async () => {
  const live = { liveCue: { Strap: 'a' } };
  const r = rig({ ...live, selections: { a: candidate({ f0: 'Bertta Berg' }, 5) } });
  const updating = r.verbs.update(sel({ editingCue: graphicCue('a', 'Strap', { f0: 'prepared' }), selectedGraphic: 'Strap', editingIsLive: true }));
  await settle();
  assert.deepEqual(sentAs(r.sends[0].batches[0][0].msg), { t: 'update', data: { f0: 'Bertta Berg' } });
  assert.deepEqual(r.log.find(([k]) => k === 'aired'), ['aired', 'Strap', 'a', 'ok']);
  r.sends[0].answer.resolve({ ...noneLeft });
  await updating;
  assert.deepEqual(r.log.find(([k]) => k === 'landed'), ['landed', 'Strap', 'a']);

  const failed = rig({ ...live, selections: { a: candidate({ f0: 'Bertta Berg' }, 5) } });
  const failing = failed.verbs.update(sel({ editingCue: graphicCue('a', 'Strap', {}), selectedGraphic: 'Strap', editingIsLive: true }));
  await settle();
  failed.sends[0].answer.reject(new Error('boom'));
  await failing;
  assert.deepEqual(failed.log.find(([k]) => k === 'unaired'), ['unaired', 'Strap', 'a'], 'a failed Update gives its capture back');
  assert.equal(failed.log.some(([k]) => k === 'landed'), false);

  const refused = rig({ ...live, selections: { a: { status: 'refused', reason: 'Not ready: the collection is not JSON.' } } });
  await refused.verbs.update(sel({ editingCue: graphicCue('a', 'Strap', { f0: 'prepared' }), selectedGraphic: 'Strap', editingIsLive: true }));
  assert.equal(refused.sends.length, 0, 'the aired cue keeps what it airs');
  assert.equal(refused.log.some(([k]) => k === 'aired'), false);
  assert.deepEqual(refused.notes, ['A: Not ready: the collection is not JSON.']);
});

test('a candidate Take or Update a later press overtook (skipped or superseded) gives its capture back; one pressed again after it lands', async () => {
  const live = { liveCue: { Strap: 'a' } };
  for (const [left, lands] of [['skipped', false], ['superseded', false], ['pressedAgain', true]]) {
    const t = rig({ selections: { a: candidate({ f0: 'Aino Aalto' }) } });
    const taking = t.verbs.take(graphicCue('a', 'Strap', {}));
    await settle();
    t.sends[0].answer.resolve({ ...noneLeft, [left]: ['Strap'] });
    await taking;
    assert.equal(t.log.some(([k]) => k === (lands ? 'landed' : 'unaired')), true, `Take, ${left}`);
    assert.equal(t.log.some(([k]) => k === (lands ? 'unaired' : 'landed')), false, `Take, ${left}`);

    const u = rig({ ...live, selections: { a: candidate({ f0: 'Bertta Berg' }, 5) } });
    const updating = u.verbs.update(sel({ editingCue: graphicCue('a', 'Strap', {}), selectedGraphic: 'Strap', editingIsLive: true }));
    await settle();
    u.sends[0].answer.resolve({ ...noneLeft, [left]: ['Strap'] });
    await updating;
    assert.equal(u.log.some(([k]) => k === (lands ? 'landed' : 'unaired')), true, `Update, ${left}`);
    assert.equal(u.log.some(([k]) => k === (lands ? 'unaired' : 'landed')), false, `Update, ${left}`);
  }
});

test('Snap and an event on an aired candidate send what its instance shows, never the prepared text; without an instance they leave those fields alone', async () => {
  const airCue = graphicCue('a', 'Strap', { f0: 'prepared', f1: 'prepared', f2: 'own' });
  const view = sel({ selectedGraphic: 'Strap', selectedLayerLive: true, airCue });
  const r = rig({ liveCue: { Strap: 'a' }, candidates: { a: ['f0', 'f1'] }, airedCandidates: { 'Strap:a': { f0: 'Aino Aalto', f1: '1200' } } });
  const snapping = r.verbs.snap(view, null, 'enter');
  await settle();
  assert.deepEqual(r.sends[0].batches[0][1].msg.data, { f0: 'Aino Aalto', f1: '1200', f2: 'own' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await snapping;

  const bare = rig({ liveCue: { Strap: 'a' }, candidates: { a: ['f0', 'f1'] } });
  const again = bare.verbs.snap(view, null, 'enter');
  await settle();
  assert.deepEqual(bare.sends[0].batches[0][1].msg.data, { f2: 'own' });
  bare.sends[0].answer.resolve({ ...noneLeft });
  await again;
});

test('Snap and an event on an ordinary cue leave alone the fields of a candidate whose Take is out on the layer (E7.1)', async () => {
  const airCue = graphicCue('plain', 'Strap', { f0: 'prepared', f1: 'prepared', f2: 'own' });
  const view = sel({ selectedGraphic: 'Strap', selectedLayerLive: true, airCue });
  const r = rig({ liveCue: { Strap: 'plain' }, airedFields: { Strap: ['f0', 'f1'] } });
  const snapping = r.verbs.snap(view, null, 'enter');
  await settle();
  assert.deepEqual(r.sends[0].batches[0][1].msg.data, { f2: 'own' }, 'the candidate that may have aired keeps its fields');
  r.sends[0].answer.resolve({ ...noneLeft });
  await snapping;
  const e = rig({ liveCue: { Strap: 'plain' }, airedFields: { Strap: ['f0', 'f1'] } });
  const pressing = e.verbs.event(view, { event: 'flash', payload: ['f0', 'f2'] });
  await settle();
  assert.equal(JSON.stringify(e.sends[0]?.batches ?? []).includes('prepared'), false, 'nor does an event that reads them');
  e.sends[0]?.answer.resolve({ ...noneLeft });
  await pressing;
});

test('± on a live candidate\'s field sends nothing and writes nothing: it comes from its source', async () => {
  const r = rig({ liveCue: { Strap: 'a' }, candidates: { a: ['f1'] } });
  await r.verbs.bump(sel({ editingCue: graphicCue('a', 'Strap', { f1: '5' }), selectedGraphic: 'Strap', editingIsLive: true }), 'f1', 1);
  assert.equal(r.sends.length, 0);
  assert.equal(r.log.some(([k]) => k === 'writeCue'), false);
  assert.deepEqual(r.notes, ['F1 shows a live candidate, so it comes from its source.']);
});

test('± on a field of the candidate the layer airs sends nothing, and a Take landing during the save wait is asked about again (E7.1)', async () => {
  // Not awaited: a send would wait on its answer, so the test reads what left after a tick.
  const r = rig({ liveCue: { Strap: 'plain' }, airedFields: { Strap: ['f1'] } });
  void r.verbs.bump(sel({ editingCue: graphicCue('plain', 'Strap', { f1: '5' }), selectedGraphic: 'Strap', editingIsLive: true }), 'f1', 1);
  await settle();
  assert.deepEqual([r.sends.length, r.notes], [0, ['F1 shows a live candidate, so it comes from its source.']]);
  const fields = {};
  const w = rig({ flushHeld: true, liveCue: { Strap: 'plain' }, airedFields: fields });
  const bumping = w.verbs.bump(sel({ editingCue: graphicCue('plain', 'Strap', { f1: '5' }), selectedGraphic: 'Strap', editingIsLive: true }), 'f1', 1);
  await settle();
  fields.Strap = ['f1'];
  w.flushes[0].resolve();
  await settle();
  void bumping;
  assert.deepEqual([w.sends.length, w.log.some(([k]) => k === 'writeCue')], [0, false], 'nothing sent or written');
  const eventFields = {};
  const e = rig({ flushHeld: true, liveCue: { Strap: 'plain' }, airedFields: eventFields });
  const pressing = e.verbs.event(sel({ selectedGraphic: 'Strap', selectedLayerLive: true, airCue: graphicCue('plain', 'Strap', { f1: '5' }) }), { event: 'bump', adjust: { f1: 1 } });
  await settle();
  eventFields.Strap = ['f1'];
  e.flushes[0].resolve();
  await settle();
  void pressing;
  assert.deepEqual([e.sends.length, e.notes], [0, ['F1 shows a live candidate, so it comes from its source.']], 'nor an event');
});

test('an event that moves a live candidate\'s field sends nothing; one that only reads it goes (E7.1)', async () => {
  const airCue = graphicCue('a', 'Strap', { f1: '1200' });
  const view = sel({ selectedGraphic: 'Strap', selectedLayerLive: true, airCue });
  const r = rig({ liveCue: { Strap: 'a' }, candidates: { a: ['f1'] }, airedCandidates: { 'Strap:a': { f1: '1200' } } });
  await r.verbs.event(view, { event: 'bump', adjust: { f1: 1 } });
  assert.equal(r.sends.length, 0);
  assert.deepEqual(r.notes, ['F1 shows a live candidate, so it comes from its source.']);
  const reading = r.verbs.event(view, { event: 'show', payload: ['f1'] });
  await settle();
  assert.deepEqual(sentAs(r.sends[0].batches[0][0].msg), { t: 'event', event: 'show', payload: { f1: '1200' } });
  r.sends[0].answer.resolve({ ...noneLeft });
  await reading;
});

test('an event cannot move the aired candidate\'s field even when its cue is gone and a sibling is selected (E7.1)', async () => {
  const r = rig({ liveCue: { Strap: 'gone' }, airedFields: { Strap: ['f1'] } });
  await r.verbs.event(sel({ selectedGraphic: 'Strap', selectedLayerLive: true, airCue: null }), { event: 'bump', adjust: { f1: 1 } });
  assert.equal(r.sends.length, 0);
  assert.deepEqual(r.notes, ['F1 shows a live candidate, so it comes from its source.']);
});

// ── The live marker after presses that overtake and fail (#1696) ───────────────────────────────

/** Take then answer later: the held send, by its press order. */
const pressTake = async (r, id, graphic = 'Strap') => {
  const taking = r.verbs.take(graphicCue(id, graphic));
  await settle();
  const send = r.sends.at(-1);
  return { taking, send, oid: send.batches.flat().find((i) => i.msg.t === 'cue').msg.oid };
};

test('an earlier Take lands, a later one overtakes it and fails: the marker names the earlier cue, in either answer order (#1696)', async () => {
  for (const fast of [true, false]) {
    for (const laterFirst of [false, true]) {
      const r = rig({ fast });
      const a = await pressTake(r, 'c1');
      const b = await pressTake(r, 'c2');
      if (fast) assert.deepEqual(r.liveCue(), { Strap: 'c2' }, 'the fast road moved it at the press');
      const answers = [() => a.send.answer.resolve({ ...noneLeft, pressedAgain: ['Strap'] }), () => b.send.answer.reject(new Error('refused'))];
      for (const answer of laterFirst ? answers.reverse() : answers) {
        answer();
        await settle();
        // Landed first, the earlier Take does not mark under the later press still out.
        if (!laterFirst && fast && answer === answers[0]) assert.deepEqual(r.liveCue(), { Strap: 'c2' });
      }
      await Promise.all([a.taking, b.taking]);
      assert.deepEqual(r.liveCue(), { Strap: 'c1' }, `fast ${fast}, later answered first ${laterFirst}`);
      assert.deepEqual(r.verbs.markersOut(), []);
    }
  }
});

test('a late older answer never marks over a newer landed one, landed or failed (#1696)', async () => {
  for (const older of ['landed', 'failed']) {
    const r = rig({ fast: true });
    const a = await pressTake(r, 'c1');
    const b = await pressTake(r, 'c2');
    b.send.answer.resolve({ ...noneLeft });
    await b.taking;
    assert.deepEqual(r.liveCue(), { Strap: 'c2' });
    if (older === 'landed') a.send.answer.resolve({ ...noneLeft, skipped: ['Strap'] });
    else a.send.answer.reject(new Error('refused'));
    await a.taking;
    assert.deepEqual(r.liveCue(), { Strap: 'c2' }, older);
  }
});

test('a failed Take or Out puts back what was on air before it; another screen\'s marker since stays (#1696)', async () => {
  const r = rig({ fast: true });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const a = await pressTake(r, 'c1');
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  assert.deepEqual(r.verbs.markersOut(), ['Strap']);
  a.send.answer.reject(new Error('refused'));
  await a.taking;
  assert.deepEqual(r.liveCue(), { Strap: 'c0' });
  const out = r.verbs.out(sel({ selectedGraphic: 'Strap', selectedLayerLive: true }));
  assert.deepEqual(r.liveCue(), {});
  r.sends[1].answer.reject(new Error('down'));
  await out;
  assert.deepEqual(r.liveCue(), { Strap: 'c0' });

  // Another screen took x1 while this page's Take was out: its failure leaves x1.
  const b = await pressTake(r, 'c2');
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'x1' } } }));
  b.send.answer.reject(new Error('refused'));
  await b.taking;
  assert.deepEqual(r.liveCue(), { Strap: 'x1' });
  // Another screen takes a cue a press of this page still out also names (Codex review): heard,
  // it stands when this page's presses are refused.
  const q = rig({ fast: true });
  q.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const one = await pressTake(q, 'c1');
  const two = await pressTake(q, 'c2');
  const theirs = [{ graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: 'theirs' } }];
  for (const item of q.verbs.heard(theirs)) q.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
  assert.deepEqual(q.liveCue(), { Strap: 'c1' });
  one.send.answer.reject(new Error('refused'));
  two.send.answer.reject(new Error('refused'));
  await Promise.all([one.taking, two.taking]);
  assert.deepEqual(q.liveCue(), { Strap: 'c1' });
  // Another screen's x1 heard, then a later press of this page over it; both fail: x1 again.
  const z = rig({ fast: true });
  z.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const first = await pressTake(z, 'c1');
  for (const item of z.verbs.heard([{ graphic: 'Strap', msg: { t: 'cue', cue: 'x1', oid: 'theirs' } }])) z.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
  const second = await pressTake(z, 'c2');
  assert.deepEqual(z.liveCue(), { Strap: 'c2' });
  first.send.answer.reject(new Error('refused'));
  second.send.answer.reject(new Error('refused'));
  await Promise.all([first.taking, second.taking]);
  assert.deepEqual(z.liveCue(), { Strap: 'x1' });

  // A press that got no answer committed after another screen's x1 (an All out is never refused;
  // a Take can be based on a head learned from a refusal): rows come in log order, so its row after
  // x1's is the newer, and marks.
  const noAnswer = () => Object.assign(new Error('the server did not answer'), { unanswered: true });
  const heardRows = (rig_, rows) => {
    for (const item of rig_.verbs.heard(rows, () => false)) rig_.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
  };
  const allOut = rig({ fast: true });
  allOut.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const { clearCueItems } = await import('../src/control/cueItems.ts');
  const clearing = allOut.verbs.send([clearCueItems('Strap')], 'All out', true);
  await settle();
  const outOid = allOut.sends[0].batches.flat().find((i) => i.msg.t === 'cue').msg.oid;
  allOut.sends[0].answer.reject(noAnswer());
  await clearing;
  heardRows(allOut, [{ graphic: 'Strap', msg: { t: 'cue', cue: 'x1', oid: 'theirs' } }]);
  heardRows(allOut, [{ graphic: 'Strap', msg: { t: 'cue', cue: null, oid: outOid } }]);
  assert.deepEqual(allOut.liveCue(), {}, 'All out committed after x1');
  const based = rig({ fast: true });
  const refused = await pressTake(based, 'c1');
  refused.send.answer.reject(Object.assign(new Error('stale'), { stale: true }));
  await refused.taking;
  const lost = await pressTake(based, 'c2');
  lost.send.answer.reject(noAnswer());
  await lost.taking;
  heardRows(based, [{ graphic: 'Strap', msg: { t: 'cue', cue: 'x1', oid: 'theirs' } }]);
  heardRows(based, [{ graphic: 'Strap', msg: { t: 'cue', cue: 'c2', oid: lost.oid } }]);
  assert.deepEqual(based.liveCue(), { Strap: 'c2' }, 'a Take based on the learned head');

  // The second arrival of another screen's marker the page already applied moves nothing: this
  // page's refused press still gives back what stood.
  const d = rig({ fast: true });
  d.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const take = await pressTake(d, 'c1');
  const echo = [{ graphic: 'Strap', msg: { t: 'cue', cue: 'c0', oid: 'theirs' } }];
  assert.deepEqual(d.verbs.heard(echo, () => true), echo);
  take.send.answer.reject(new Error('refused'));
  await take.taking;
  assert.deepEqual(d.liveCue(), { Strap: 'c0' });
});

test('a Take that got no answer goes back off the marker, and its row heard later marks it while it is still the newest press (#1696)', async () => {
  const noAnswer = () => Object.assign(new Error('the server did not answer'), { unanswered: true });
  const r = rig({ fast: true });
  const a = await pressTake(r, 'c1');
  a.send.answer.reject(noAnswer());
  await a.taking;
  assert.deepEqual(r.liveCue(), {});
  r.verbs.heard([{ graphic: 'Score', msg: { t: 'cue', cue: 'c1', oid: a.oid } }, { graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: 'other' } }], () => true);
  assert.deepEqual(r.liveCue(), {}, 'only its own row, on its own graphic');
  r.verbs.heard([{ graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: a.oid } }], () => true);
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });

  // A newer press since: the older row heard late moves nothing.
  const r2 = rig({ fast: true });
  const b = await pressTake(r2, 'c1');
  b.send.answer.reject(noAnswer());
  await b.taking;
  const c = await pressTake(r2, 'c2');
  c.send.answer.resolve({ ...noneLeft });
  await c.taking;
  r2.verbs.heard([{ graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: b.oid } }], () => true);
  assert.deepEqual(r2.liveCue(), { Strap: 'c2' });
});

test('a late row of an older press never marks over a newer one that landed; with every newer press failed, it marks (#1696)', async () => {
  const noAnswer = () => Object.assign(new Error('the server did not answer'), { unanswered: true });
  // The first press of each rig below is the Take of c1, so its row carries the first marker's id.
  const row = [{ graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: 'oid-1' } }];
  // Committed, answer lost; a newer Take lands before its row arrives.
  const r = rig({ fast: true });
  const a = await pressTake(r, 'c1');
  const b = await pressTake(r, 'c2');
  a.send.answer.reject(noAnswer());
  b.send.answer.resolve({ ...noneLeft });
  await Promise.all([a.taking, b.taking]);
  r.verbs.heard(row, () => true);
  assert.deepEqual(r.liveCue(), { Strap: 'c2' });

  // No answer, then a newer Take is refused: the row heard later marks the older cue.
  for (const order of ['answered first', 'pressed while out']) {
    const q = rig({ fast: true });
    const one = await pressTake(q, 'c1');
    if (order === 'answered first') one.send.answer.reject(noAnswer());
    const two = await pressTake(q, 'c2');
    if (order !== 'answered first') one.send.answer.reject(noAnswer());
    two.send.answer.reject(new Error('refused'));
    await Promise.all([one.taking, two.taking]);
    assert.deepEqual(q.liveCue(), {}, order);
    q.verbs.heard(row, () => true);
    assert.deepEqual(q.liveCue(), { Strap: 'c1' }, order);
  }

  // Heard while a newer Take is out: that Take's answer decides, and its failure leaves this one.
  const t = rig({ fast: true });
  const older = await pressTake(t, 'c1');
  older.send.answer.reject(noAnswer());
  await older.taking;
  const newer = await pressTake(t, 'c2');
  t.verbs.heard(row, () => true);
  assert.deepEqual(t.liveCue(), { Strap: 'c2' }, 'not under the newer press still out');
  newer.send.answer.reject(new Error('refused'));
  await newer.taking;
  assert.deepEqual(t.liveCue(), { Strap: 'c1' });
});

test('a send of two batches on one graphic books each: the first lands, the second fails, the marker shows the first (#1696)', async () => {
  const { clearCueItems, takeCueItems } = await import('../src/control/cueItems.ts');
  const r = rig({ fast: true });
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const sending = r.verbs.send([clearCueItems('Strap'), takeCueItems({ id: 'c1', graphic: 'Strap', values: {} })], 'Out, then Next');
  await settle();
  assert.deepEqual(r.liveCue(), { Strap: 'c1' });
  r.sends[0].answer.reject(Object.assign(new Error('refused'), { landed: 1 }));
  await sending;
  assert.deepEqual(r.liveCue(), {});
});

test("this page's own cue markers heard back are the sender's on a graphic it pressed; a marker from an earlier mount of the page is applied (#1696)", async () => {
  const r = rig({ fast: true });
  const a = await pressTake(r, 'c1');
  a.send.answer.resolve({ ...noneLeft });
  await a.taking;
  const rows = [
    { graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: a.oid } },
    { graphic: 'Strap', msg: { t: 'play', oid: a.oid } },
    { graphic: 'Strap', msg: { t: 'cue', cue: 'x1', oid: 'theirs' } },
    { graphic: 'Score', msg: { t: 'cue', cue: 's0', oid: 'earlier' } },
  ];
  assert.deepEqual(r.verbs.heard(rows), rows.slice(1));
  // Reopened: the new sender sent none of them, so the page applies them all.
  assert.deepEqual(rig().verbs.heard(rows), rows);

  // Reopened, a Take of the new sender on the graphic refused, or still out and then refused: the
  // earlier mount's committed Take, heard late, is applied, and stays.
  for (const when of ['after', 'while out']) {
    const n = rig({ fast: true });
    n.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
    const take = await pressTake(n, 'c2');
    const earlier = [{ graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: 'earlier' } }];
    const hearIt = () => {
      for (const item of n.verbs.heard(earlier)) n.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
    };
    if (when === 'while out') hearIt();
    take.send.answer.reject(new Error('refused'));
    await take.taking;
    if (when === 'after') hearIt();
    assert.deepEqual(n.liveCue(), { Strap: 'c1' }, when);
  }

  // Reopened, the new sender takes the same cue again while the earlier mount's Take of it is still
  // out; the earlier one's row is heard, then the new Take is refused: c1 airs, and stays marked.
  const same = rig({ fast: true });
  same.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c0' } } }));
  const retake = await pressTake(same, 'c1');
  for (const item of same.verbs.heard([{ graphic: 'Strap', msg: { t: 'cue', cue: 'c1', oid: 'earlier' } }], () => false)) same.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
  retake.send.answer.reject(new Error('refused'));
  await retake.taking;
  assert.deepEqual(same.liveCue(), { Strap: 'c1' }, 'same cue retaken');
});

test('a batch that landed but left a graphic alone, then a later batch failing: that graphic keeps its marker (#1696)', async () => {
  const { clearCueItems } = await import('../src/control/cueItems.ts');
  const r = rig();
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Strap: 'c1', Score: 's1' } } }));
  const sending = r.verbs.send([clearCueItems('Strap'), clearCueItems('Score')], 'All out', true);
  await settle();
  // The first batch landed with Strap skipped (a newer press of this page stood there); the second
  // failed.
  r.sends[0].answer.reject(Object.assign(new Error('refused'), { landed: 1, skipped: ['Strap'] }));
  await sending;
  assert.deepEqual(r.liveCue(), { Strap: 'c1', Score: 's1' });
});

test('a send that throws before it goes leaves no marker press out (#1696)', async () => {
  const r = rig();
  r.sender.armSpecFor = () => {
    throw new Error('bad spec');
  };
  await assert.rejects(r.verbs.take(graphicCue('c1', 'Strap')), /bad spec/);
  assert.deepEqual(r.verbs.markersOut(), []);
});

/** A seeded generator (mulberry32), so a failing walk can be replayed by its seed. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const MARKER_WALKS = Number(process.env.MARKER_WALKS ?? 2000);

/**
 * One walk: Takes and Outs on two graphics, each committed by a model server (protocol 2: a press
 * older than one it applied is skipped), answered late and out of order, refused, or never answered
 * (committed or not, and then perhaps committed late, its row heard whenever it comes). Whenever no
 * marker press is out on a graphic, the marker names what its output shows, which is the cue of
 * this page's newest press that landed there.
 */
async function markerWalk(seed, steps) {
  const random = rng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const r = rig({ fast: random() < 0.5 });
  const graphics = ['Strap', 'Score'];
  const applied = {};
  const output = {};
  const presses = [];
  const trace = [];
  /** Per graphic, another screen's newest Take: the cue, and how many presses of this page came before it. */
  const foreign = {};
  let foreignRows = 0;
  const check = (when) => {
    for (const g of graphics) {
      const open = presses.some((p) => p.graphic === g && !p.answered);
      assert.equal(r.verbs.markersOut().includes(g), open, `seed ${seed} ${when}: markersOut ${g}\n${trace.join('\n')}`);
      // Out, or landed with its answer lost and its row not heard yet: nothing here can know.
      if (open || presses.some((p) => p.graphic === g && p.lost && p.reached && !p.heard)) continue;
      const landed = presses.filter((p) => p.graphic === g && p.reached).at(-1);
      const theirs = foreign[g] && (!landed || landed.n <= foreign[g].after) ? foreign[g] : null;
      assert.equal(theirs ? theirs.cue : landed ? landed.cue : null, output[g] ?? null, `seed ${seed}: the model`);
      assert.equal(r.liveCue()[g] ?? null, output[g] ?? null, `seed ${seed} ${when}: marker on ${g}\n${trace.join('\n')}`);
    }
  };
  // The page applies what the sender hands back, as `claimAndApply` would a row never claimed (a
  // slow-road press of this page is claimed only by its row).
  // Rows arrive in commit order (the durable road): hearing one hears every earlier one first.
  const hear = (p) => {
    for (const q of presses.filter((o) => o !== p && o.graphic === p.graphic && o.reached && !o.heard && o.order < p.order).sort((a, b) => a.order - b.order)) {
      q.heard = true;
      hearOne(q);
    }
    hearOne(p);
  };
  const hearOne = (p) => {
    const rest = r.verbs.heard([{ graphic: p.graphic, msg: { t: 'cue', cue: p.cue, oid: `oid-${p.n}` } }], () => false);
    for (const item of rest) r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
  };
  let commits = 0;
  const commit = (p) => {
    p.committed = true;
    p.order = commits += 1;
    p.reached = p.n > (applied[p.graphic] ?? 0);
    if (p.reached) {
      applied[p.graphic] = p.n;
      output[p.graphic] = p.cue;
    }
  };
  for (let step = 0; step < steps; step++) {
    const open = presses.filter((p) => !p.answered);
    const uncommitted = open.filter((p) => !p.committed);
    // A row still to come: of a press whose answer was lost, or of any press that landed.
    const late = presses.filter((p) => !p.heard && (p.lost || p.reached));
    // Another screen's Take, on a graphic where no press of this page has committed with its answer
    // or row still to come (one that did is the documented trap: its late answer marks over it).
    const calm = graphics.filter((g) => !presses.some((p) => p.graphic === g && p.committed && p.reached && !p.answered));
    const kinds = ['press', 'press', ...(uncommitted.length ? ['commit', 'commit', 'refuse'] : []), ...(open.length ? ['lose'] : []), ...(open.some((p) => p.committed) ? ['answer', 'answer'] : []), ...(late.length ? ['late', 'late'] : []), ...(calm.length ? ['foreign'] : [])];
    const kind = pick(kinds);
    let acted;
    if (kind === 'press') {
      const graphic = pick(graphics);
      const cue = random() < 0.25 ? null : pick(['c1', 'c2', 'c3']);
      const done = cue ? r.verbs.take(graphicCue(cue, graphic)) : r.verbs.out(sel({ selectedGraphic: graphic, selectedLayerLive: true }));
      await settle();
      presses.push((acted = { n: presses.length + 1, graphic, cue, send: r.sends[presses.length], done }));
    } else if (kind === 'commit') {
      commit((acted = pick(uncommitted)));
    } else if (kind === 'answer') {
      const p = (acted = pick(open.filter((q) => q.committed)));
      p.answered = true;
      p.send.answer.resolve({ ...noneLeft, skipped: p.reached ? [] : [p.graphic] });
    } else if (kind === 'refuse') {
      const p = (acted = pick(uncommitted));
      p.answered = true;
      p.send.answer.reject(new Error('refused'));
    } else if (kind === 'lose') {
      // Committed or not, its answer is lost. Its row already heard, the send that gave up landed
      // (hostedControl.ts `heard`); otherwise its row, if any, comes later.
      const p = (acted = pick(open));
      p.answered = true;
      if (p.heard) p.send.answer.resolve({ ...noneLeft, skipped: p.reached ? [] : [p.graphic] });
      else {
        p.lost = true;
        p.send.answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true, items: [{ graphic: p.graphic, msg: { t: 'cue', cue: p.cue, oid: `oid-${p.n}` } }] }));
      }
    } else if (kind === 'foreign') {
      // It applies at once: every press of this page before it on that graphic is then older than
      // the head (refused stale, or skipped), and its row is heard.
      const g = pick(calm);
      // The log is in commit order: rows of this page's presses there that committed come first.
      for (const p of presses.filter((q) => q.graphic === g && q.reached && !q.heard).sort((a, b) => a.order - b.order)) {
        p.heard = true;
        hearOne(p);
      }
      const cue = pick(['x1', 'x2', null]);
      applied[g] = presses.length;
      output[g] = cue;
      foreign[g] = { cue, after: presses.length };
      acted = { n: `x${(foreignRows += 1)}`, graphic: g, cue };
      const rest = r.verbs.heard([{ graphic: g, msg: { t: 'cue', cue, oid: `theirs-${foreignRows}` } }], () => false);
      for (const item of rest) r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
    } else {
      const p = (acted = pick(late));
      p.heard = true;
      if (!p.committed) commit(p);
      if (p.reached) hear(p);
    }
    trace.push(`${kind} ${JSON.stringify([acted.n, acted.graphic, acted.cue, !!acted.reached])} marker ${JSON.stringify(r.liveCue())}`);
    await settle();
    await settle();
    check(`step ${step} ${kind}`);
  }
  // Every press answered, in a random order: the marker names what airs.
  for (const p of presses.filter((q) => !q.answered).sort(() => random() - 0.5)) {
    p.answered = true;
    if (random() < 0.5 || p.committed) {
      if (!p.committed) commit(p);
      p.send.answer.resolve({ ...noneLeft, skipped: p.reached ? [] : [p.graphic] });
    } else p.send.answer.reject(new Error('refused'));
    await settle();
  }
  await Promise.all(presses.map((p) => p.done));
  // Every row still to come arrives, in a random order.
  for (const p of presses.filter((q) => q.reached && !q.heard).sort((a, b) => a.order - b.order)) {
    p.heard = true;
    hear(p);
  }
  check('at the end');
}

test(`${MARKER_WALKS} seeded walks of presses and answers on two graphics: the marker names this page's newest landed press (#1696)`, async () => {
  for (let seed = 1; seed <= MARKER_WALKS; seed++) await markerWalk(seed, 30);
});

/**
 * The same against sends of one or two batches, each carrying one or two graphics of three (an Out
 * of several graphics, All out's waves, a timed cue's Out and Next): each batch commits on its own,
 * the send is refused or loses its answer at the batch it reached, and the batches after it never
 * go (hostedControl.ts `sendControlVerbs`). Rows come after the answers.
 */
async function batchWalk(seed, steps) {
  const { clearCueItems, takeCueItems } = await import('../src/control/cueItems.ts');
  const random = rng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const r = rig({ fast: random() < 0.5 });
  const graphics = ['Strap', 'Score', 'Clock'];
  const applied = {};
  const output = {};
  const sends = [];
  const recs = [];
  const trace = [];
  const commit = (rec) => {
    rec.committed = true;
    rec.reached = rec.n > (applied[rec.graphic] ?? 0);
    if (rec.reached) {
      applied[rec.graphic] = rec.n;
      output[rec.graphic] = rec.cue;
    }
  };
  const hear = (rec) => {
    rec.heard = true;
    const rest = r.verbs.heard([{ graphic: rec.graphic, msg: { t: 'cue', cue: rec.cue, oid: `oid-${rec.n}` } }], () => false);
    for (const item of rest) r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, item.graphic, item.msg.cue) } }));
  };
  const check = (when) => {
    for (const g of graphics) {
      const out = sends.some((s) => !s.answered && s.recs.some((rec) => rec.graphic === g));
      assert.equal(r.verbs.markersOut().includes(g), out, `seed ${seed} ${when}: markersOut ${g}\n${trace.join('\n')}`);
      if (out || recs.some((rec) => rec.graphic === g && rec.lost && rec.reached && !rec.heard)) continue;
      assert.equal(r.liveCue()[g] ?? null, output[g] ?? null, `seed ${seed} ${when}: marker on ${g}\n${trace.join('\n')}`);
    }
  };
  /** The graphics the batches before `k` left alone: the server skipped them under a newer press. */
  const before = (s, k) => s.recs.filter((rec) => rec.batch < k && !rec.reached).map((rec) => rec.graphic);
  /** Answer a send: `fate` landed (every batch committed), refused or lost at the batch it reached. */
  const answer = (s, fate) => {
    s.answered = true;
    const k = s.done;
    if (fate === 'landed') {
      const skipped = s.recs.filter((rec) => !rec.reached).map((rec) => rec.graphic);
      s.answer.resolve({ ...noneLeft, skipped });
    } else if (fate === 'refused') s.answer.reject(Object.assign(new Error('refused'), { landed: k, skipped: before(s, k) }));
    else {
      const lost = s.recs.filter((rec) => rec.batch === k);
      for (const rec of lost) rec.lost = true;
      if (random() < 0.5) lost.forEach(commit);
      s.answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true, landed: k, skipped: before(s, k), items: lost.map((rec) => ({ graphic: rec.graphic, msg: { t: 'cue', cue: rec.cue, oid: `oid-${rec.n}` } })) }));
    }
  };
  for (let step = 0; step < steps; step++) {
    const open = sends.filter((s) => !s.answered);
    const committing = open.filter((s) => s.done < s.batches);
    const rows = recs.filter((rec) => !rec.heard && rec.send.answered && (rec.lost || rec.reached));
    const kinds = ['press', 'press', ...(committing.length ? ['commit', 'commit'] : []), ...(open.some((s) => s.done === s.batches) ? ['answer', 'answer'] : []), ...(committing.length ? ['refuse', 'lose'] : []), ...(rows.length ? ['row', 'row'] : [])];
    const kind = pick(kinds);
    if (kind === 'press') {
      const free = [...graphics].sort(() => random() - 0.5);
      const shape = pick([[1], [2], [1, 1], [1, 2], [2, 1]]);
      const batches = shape.map((size) => free.splice(0, size).map((graphic) => ({ graphic, cue: random() < 0.3 ? null : pick(['c1', 'c2', 'c3']) })));
      const s = { batches: batches.length, done: 0, recs: [] };
      for (const [batch, list] of batches.entries()) for (const { graphic, cue } of list) s.recs.push({ n: recs.length + s.recs.length + 1, graphic, cue, batch, send: s });
      recs.push(...s.recs);
      s.sending = r.verbs.send(batches.map((list) => list.flatMap(({ graphic, cue }) => (cue ? takeCueItems({ id: cue, graphic, values: {} }) : clearCueItems(graphic)))), 'Walk');
      await settle();
      s.answer = r.sends.at(-1).answer;
      sends.push(s);
      trace.push(`press ${JSON.stringify(batches)}`);
    } else if (kind === 'commit') {
      const s = pick(committing);
      s.recs.filter((rec) => rec.batch === s.done).forEach(commit);
      s.done += 1;
      trace.push(`commit batch ${s.done - 1} of send ${sends.indexOf(s)}`);
    } else if (kind === 'answer') {
      const s = pick(open.filter((one) => one.done === one.batches));
      answer(s, 'landed');
      trace.push(`answer send ${sends.indexOf(s)}`);
    } else if (kind === 'refuse' || kind === 'lose') {
      const s = pick(committing);
      answer(s, kind === 'refuse' ? 'refused' : 'lost');
      trace.push(`${kind} send ${sends.indexOf(s)} at batch ${s.done}`);
    } else {
      const rec = pick(rows);
      if (!rec.committed) commit(rec);
      if (rec.reached) hear(rec);
      else rec.heard = true;
      trace.push(`row ${rec.n} ${rec.graphic} ${rec.cue} reached ${!!rec.reached}`);
    }
    trace.push(`  marker ${JSON.stringify(r.liveCue())} output ${JSON.stringify(output)}`);
    await settle();
    await settle();
    check(`step ${step} ${kind}`);
  }
  for (const s of sends.filter((one) => !one.answered)) {
    if (random() < 0.5) {
      while (s.done < s.batches) s.recs.filter((rec) => rec.batch === s.done++).forEach(commit);
      answer(s, 'landed');
    } else answer(s, 'refused');
    await settle();
  }
  await Promise.all(sends.map((s) => s.sending));
  for (const rec of recs.filter((one) => one.reached && !one.heard)) hear(rec);
  check('at the end');
}

test(`${MARKER_WALKS} seeded walks of sends of several batches and graphics: the marker names this page's newest landed press on each (#1696)`, async () => {
  for (let seed = 1; seed <= MARKER_WALKS; seed++) await batchWalk(seed, 30);
});

// ── Pinned live controls: what a live press does (docs/work-specs/pinned-live-controls/spec.md
// "What a press does", F1 and F2; AC-2). A pinned block hands the verbs a selection built for its
// own graphic (control/liveControls.ts `liveSelection`); these rows hold every wait. ─────────────

const { liveSelection } = await import('../src/control/liveControls.ts');

test('a press on a pinned graphic acts on that graphic\'s on-air cue, never on the selected one (AC-2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7', name: 'Katri' });
  const quiz = graphicCue('q1', 'Strap', { f3: '2' });
  const r = rig({ seed: false, liveCue: { Score: 'b1', Strap: 'q1' }, aired: { Score: { home: '7' }, Strap: { f3: '2' } } });
  const pinned = liveSelection('Score', [quiz, banner], r.liveCue());
  const bumping = r.verbs.bump(pinned, 'home', 1);
  await settle();
  assert.deepEqual(sentAs(r.sends[0].batches), [[{ graphic: 'Score', msg: { t: 'update', data: { home: '8' } } }]]);
  r.sends[0].answer.resolve({ ...noneLeft });
  await bumping;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue'), [['writeCue', 'b1', '{"home":"8"}']]);
  const firing = r.verbs.event(pinned, { event: 'show', payload: ['name'] });
  await settle();
  assert.deepEqual(sentAs(r.sends[1].batches), [[{ graphic: 'Score', msg: { t: 'event', event: 'show', payload: { name: 'Katri' } } }]]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await firing;
});

test('a pinned graphic that is off air sends nothing, whatever is pressed', async () => {
  const r = rig({ seed: false });
  const off = liveSelection('Score', [graphicCue('b1', 'Score')], r.liveCue());
  assert.equal(off.selectedLayerLive, false);
  await r.verbs.bump(off, 'home', 1);
  await r.verbs.event(off, goal);
  await r.verbs.snap(off, null, 'x');
  assert.equal(r.sends.length, 0);
  assert.deepEqual(r.log, []);
});

test('a Take of another cue of the graphic during a held save refuses the press, which sends and writes nothing (F1)', async () => {
  for (const press of ['bump', 'event', 'snap']) {
    const banner = graphicCue('b1', 'Score', { home: '7' });
    const r = rig({ seed: false, flushHeld: true, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
    const view = liveSelection('Score', [banner], r.liveCue());
    const pressing = press === 'bump' ? r.verbs.bump(view, 'home', 1) : press === 'event' ? r.verbs.event(view, goal) : r.verbs.snap(view, null, 'x');
    await settle();
    // Another cue of the banner is taken while the save is held.
    r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Score: 'b2' } } }));
    r.flushes[0].resolve();
    await pressing;
    assert.equal(r.sends.length, 0, press);
    assert.deepEqual(r.log.filter(([k]) => k === 'writeCue' || k === 'writeLive' || k === 'patch'), [], press);
    assert.deepEqual(r.notes, ['Nothing sent: the cue on Score changed.'], press);
  }
});

test('a press refuses a cue this page\'s own Take is still taking off the layer (F1)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const taking = r.verbs.take(graphicCue('b2', 'Score', { home: '0' }));
  await settle();
  // The Take of b2 is out, unanswered; the marker still names b1.
  assert.equal(r.liveCue().Score, 'b1');
  await r.verbs.bump(view, 'home', 1);
  assert.equal(r.sends.length, 1);
  assert.deepEqual(r.notes, ['Nothing sent: the cue on Score changed.']);
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
});

test('a press drawn for a cue the layer no longer holds is refused at the press (F1)', async () => {
  const r = rig({ seed: false, liveCue: { Score: 'b2' } });
  const stale = sel({ selectedGraphic: 'Score', selectedLayerLive: true, airCue: graphicCue('b1', 'Score'), editingCue: graphicCue('b1', 'Score'), editingIsLive: true });
  await r.verbs.event(stale, goal);
  await r.verbs.bump(stale, 'home', 1);
  assert.equal(r.sends.length, 0);
  assert.equal(r.notes.length, 2);
});

test('two +1 presses inside one held round trip write 8 then 9, never 8 twice (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view, 'home', 1);
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.equal(r.sends.length, 1);
  assert.deepEqual(r.sends[0].batches[0][0].msg.data, { home: '8' });
  // Air's record moves as the page's own monitor applied the first (published: `applyHere`).
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, aired: { Score: { home: '8' } } } }));
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue').map((w) => w[2]), ['{"home":"8"}', '{"home":"9"}']);
});

test('a press released by the fallback while the one before is still out counts from the figure this page sent (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  void r.verbs.bump(view, 'home', 1);
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  // The first never answers and air's record never moved; the queue's fallback lets the second go.
  r.timers[0]();
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
  // An adjust event counts from the same sent figure.
  const r2 = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const v2 = liveSelection('Score', [banner], r2.liveCue());
  void r2.verbs.event(v2, goal);
  const goal2 = r2.verbs.event(v2, goal);
  await settle();
  r2.timers[0]();
  await settle();
  assert.equal(r2.sends.length, 2);
  r2.sends[1].answer.resolve({ ...noneLeft });
  await goal2;
  assert.deepEqual(r2.log.filter(([k]) => k === 'writeLive'), [['writeLive', 'b1', '{"home":"9"}']]);
});

test('a refused or failed send writes nothing into the cue and says why (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const failing = r.verbs.bump(view, 'home', 1);
  await settle();
  r.sends[0].answer.reject(new Error('down'));
  await failing;
  const goalFailing = r.verbs.event(view, goal);
  await settle();
  r.sends[1].answer.reject(Object.assign(new Error('refused'), { stale: true }));
  await goalFailing;
  // Skipped by the server: not on the output, so not written either.
  const skipped = r.verbs.bump(view, 'home', 1);
  await settle();
  r.sends[2].answer.resolve({ ...noneLeft, skipped: ['Score'] });
  await skipped;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue' || k === 'writeLive' || k === 'patch'), []);
  assert.equal(r.notes.length, 2);
  // After the failures, the next press counts from air again, not from the figure that failed.
  const again = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[3].batches[0][0].msg.data, { home: '8' });
  r.sends[3].answer.resolve({ ...noneLeft });
  await again;
});

test('a correction typed into the on-air cue but not yet aired is never the next bump\'s base (AC-2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  // Typed (and saved) in PREP, not yet Updated: the cue says 20, air still shows 7.
  r.draft.b1 = { home: '20' };
  const view = liveSelection('Score', [{ ...banner, values: { home: '20' } }], r.liveCue());
  const bumping = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[0].batches[0][0].msg.data, { home: '8' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await bumping;
});

test('a press after one that landed on the slow road counts from that figure until air\'s record moves (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view, 'home', 1);
  await settle();
  // Landed, but its row is not back: air's record still says 7.
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
  // Another screen moved it to 15 since: air's record is the base again.
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, aired: { Score: { home: '15' } } } }));
  const third = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[2].batches[0][0].msg.data, { home: '16' });
  r.sends[2].answer.resolve({ ...noneLeft });
  await third;
});

test('a landed figure is not the base on the next cue, nor after air\'s record moved back to it (F2)', async () => {
  const a = graphicCue('a1', 'Score', { home: '0' });
  const b = graphicCue('b1', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 'a1' }, aired: { Score: { home: '0' } } });
  const one = r.verbs.bump(liveSelection('Score', [a, b], r.liveCue()), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await one;
  // Cue B is taken with home 0: a new cue and a new record of what air was sent.
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Score: 'b1' }, aired: { Score: { home: '0' } } } }));
  const two = r.verbs.bump(liveSelection('Score', [a, b], r.liveCue()), 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '1' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await two;
  // On B, this page's Update puts the figure back to what the cue holds: air's record is the base.
  const updating = r.verbs.update(liveSelection('Score', [a, b], r.liveCue()));
  await settle();
  assert.deepEqual(r.sends[2].batches[0][0].msg.data, { home: '0' });
  r.sends[2].answer.resolve({ ...noneLeft });
  await updating;
  const three = r.verbs.bump(liveSelection('Score', [a, b], r.liveCue()), 'home', 1);
  await settle();
  assert.deepEqual(r.sends[3].batches[0][0].msg.data, { home: '1' });
  r.sends[3].answer.resolve({ ...noneLeft });
  await three;
});

test('a landed figure survives an update of another field arriving before its row (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7', name: 'Katri' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7', name: 'Katri' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view, 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  // Another page's name-only update arrives; the +1's own row has not.
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, aired: { Score: { home: '7', name: 'K.' } } } }));
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
});

test('an unrelated write to air\'s record during a slow send does not lose the figure that landed (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7', name: 'Katri' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7', name: 'Katri' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view, 'home', 1);
  await settle();
  // Another page's name Update lands while the +1 is out; its own row is not back.
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, aired: { Score: { home: '7', name: 'K.' } } } }));
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
});

test('a correction heard while a +1 is out stands over it: the next press counts from the correction (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view, 'home', 1);
  await settle();
  // Another screen corrects the score to 0 while the +1 is out.
  r.session.apply((parts) => ({ ...parts, air: { ...parts.air, aired: { Score: { home: '0' } } } }));
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  const second = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '1' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
});

test('a landed figure stays the base when the send that would replace it fails (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view, 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  const failing = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  r.sends[1].answer.reject(new Error('down'));
  await failing;
  const third = r.verbs.bump(view, 'home', 1);
  await settle();
  assert.deepEqual(r.sends[2].batches[0][0].msg.data, { home: '9' });
  r.sends[2].answer.resolve({ ...noneLeft });
  await third;
});

test('a failed older send gives back no landed figure a newer send replaced (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const first = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await first;
  const failing = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '9' });
  // The cue, staged at 0, is sent again and lands while the +1 is still out.
  const updating = r.verbs.update(view());
  await settle();
  assert.deepEqual(r.sends[2].batches[0][0].msg.data, { home: '0' });
  r.sends[2].answer.resolve({ ...noneLeft });
  await updating;
  r.sends[1].answer.reject(new Error('down'));
  await failing;
  const third = r.verbs.bump(view(), 'home', 1);
  await settle();
  // The Update's 0 landed after the 8: the +1 counts from 0, never from the 8 the failure parked.
  assert.deepEqual(r.sends[3].batches[0][0].msg.data, { home: '1' });
  r.sends[3].answer.resolve({ ...noneLeft });
  await third;
});

test('a late older answer that landed books nothing over a figure a newer send landed (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const older = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(r.sends[0].batches[0][0].msg.data, { home: '8' });
  // The cue, staged at 0, is sent again and lands while the +1 is still out.
  const updating = r.verbs.update(view());
  await settle();
  assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '0' });
  r.sends[1].answer.resolve({ ...noneLeft });
  await updating;
  r.sends[0].answer.resolve({ ...noneLeft, pressedAgain: ['Score'] });
  await older;
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(r.sends[2].batches[0][0].msg.data, { home: '1' });
  r.sends[2].answer.resolve({ ...noneLeft });
  await next;
});

test('a late older answer writes nothing into the cue over a figure a newer send landed (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '0' });
  for (const press of ['bump', 'event']) {
    const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
    const view = () => liveSelection('Score', [banner], r.liveCue());
    const older = press === 'bump' ? r.verbs.bump(view(), 'home', 1) : r.verbs.event(view(), goal);
    await settle();
    // The cue, staged at 0, is sent again and lands while the older press is still out.
    const updating = r.verbs.update(view());
    await settle();
    assert.deepEqual(r.sends[1].batches[0][0].msg.data, { home: '0' }, press);
    r.sends[1].answer.resolve({ ...noneLeft });
    await updating;
    r.sends[0].answer.resolve({ ...noneLeft, pressedAgain: ['Score'] });
    await older;
    assert.deepEqual(r.log.filter(([k]) => k === 'writeCue' || k === 'writeLive'), [], press);
  }
});

test('an accepted press writes nothing over an edit to its field saved while it was out (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  for (const press of ['bump', 'event']) {
    const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } }, saved: { b1: { home: '7' } } });
    const view = () => liveSelection('Score', [banner], r.liveCue());
    const pressing = press === 'bump' ? r.verbs.bump(view(), 'home', 1) : r.verbs.event(view(), goal);
    await settle();
    // A correction to 20 is typed and its debounce saves it while the press is out.
    r.saved.b1 = { home: '20' };
    r.sends[0].answer.resolve({ ...noneLeft });
    await pressing;
    assert.deepEqual(r.log.filter(([k]) => k === 'writeCue' || k === 'writeLive'), [], press);
  }
  // A second press released before the first one wrote still writes its figure after it.
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } }, saved: { b1: { home: '7' } } });
  r.page.writeCue = (cueId, values) => {
    r.log.push(['writeCue', cueId, JSON.stringify(values)]);
    r.saved[cueId] = { ...r.saved[cueId], ...values };
  };
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const one = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await one;
  const two = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[1].answer.resolve({ ...noneLeft });
  await two;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue'), [['writeCue', 'b1', '{"home":"8"}'], ['writeCue', 'b1', '{"home":"9"}']]);
});

// ── THE SENT-FIGURE BASE ON THE SLOW ROAD (pinned-live-controls "What a press does", repair of
// row 32a). This page's air record moves only when a row is heard back, so a row of an OLDER own
// send can arrive while a newer one is out: it is no newer command, and the newer send's figure is
// still the next press's base once it lands. A Take or an Update still out is a sent figure too. ──

const { airedAfter } = await import('../src/control/outputRecovery.ts');
/** Rows heard back, taken as the page takes them (ProductionPage `hearCommand`): the sender sees
 *  them first, then air's record and the marker move for what it leaves to the page. */
function hearRows(r, items) {
  const rest = r.verbs.heard(items, () => false);
  r.session.apply((parts) => ({
    ...parts,
    air: {
      ...parts.air,
      aired: rest.reduce((aired, item) => airedAfter(aired, item.graphic, item.msg), parts.air.aired),
      liveCue: rest.reduce((map, item) => (item.msg.t === 'cue' ? withLiveCue(map, item.graphic, item.msg.cue ?? null) : map), parts.air.liveCue),
    },
  }));
}
const homeSent = (r, n) => r.sends[n].batches[0].find((item) => item.msg.t === 'update').msg.data.home;

test('three quick +1 presses on the slow road send 8, 9, 10 when the first row is heard while the second is out', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const a = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await a;
  const b = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 1), '9');
  // The first press's row is heard while the second is out: air's record says 8.
  hearRows(r, r.sends[0].batches[0]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await b;
  const c = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 2), '10');
  r.sends[2].answer.resolve({ ...noneLeft });
  await c;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue').map(([, , v]) => v), ['{"home":"8"}', '{"home":"9"}', '{"home":"10"}']);
});

test('the Take of a new round is the base once it lands, though an older +1\'s row is heard while it is out', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [s1, s2], r.liveCue());
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
  const taking = r.verbs.take(s2);
  await settle();
  // The +1's row (8) is heard while the Take is out.
  hearRows(r, r.sends[0].batches[0]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await taking;
  assert.equal(r.liveCue().Score, 's2');
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 2), '1');
  r.sends[2].answer.resolve({ ...noneLeft });
  await next;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue').at(-1), ['writeCue', 's2', '{"home":"1"}']);
});

test('a +1 pressed while a Re-take is out counts from the Re-take\'s figure, not the round before', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [s1, s2], r.liveCue());
  const taking = r.verbs.take(s2);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  // Its row is not heard: air's record still says s1's 7. Re-take s2 goes out.
  const retaking = r.verbs.take(s2);
  await settle();
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  // The press waits behind this page's own Re-take; the fallback lets it go while that is still out.
  assert.equal(r.sends.length, 2);
  r.timers.at(-1)();
  await settle();
  assert.equal(homeSent(r, 2), '1');
  r.sends[1].answer.resolve({ ...noneLeft });
  await retaking;
  r.sends[2].answer.resolve({ ...noneLeft });
  await plus;
  // And the next press counts from that +1.
  const again = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 3), '2');
  r.sends[3].answer.resolve({ ...noneLeft });
  await again;
});

test('a correction from another screen heard while a +1 is out stands over it, though it carries the same figure as an older row', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const a = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await a;
  const b = r.verbs.bump(view(), 'home', 1);
  await settle();
  // Another screen's row puts 8 on air (no id this page sent): a newer command, whatever it says.
  hearRows(r, [{ graphic: 'Score', msg: { t: 'update', data: { home: '8' }, oid: 'other-screen' } }]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await b;
  const c = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 2), '9');
  r.sends[2].answer.resolve({ ...noneLeft });
  await c;
});

const BASE_WALKS = Number(process.env.BASE_WALKS ?? 3000);

/**
 * One walk on the slow road: +1 presses, Takes, Re-takes and Updates of three cues on one graphic,
 * another screen's corrections and Takes, answers landed, failed or refused in press order (one
 * send in flight per graphic; a model server refuses a press made before it heard another screen's
 * command committed ahead of it, as protocol 2 does), and rows heard back one at a time, in the
 * log's order, whenever. Every +1 that
 * goes is checked against the base rule: the newest of air's record and this page's landed or
 * pending sent figures. An own figure still out is the newest; one that landed is, until another
 * screen's command is heard after its press; otherwise air's record.
 */
async function baseWalk(seed, steps) {
  const random = rng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const cues = ['s1', 's2', 's3'].map((id, i) => graphicCue(id, 'Score', { home: String([7, 0, 3][i]), name: id }));
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7', name: 's1' } } });
  const trace = [];
  /** What the page knows, in the order it learned it: its own sends at their press, and the rows of
   *  other screens when heard. */
  const known = [{ kind: 'initial' }];
  const log = [];
  let heardUpTo = 0;
  let airedHome = '7';
  const open = [];
  const wrong = [];
  const pushed = r.sends.push.bind(r.sends);
  r.sends.push = (send) => {
    const index = r.sends.length;
    const items = send.batches.flat();
    const update = items.find((item) => item.msg.t === 'update');
    const isBump = items.length === 1 && update && Object.keys(update.msg.data).join() === 'home';
    if (isBump) {
      const own = known.filter((e) => e.kind === 'own' && e.state !== 'dropped');
      const pending = own.filter((e) => e.state === 'pending').at(-1);
      const newest = known.filter((e) => e.kind !== 'own' || e.state === 'landed').at(-1);
      const base = newest.kind === 'own' ? (pending && known.indexOf(pending) > known.indexOf(newest) ? pending.home : newest.home) : (pending ? pending.home : airedHome);
      // Recorded, not thrown: the send runs inside the verb, which would read a throw as a failure.
      if (update.msg.data.home !== String(Number(base) + 1)) wrong.push(`seed ${seed}: send ${index} sent ${update.msg.data.home}, counting from ${base}\n${trace.join('\n')}`);
    }
    trace.push(`send ${index}: ${items.map((i) => `${i.msg.t}${i.msg.data ? JSON.stringify(i.msg.data) : i.msg.cue !== undefined ? `:${i.msg.cue}` : ''}`).join('+')}`);
    known.push({ kind: 'own', index, state: 'pending', home: update?.msg.data.home, seen: heardUpTo });
    open.push(index);
    return pushed(send);
  };
  const entry = (index) => known.find((e) => e.kind === 'own' && e.index === index);
  const answer = (index, fate) => {
    open.splice(open.indexOf(index), 1);
    const send = r.sends[index];
    // Protocol 2: a press based on less than another screen committed before it is refused.
    if (fate === 'landed' && log.slice(entry(index).seen).some((row) => !row.own)) {
      entry(index).state = 'dropped';
      trace.push(`answer ${index}: stale`);
      send.answer.reject(Object.assign(new Error('changed'), { stale: true }));
    } else if (fate === 'landed') {
      entry(index).state = 'landed';
      log.push(...send.batches.flat().map((item) => ({ ...item, own: true })));
      trace.push(`answer ${index}: landed`);
      send.answer.resolve({ ...noneLeft });
    } else {
      entry(index).state = 'dropped';
      trace.push(`answer ${index}: failed`);
      send.answer.reject(new Error('down'));
    }
  };
  let foreign = 0;
  for (let step = 0; step < steps; step++) {
    const roll = random();
    if (roll < 0.3) {
      trace.push('press +1');
      void r.verbs.bump(liveSelection('Score', cues, r.liveCue()), 'home', 1);
    } else if (roll < 0.4) {
      const cue = pick(cues);
      if (random() < 0.5) r.draft[cue.id] = { home: String(Math.floor(random() * 20)) };
      trace.push(`take ${cue.id} ${JSON.stringify(r.draft[cue.id] ?? {})}`);
      void r.verbs.take(cue);
    } else if (roll < 0.47) {
      const view = liveSelection('Score', cues, r.liveCue());
      if (view.editingCue && random() < 0.5) r.draft[view.editingCue.id] = { home: String(Math.floor(random() * 20)) };
      trace.push('update');
      void r.verbs.update(view);
    } else if (roll < 0.72 && open.length > 0) {
      // One send in flight per page and graphic (seqSend.ts `createGraphicFifo`): answers come in
      // press order.
      answer(open[0], random() < 0.85 ? 'landed' : 'failed');
    } else if (roll < 0.8) {
      foreign += 1;
      const home = String(Math.floor(random() * 20));
      trace.push(`another screen: ${random() < 0.7 ? 'correction' : 'take s3'} home ${home}`);
      const take = trace.at(-1).includes('take');
      log.push({ graphic: 'Score', msg: { t: 'update', data: take ? { home, name: 's3' } : { home }, oid: `other-${foreign}` } });
      if (take) log.push({ graphic: 'Score', msg: { t: 'play', oid: `other-play-${foreign}` } }, { graphic: 'Score', msg: { t: 'cue', cue: 's3', oid: `other-cue-${foreign}` } });
    } else if (heardUpTo < log.length) {
      const row = log[heardUpTo++];
      trace.push(`hear ${row.own ? 'own' : 'other'} ${row.msg.t}${row.msg.data ? JSON.stringify(row.msg.data) : ''}`);
      if (row.msg.t === 'update' && 'home' in row.msg.data) {
        airedHome = row.msg.data.home;
        if (!row.own) known.push({ kind: 'foreign', home: row.msg.data.home });
      }
      hearRows(r, [{ graphic: row.graphic, msg: row.msg }]);
    }
    await settle();
    assert.deepEqual(wrong, []);
  }
  // Settle what is still out, so nothing is left held.
  while (open.length > 0) {
    answer(open[0], 'landed');
    await settle();
  }
  assert.deepEqual(wrong, []);
}

test('on the slow road every +1 counts from the newest of air\'s record and this page\'s landed or pending figures (walk)', async () => {
  for (let seed = 1; seed <= BASE_WALKS; seed++) await baseWalk(seed, 40);
});

test('a Take that throws before it is sent leaves no figure held as sent', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const timed = graphicCue('timed', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } } });
  r.sender.armSpecFor = () => {
    throw new Error('bad spec');
  };
  await assert.rejects(r.verbs.take(timed), /bad spec/);
  const plus = r.verbs.bump(liveSelection('Score', [s1, timed], r.liveCue()), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 0), '8');
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
});

test('the hockey scorebug: a ⚡ goal, then +1 twice, counts on when the goal\'s slow row is heard while the first +1 is out', async () => {
  // As controlModel.ts `pressSend` says it: the moved figure rides in the event's payload, which is
  // what air's record takes from the row (outputRecovery.ts `airedAfter`).
  const pressSend = (button, boundMap, valueOf) => {
    const fields = Object.fromEntries(Object.entries(button.adjust ?? {}).map(([key, delta]) => [key, String(Number(valueOf(key) ?? 0) + delta)]));
    return { payload: fields, fields, tree: [] };
  };
  const scorebug = graphicCue('h1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'h1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend } });
  const view = () => liveSelection('Score', [scorebug], r.liveCue());
  const goal = r.verbs.event(view(), { event: 'goalA', adjust: { home: 1 } });
  await settle();
  assert.deepEqual(r.sends[0].batches[0][0].msg.payload, { home: '8' });
  r.sends[0].answer.resolve({ ...noneLeft });
  await goal;
  const one = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 1), '9');
  // The goal's row comes back on the slow road (a graphic with a clock) while the +1 is out.
  hearRows(r, r.sends[0].batches[0]);
  r.sends[1].answer.resolve({ ...noneLeft });
  await one;
  const two = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 2), '10');
  r.sends[2].answer.resolve({ ...noneLeft });
  await two;
});

test('a send whose first batch landed and second failed keeps the first batch\'s figures as the base', async () => {
  const { takeCueItems } = await import('../src/control/cueItems.ts');
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [s1, s2], r.liveCue());
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
  // A folder's Take: Score's batch commits, Strap's fails; no row is heard yet.
  const taking = r.verbs.send([takeCueItems({ id: 's2', graphic: 'Score', values: { home: '0' } }), takeCueItems({ id: 'x1', graphic: 'Strap', values: {} })], 'Take');
  await settle();
  r.sends[1].answer.reject(Object.assign(new Error('down'), { landed: 1 }));
  await taking;
  assert.equal(r.liveCue().Score, 's2');
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 2), '1');
  r.sends[2].answer.resolve({ ...noneLeft });
  await next;
});

test('a landed Take\'s figure stands again once the newer Re-take and a +1 on it both fail', async () => {
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const s3 = graphicCue('s3', 'Score', { home: '3' });
  const r = rig({ seed: false, liveCue: { Score: 's2' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [s2, s3], r.liveCue());
  const taking = r.verbs.take(s3);
  await settle();
  const retaking = r.verbs.take(s2);
  await settle();
  // s3's Take lands; the marker stays on s2, whose Re-take is newer and still out.
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  // The press waits behind this page's own Re-take; the fallback lets it go while that is still out.
  assert.equal(r.sends.length, 2);
  r.timers.at(-1)();
  await settle();
  assert.equal(homeSent(r, 2), '1');
  // A blip: the Re-take and the +1 both fail. s3 is what airs.
  r.sends[1].answer.reject(new Error('down'));
  await retaking;
  r.sends[2].answer.reject(new Error('down'));
  await plus;
  assert.equal(r.liveCue().Score, 's3');
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 3), '4');
  r.sends[3].answer.resolve({ ...noneLeft });
  await next;
});

test('an Update sent while a failed Take was out counts on the cue an older landed Take left', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [s1, s2], r.liveCue());
  const takeTwo = r.verbs.take(s2);
  await settle();
  const takeOne = r.verbs.take(s1);
  await settle();
  // s2's Take lands while the newer Take of s1 is still out: the marker waits on s1's answer.
  r.sends[0].answer.resolve({ ...noneLeft });
  await takeTwo;
  r.draft.s1 = { home: '14' };
  const updating = r.verbs.update(view());
  await settle();
  assert.equal(homeSent(r, 2), '14');
  // s1's Take fails: s2 is what airs, and the Update's 14 went onto it.
  r.sends[1].answer.reject(new Error('down'));
  await takeOne;
  r.sends[2].answer.resolve({ ...noneLeft });
  await updating;
  assert.equal(r.liveCue().Score, 's2');
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(homeSent(r, 3), '15');
  r.sends[3].answer.resolve({ ...noneLeft });
  await plus;
});

// ── THE LEDGER (row 32a's last repair, check 2 F1 to F4). One ledger of this page's own sends,
// by press number, is the only source of an unbound field's base: pending, landed until air's
// record takes it past, or gone when it did not reach the output. A live press also waits behind
// this page's own Take, Re-take, Update and Out of its graphic, and goes only while the live
// marker and this page's newest marker press both name its cue. ──

/** As controlModel.ts `pressSend` says it: an event's moved figure rides in its payload. */
const paysMoved = (button, boundMap, valueOf) => {
  const fields = Object.fromEntries(Object.entries(button.adjust ?? {}).map(([key, delta]) => [key, String(Number(valueOf(key) ?? 0) + delta)]));
  return { payload: fields, fields, tree: [] };
};
const goalA = { event: 'goalA', adjust: { home: 1 } };
/** The fast road, switched by the test: this page's monitor and air's record take the page's own
 *  commands at the press (airState.ts `claimAndApply`). */
function roads(r) {
  const road = { fast: false };
  r.state.sender = {
    ...r.sender,
    applyHere: (items) =>
      road.fast &&
      r.session.apply((parts) => ({
        ...parts,
        air: {
          ...parts.air,
          aired: items.reduce((aired, item) => airedAfter(aired, item.graphic, item.msg), parts.air.aired),
          liveCue: items.reduce((map, item) => (item.msg.t === 'cue' ? withLiveCue(map, item.graphic, item.msg.cue ?? null) : map), parts.air.liveCue),
        },
      })),
  };
  return road;
}
const homeAired = (r) => r.session.air.get().aired.Score?.home;
const sentHomes = (r) => r.sends.map((send) => send.batches[0].find((item) => item.msg.t === 'update' || item.msg.t === 'event')?.msg).map((msg) => msg?.data?.home ?? msg?.payload?.home);

test('a +1 that failed on the fast road is never the base, though an older slow row is heard after it (F1)', async () => {
  const scorebug = graphicCue('h1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'h1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend: paysMoved } });
  const road = roads(r);
  const view = () => liveSelection('Score', [scorebug], r.liveCue());
  // A ⚡ goal on a graphic with a clock rides the slow road: it lands, its row is not heard yet.
  const goal = r.verbs.event(view(), goalA);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await goal;
  // Past the slow window the +1 rides the fast road: this monitor shows its 9 at the press. It fails.
  road.fast = true;
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9']);
  assert.equal(homeAired(r), '9');
  r.sends[1].answer.reject(Object.assign(new Error('down'), { aired: true }));
  await plus;
  // The goal's row is heard: air's record, and this monitor, show 8.
  hearRows(r, r.sends[0].batches[0]);
  assert.equal(homeAired(r), '8');
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(sentHomes(r)[2], '9');
  r.sends[2].answer.resolve({ ...noneLeft });
  await next;
});

test('a fast-road +1 applied here and then failed never becomes the base: the landed figure before it stands (R14)', async () => {
  const scorebug = graphicCue('h1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'h1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend: paysMoved } });
  const road = roads(r);
  const view = () => liveSelection('Score', [scorebug], r.liveCue());
  const goal = r.verbs.event(view(), goalA);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await goal;
  road.fast = true;
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[1].answer.reject(new Error('down'));
  await plus;
  // No row heard: the goal's 8 landed, the 9 did not.
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(sentHomes(r)[2], '9');
  r.sends[2].answer.resolve({ ...noneLeft });
  await next;
  // And a fast +1 that lands counts on: its own apply here took no figure past.
  const again = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9', '9', '10']);
  r.sends[3].answer.resolve({ ...noneLeft });
  await again;
});

test('the hockey scorebug on the fast road: the goal\'s slow row heard after a fast +1 landed leaves that +1 the base', async () => {
  const scorebug = graphicCue('h1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'h1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend: paysMoved } });
  const road = roads(r);
  const view = () => liveSelection('Score', [scorebug], r.liveCue());
  const goal = r.verbs.event(view(), goalA);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await goal;
  road.fast = true;
  const one = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[1].answer.resolve({ ...noneLeft });
  await one;
  // The goal's slow row arrives after the fast +1 applied here: this monitor goes back to 8.
  hearRows(r, r.sends[0].batches[0]);
  const two = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9', '10']);
  r.sends[2].answer.resolve({ ...noneLeft });
  await two;
});

test('two overlapping sends that both fail around a landed ⚡ goal lose no figure (F2)', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend: paysMoved } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
  const goal = r.verbs.event(view(), goalA);
  await settle();
  // An Update goes out while the goal is out; the goal lands; a second Update goes out.
  const first = r.verbs.update(view());
  await settle();
  r.sends[1].answer.resolve({ ...noneLeft });
  await goal;
  const second = r.verbs.update(view());
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9', '7', '7']);
  // Both Updates fail: air shows the goal's 9.
  r.sends[2].answer.reject(new Error('down'));
  await first;
  r.sends[3].answer.reject(new Error('down'));
  await second;
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(sentHomes(r)[4], '10');
  r.sends[4].answer.resolve({ ...noneLeft });
  await next;
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue' || k === 'writeLive').map(([, , v]) => v), ['{"home":"8"}', '{"home":"9"}', '{"home":"10"}']);
});

test('a press is refused when another screen takes another cue while this page\'s Re-take is out (F3)', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '3' });
  const r = rig({ seed: false, flushHeld: true, liveCue: { Score: 's2' }, aired: { Score: { home: '3' } } });
  const view = () => liveSelection('Score', [s1, s2], r.liveCue());
  const retake = r.verbs.take(s2);
  await settle();
  r.flushes[0].resolve();
  await settle();
  assert.equal(r.sends.length, 1);
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  // Another screen takes s1 (Katri's 7), and its rows are heard: the live marker names s1.
  hearRows(r, [
    { graphic: 'Score', msg: { t: 'update', data: { home: '7' }, oid: 'other-u' } },
    { graphic: 'Score', msg: { t: 'play', oid: 'other-p' } },
    { graphic: 'Score', msg: { t: 'cue', cue: 's1', oid: 'other-c' } },
  ]);
  assert.equal(r.liveCue().Score, 's1');
  // Whatever the press waits on, the Re-take or its save, it ends.
  for (const fire of r.timers) fire();
  await settle();
  for (const flush of r.flushes) flush.resolve();
  await settle();
  assert.equal(r.sends.length, 1);
  assert.deepEqual(r.notes, ['Nothing sent: the cue on Score changed.']);
  assert.deepEqual(r.log.filter(([k]) => k === 'writeCue' || k === 'writeLive'), []);
  r.sends[0].answer.reject(Object.assign(new Error('changed'), { stale: true }));
  await retake;
  await plus;
});

test('a press is refused when this page\'s own Take of another cue goes out while it waits on its save', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, flushHeld: true, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } } });
  const plus = r.verbs.bump(liveSelection('Score', [s1, s2], r.liveCue()), 'home', 1);
  await settle();
  const taking = r.verbs.take(s2);
  await settle();
  // The Take's save ends first and it goes; the live marker still names s1 until its answer.
  r.flushes[1].resolve();
  await settle();
  assert.equal(r.sends.length, 1);
  assert.equal(r.liveCue().Score, 's1');
  r.flushes[0].resolve();
  await plus;
  assert.equal(r.sends.length, 1);
  assert.deepEqual(r.notes, ['Nothing sent: the cue on Score changed.']);
  r.sends[0].answer.resolve({ ...noneLeft });
  await taking;
});

test('a live press waits behind this page\'s own Update of its graphic, then counts from what it sent', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  r.draft.b1 = { home: '20' };
  const updating = r.verbs.update(view());
  await settle();
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(r.sends.length, 1);
  r.sends[0].answer.resolve({ ...noneLeft });
  await updating;
  await settle();
  assert.deepEqual(sentHomes(r), ['20', '21']);
  r.sends[1].answer.resolve({ ...noneLeft });
  await plus;
});

test('a Re-take that stalls past the fallback: the +1 it let go lands, and no figure is sent twice (R7)', async () => {
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's2' }, aired: { Score: { home: '0' } } });
  const view = () => liveSelection('Score', [s2], r.liveCue());
  const retake = r.verbs.take(s2);
  await settle();
  const one = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.timers.at(-1)?.();
  await settle();
  r.sends[1].answer.resolve({ ...noneLeft });
  await one;
  // The Re-take is still out: this press waits for it too, until its own fallback.
  const two = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(r.sends.length, 2);
  r.timers.at(-1)?.();
  await settle();
  r.sends[2].answer.resolve({ ...noneLeft });
  await two;
  r.sends[0].answer.resolve({ ...noneLeft });
  await retake;
  const three = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[3].answer.resolve({ ...noneLeft });
  await three;
  assert.deepEqual(sentHomes(r), ['0', '1', '2', '3']);
});

test('a +1 that got no answer and whose row is heard later stands over the older landed figure', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const a = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await a;
  const b = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[1].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  await b;
  // It committed after all: both rows are heard, in the log's order.
  hearRows(r, r.sends[0].batches[0]);
  hearRows(r, r.sends[1].batches[0]);
  assert.equal(homeAired(r), '9');
  const c = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9', '10']);
  r.sends[2].answer.resolve({ ...noneLeft });
  await c;
});

test('a +1 pressed between the rows of another screen\'s Take stays the base once that Take\'s cue row is heard', async () => {
  const s1 = graphicCue('s1', 'Score', { home: '7' });
  const s2 = graphicCue('s2', 'Score', { home: '0' });
  const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend: paysMoved } });
  const view = () => liveSelection('Score', [s1, s2], r.liveCue());
  // Another screen takes s2: its update row is heard, its play and cue rows not yet.
  hearRows(r, [{ graphic: 'Score', msg: { t: 'update', data: { home: '0' }, oid: 'other-u' } }]);
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
  hearRows(r, [
    { graphic: 'Score', msg: { t: 'play', oid: 'other-p' } },
    { graphic: 'Score', msg: { t: 'cue', cue: 's2', oid: 'other-c' } },
  ]);
  assert.equal(r.liveCue().Score, 's2');
  const goal = r.verbs.event(view(), goalA);
  await settle();
  assert.deepEqual(sentHomes(r), ['1', '2']);
  r.sends[1].answer.resolve({ ...noneLeft });
  await goal;
});

test('an Update applied here that got no answer, whose row arrives already applied, committed: older figures stand no more', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } }, ioWith: { pressSend: paysMoved } });
  const road = roads(r);
  road.fast = true;
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
  // The cue as stored (7) is sent again; this monitor shows it at once; the server does not answer.
  const updating = r.verbs.update(view());
  await settle();
  r.sends[1].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  await updating;
  assert.equal(homeAired(r), '7');
  // Both rows arrive, each already applied here: the Update committed after the +1.
  r.verbs.heard(r.sends[0].batches[0], () => true);
  r.verbs.heard(r.sends[1].batches[0], () => true);
  const goal = r.verbs.event(view(), goalA);
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '7', '8']);
  r.sends[2].answer.resolve({ ...noneLeft });
  await goal;
});

test('two of this page\'s rows heard in one call take only their own sends past, not a newer one that landed', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  for (let n = 0; n < 3; n++) {
    const plus = r.verbs.bump(view(), 'home', 1);
    await settle();
    r.sends[n].answer.resolve({ ...noneLeft });
    await plus;
  }
  // A broadcast carries the first two rows together; the third's is not heard yet.
  hearRows(r, [...r.sends[0].batches[0], ...r.sends[1].batches[0]]);
  assert.equal(homeAired(r), '9');
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9', '10', '11']);
  r.sends[3].answer.resolve({ ...noneLeft });
  await next;
});

test('a send still out stays the base however many sends follow it on its graphic', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const stuck = r.verbs.bump(view(), 'home', 1);
  await settle();
  // Seventy sends of another field land meanwhile.
  for (let n = 1; n <= 70; n++) {
    const sent = r.verbs.send([[{ graphic: 'Score', msg: { t: 'update', data: { name: `n${n}` } } }]], 'Update');
    r.sends[n].answer.resolve({ ...noneLeft });
    await sent;
  }
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.timers.at(-1)?.();
  await settle();
  assert.equal(sentHomes(r).at(-1), '9');
  r.sends.at(-1).answer.resolve({ ...noneLeft });
  r.sends[0].answer.resolve({ ...noneLeft });
  await stuck;
  await next;
});

test('a landed figure stays the base however many sends of other fields follow it unheard', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[0].answer.resolve({ ...noneLeft });
  await plus;
  for (let n = 1; n <= 70; n++) {
    const sent = r.verbs.send([[{ graphic: 'Score', msg: { t: 'update', data: { name: `n${n}` } } }]], 'Update');
    r.sends[n].answer.resolve({ ...noneLeft });
    await sent;
  }
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.equal(sentHomes(r).at(-1), '9');
  r.sends.at(-1).answer.resolve({ ...noneLeft });
  await next;
});

test('a Re-take that got no answer, heard back whole with its marker later, takes no newer landed figure past', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  r.draft.b1 = { home: '5' };
  const retake = r.verbs.take(banner);
  await settle();
  r.sends[0].answer.reject(Object.assign(new Error('the server did not answer'), { unanswered: true }));
  await retake;
  delete r.draft.b1;
  const plus = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.sends[1].answer.resolve({ ...noneLeft });
  await plus;
  // The Re-take did commit, before the +1: its rows, marker included, arrive in one broadcast.
  hearRows(r, r.sends[0].batches[0]);
  const next = r.verbs.bump(view(), 'home', 1);
  await settle();
  assert.deepEqual(sentHomes(r), ['5', '8', '9']);
  r.sends[2].answer.resolve({ ...noneLeft });
  await next;
});

test('a landed figure heard back is not dropped while an older send is still out, so that send never comes back as the base', async () => {
  const banner = graphicCue('b1', 'Score', { home: '7' });
  const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
  const view = () => liveSelection('Score', [banner], r.liveCue());
  void r.verbs.bump(view(), 'home', 1);
  await settle();
  // The first never answers; the fallback lets the second go, counting from it.
  const second = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.timers.at(-1)();
  await settle();
  r.sends[1].answer.resolve({ ...noneLeft });
  await second;
  hearRows(r, r.sends[1].batches[0]);
  assert.equal(homeAired(r), '9');
  // A send of another field goes and lands meanwhile.
  const name = r.verbs.send([[{ graphic: 'Score', msg: { t: 'update', data: { name: 'K.' } } }]], 'Update');
  r.sends[2].answer.resolve({ ...noneLeft });
  await name;
  const third = r.verbs.bump(view(), 'home', 1);
  await settle();
  r.timers.at(-1)?.();
  await settle();
  assert.deepEqual(sentHomes(r), ['8', '9', undefined, '10']);
  r.sends[3].answer.resolve({ ...noneLeft });
  r.sends[0].answer.resolve({ ...noneLeft });
  await third;
});

test('after this page\'s Out lands, a Take of a cue without a field leaves the round before no base for it, on either road', async () => {
  for (const fast of [true, false]) {
    const s1 = graphicCue('s1', 'Score', { home: '7', away: '4' });
    const s2 = graphicCue('s2', 'Score', { home: '0' });
    const r = rig({ seed: false, liveCue: { Score: 's1' }, aired: { Score: { home: '7', away: '4' } } });
    const road = roads(r);
    road.fast = fast;
    const view = () => liveSelection('Score', [s1, s2], r.liveCue());
    const plus = r.verbs.bump(view(), 'away', 1);
    await settle();
    r.sends[0].answer.resolve({ ...noneLeft });
    await plus;
    const off = r.verbs.out(view());
    await settle();
    r.sends[1].answer.resolve({ ...noneLeft });
    await off;
    const taking = r.verbs.take(s2);
    await settle();
    r.sends[2].answer.resolve({ ...noneLeft });
    await taking;
    assert.equal(r.liveCue().Score, 's2');
    // On the slow road this page's record still holds s1's 4 until the rows come back; heard, the
    // Out empties it.
    if (!fast) for (const n of [0, 1, 2]) hearRows(r, r.sends[n].batches[0]);
    const next = r.verbs.bump(view(), 'away', 1);
    await settle();
    assert.equal(r.sends[3].batches[0][0].msg.data.away, '1', fast ? 'fast' : 'slow');
    r.sends[3].answer.resolve({ ...noneLeft });
    await next;
  }
});

test('a live press answers what it came to, for a panel key: accepted, overtaken, refused stale, unanswered or failed (E6.1)', async () => {
  const cases = [
    [(h) => h.resolve({ ...noneLeft }), { outcome: 'accepted' }],
    [(h) => h.resolve({ ...noneLeft, superseded: ['Score'] }), { outcome: 'refused', note: 'A later press replaced it.' }],
    [(h) => h.reject(Object.assign(new Error('another screen moved it'), { stale: true })), 'refused'],
    [(h) => h.reject(Object.assign(new Error('no answer'), { unanswered: true })), 'unknown'],
    [(h) => h.reject(new Error('down')), 'failed'],
  ];
  for (const press of ['event', 'bump']) {
    for (const [answer, want] of cases) {
      const banner = graphicCue('b1', 'Score', { home: '7' });
      const r = rig({ seed: false, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
      const view = liveSelection('Score', [banner], r.liveCue());
      const pressing = press === 'bump' ? r.verbs.bump(view, 'home', 1) : r.verbs.event(view, goal);
      await settle();
      answer(r.sends[0].answer);
      const done = await pressing;
      if (typeof want === 'string') {
        assert.equal(done.outcome, want, press);
        // The reason is the note line's own sentence.
        assert.equal(done.note, r.notes.at(-1), press);
      } else assert.deepEqual(done, want, press);
    }
  }
});

test('a live press that sends nothing answers refused with the reason: off air, or another cue took the layer (E6.1)', async () => {
  for (const press of ['event', 'bump']) {
    const banner = graphicCue('b1', 'Score', { home: '7' });
    const off = rig({ seed: false });
    const offView = liveSelection('Score', [banner], {});
    assert.deepEqual(await (press === 'bump' ? off.verbs.bump(offView, 'home', 1) : off.verbs.event(offView, goal)), { outcome: 'refused', note: 'Score is off air' }, press);
    const r = rig({ seed: false, flushHeld: true, liveCue: { Score: 'b1' }, aired: { Score: { home: '7' } } });
    const view = liveSelection('Score', [banner], r.liveCue());
    const pressing = press === 'bump' ? r.verbs.bump(view, 'home', 1) : r.verbs.event(view, goal);
    await settle();
    r.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Score: 'b2' } } }));
    r.flushes[0].resolve();
    assert.deepEqual(await pressing, { outcome: 'refused', note: 'Nothing sent: the cue on Score changed.' }, press);
    assert.equal(r.sends.length, 0, press);
  }
});

test('a bound press whose shared value did not move answers failed, not accepted (E6.1)', async () => {
  for (const press of ['event', 'bump']) {
    const r = rig({ bound: { Score: { home: 'match.home' } }, tree: { Score: { home: '2' } } });
    r.page.patchBound = async () => false;
    const view = sel({ selectedGraphic: 'Score', selectedLayerLive: true, editingCue: graphicCue('s1', 'Score'), editingIsLive: true, airCue: graphicCue('s1', 'Score') });
    const pressing = press === 'bump' ? r.verbs.bump(view, 'home', 1) : r.verbs.event(view, goal);
    await settle();
    r.sends[0]?.answer.resolve({ ...noneLeft });
    assert.deepEqual(await pressing, { outcome: 'failed', note: 'The shared value did not move' }, press);
  }
});

test('a step on a layer airing a cue this page does not hold says so, not off air (E6.1)', async () => {
  const r = rig({ seed: false, liveCue: { Score: 'elsewhere' } });
  const view = liveSelection('Score', [], r.liveCue());
  assert.deepEqual(await r.verbs.bump(view, 'home', 1), { outcome: 'refused', note: 'The cue on Score is not one this page holds' });
});

test('a panel press on a layer airing a cue this page cannot see is held to the cue its key named (E6.1, L1 AC-8)', async () => {
  // The key was drawn while `unseen` aired; another cue this page cannot see took the layer since.
  const r = rig({ seed: false, liveCue: { Score: 'other' } });
  const view = liveSelection('Score', [], r.liveCue());
  assert.equal(view.airCue, null);
  assert.deepEqual(await r.verbs.event(view, { event: 'go' }, 'unseen'), { outcome: 'refused', note: 'Nothing sent: the cue on Score changed.' });
  assert.equal(r.sends.length, 0);
  // The cue it named is the one on the layer: the press goes.
  const going = r.verbs.event(view, { event: 'go' }, 'other');
  await settle();
  assert.equal(r.sends.length, 1);
  r.sends[0].answer.resolve({ ...noneLeft });
  assert.deepEqual(await going, { outcome: 'accepted' });
  // Named, and replaced during the save wait: refused after the wait.
  const held = rig({ seed: false, flushHeld: true, liveCue: { Score: 'other' } });
  const waiting = held.verbs.event(liveSelection('Score', [], held.liveCue()), { event: 'go' }, 'other');
  await settle();
  held.session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Score: 'third' } } }));
  held.flushes[0].resolve();
  assert.deepEqual(await waiting, { outcome: 'refused', note: 'Nothing sent: the cue on Score changed.' });
  assert.equal(held.sends.length, 0);
});

test('a press whose selection and key name different cues goes nowhere, whichever is on the layer (E6.1)', async () => {
  for (const [drawn, named, onLayer] of [['b2', 'b1', 'b2'], ['b1', 'b2', 'b2']]) {
    const cue = graphicCue(drawn, 'Score', { home: '7' });
    const r = rig({ seed: false, liveCue: { Score: onLayer } });
    const view = { ...liveSelection('Score', [cue], { Score: drawn }), selectedLayerLive: true };
    assert.deepEqual(await r.verbs.event(view, { event: 'go' }, named), { outcome: 'refused', note: 'Nothing sent: the cue on Score changed.' }, `${drawn}/${named}`);
    assert.equal(r.sends.length, 0, `${drawn}/${named}`);
  }
});
