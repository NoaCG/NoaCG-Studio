// guards: src/control/serverPlayout.ts, src/control/folderAir.ts, src/control/folderStep.ts, src/control/cuePlayback.ts, src/control/serverState.ts
//
// A FOLDER'S TAKE, run in Node with the Bridge faked (docs/CLIP_PLAYBACK_PLAN.md §6.4 to §6.6, phase
// 4): what a Play-through folder sends and when it cannot go, Loop the folder on the page's side, Play
// next's folder limit, All together's refusals, run and note, which file the clock follows, the one
// function a folder's button lights from, and the file that must not air on two slots. The browser
// half - that the page wires them - is e2e/playout-folders.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const serverPlayout = await import('../src/control/serverPlayout.ts');
const { clockRank, folderRun, folderRunBlocker, folderTakeBlocker, playNextTarget, runServerVerb, runTogether, sequenceAction, takeBlocker, throughFolderOf, throughPlaces, togetherNote, togetherPlan } = serverPlayout;
const { asFolderMember, takePlayback } = await import('../src/control/cuePlayback.ts');
const { NO_OWNERSHIP, airClash, applyAccepted, applyReading, clipClock, clockedClip } = await import('../src/control/serverState.ts');
const { folderAir, folderAirWords } = await import('../src/control/folderAir.ts');
const { folderStep, stepFace } = await import('../src/control/folderStep.ts');

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
/** A movie of `seconds` on 2-10, unless told otherwise. */
const vt = (id, seconds, extra = {}) => ({ id, adapter: 'casparcg', kind: 'media', name: id.toUpperCase(), layer: 10, channel: 2, mediaKind: 'movie', frames: seconds * 25, fps: 25, ...extra });
const cue = (id, sourceId, folderId, playback) => ({ id, sourceId, source: 'playout', label: id.toUpperCase(), values: {}, ...(folderId ? { folderId } : {}), ...(playback ? { playback } : {}) });
const graphic = (id, folderId) => ({ id, sourceId: `g-${id}`, label: id.toUpperCase(), values: {}, ...(folderId ? { folderId } : {}) });
const address = (item) => `${item.channel ?? 1}-${item.layer}`;
const BRIDGE_06 = { state: 'ok', features: ['state', 'playback', 'sequence', 'sequence-loop'], capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'], version: '2.5.0 69e8ad5 Stable' };
const BRIDGE_05 = { ...BRIDGE_06, features: ['state', 'playback', 'sequence'] };
const through = (extra = {}) => ({ id: 'T', name: 'Opening', mode: 'through', ...extra });

function fakeAct(...states) {
  const sent = [];
  let generation = 0;
  const act = async (action) => {
    sent.push(action);
    const state = states.shift() ?? 'ok';
    if (state !== 'ok') return { state, detail: `refused (${state})` };
    generation += 1;
    return { state, detail: 'connected', generation, session: 's1', ...(action.verb === 'take' || action.verb === 'sequence' ? { instance: `s1.${generation}` } : {}) };
  };
  return { act, sent };
}

// ── Play through ───────────────────────────────────────────────────────────────────────────────

test('a clip before the last plays into the next: its own ending gives way, its fade in, trim and level stay', () => {
  const item = vt('a', 10);
  const middle = asFolderMember({ playback: { end: 'clear', fadeOut: 'short', fadeIn: 'long', levelDb: -6, trimIn: 1 } }, item, false);
  assert.deepEqual(takePlayback(middle, item), { loop: false, playback: { fadeIn: 1, gain: 10 ** (-6 / 20), trim: { in: 1 } } });
  // Play next and the legacy loop give way too.
  assert.deepEqual(takePlayback(asFolderMember({ playback: { end: 'next' } }, item, false), item), { loop: false });
  assert.deepEqual(takePlayback(asFolderMember({}, { ...item, loop: true }, false), { ...item, loop: true }), { loop: false });
  // The last keeps its own, except Play next, which never leaves its folder.
  assert.deepEqual(takePlayback(asFolderMember({ playback: { end: 'clear', fadeOut: 'short' } }, item, true), item), { loop: false, playback: { end: 'clear', fadeOut: 0.5 } });
  assert.deepEqual(takePlayback(asFolderMember({ playback: { end: 'next' } }, item, true), item), { loop: false });
});

test('a Play-through folder plays its clips in order, from a taken member to the end, and round again when it loops', () => {
  const items = [vt('a', 10), vt('b', 10), vt('c', 10)];
  const cues = [cue('a', 'a', 'T'), cue('b', 'b', 'T', { end: 'clear' }), cue('x', 'a'), cue('c', 'c', 'T')];
  const ids = (r) => r.run.members.map((m) => m.cue.id);
  assert.deepEqual(ids(folderRun(through(), cues, items)), ['a', 'b', 'c']);
  assert.deepEqual(ids(folderRun(through(), cues, items, 'b')), ['b', 'c']);
  const looped = folderRun(through({ end: 'loop' }), cues, items, 'b');
  assert.deepEqual([ids(looped), looped.run.loop], [['b', 'c', 'a'], true]);
  // One clip is a plain Take; with Loop the folder, a looping one.
  const one = folderRun(through({ end: 'loop' }), [cue('a', 'a', 'T')], items);
  assert.deepEqual([one.run.members.length, one.run.loop, takePlayback(one.run.members[0].cue, items[0]).loop], [1, false, true]);
  // What cannot play through is named, whole.
  const withGraphic = [cue('a', 'a', 'T'), graphic('strap', 'T')];
  assert.deepEqual(folderRun(through(), withGraphic, items), { ok: false, reason: 'STRAP is a graphic, and a folder that plays through plays clips and audio files only.' });
  const many = Array.from({ length: 101 }, (_, i) => cue(`c${i}`, 'a', 'T'));
  assert.equal(folderRun(through(), many, items).reason, 'Opening holds 101 clips; a folder that plays through plays at most 100.');
});

test('a folder that cannot be taken with this Bridge or server says why, judged on the clips as it plays them', () => {
  const items = [vt('a', 10), vt('b', 10)];
  const cues = [cue('a', 'a', 'T', { end: 'clear' }), cue('b', 'b', 'T')];
  const run = (folder = through(), c = cues, it = items) => folderRun(folder, c, it);
  assert.equal(folderRunBlocker(run(through({ end: 'loop' })), BRIDGE_06), null);
  assert.equal(
    folderRunBlocker(run(through({ end: 'loop' })), BRIDGE_05),
    'This folder starts over after its last clip. Update NoaCG Bridge to take it, or set At the end to As the last clip says.',
  );
  // Without the sequence at all, the one fix is to stop playing through.
  assert.equal(
    folderRunBlocker(run(through({ end: 'loop' })), { ...BRIDGE_05, features: ['state', 'playback'] }),
    'This folder plays its clips one after another. Update NoaCG Bridge to take it, or set How it plays to One by one.',
  );
  assert.equal(
    folderRunBlocker(run(), { ...BRIDGE_06, capabilities: [] }),
    'This folder plays its clips one after another, which CasparCG 2.5.0 cannot do. To take it, set How it plays to One by one.',
  );
  assert.equal(folderRunBlocker(run(), null), 'Asking NoaCG Bridge what it can play…');
  // The first clip's Clear gives way, so a server that cannot clear is no reason; a fade still is.
  assert.equal(folderRunBlocker(run(), { ...BRIDGE_06, capabilities: ['state', 'sequence'] }), null);
  const faded = [cue('a', 'a', 'T', { fadeIn: 'short' }), cue('b', 'b', 'T')];
  assert.match(folderRunBlocker(run(through(), faded), { ...BRIDGE_06, capabilities: ['state', 'sequence'] }), /^A, which this folder plays: This cue fades/);
  // A clip too short to queue in time, a length or a kind not known - each named.
  const short = [cue('a', 'a', 'T'), cue('b', 'b', 'T')];
  const shortItems = [vt('a', 1.5), vt('b', 1.5)];
  assert.equal(folderRunBlocker(run(through(), short, shortItems), BRIDGE_06), 'B plays 1.5 s; in a folder that plays through, every clip after the first plays at least 2 s.');
  assert.equal(folderRunBlocker(run(through(), short, [vt('a', 1.5), vt('b', 10)]), BRIDGE_06), null, 'a short first clip is fine when nothing comes round to it');
  assert.equal(folderRunBlocker(run(through({ end: 'loop' }), short, [vt('a', 1.5), vt('b', 10)]), BRIDGE_06), 'A plays 1.5 s; in a folder that loops, every clip plays at least 2 s.');
  assert.equal(folderRunBlocker(run(through(), short, [vt('a', 10), { ...vt('b', 10), mediaKind: undefined }]), BRIDGE_06), "B is not in the server's list yet, so its kind is not known.");
  assert.equal(folderRunBlocker(run(through(), short, [vt('a', 10), { ...vt('b', 10), frames: undefined }]), BRIDGE_06), 'B has no known length.');
  // A lone clip that loops goes as the legacy loop, which every Bridge understands.
  assert.equal(folderRunBlocker(run(through({ end: 'loop' }), [cue('a', 'a', 'T')]), { ...BRIDGE_05, features: [] }), null);
});

test('takeBlocker knows folders: a member takes by its folder\'s rules, a folder by how it plays', () => {
  const items = [vt('a', 10), vt('b', 10), { ...vt('still', 0), mediaKind: 'still', frames: undefined }];
  const folders = [through({ end: 'loop' })];
  const cues = [cue('a', 'a', 'T'), cue('b', 'b', 'T'), cue('logo', 'still', 'T')];
  const expected = 'LOGO is a still, which never ends, and a folder that plays through plays clips and audio files only.';
  assert.equal(takeBlocker(cues[0], cues, items, address, BRIDGE_06, folders), expected);
  assert.equal(takeBlocker(folders[0], cues, items, address, BRIDGE_06, folders), expected);
  // The still itself is taken on its own Take, as outside any folder.
  assert.equal(throughFolderOf(cues[2], cues, items, folders), undefined);
  assert.match(takeBlocker(cues[2], cues, items, address, BRIDGE_06, folders), /Update NoaCG Bridge/);
  assert.equal(takeBlocker({ ...cues[2], imageFit: 'stretch' }, cues, items, address, BRIDGE_06, folders), null);
  // Without folders, nothing changed.
  assert.equal(takeBlocker(cues[0], cues, items, address, BRIDGE_05), null);

  // A mode this build does not know reads as One by one here too, as it is drawn: it steps, each
  // press one cue's own Take, and is never sent down another mode's path. What a step would take is
  // judged at the press, on that cue (folderStep).
  const other = [{ id: 'N', name: 'Next', mode: 'rotate' }];
  const two = [cue('a', 'a', 'N'), cue('b', 'b', 'N')];
  assert.equal(takeBlocker(other[0], two, [vt('a', 10), vt('b', 10, { layer: 11 })], address, BRIDGE_06, other), null);
  assert.equal(takeBlocker({ id: 'N', name: 'Next' }, two, [vt('a', 10), vt('b', 10, { layer: 11 })], address, BRIDGE_06, other), null);
});

test("each clip's place in its Play-through folder, in one pass, agrees with throughFolderOf", () => {
  const items = [vt('a', 10), vt('b', 10), vt('c', 10), { ...vt('still', 0), mediaKind: 'still', frames: undefined }];
  const cues = [cue('a', 'a', 'T'), cue('b', 'b', 'T'), cue('logo', 'still', 'T'), cue('c', 'c', 'L'), cue('x', 'a'), cue('gone', 'b', 'GONE')];
  const folders = [through(), { id: 'L', name: 'One', mode: 'through', end: 'loop' }, { id: 'T', name: 'Twice', mode: 'manual' }];
  const places = throughPlaces(cues, items, folders);
  assert.deepEqual([...places].map(([id, p]) => [id, p.folder.id, p.role]), [['a', 'T', 'middle'], ['b', 'T', 'middle'], ['c', 'L', 'loop-alone']]);
  for (const c of cues) assert.equal(places.get(c.id)?.folder, throughFolderOf(c, cues, items, folders), c.id);
  assert.equal(throughPlaces(cues, items, [through({ end: 'loop' })]).get('b').role, 'middle');
  assert.equal(throughPlaces([cue('a', 'a', 'T'), cue('b', 'b', 'T')], items, [through({ end: 'loop' })]).get('b').role, 'loop-last');
  assert.equal(throughPlaces([cue('a', 'a', 'T'), cue('b', 'b', 'T')], items, [through()]).get('b').role, 'last');
});

test('a folder that loops sends `loop`, and only then: a sequence that ends is the action it always was', async () => {
  const items = [vt('a', 10), vt('b', 10)];
  const members = folderRun(through(), [cue('a', 'a', 'T'), cue('b', 'b', 'T')], items).run.members;
  assert.equal('loop' in sequenceAction(members, slot(2, 10)), false);
  assert.equal(sequenceAction(members, slot(2, 10), true).loop, true);
  const { act, sent } = fakeAct();
  const outcome = await runServerVerb({ verb: 'take', cue: members[0].cue, item: items[0], label: 'Take', live: undefined, slotNow: slot(2, 10), values: () => ({}), act, sequence: members, loop: true });
  assert.equal(outcome.ok, true);
  assert.deepEqual([sent.length, sent[0].verb, sent[0].loop], [1, 'sequence', true]);
});

test('Play next never leaves the cue\'s own folder, either way', () => {
  const items = [vt('a', 10), vt('b', 10), vt('c', 10), vt('s', 3, { layer: 5 })];
  const folders = [{ id: 'F', name: 'F', mode: 'manual' }];
  const reason = (cues, id) => playNextTarget(cues, items, id, address, folders);
  // From no folder into one, and from a folder past its end.
  assert.deepEqual(reason([cue('a', 'a'), cue('b', 'b', 'F')], 'a'), { ok: false, reason: 'the next clip is in another folder' });
  assert.deepEqual(reason([cue('a', 'a', 'F'), cue('b', 'b')], 'a'), { ok: false, reason: 'the next clip is in another folder' });
  // Inside the folder, past a cue on another slot, and across a split folder's runs.
  assert.equal(reason([cue('a', 'a', 'F'), cue('s', 's', 'F'), cue('b', 'b', 'F')], 'a').next.cue.id, 'b');
  assert.equal(reason([cue('a', 'a', 'F'), cue('s', 's'), cue('b', 'b', 'F')], 'a').next.cue.id, 'b');
  // A folderId naming no folder reads as none.
  assert.equal(reason([cue('a', 'a'), cue('b', 'b', 'GONE')], 'a').next.cue.id, 'b');
});

test('the page holds a looping sequence as the Bridge says it, and ON AIR comes round with it', () => {
  const items = [vt('a', 10), vt('b', 10)];
  const cues = [cue('a', 'a', 'T'), cue('b', 'b', 'T')];
  const entry = (id) => ({ item: { kind: 'media', name: id.toUpperCase() }, cueId: id, media: { kind: 'movie', seconds: 10 } });
  const taken = applyAccepted({ ownership: NO_OWNERSHIP, timing: {} }, { verb: 'take', slot: slot(2, 10), generation: 1, session: 's1', instance: 's1.1', itemId: 'a', cueId: 'a', length: 10, now: 0, readable: true, sequence: { next: [entry('b')], loop: true } });
  const ctx = { channel: 2, now: 0, cues, items, slotOf: (i) => slot(i.channel, i.layer) };
  const reading = (s) => ({ ok: true, channel: 2, session: 's1', observedAt: 0, slots: [{ layer: 10, producer: 'video', paused: false, loop: false, generation: 1, instance: 's1.1', segment: { start: 0, length: 10 }, ...s }] });
  let parts = applyReading(taken, reading({ file: 'B', position: 2, cueId: 'b', sequence: { next: [entry('a')], loop: true } }), { ...ctx, now: 11_000 });
  assert.deepEqual(Object.keys(parts.ownership.onAir), ['b']);
  assert.deepEqual(parts.ownership.sequences, { '2-10': { next: [entry('a')], loop: true } });
  assert.equal(parts.timing['2-10'].loop, false, 'the folder\'s loop is not the server\'s own LOOP');
  // The wrap: the first entry again.
  parts = applyReading(parts, reading({ file: 'A', position: 1, cueId: 'a', sequence: { next: [entry('b')], loop: true } }), { ...ctx, now: 21_000 });
  assert.deepEqual(Object.keys(parts.ownership.onAir), ['a']);
  const clock = clipClock(parts.ownership, parts.timing, items, cues, 21_000);
  assert.deepEqual([clock.end, clock.finally, clock.toStudio, clock.phase, clock.next.label], ['next', 'loop', undefined, 'looping', 'B']);
  // A folder's slot that no item plays on is still read.
  const alone = applyReading({ ownership: NO_OWNERSHIP, timing: {} }, { ok: true, channel: 3, session: 's1', observedAt: 0, slots: [{ layer: 12, producer: 'video', file: 'X', paused: false, loop: false, generation: 0 }] }, { ...ctx, channel: 3, alsoSlots: [slot(3, 12)] });
  assert.equal(alone.ownership.unidentified.length, 1);
});

test('one file never goes on air on two slots through this page', () => {
  const cues = [cue('a', 'a', 'T'), cue('b', 'b', 'T'), cue('a2', 'a')];
  const inT = (id) => (id === 'a' || id === 'b' ? 'T' : undefined);
  const upOn = (itemId, cueId, s) => ({ ...NO_OWNERSHIP, onAir: { [itemId]: { cueId, slot: s } } });
  // A standalone cue of A is up on 2-5: the folder cannot play A on 2-10.
  assert.equal(airClash({ slot: '2-10', cueIds: ['a', 'b'], folderId: 'T' }, upOn('a', 'a2', slot(2, 5)), cues, inT), 'A2 is up on 2-5. Take it off there first.');
  // The folder plays A on 2-10: a standalone Take of A on 2-5 is refused.
  assert.equal(airClash({ slot: '2-5', cueIds: ['a2'] }, upOn('a', 'a', slot(2, 10)), cues, inT), 'A is up on 2-10. Take it off there first.');
  // A is still to play in the folder's loop on 2-10.
  const waiting = { ...upOn('b', 'b', slot(2, 10)), sequences: { '2-10': { next: [{ item: { kind: 'media', name: 'A' }, cueId: 'a', media: { kind: 'movie', seconds: 10 } }], loop: true } } };
  assert.equal(airClash({ slot: '2-5', cueIds: ['a2'] }, waiting, cues, inT), 'A is still to play on 2-10. Take that off first.');
  // The folder's own run moved to another slot, and a plain re-take of a moved file, are not clashes.
  assert.equal(airClash({ slot: '2-12', cueIds: ['a', 'b'], folderId: 'T' }, waiting, cues, inT), null);
  assert.equal(airClash({ slot: '2-5', cueIds: ['a2'] }, upOn('a', 'a2', slot(2, 10)), cues, inT), null);
});

// ── All together ───────────────────────────────────────────────────────────────────────────────

const rundown = (over = {}) => ({
  items: [vt('vt', 60), vt('bed', 20, { layer: 5, mediaKind: 'audio' })],
  addressOf: address,
  graphicOf: (c) => ({ 'g-strap': { name: 'Hairline', layer: 20 }, 'g-bug': { name: 'Bug', layer: 22 } })[c.sourceId] ?? null,
  ability: BRIDGE_06,
  blockerOf: () => null,
  ...over,
});

test('All together is refused before anything is sent, naming the cue', () => {
  const plan = (members, r = rundown()) => togetherPlan(members, r);
  assert.equal(plan([cue('vt', 'vt'), cue('vt2', 'vt')]).reason, 'VT and VT2 both play on 2-10, which holds one thing at a time. Move one of them to another layer to take this folder.');
  assert.equal(plan([graphic('strap'), { ...graphic('strap2'), sourceId: 'g-strap' }]).reason, 'STRAP and STRAP2 are both cues of Hairline, which shows one cue at a time. Keep one of them in this folder.');
  assert.equal(plan([graphic('strap'), graphic('bug')], rundown({ graphicOf: () => ({ name: 'x', layer: 20 }) })).reason, 'STRAP and BUG are both cues of x, which shows one cue at a time. Keep one of them in this folder.');
  assert.equal(plan([graphic('strap'), graphic('bug')], rundown({ graphicOf: (c) => ({ name: c.sourceId, layer: 20 }) })).reason, 'STRAP and BUG both air on layer 20. Give one of their graphics another layer to take this folder.');
  assert.equal(plan([cue('gone', 'nope')]).reason, 'GONE plays a file this production no longer lists.');
  assert.equal(plan([graphic('lost')]).reason, 'LOST points at a graphic this production no longer has.');
  assert.equal(plan([cue('vt', 'vt')], rundown({ ability: null })).reason, 'Asking NoaCG Bridge what it can play…');
  assert.equal(plan([cue('vt', 'vt')], rundown({ ability: { state: 'config' } })).reason, 'VT plays on the playout server, and NoaCG Bridge is not connected.');
  assert.equal(plan([graphic('strap')], rundown({ ability: null })).ok, true, 'graphics alone never wait for a Bridge');
  assert.equal(plan([cue('vt', 'vt')], rundown({ blockerOf: () => 'This cue fades. Update NoaCG Bridge to take it, or set its fades to Cut.' })).reason, 'VT: This cue fades. Update NoaCG Bridge to take it, or set its fades to Cut.');
  assert.equal(plan([cue('vt', 'vt', undefined, { end: 'next' })]).reason, 'VT: This cue plays the next clip, and every cue of this folder starts at once. Set another ending to take it.');
  // The server cues first, then the graphics, each in rundown order.
  const ok = plan([graphic('strap'), cue('bed', 'bed'), cue('vt', 'vt')]);
  assert.deepEqual([ok.server.map((m) => m.cue.id), ok.graphics.map((g) => g.cue.id)], [['bed', 'vt'], ['strap']]);
  // One by one steps: each press is judged on the cue it takes, at the press.
  assert.equal(folderTakeBlocker({ id: 'M', name: 'M', mode: 'manual' }, [], rundown()), null);
});

test('the run sends each server cue alone, then the graphics; a refusal stops nothing and nothing is retried', async () => {
  const items = rundown().items;
  const members = [cue('vt', 'vt'), cue('bed', 'bed'), graphic('strap')];
  const plan = togetherPlan(members, rundown());
  const { act, sent } = fakeAct('ok', 'server', 'ok');
  const order = [];
  const results = await runTogether(plan, {
    server: async (m) => {
      order.push(m.cue.id);
      const o = await runServerVerb({ verb: 'take', cue: m.cue, item: m.item, label: `Take of ${m.cue.label}`, live: undefined, slotNow: slot(2, m.item.layer), values: () => ({}), act });
      return { ok: o.ok, note: o.note };
    },
    graphic: async (g) => (order.push(g.cue.id), { ok: true, note: `✓ Take of ${g.cue.label}` }),
    off: async () => assert.fail('nothing is taken back off'),
    stopped: () => false,
  });
  assert.deepEqual(order, ['vt', 'bed', 'strap']);
  // Exactly what a Take of each cue alone sends.
  assert.deepEqual(sent, [
    { verb: 'take', item: { kind: 'media', name: 'VT' }, slot: slot(2, 10), cueId: 'vt' },
    { verb: 'take', item: { kind: 'media', name: 'BED' }, slot: slot(2, 5), cueId: 'bed' },
  ]);
  assert.deepEqual(results.map((r) => [r.cueId, r.ok, r.sent]), [['vt', true, true], ['bed', false, true], ['strap', true, true]]);
  assert.equal(togetherNote('Opening', results), 'Take: Opening, 2 of 3 on air. Take of BED did not reach the playout server: refused (server).');
  assert.equal(togetherNote('Opening', results.map((r) => ({ ...r, ok: true, note: '✓ fine' }))), '✓ Take: Opening, 3 of 3 on air');
  void items;
});

test('the graphics of an All-together run start together, and answer in rundown order', async () => {
  const plan = togetherPlan([cue('vt', 'vt'), graphic('strap'), graphic('bug'), graphic('logo')], rundown({ graphicOf: (c) => ({ name: c.id, layer: { strap: 20, bug: 21, logo: 22 }[c.id] }) }));
  assert.equal(plan.ok, true);
  let inFlight = 0;
  let most = 0;
  const release = [];
  const results = runTogether(plan, {
    server: async () => ({ ok: true, note: '✓' }),
    graphic: (g) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      // The last graphic answers first: the order of the results must not follow the answers.
      return new Promise((resolve) => release.push(() => (inFlight -= 1, resolve({ ok: g.cue.id !== 'bug', note: `✓ ${g.cue.id}` }))));
    },
    off: async () => assert.fail('nothing is taken back off'),
    stopped: () => false,
  });
  for (let i = 0; i < 20 && release.length < 3; i++) await new Promise((r) => setTimeout(r, 0));
  // Every graphic is on its way before any has answered. (One at a time, only the first would be.)
  assert.equal(most, 3);
  for (const r of [...release].reverse()) r();
  assert.deepEqual((await results).map((r) => [r.cueId, r.ok]), [['vt', true], ['strap', true], ['bug', false], ['logo', true]]);
});

