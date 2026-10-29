// guards: src/control/serverPlayout.ts, src/control/folderAir.ts, src/control/folderStep.ts, src/control/cuePlayback.ts, src/control/serverState.ts, src/control/folderPlayout.ts, src/control/playoutSession.ts
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
  // E3.2a: a member only its output confirms (an imported OGraf package) is sent, never on air.
  const foreign = results.map((r, i) => ({ ...r, ok: true, note: '✓ fine', ...(i === 0 ? { unconfirmed: true } : {}) }));
  assert.equal(togetherNote('Opening', foreign), 'Take: Opening, 2 of 3 on air, 1 sent to the outputs', 'no ✓ while a member awaits its output');
  // A sent member's own sentence is not repeated; a member that failed still says why.
  const mixed = foreign.map((r, i) => (i === 0 ? { ...r, note: 'Take: VT sent to the outputs' } : i === 1 ? { ...r, ok: false, note: 'BED refused' } : r));
  assert.equal(togetherNote('Opening', mixed), 'Take: Opening, 1 of 3 on air, 1 sent to the outputs. BED refused.');
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
  const mixed = folderAirWords(rehearsal.A, 0);
  assert.equal(mixed.tag, 'ON AIR', 'the bed airs through the Bridge, so the folder keeps its short words');
  assert.match(mixed.title, /1 cue up on this page only/, 'and says the strap is up here');
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
  assert.deepEqual(stepFace({ kind: 'take', cueId: 'g1', off: [] }, 'Straps', label, false), { text: '⟳ TAKE', title: 'Take G1', tone: 'take' });
  assert.equal(stepFace({ kind: 'take', cueId: 'g2', off: ['g1'] }, 'Straps', label, true).text, '⟳ NEXT');
  assert.equal(stepFace({ kind: 'take', cueId: 'g2', off: ['g1'] }, 'Straps', label, true).title, 'Take G2, and G1 off');
  assert.equal(stepFace({ kind: 'top', off: ['g2'] }, 'Straps', label, true).text, '■ TAKE OFF');
  assert.equal(stepFace({ kind: 'top', off: [] }, 'Straps', label, true).text, '↺ FROM THE TOP');
  assert.match(stepFace({ kind: 'top', off: [] }, 'Straps', label, true).title, /its clips play on/);
});

test('a folder lists every child\'s own outcome, and All together names the cues that share one place (data-sources C6, AC-16)', async () => {
  const { folderChildren } = await import('../src/control/folderAir.ts');
  const members = [
    { id: 'a', label: 'Score', source: 'graphic', sourceId: 'g1', values: {} },
    { id: 'b', label: 'Clip', source: 'playout', sourceId: 'p1', values: {} },
    { id: 'c', label: 'Lower third', source: 'graphic', sourceId: 'g2', values: {} },
    { id: 'd', label: 'Credits', source: 'graphic', sourceId: 'g3', values: {} },
    { id: 'e', label: 'Clip 2', source: 'playout', sourceId: 'p2', values: {} },
  ];
  const address = { a: 'L20', b: '1-10', c: 'L30', d: 'L20', e: '1-10' };
  const children = folderChildren(members, { mode: 'together', address: (c) => address[c.id], onAir: ['a', 'd'], misses: { b: 'NoaCG Bridge refused it: file not found', a: 'stale miss' }, graphicsAir: true });
  assert.deepEqual(children.map((c) => c.outcome), ['air', 'miss', 'off', 'air', 'off'], 'partial success is never one state');
  assert.equal(children[1].why, 'NoaCG Bridge refused it: file not found');
  assert.equal(children[0].why, undefined, 'a cue on air carries no old miss');
  // Both sides of each collision are named, graphics and server cues alike.
  assert.deepEqual(children.map((c) => c.sharesWith ?? []), [['Credits'], ['Clip 2'], [], ['Score'], ['Clip']]);
  // Before the first publish a graphic that is up plays on this page only, as its row says; a
  // server cue airs either way.
  const unpublished = folderChildren(members, { mode: 'together', address: (c) => address[c.id], onAir: ['a', 'b'], misses: {}, graphicsAir: false });
  assert.deepEqual(unpublished.slice(0, 2).map((c) => c.outcome), ['up', 'air']);
  // One by one and Play through use one place in turn by design: no collision.
  for (const mode of ['manual', 'through']) {
    assert.ok(folderChildren(members, { mode, address: (c) => address[c.id], onAir: [], misses: {}, graphicsAir: true }).every((c) => c.sharesWith === undefined), mode);
  }
});

