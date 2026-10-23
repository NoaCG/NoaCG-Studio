// guards: src/control/takeBlockers.ts
//
// WHY A TAKE WOULD NOT GO, run in Node (docs/CLIP_PLAYBACK_PLAN.md §6.9): the refusals the production
// page asks before a Take, a direct trigger or a One-by-one step sends anything, with their wording
// and the order they are asked in. Moved out of ProductionPage in the production-page refactor's
// phase 5; the browser half - that the buttons, SPACE and the editor read them - is
// e2e/playout-cues.spec.ts, e2e/playout-folders.spec.ts and e2e/playout-clock.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { casparOffRefusal, directBlocker, stepBlocker, takeBlockerFor, takePlans } = await import('../src/control/takeBlockers.ts');
const { throughPlaces } = await import('../src/control/serverPlayout.ts');
const { rundownView } = await import('../src/model/rundownRows.ts');
const { NO_OWNERSHIP } = await import('../src/control/serverState.ts');

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
/** The NoaCG output on 1-20; new clips on channel 2. */
const SETTINGS = { channel: 1, layer: 20, clipChannel: 2 };
/** control/playoutLink.ts `itemSlot` and `folderSlot`, by the same rules. */
const SLOTS = {
  itemSlot: (s, item) => slot(item.channel ?? s.channel, item.layer),
  folderSlot: (s, folder) => slot(folder.slot?.channel ?? s.clipChannel, folder.slot?.layer ?? 10),
};
const vt = (id, extra = {}) => ({ id, adapter: 'casparcg', kind: 'media', name: id.toUpperCase(), layer: 10, channel: 2, mediaKind: 'movie', frames: 250, fps: 25, ...extra });
const strapItem = (id, extra = {}) => ({ id, adapter: 'casparcg', kind: 'template', name: id.toUpperCase(), layer: 21, channel: 1, ...extra });
const cue = (id, sourceId, extra = {}) => ({ id, sourceId, source: 'playout', label: id.toUpperCase(), values: {}, ...extra });
const graphic = (id, extra = {}) => ({ id, sourceId: `g-${id}`, label: id.toUpperCase(), values: {}, ...extra });
const BRIDGE = { state: 'ok', features: ['state', 'playback', 'sequence', 'sequence-loop'], capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'], version: '2.5.0' };

/** One render's facts, the way the page builds them. */
function context({ cues = [], items = [], folders = [], ownership = NO_OWNERSHIP, settings = SETTINGS, ability = BRIDGE, casparOn = true, bridgeDown = false, graphics = {} } = {}) {
  const { members } = rundownView({ cues, folders });
  return {
    cues,
    items,
    folders,
    members,
    places: throughPlaces(cues, items, folders),
    ownership,
    settings,
    ability,
    casparOn,
    bridgeDown,
    itemOf: (c) => (c.source === 'playout' ? (items.find((i) => i.id === c.sourceId) ?? null) : null),
    graphicOf: (c) => (graphics[c.sourceId] ? { name: graphics[c.sourceId], layer: 1 } : null),
    slots: SLOTS,
  };
}
const OUTPUT = 'Layer 20 on Channel 1 is the NoaCG output. Choose another layer for this.';
const CASPAR_OFF = 'CasparCG is off for this production.';

test('nothing held is never refused', () => {
  assert.equal(takeBlockerFor(null, context()), null);
});

test('a server cue is not taken while the CasparCG switch is off; a graphic cue still is', () => {
  const ctx = context({ cues: [cue('a', 'a'), graphic('g')], items: [vt('a')], casparOn: false, graphics: { 'g-g': 'Strap' } });
  assert.equal(casparOffRefusal(ctx.cues[0], false), CASPAR_OFF);
  assert.equal(casparOffRefusal(ctx.cues[0], true), null);
  assert.equal(casparOffRefusal(ctx.cues[1], false), null);
  assert.equal(takeBlockerFor(ctx.cues[0], ctx), CASPAR_OFF);
  assert.equal(takeBlockerFor(ctx.cues[1], ctx), null);
  assert.equal(takeBlockerFor(ctx.cues[0], { ...ctx, casparOn: true }), null);
});

test('the CasparCG switch is said before the output slot', () => {
  const ctx = context({ cues: [cue('s', 's')], items: [strapItem('s', { layer: 20 })], casparOn: false });
  assert.equal(takeBlockerFor(ctx.cues[0], ctx), CASPAR_OFF);
  assert.equal(takeBlockerFor(ctx.cues[0], { ...ctx, casparOn: true }), OUTPUT);
});

test('nothing is taken onto the NoaCG output\'s own slot: a cue, a Play-through folder, another folder\'s cue', () => {
  const onOutput = context({ cues: [cue('s', 's')], items: [strapItem('s', { layer: 20 })] });
  assert.equal(takeBlockerFor(onOutput.cues[0], onOutput), OUTPUT);
  // A layer above the output on its channel is the operator's to choose.
  const above = context({ cues: [cue('s', 's')], items: [strapItem('s', { layer: 21 })] });
  assert.equal(takeBlockerFor(above.cues[0], above), null);
  // The output's slot is read from the settings given.
  assert.equal(takeBlockerFor(above.cues[0], { ...above, settings: { ...SETTINGS, layer: 21 } }), 'Layer 21 on Channel 1 is the NoaCG output. Choose another layer for this.');

  const T = { id: 'T', name: 'Opening', mode: 'through', slot: { channel: 1, layer: 20 } };
  const through = context({ cues: [cue('a', 'a', { folderId: 'T' }), cue('b', 'b', { folderId: 'T' })], items: [vt('a'), vt('b')], folders: [T] });
  assert.equal(takeBlockerFor(T, through), OUTPUT, 'the folder plays on its own slot');
  assert.equal(takeBlockerFor(through.cues[1], through), OUTPUT, 'its clip plays on the folder\'s slot, not its own');

  const M = { id: 'M', name: 'Pack', mode: 'manual' };
  const manual = context({ cues: [cue('a', 'a', { folderId: 'M' }), cue('s', 's', { folderId: 'M' })], items: [vt('a'), strapItem('s', { layer: 20 })], folders: [M] });
  assert.equal(takeBlockerFor(M, manual), OUTPUT, 'another folder\'s cues each play on their own slot');
  assert.equal(takeBlockerFor(manual.cues[0], manual), null);
});

test('the output slot is said before a setting the Bridge cannot honour', () => {
  const cannot = { state: 'ok', features: [], capabilities: [] };
  const ctx = context({ cues: [cue('a', 'a', { playback: { fadeIn: 'short' } })], items: [vt('a', { channel: 1, layer: 20 })], ability: cannot });
  assert.equal(takeBlockerFor(ctx.cues[0], ctx), OUTPUT);
  const elsewhere = context({ cues: ctx.cues, items: [vt('a')], ability: cannot });
  assert.notEqual(takeBlockerFor(ctx.cues[0], elsewhere), null, 'the setting refuses it on any other slot');
  assert.notEqual(takeBlockerFor(ctx.cues[0], elsewhere), OUTPUT);
});

test('a Play next whose clip cannot be found is refused with the reason, never taken as a Hold', () => {
  const ctx = context({ cues: [cue('a', 'a', { playback: { end: 'next' } })], items: [vt('a')] });
  assert.match(takeBlockerFor(ctx.cues[0], ctx), /^This cue plays the next clip, but .+\. Set another ending to take it\.$/);
});

test('a file up on another slot is not taken onto a second, and a folder\'s own run moved is not a clash', () => {
  const T = { id: 'T', name: 'Opening', mode: 'through' };
  const cues = [cue('a', 'a', { folderId: 'T' }), cue('b', 'b', { folderId: 'T' }), cue('x', 'a')];
  const items = [vt('a'), vt('b')];
  // Another cue of the same file is up on 2-5: the folder's Take would put it on a second slot.
  const stray = context({ cues, items, folders: [T], ownership: { ...NO_OWNERSHIP, onAir: { a: { cueId: 'x', slot: slot(2, 5) } } } });
  assert.equal(takeBlockerFor(cues[0], stray), 'X is up on 2-5. Take it off there first.');
  assert.equal(takeBlockerFor(T, stray), 'X is up on 2-5. Take it off there first.');
  // The folder's own clip up on its old slot: its re-take takes it off first.
  const moved = context({ cues, items, folders: [T], ownership: { ...NO_OWNERSHIP, onAir: { a: { cueId: 'a', slot: slot(2, 5) } } } });
  assert.equal(takeBlockerFor(cues[1], moved), null);
  // Up where it would go anyway: no clash.
  const here = context({ cues, items, folders: [T], ownership: { ...NO_OWNERSHIP, onAir: { a: { cueId: 'x', slot: slot(2, 10) } } } });
  assert.equal(takeBlockerFor(cues[0], here), null);
});

test('a Play next is checked for every clip it will play, not only its own', () => {
  // P plays Q next on 2-10; Q's file is up on 3-10 as a Play-through folder's clip.
  const T = { id: 'T', name: 'Opening', mode: 'through', slot: { channel: 3, layer: 10 } };
  const cues = [cue('p', 'p', { playback: { end: 'next' } }), cue('q', 'q'), cue('tq', 'q', { folderId: 'T' })];
  const ctx = context({ cues, items: [vt('p'), vt('q')], folders: [T], ownership: { ...NO_OWNERSHIP, onAir: { q: { cueId: 'tq', slot: slot(3, 10) } } } });
  assert.deepEqual(takePlans(cues[0], ctx).map((p) => [p.slot, p.cueIds()]), [['2-10', ['p', 'q']]]);
  assert.equal(takeBlockerFor(cues[0], ctx), 'TQ is up on 3-10. Take it off there first.');
});

test('a setting refusal is said before an air clash', () => {
  const T = { id: 'T', name: 'Opening', mode: 'through' };
  const cues = [cue('a', 'a', { folderId: 'T', playback: { fadeIn: 'short' } }), cue('x', 'a')];
  const ctx = context({ cues, items: [vt('a')], folders: [T], ownership: { ...NO_OWNERSHIP, onAir: { a: { cueId: 'x', slot: slot(2, 5) } } }, ability: { state: 'ok', features: ['state'], capabilities: ['state'] } });
  const why = takeBlockerFor(cues[0], ctx);
  assert.ok(why && !why.startsWith('X is up'), why);
});

test('a direct trigger: a graphic cue needs its graphic, a server cue the switch, its file and a slot that is not the output', () => {
  const ctx = context({ cues: [graphic('g'), graphic('h'), cue('a', 'a'), cue('gone', 'nothing')], items: [vt('a')], graphics: { 'g-g': 'Strap' } });
  assert.equal(directBlocker(ctx.cues[0], ctx, SETTINGS), null);
  assert.equal(directBlocker(ctx.cues[1], ctx, SETTINGS), 'H has no graphic.');
  assert.equal(directBlocker(ctx.cues[0], { ...ctx, casparOn: false }, SETTINGS), null, 'the switch is about the server only');
  assert.equal(directBlocker(ctx.cues[2], { ...ctx, casparOn: false }, SETTINGS), CASPAR_OFF);
  assert.equal(directBlocker(ctx.cues[3], ctx, SETTINGS), 'GONE has no media file.');
  assert.equal(directBlocker(ctx.cues[3], { ...ctx, casparOn: false }, SETTINGS), CASPAR_OFF, 'the switch is said first');
  assert.equal(directBlocker(ctx.cues[2], ctx, SETTINGS), null);
});

test('a direct trigger judges the output slot by the settings it is given, as they stand at the press', () => {
  const ctx = context({ cues: [cue('a', 'a')], items: [vt('a')] });
  const outputOn210 = { ...SETTINGS, channel: 2, layer: 10 };
  assert.equal(directBlocker(ctx.cues[0], ctx, outputOn210), 'Layer 10 on Channel 2 is the NoaCG output. Choose another layer for this.');
  assert.equal(directBlocker(ctx.cues[0], { ...ctx, settings: outputOn210 }, SETTINGS), null);
});

test('a direct trigger plays the cue alone: its folder and its neighbours do not count', () => {
  const T = { id: 'T', name: 'Opening', mode: 'through', slot: { channel: 1, layer: 20 } };
  const folder = context({ cues: [cue('a', 'a', { folderId: 'T' }), cue('b', 'b', { folderId: 'T' })], items: [vt('a'), vt('b')], folders: [T] });
  assert.equal(takeBlockerFor(folder.cues[0], folder), OUTPUT);
  assert.equal(directBlocker(folder.cues[0], folder, SETTINGS), null, 'its own slot, not the folder\'s');
  // Play next finds no neighbour when the cue is alone, so the direct trigger says so.
  const next = context({ cues: [cue('p', 'p', { playback: { end: 'next' } }), cue('q', 'q')], items: [vt('p'), vt('q')] });
  assert.equal(takeBlockerFor(next.cues[0], next), null);
  assert.match(directBlocker(next.cues[0], next, SETTINGS), /^This cue plays the next clip, but /);
});

test('a One-by-one step: the file or graphic gone, the Bridge not there, then the Take check', () => {
  const ctx = context({ cues: [cue('a', 'a'), cue('gone', 'nothing'), graphic('g'), graphic('h')], items: [vt('a')], graphics: { 'g-g': 'Strap' } });
  assert.equal(stepBlocker(ctx.cues[0], ctx), null);
  assert.equal(stepBlocker(ctx.cues[1], ctx), 'GONE plays a file this production no longer lists.');
  assert.equal(stepBlocker(ctx.cues[1], { ...ctx, bridgeDown: true }), 'GONE plays a file this production no longer lists.', 'the file is said first');
  assert.equal(stepBlocker(ctx.cues[0], { ...ctx, bridgeDown: true, casparOn: false }), 'A plays on the playout server, and NoaCG Bridge is not connected.');
  assert.equal(stepBlocker(ctx.cues[0], { ...ctx, casparOn: false }), CASPAR_OFF);
  assert.equal(stepBlocker(ctx.cues[2], { ...ctx, bridgeDown: true, casparOn: false }), null, 'a graphic needs neither');
  assert.equal(stepBlocker(ctx.cues[3], ctx), 'H points at a graphic this production no longer has.');
});

test('a step judges its server cue by the Take check, on the folder\'s slot', () => {
  const T = { id: 'T', name: 'Opening', mode: 'through', slot: { channel: 1, layer: 20 } };
  const ctx = context({ cues: [cue('a', 'a', { folderId: 'T' })], items: [vt('a')], folders: [T] });
  assert.equal(stepBlocker(ctx.cues[0], ctx), OUTPUT);
});