test('Out or All out during the run: nothing more is sent, and what lands after is taken back off', async () => {
  const plan = togetherPlan([cue('vt', 'vt'), cue('bed', 'bed'), graphic('strap')], rundown());
  let stopped = false;
  const offs = [];
  const results = await runTogether(plan, {
    server: async (m) => {
      if (m.cue.id === 'bed') stopped = true; // Out pressed while BED's take was in flight
      return { ok: true, note: '✓' };
    },
    graphic: async () => assert.fail('the graphic is never sent'),
    off: async (m) => void offs.push(m.cue.id),
    stopped: () => stopped,
  });
  assert.deepEqual(offs, ['bed']);
  assert.deepEqual(results.map((r) => [r.cueId, r.sent]), [['vt', true], ['bed', true], ['strap', false]]);
  assert.equal(results[2].note, 'STRAP was not sent: the folder was taken off first.');
});

test('the clock follows the longest file that ends: a video before its own audio, a loop last', () => {
  const vtItem = vt('vt', 60);
  const bed = vt('bed', 300, { layer: 5, mediaKind: 'audio' });
  const sting = vt('sting', 60, { layer: 6, mediaKind: 'audio' });
  const rank = clockRank([
    { cue: cue('bed', 'bed', undefined, { end: 'loop' }), item: bed },
    { cue: cue('sting', 'sting'), item: sting },
    { cue: cue('vt', 'vt'), item: vtItem },
  ]);
  assert.deepEqual([...rank].sort((a, b) => b[1] - a[1]).map(([id]) => id), ['vt', 'sting', 'bed']);
  // Stamped with its rank, the most preferred file still up is the one the clock follows.
  let parts = { ownership: NO_OWNERSHIP, timing: {} };
  for (const [itemId, cueId, s] of [['vt', 'vt', slot(2, 10)], ['sting', 'sting', slot(2, 6)], ['bed', 'bed', slot(2, 5)]]) {
    parts = applyAccepted(parts, { verb: 'take', slot: s, generation: 1, itemId, cueId, now: 1000, takenAt: 1000 + rank.get(cueId), readable: false, length: 60 });
  }
  assert.equal(clockedClip(parts.ownership, parts.timing, [vtItem, sting, bed]).itemId, 'vt');
  assert.equal(parts.timing['2-10'].at, 1000, 'the estimate counts from the press, whatever the stamp');
});