// ── THE FOLDER VERBS AND THEIR CANCELLATION (control/folderPlayout.ts; production-page refactor §4.2,
// AC-4) ─────────────────────────────────────────────────────────────────────────────────────────
//
// The module on a real session, with the page faked: every server verb, graphic Take, send and save
// wait is recorded in one ordered log and answered only when the test says so, so an answer can come
// late, out of order, after Out or All out, or after the session's end.

const { createFolderPlayout } = await import('../src/control/folderPlayout.ts');
const { createPlayoutSession } = await import('../src/control/playoutSession.ts');

const SENT = { ok: true, skipped: [], superseded: [], pressedAgain: [] };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 10; i++) await tick();
};

/** A folder rig: `held` calls wait for `answer(i, result)`; otherwise each answers at once with
 *  `auto(call)`. The server's ownership and the page's liveCue move as the page's own verbs move
 *  them: a server take puts its cue up on its item, an Out takes it off. */
function folderRig({ folders, cues, items = rundown().items, graphicOf = (c) => ({ 'g-strap': 'Hairline', 'g-bug': 'Bug', 'g-g1': 'One', 'g-g2': 'Two' })[c.sourceId] ?? null } = {}) {
  const session = createPlayoutSession('prod-1');
  const log = [];
  const calls = [];
  const notes = [];
  let held = false;
  let liveCue = {};
  let ownership = NO_OWNERSHIP;
  let clock = 5000;
  const itemOf = (c) => (c.source === 'playout' ? (items.find((i) => i.id === c.sourceId) ?? null) : null);
  const call = (kind, detail, auto) =>
    new Promise((resolve) => {
      log.push(`${kind} ${detail}`);
      const entry = { kind, detail, resolve: (r) => (log.push(`answer ${kind} ${detail}`), resolve(r === undefined ? auto() : r)) };
      calls.push(entry);
      if (!held) entry.resolve();
    });
  const page = {
    cues,
    folders: new Map(folders.map((f) => [f.id, f])),
    members: new Map(folders.map((f) => [f.id, cues.filter((c) => c.folderId === f.id)])),
    items,
    itemOf,
    graphicOf,
    get folderSteps() {
      return session.folders.get().folderSteps;
    },
    stepMembers: (folderId) => cues.filter((c) => c.folderId === folderId).map((c) => (itemOf(c) ? { id: c.id, graphic: itemOf(c).kind === 'template', replaces: `item:${c.sourceId}` } : { id: c.id, graphic: true, replaces: `pool:${c.sourceId}` })),
    folderName: (f) => f.name,
    takeBlocker: () => null,
    stepBlocker: () => null,
    together: rundown({ items, graphicOf: (c) => (graphicOf(c) ? { name: graphicOf(c), layer: { 'g-strap': 20, 'g-bug': 22 }[c.sourceId] ?? 30 } : null) }),
    ownership: () => ownership,
    liveCueOf: () => liveCue,
    setLiveCue: (fold) => {
      log.push('fold liveCue');
      liveCue = fold(liveCue);
    },
    serverVerb: (c, verb, label, options = {}) => {
      const item = itemOf(c);
      if (!item) return Promise.resolve(null);
      return call('server', `${verb} ${c.id} "${label}"${options.cut ? ' cut' : ''}${options.takenAt !== undefined ? ` at ${options.takenAt}` : ''}`, () => {
        const onAir = { ...ownership.onAir };
        if (verb === 'take') onAir[item.id] = { cueId: c.id, slot: slot(item.channel, item.layer) };
        if (verb === 'out') delete onAir[item.id];
        ownership = { ...ownership, onAir };
        return { ok: true, note: `✓ ${label}: ${c.label}`, accepted: [] };
      });
    },
    takeGraphic: (c, label) =>
      call('graphic', `${c.id} "${label}"`, () => {
        liveCue = { ...liveCue, [graphicOf(c)]: c.id };
        return { ok: true, note: `✓ ${label}: ${c.label}` };
      }),
    takeCue: async (c) => {
      if (c.source === 'playout') {
        const o = await page.serverVerb(c, 'take', 'Take');
        if (o?.ok) fp.noteStep(c);
        return;
      }
      const t = await page.takeGraphic(c, 'Take');
      if (t?.ok) fp.noteStep(c);
    },
    send: (batches, label) =>
      call('send', `${label} ${batches.map((b) => b[0].graphic).join(',')}`, () => SENT),
    flush: () => call('flush', '', () => undefined),
    note: (text) => notes.push(text),
  };
  const fp = createFolderPlayout(session, { now: () => clock }, () => page);
  return {
    session, fp, page, log, calls, notes,
    hold: () => (held = true),
    /** Answer the oldest call still waiting of this kind (or the call at `i`). */
    answer: (match, result) => {
      const entry = calls.find((c) => !c.done && `${c.kind} ${c.detail}`.includes(match));
      assert.ok(entry, `a call waits that matches ${match}`);
      entry.done = true;
      entry.resolve(result);
    },
    up: (cueId, itemId) => (ownership = { ...ownership, onAir: { ...ownership.onAir, [itemId]: { cueId, slot: slot(2, 10) } } }),
    live: (map) => (liveCue = { ...liveCue, ...map }),
    liveCue: () => liveCue,
    folders: () => session.folders.get(),
    setClock: (t) => (clock = t),
  };
}

