// guards: src/control/trimEffects.ts
//
// WHAT A NEW TRIM WOULD BREAK (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.6), in Node: the page's own Take
// checks run on the rundown with the candidate trim, and the first cue or folder that could be taken
// before and could not after is named. The browser half (the timeline and the boxes say it) is
// e2e/clip-timeline.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { trimBreaks } = await import('../src/control/trimEffects.ts');
const { throughPlaces } = await import('../src/control/serverPlayout.ts');
const { rundownView } = await import('../src/model/rundownRows.ts');
const { NO_OWNERSHIP } = await import('../src/control/serverState.ts');

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
const SETTINGS = { channel: 1, layer: 20, clipChannel: 2 };
const SLOTS = { itemSlot: (s, item) => slot(item.channel ?? s.channel, item.layer), folderSlot: (s, folder) => slot(folder.slot?.channel ?? s.clipChannel, folder.slot?.layer ?? 10) };
const vt = (id, extra = {}) => ({ id, adapter: 'casparcg', kind: 'media', name: id.toUpperCase(), layer: 10, channel: 2, mediaKind: 'movie', frames: 250, fps: 25, ...extra });
const cue = (id, sourceId, extra = {}) => ({ id, sourceId, source: 'playout', label: id.toUpperCase(), values: {}, ...extra });
const BRIDGE = { state: 'ok', features: ['state', 'playback', 'sequence', 'sequence-loop'], capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'], version: '2.5.0' };

function context({ cues = [], items = [], folders = [] } = {}) {
  const { members } = rundownView({ cues, folders });
  return {
    cues, items, folders, members, places: throughPlaces(cues, items, folders), ownership: NO_OWNERSHIP, settings: SETTINGS, ability: BRIDGE,
    casparOn: true, bridgeDown: false, itemOf: (c) => items.find((i) => i.id === c.sourceId) ?? null, graphicOf: () => null, slots: SLOTS,
  };
}

test('a trim valid on its own, breaking nothing, says nothing', () => {
  const ctx = context({ cues: [cue('a', 'a'), cue('b', 'b')], items: [vt('a'), vt('b')] });
  assert.equal(trimBreaks(ctx, 'a', { trimIn: 1, trimOut: 2.5 }), null);
  assert.equal(trimBreaks(ctx, 'a', {}), null, 'Whole clip');
});

test('cutting a Play next follower under two seconds names the cue that plays it next', () => {
  const ctx = context({ cues: [cue('p', 'p', { playback: { end: 'next' } }), cue('q', 'q')], items: [vt('p'), vt('q')] });
  const said = trimBreaks(ctx, 'q', { trimIn: 1, trimOut: 2.9 });
  assert.match(said, /^P could no longer be taken: /);
  assert.equal(trimBreaks(ctx, 'q', { trimIn: 1, trimOut: 3 }), null, 'two seconds is enough');
  // The first clip of the chain may be short: only a follower must leave time to queue the next.
  assert.equal(trimBreaks(ctx, 'p', { trimIn: 1, trimOut: 1.5 }), null);
});

test('cutting a clip of a looping Play-through folder under two seconds names the folder', () => {
  const F = { id: 'F', name: 'Opening', mode: 'through', end: 'loop', slot: { channel: 2, layer: 12 } };
  const ctx = context({ cues: [cue('a', 'a', { folderId: 'F' }), cue('b', 'b', { folderId: 'F' })], items: [vt('a'), vt('b')], folders: [F] });
  assert.match(trimBreaks(ctx, 'a', { trimOut: 1 }), /could no longer be taken: /);
});

test('a cue already refused is not blamed on the trim', () => {
  const ctx = context({ cues: [cue('p', 'p', { playback: { end: 'next' } })], items: [vt('p')] });
  assert.equal(trimBreaks(ctx, 'p', { trimIn: 1 }), null);
});