// ── The folder's air state ─────────────────────────────────────────────────────────────────────

test('one function lights every folder, from what is up and never from the clock', () => {
  const items = [vt('a', 10), vt('b', 10), vt('bed', 20, { layer: 5 })];
  const cues = [cue('a', 'a', 'T'), cue('b', 'b', 'T'), cue('bed', 'bed', 'A'), graphic('strap', 'A'), graphic('bug', 'M'), graphic('x', 'M'), cue('orphan', 'a', 'GONE')];
  const folders = [through({ end: 'loop' }), { id: 'A', name: 'All', mode: 'together' }, { id: 'M', name: 'Round', mode: 'manual' }, { id: 'EMPTY', name: 'E', mode: 'manual' }];
  const ownership = {
    ...NO_OWNERSHIP,
    onAir: { b: { cueId: 'b', slot: slot(2, 10) }, bed: { cueId: 'bed', slot: slot(2, 5) } },
    sequences: { '2-10': { next: [{ item: { kind: 'media', name: 'A' }, cueId: 'a', media: { kind: 'movie', seconds: 10 } }], loop: true } },
  };
  const liveCue = { 'g-bug': 'bug' };
  const air = folderAir({ folders, cues, items, ownership, liveCue, graphicName: (c) => c.sourceId });
  assert.deepEqual(Object.keys(air), ['T', 'A', 'M']);
  assert.deepEqual([air.T.lit, air.T.onAir, air.T.following, air.T.looping, air.T.slot], ['on', ['b'], 1, true, '2-10']);
  assert.deepEqual([air.A.lit, air.A.onAir, air.A.total], ['partial', ['bed'], 2]);
  assert.deepEqual([air.M.lit, air.M.onAir], ['on', ['bug']]);
  assert.deepEqual(folderAirWords(air.A, 0), { tag: '1 OF 2 ON AIR', tone: 'part', title: '1 of the 2 cues of this folder is on air. Out takes it off.' });
  assert.deepEqual(folderAirWords(air.M, 0).tag, '1 ON AIR');
  assert.equal(folderAirWords(air.T, 0).title, 'Plays through on 2-10 and starts over after its last clip, until Out.');
  assert.deepEqual(folderAirWords({ ...air.A, onAir: [], lit: 'off' }, 1).tag, 'NOT TAKEN');
  assert.equal(folderAirWords({ ...air.A, onAir: [], lit: 'off' }, 0), null);
  // Before the first publish a graphic plays on this page only: UP, and ON AIR only for what airs.
  const rehearsal = folderAir({ folders, cues, items, ownership, liveCue: { 'g-bug': 'bug', 'g-strap': 'strap' }, graphicName: (c) => c.sourceId, graphicsAir: false });
  assert.equal(rehearsal.M.upHere, 1);
  assert.deepEqual(folderAirWords(rehearsal.M, 0), { tag: '1 UP', tone: 'up', title: '1 cue up on this page only: the production is not published.' });
  assert.equal(folderAirWords(rehearsal.A, 0).tag, '1 ON AIR · 1 UP', 'the bed airs through the Bridge, the strap is up here');
  assert.equal(rehearsal.T.upHere, undefined, 'clips air either way');
  assert.equal(folderAirWords(rehearsal.T, 0).tag, 'ON AIR');
  // Readings that move only the clock hand the page the same ownership object, so this never runs twice a second.

  // Whether it loops is the server's word, never the record's: a page that learned the take from a
  // reading (after a reload) sees the last clip of a run that ends, even once the folder is set to loop
  // for its next Take, and a one-clip folder the server loops.
  const ctx = { channel: 2, now: 0, cues: [cue('a', 'a', 'T'), cue('b', 'b', 'T')], items: [vt('a', 10), vt('b', 10)], slotOf: (i) => slot(i.channel, i.layer) };
  const read = (s) => applyReading({ ownership: NO_OWNERSHIP, timing: {} }, { ok: true, channel: 2, session: 's1', observedAt: 0, slots: [{ layer: 10, producer: 'video', paused: false, generation: 1, instance: 's1.1', segment: { start: 0, length: 10 }, position: 2, ...s }] }, ctx).ownership;
  const last = read({ file: 'B', cueId: 'b', loop: false });
  const lit = (ownership, folder) => folderAir({ folders: [folder], cues: ctx.cues, items: ctx.items, ownership, liveCue: {}, graphicName: () => null }).T;
  assert.equal(lit(last, through({ end: 'loop' })).looping, false);
  const alone = read({ file: 'A', cueId: 'a', loop: true });
  assert.equal(lit(alone, through()).looping, true);
});