const TOGETHER = { id: 'A', name: 'Opening', mode: 'together' };
const togetherCues = [cue('vt', 'vt', 'A'), cue('bed', 'bed', 'A'), { ...graphic('strap', 'A') }, { ...graphic('bug', 'A') }];

test('All together: the save wait first, the run registered after it, each server cue alone, then the graphics at once; misses and the note from every answer', async () => {
  const r = folderRig({ folders: [TOGETHER], cues: togetherCues });
  r.hold();
  r.session.apply((p) => ({ ...p, folders: { ...p.folders, takeMisses: { vt: 'old miss', other: 'kept' } } }));
  const done = r.fp.take(TOGETHER);
  await settle();
  // Nothing is sent, and the folder is not yet being sent, while the draft saves (S3 kept, phase 1).
  assert.deepEqual(r.log, ['flush ']);
  assert.equal(r.fp.running('A'), false);
  assert.equal(r.folders().sending.has('A'), false);
  r.answer('flush');
  await settle();
  assert.equal(r.fp.running('A'), true);
  assert.deepEqual([...r.folders().sending], ['A']);
  assert.deepEqual(r.folders().takeMisses, { other: 'kept' }, 'the folder\'s own misses clear when its run starts');
  // The longest file that ends is ranked last; each take is stamped with the press time plus its rank.
  assert.deepEqual(r.log.slice(1), ['answer flush ', 'server take vt "Take of VT" at 5001']);
  r.answer('take vt');
  await settle();
  assert.equal(r.log.at(-1), 'server take bed "Take of BED" at 5000', 'the second server cue goes only after the first answered');
  // The bed is refused; the graphics then go together and answer in reverse.
  r.answer('take bed', { ok: false, note: 'Take of BED did not reach the playout server: refused (server)', accepted: [] });
  await settle();
  assert.deepEqual(r.log.slice(-2), ['graphic strap "Take of STRAP"', 'graphic bug "Take of BUG"']);
  r.answer('bug', { ok: false, note: 'BUG was refused' });
  r.answer('strap');
  await done;
  assert.deepEqual(r.folders().takeMisses, { other: 'kept', bed: 'Take of BED did not reach the playout server: refused (server)', bug: 'BUG was refused' });
  assert.deepEqual(r.notes, ['Take: Opening, 2 of 4 on air. Take of BED did not reach the playout server: refused (server). BUG was refused.']);
  assert.equal(r.fp.running('A'), false);
  assert.equal(r.folders().sending.size, 0);
});

test('a second Take of a folder still being sent sends nothing; a refused plan sends nothing and says why', async () => {
  const r = folderRig({ folders: [TOGETHER], cues: togetherCues });
  r.hold();
  const first = r.fp.take(TOGETHER);
  r.answer('flush');
  await settle();
  const before = r.log.length;
  await r.fp.take(TOGETHER);
  assert.equal(r.log.length, before, 'the second press neither waits for the save nor sends');
  r.answer('take vt');
  await settle();
  r.answer('take bed');
  await settle();
  r.answer('strap');
  r.answer('bug');
  await first;
  const clash = folderRig({ folders: [TOGETHER], cues: [cue('vt', 'vt', 'A'), cue('vt2', 'vt', 'A')] });
  await clash.fp.take(TOGETHER);
  assert.deepEqual(clash.log, ['flush ', 'answer flush ']);
  assert.deepEqual(clash.notes, ['Take was not sent: VT and VT2 both play on 2-10, which holds one thing at a time. Move one of them to another layer to take this folder.']);
  const blocked = folderRig({ folders: [TOGETHER], cues: togetherCues });
  blocked.page.takeBlocker = () => 'Asking NoaCG Bridge what it can play…';
  await blocked.fp.take(TOGETHER);
  assert.deepEqual(blocked.log, [], 'a blocked folder does not even wait for the save');
  assert.deepEqual(blocked.notes, ['Take was not sent: Asking NoaCG Bridge what it can play…']);
});

test('Out during an All-together Take: the held member is taken back off when it lands, nothing more is sent, and the run writes no misses or note', async () => {
  const r = folderRig({ folders: [TOGETHER], cues: togetherCues });
  r.hold();
  const done = r.fp.take(TOGETHER);
  r.answer('flush');
  await settle();
  const out = r.fp.out(TOGETHER);
  await settle();
  // Nothing of it is up yet, so Out itself sends nothing; it says so once.
  r.answer('take vt');
  await settle();
  // VT landed after the stop: taken back off with its own fade (no cut).
  assert.equal(r.log.at(-1), 'server out vt "Out"');
  r.answer('out vt');
  await done;
  await out;
  assert.ok(!r.log.some((l) => l.includes('bed') || l.includes('strap') || l.includes('bug')), 'no other member is sent');
  assert.deepEqual(r.folders().takeMisses, {});
  assert.deepEqual(r.notes, ['✓ Out: Opening']);
  assert.equal(r.fp.running('A'), false);
});

test('All out during a Take cuts what lands after it, and sends every One-by-one folder to the top', async () => {
  const r = folderRig({ folders: [TOGETHER, { id: 'M', name: 'Steps', mode: 'manual' }], cues: togetherCues });
  r.session.apply((p) => ({ ...p, folders: { ...p.folders, folderSteps: { M: 'g1', N: null } } }));
  r.hold();
  const done = r.fp.take(TOGETHER);
  r.answer('flush');
  await settle();
  r.fp.stopAll('all-out');
  assert.deepEqual(r.folders().folderSteps, { M: null, N: null }, 'synchronously, at the press');
  r.answer('take vt');
  await settle();
  assert.equal(r.log.at(-1), 'server out vt "All out" cut');
  r.answer('out vt');
  await done;
  assert.ok(!r.log.some((l) => l.includes('bed') || l.includes('strap')));
  assert.deepEqual(r.notes, []);
});

test('the session ends during a Take: a send held past it changes nothing when it lands, and nothing more is sent', async () => {
  const r = folderRig({ folders: [TOGETHER], cues: togetherCues });
  r.hold();
  const done = r.fp.take(TOGETHER);
  r.answer('flush');
  await settle();
  const parts = r.folders();
  r.session.dispose();
  assert.equal(r.fp.running('A'), false, 'the runs are cleared at the end');
  const sentBefore = r.log.length;
  r.answer('take vt');
  await done;
  // Only the answer itself: no Out, no further member, no note, no state.
  assert.deepEqual(r.log.slice(sentBefore), ['answer server take vt "Take of VT" at 5001']);
  assert.deepEqual(r.notes, []);
  assert.equal(r.folders(), parts, 'the folders part is the object it was at the end');
  // A press after the end waits for the save and sends nothing.
  const late = folderRig({ folders: [TOGETHER], cues: togetherCues });
  late.session.dispose();
  await late.fp.take(TOGETHER);
  assert.deepEqual(late.log, ['flush ', 'answer flush ']);
  assert.deepEqual(late.notes, []);
});