// ── ONE BY ONE STEPS (docs/CLIP_PLAYBACK_PLAN.md §20.1) ─────────────────────────────────────────────

/** Two graphics on their own pool graphics, a clip and an audio file, in that order. */
const STEP = [
  { id: 'g1', graphic: true, replaces: 'pool:a' },
  { id: 'g2', graphic: true, replaces: 'pool:b' },
  { id: 'vt', graphic: false, replaces: 'slot:2-10' },
  { id: 'bed', graphic: false, replaces: 'slot:2-5' },
];
const up = (...ids) => new Set(ids);

test('a One-by-one folder steps: each press takes the next cue and the graphic before it off, never a clip', () => {
  assert.deepEqual(folderStep(STEP, undefined, up()), { kind: 'take', cueId: 'g1', off: [] });
  assert.deepEqual(folderStep(STEP, 'g1', up('g1')), { kind: 'take', cueId: 'g2', off: ['g1'] });
  // A graphic goes off whatever comes next, a clip included.
  assert.deepEqual(folderStep(STEP, 'g2', up('g2')), { kind: 'take', cueId: 'vt', off: ['g2'] });
  // A clip is never stopped by a step: the audio file comes in under it.
  assert.deepEqual(folderStep(STEP, 'vt', up('vt')), { kind: 'take', cueId: 'bed', off: [] });
  // The end: back to the top, the clip and the bed playing on.
  assert.deepEqual(folderStep(STEP, 'bed', up('vt', 'bed')), { kind: 'top', off: [] });
  // From the top, the first cue not on air.
  assert.deepEqual(folderStep(STEP, null, up('vt', 'bed')), { kind: 'take', cueId: 'g1', off: [] });
});