test('the session ends during the save wait: the Take never starts', async () => {
  const r = folderRig({ folders: [TOGETHER], cues: togetherCues });
  r.hold();
  const done = r.fp.take(TOGETHER);
  r.session.dispose();
  r.answer('flush');
  await done;
  assert.deepEqual(r.log, ['flush ', 'answer flush ']);
});

const THROUGH = { id: 'T', name: 'Clips', mode: 'through' };
const throughCues = [cue('vt', 'vt', 'T'), cue('bed', 'bed', 'T')];

test('Play through: one server Take of its first cue says its note; Out while it is on its way takes back off every member that landed', async () => {
  const r = folderRig({ folders: [THROUGH], cues: throughCues });
  await r.fp.take(THROUGH);
  assert.deepEqual(r.log, ['flush ', 'answer flush ', 'server take vt "Take of Clips"', 'answer server take vt "Take of Clips"']);
  assert.deepEqual(r.notes, ['✓ Take of Clips: VT']);
  const late = folderRig({ folders: [THROUGH], cues: throughCues });
  late.hold();
  const done = late.fp.take(THROUGH);
  late.answer('flush');
  await settle();
  void late.fp.out(THROUGH);
  late.answer('take vt');
  await settle();
  assert.equal(late.log.at(-1), 'server out vt "Out"');
  late.answer('out vt');
  await done;
  assert.deepEqual(late.notes, ['✓ Out: Clips'], 'the Take says nothing once stopped');
  // A refused Take after Out sends nothing back off.
  const refused = folderRig({ folders: [THROUGH], cues: throughCues });
  refused.hold();
  const d2 = refused.fp.take(THROUGH);
  refused.answer('flush');
  await settle();
  refused.fp.stopAll('all-out');
  refused.answer('take vt', { ok: false, note: 'no', accepted: [] });
  await d2;
  assert.equal(refused.log.at(-1), 'answer server take vt "Take of Clips"');
  assert.deepEqual(refused.notes, []);
});

test('Out takes every server cue of the folder off, one after another, then its graphics in one send, and moves liveCue only after the answer', async () => {
  const r = folderRig({ folders: [TOGETHER], cues: togetherCues });
  r.up('vt', 'vt');
  r.up('bed', 'bed');
  r.live({ Hairline: 'strap', Bug: 'other-cue' });
  r.session.apply((p) => ({ ...p, folders: { ...p.folders, takeMisses: { strap: 'x', elsewhere: 'y' }, folderSteps: { A: 'vt' } } }));
  r.hold();
  const done = r.fp.out(TOGETHER);
  assert.deepEqual(r.folders().folderSteps, { A: null });
  assert.deepEqual(r.folders().takeMisses, { elsewhere: 'y' });
  await settle();
  assert.deepEqual(r.log, ['server out vt "Out of VT"']);
  r.answer('out vt', { ok: false, note: 'VT did not go off.', accepted: [] });
  await settle();
  r.answer('out bed');
  await settle();
  // Only STRAP is this folder's graphic on air (BUG's layer holds another cue).
  assert.equal(r.log.at(-1), 'send Out Hairline');
  assert.ok(!r.log.includes('fold liveCue'), 'liveCue does not move before the answer');
  r.answer('send Out', { ...SENT, pressedAgain: ['Hairline'] });
  await done;
  assert.deepEqual(r.liveCue(), { Hairline: 'strap', Bug: 'other-cue' }, 'a graphic pressed again since stands');
  assert.deepEqual(r.notes, ['Out: Opening did not take all of it off. VT did not go off.']);
  const ok = folderRig({ folders: [TOGETHER], cues: togetherCues });
  ok.live({ Hairline: 'strap', Bug: 'bug' });
  await ok.fp.out(TOGETHER);
  assert.deepEqual(ok.liveCue(), {});
  assert.deepEqual(ok.log.slice(-2), ['answer send Out Hairline', 'fold liveCue']);
  assert.deepEqual(ok.notes, ['✓ Out: Opening']);
  const failed = folderRig({ folders: [TOGETHER], cues: togetherCues });
  failed.live({ Bug: 'bug' });
  failed.page.send = async () => ({ ok: false, note: 'Not sent: offline.' });
  await failed.fp.out(TOGETHER);
  assert.deepEqual(failed.liveCue(), { Bug: 'bug' });
  assert.deepEqual(failed.notes, ['Out: Opening did not take all of it off. Not sent: offline.']);
});

const MANUAL = { id: 'M', name: 'Steps', mode: 'manual' };
const manualCues = [graphic('g1', 'M'), graphic('g2', 'M'), cue('vt', 'vt', 'M')];

test('a step: the graphic up goes off first, its answer moves liveCue, then the next cue\'s own Take; the step follows the take', async () => {
  const r = folderRig({ folders: [MANUAL], cues: manualCues });
  r.live({ One: 'g1' });
  r.hold();
  const done = r.fp.step(MANUAL);
  await settle();
  assert.deepEqual(r.log, ['flush ']);
  assert.equal(r.fp.running('M'), false, 'registered only after the save wait');
  r.answer('flush');
  await settle();
  assert.equal(r.log.at(-1), 'send Out One');
  r.answer('send Out');
  await settle();
  assert.deepEqual(r.log.slice(-3), ['answer send Out One', 'fold liveCue', 'graphic g2 "Take"']);
  r.answer('g2');
  await done;
  assert.deepEqual(r.folders().folderSteps, { M: 'g2' });
  assert.deepEqual(r.liveCue(), { Two: 'g2' });
  // A press while one is being sent does nothing.
  r.hold();
  const next = r.fp.step(MANUAL);
  r.answer('flush');
  await settle();
  const before = r.log.length;
  await r.fp.step(MANUAL);
  assert.equal(r.log.length, before);
  r.answer('send Out');
  await settle();
  r.answer('take vt');
  await next;
  assert.deepEqual(r.folders().folderSteps, { M: 'vt' });
});

test('a folder\'s Out is a press on each live candidate layer it clears, settled by its answer (E7.1)', async () => {
  const r = folderRig({ folders: [MANUAL], cues: manualCues });
  const presses = [];
  r.page.selectionAired = (graphic, cueId, take, moves) => {
    presses.push(['press', graphic, cueId, take.status, moves]);
    return { landed: () => presses.push(['landed', graphic]), undo: () => presses.push(['undo', graphic]) };
  };
  r.live({ One: 'g1' });
  r.hold();
  const done = r.fp.step(MANUAL);
  r.answer('flush');
  await settle();
  assert.deepEqual(presses, [['press', 'One', '', 'none', true]], 'registered before the Out goes');
  r.answer('send Out');
  await settle();
  r.answer('g2');
  await done;
  assert.deepEqual(presses, [['press', 'One', '', 'none', true], ['landed', 'One']]);
});

test('a step whose graphic does not go off goes no further; the end goes back to the top; nothing left to take says so', async () => {
  const r = folderRig({ folders: [MANUAL], cues: manualCues });
  r.live({ One: 'g1' });
  r.page.send = async () => ({ ok: false, note: 'Not sent: offline.' });
  await r.fp.step(MANUAL);
  assert.ok(!r.log.some((l) => l.startsWith('graphic')), 'the next cue is never taken');
  assert.deepEqual(r.notes, ['Not sent: offline.']);
  const end = folderRig({ folders: [MANUAL], cues: manualCues });
  end.session.apply((p) => ({ ...p, folders: { ...p.folders, folderSteps: { M: 'vt' } } }));
  end.live({ Two: 'g2' });
  await end.fp.step(MANUAL);
  assert.deepEqual(end.folders().folderSteps, { M: null });
  assert.deepEqual(end.notes, ['✓ Steps: back to its first cue']);
  assert.deepEqual(end.liveCue(), {});
  const all = folderRig({ folders: [{ id: 'C', name: 'Clips', mode: 'manual' }], cues: [cue('vt', 'vt', 'C')] });
  all.up('vt', 'vt');
  all.session.apply((p) => ({ ...p, folders: { ...p.folders, folderSteps: { C: null } } }));
  await all.fp.step({ id: 'C', name: 'Clips', mode: 'manual' });
  assert.deepEqual(all.log, []);
  assert.deepEqual(all.notes, ['Everything in Clips is on air. 0 takes it off.']);
  const blocked = folderRig({ folders: [MANUAL], cues: manualCues });
  blocked.page.stepBlocker = (c) => `${c.label} waits`;
  await blocked.fp.step(MANUAL);
  assert.deepEqual(blocked.log, []);
  assert.deepEqual(blocked.notes, ['Take was not sent: G1 waits']);
});