test('the end of a folder with a graphic up takes it off and goes back to the top', () => {
  const two = STEP.slice(0, 2);
  assert.deepEqual(folderStep(two, 'g2', up('g2')), { kind: 'top', off: ['g2'] });
  assert.deepEqual(folderStep(two, null, up()), { kind: 'take', cueId: 'g1', off: [] });
});

test('a cue of the same pool graphic replaces the one up rather than taking it off first', () => {
  const same = [
    { id: 'anna', graphic: true, replaces: 'pool:strap' },
    { id: 'ben', graphic: true, replaces: 'pool:strap' },
    { id: 'logo', graphic: true, replaces: 'pool:logo' },
  ];
  assert.deepEqual(folderStep(same, 'anna', up('anna')), { kind: 'take', cueId: 'ben', off: [] });
  assert.deepEqual(folderStep(same, 'ben', up('ben')), { kind: 'take', cueId: 'logo', off: ['ben'] });
});

test('manual takes and the server moving on never make a step re-take or skip back', () => {
  // A cue taken by hand mid-run moves the step to it (the page remembers it), and a graphic still up
  // from before goes off with the next step.
  assert.deepEqual(folderStep(STEP, 'vt', up('g1', 'vt')), { kind: 'take', cueId: 'bed', off: ['g1'] });
  // A cue already on air is passed over: a clip the server moved on to by itself is never re-taken.
  const clips = [
    { id: 'c1', graphic: false, replaces: 'slot:2-10' },
    { id: 'c2', graphic: false, replaces: 'slot:2-10' },
    { id: 'g', graphic: true, replaces: 'pool:a' },
  ];
  assert.deepEqual(folderStep(clips, 'c1', up('c2')), { kind: 'take', cueId: 'g', off: [] });
  // A reload forgets the memory: the furthest cue on air says where the step stands.
  assert.deepEqual(folderStep(STEP, undefined, up('g2')), { kind: 'take', cueId: 'vt', off: ['g2'] });
  // A remembered cue that has left the folder reads the same way.
  assert.deepEqual(folderStep(STEP, 'gone', up('g1')), { kind: 'take', cueId: 'g2', off: ['g1'] });
  // Everything on air and no graphic to take off: nothing a press can do.
  assert.deepEqual(folderStep(clips.slice(0, 2), null, up('c1', 'c2')), { kind: 'none' });
});

test('the TAKE button says what a step does and names the cues in its tooltip', () => {
  const label = (id) => id.toUpperCase();
  assert.deepEqual(stepFace({ kind: 'take', cueId: 'g1', off: [] }, 'Straps', label, false), { text: '⟳ TAKE', title: 'Take G1. SPACE does the same', tone: 'take' });
  assert.equal(stepFace({ kind: 'take', cueId: 'g2', off: ['g1'] }, 'Straps', label, true).text, '⟳ NEXT');
  assert.equal(stepFace({ kind: 'take', cueId: 'g2', off: ['g1'] }, 'Straps', label, true).title, 'Take G2, and G1 off. SPACE does the same');
  assert.equal(stepFace({ kind: 'top', off: ['g2'] }, 'Straps', label, true).text, '■ TAKE OFF');
  assert.equal(stepFace({ kind: 'top', off: [] }, 'Straps', label, true).text, '↺ FROM THE TOP');
  assert.match(stepFace({ kind: 'top', off: [] }, 'Straps', label, true).title, /its clips play on/);
});