test('Out or All out while a step\'s take is on its way: what it put up goes back off and the folder stays at the top', async () => {
  for (const [stop, label] of [['out', '"Out"'], ['all-out', '"All out" cut']]) {
    const r = folderRig({ folders: [MANUAL], cues: manualCues });
    r.session.apply((p) => ({ ...p, folders: { ...p.folders, folderSteps: { M: 'g2' } } }));
    r.hold();
    const done = r.fp.step(MANUAL);
    r.answer('flush');
    await settle();
    assert.equal(r.log.at(-1), 'server take vt "Take"');
    if (stop === 'out') void r.fp.out(MANUAL);
    else r.fp.stopAll('all-out');
    r.answer('take vt');
    await settle();
    assert.equal(r.log.at(-1), `server out vt ${label}`, stop);
    r.answer('out vt');
    await done;
    assert.deepEqual(r.folders().folderSteps, { M: null }, `${stop}: the take's own step is undone`);
  }
  // A graphic step taken back off: its graphic is cleared whatever liveCue says, unless pressed again.
  const g = folderRig({ folders: [MANUAL], cues: manualCues });
  g.hold();
  const done = g.fp.step(MANUAL);
  g.answer('flush');
  await settle();
  g.fp.stopAll('all-out');
  g.answer('g1');
  await settle();
  assert.equal(g.log.at(-1), 'send Out One');
  g.answer('send Out');
  await done;
  assert.deepEqual(g.liveCue(), {});
  assert.deepEqual(g.folders().folderSteps, { M: null });
  // The session's end while a step's take is on its way: nothing is taken back off.
  const e = folderRig({ folders: [MANUAL], cues: manualCues });
  e.hold();
  const d = e.fp.step(MANUAL);
  e.answer('flush');
  await settle();
  e.session.dispose();
  e.answer('g1');
  await d;
  assert.equal(e.log.at(-1), 'answer graphic g1 "Take"');
});

test('the misses and the step bookkeeping: cleared, noted and settled only when they move', () => {
  const r = folderRig({ folders: [MANUAL, TOGETHER], cues: [...manualCues, ...togetherCues] });
  r.session.apply((p) => ({ ...p, folders: { ...p.folders, takeMisses: { a: 'Take of A did not go', b: 'B refused' } } }));
  const before = r.folders();
  r.fp.clearMisses(['zz']);
  assert.equal(r.folders(), before, 'clearing a cue with no miss writes nothing');
  r.fp.clearMisses(['a']);
  assert.deepEqual(r.folders().takeMisses, { b: 'B refused' });
  r.fp.settleMisses((shown) => (shown === 'B refused' ? null : shown));
  assert.deepEqual(r.folders().takeMisses, {});
  const settled = r.folders();
  r.fp.settleMisses(() => null);
  assert.equal(r.folders(), settled);
  r.fp.noteStep(manualCues[1]);
  assert.deepEqual(r.folders().folderSteps, { M: 'g2' });
  const noted = r.folders();
  r.fp.noteStep(manualCues[1]);
  assert.equal(r.folders(), noted, 'the same cue again writes nothing');
  r.fp.noteStep(togetherCues[0]);
  assert.equal(r.folders(), noted, 'only a One-by-one folder has a step');
});
