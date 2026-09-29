// guards: src/model/cueClipboard.ts
//
// THE RUNDOWN'S CLIPBOARD (docs/CLIP_PLAYBACK_PLAN.md §20.2), run in Node: a copy is new cues with new
// ids over the same graphic or file, carrying their own values, note and clip settings, and a folder
// copied whole comes back as a new folder; a paste lands like a dropped block, and refuses what a drop
// there would; a cut holds ids, and cannot be pasted inside itself. The writer that runs a paste on
// the record is src/model/shows.ts `pasteInRundown`; the page's keys are e2e/playout-folders.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { clipSize, copyClip, cutClip, cutPlaceRefusal, pasteCopies } = await import('../src/model/cueClipboard.ts');
const { foldersContiguous, placeRefusal } = await import('../src/model/showFolders.ts');

const cue = (id, folderId, extra = {}) => ({ id, sourceId: `g-${id}`, label: id, values: { f0: `${id} value` }, ...(folderId ? { folderId } : {}), ...extra });
const clip = (id, folderId) => ({ id, sourceId: 'vt', source: 'playout', label: id, values: {}, playback: { end: 'loop', levelDb: -6 }, ...(folderId ? { folderId } : {}) });
const shape = (cues) => cues.map((c) => (c.folderId ? `${c.id}(${c.folderId})` : c.id)).join(' ');
const record = (cues, folders = []) => ({
  id: 'show',
  cues,
  folders,
  graphics: cues.filter((c) => c.source !== 'playout').map((c) => ({ id: c.sourceId })),
  playoutItems: [{ id: 'vt', kind: 'media', mediaKind: 'movie' }],
});
let n = 0;
const newId = () => `n${++n}`;

test('a copy is new cues over the same source: its own values, note and clip settings, never an id', () => {
  n = 0;
  const rec = record([cue('A', undefined, { note: 'after the intro' }), clip('V'), cue('B')]);
  const copied = copyClip(rec, ['V', 'A']);
  assert.equal(clipSize(copied), 2);
  // In rundown order, whatever order they were picked in.
  assert.deepEqual(copied.cues.map((c) => c.label), ['A', 'V']);
  assert.equal(JSON.stringify(copied).includes('"id"'), false, 'a copy carries no cue id');
  const out = pasteCopies(rec, copied, { after: 'B' }, newId);
  assert.equal(shape(out.cues), 'A V B n1 n2');
  assert.deepEqual(out.added, ['n1', 'n2']);
  const [a, v] = out.cues.slice(3);
  assert.deepEqual([a.sourceId, a.values, a.note, a.label], ['g-A', { f0: 'A value' }, 'after the intro', 'A']);
  assert.deepEqual([v.source, v.sourceId, v.playback], ['playout', 'vt', { end: 'loop', levelDb: -6 }]);
  // Its own values: editing the copy's never reaches the original's.
  a.values.f0 = 'changed';
  assert.equal(rec.cues[0].values.f0, 'A value');
  assert.equal(copyClip(rec, ['GONE']), null);
});

test('a folder copied whole pastes as a new folder beside the place; one copied in part comes loose', () => {
  n = 0;
  const folders = [{ id: 'F', name: 'Opening', mode: 'through', end: 'loop', slot: { layer: 12 } }];
  const rec = record([cue('A'), clip('B', 'F'), clip('C', 'F'), cue('D')], folders);
  const whole = copyClip(rec, ['B', 'C', 'D']);
  assert.deepEqual(whole.folders, [{ key: 'F', name: 'Opening', mode: 'through', end: 'loop', slot: { layer: 12 } }]);
  // Pasted after B, inside F: the new folder lands beside F, never inside it.
  const out = pasteCopies(rec, whole, { after: 'B' }, newId);
  assert.equal(shape(out.cues), 'A B(F) C(F) n2(n1) n3(n1) n4 D');
  assert.deepEqual(out.folders.find((f) => f.id === 'n1'), { id: 'n1', name: 'Opening copy', mode: 'through', end: 'loop', slot: { layer: 12 } });
  assert.ok(foldersContiguous(out.cues));
  // Only B of F: B comes loose, and joins the folder where it is pasted.
  const part = copyClip(rec, ['B']);
  assert.deepEqual(part.folders, []);
  assert.equal(shape(pasteCopies(rec, part, { after: 'C' }, newId).cues), 'A B(F) C(F) n5(F) D');
});

test('a paste refuses what a drop there would, and a source the production no longer has', () => {
  const folders = [{ id: 'T', name: 'Opening', mode: 'through' }];
  const rec = record([clip('V1', 'T'), cue('GFX')], folders);
  const copied = copyClip(rec, ['GFX']);
  assert.equal(pasteCopies(rec, copied, { into: 'T' }, newId).refused, 'GFX is a graphic, and a folder that plays through plays clips and audio files only.');
  assert.equal(pasteCopies({ ...rec, graphics: [] }, copied, { end: true }, newId).refused, 'GFX plays something this production no longer has, so it was not pasted.');
  assert.match(pasteCopies(rec, copied, { after: 'GONE' }, newId).refused, /has gone/);
});

test('a cut is the cues\' own ids, and it is never pasted inside itself', () => {
  const cut = cutClip('show', ['B', 'C']);
  assert.deepEqual(cut, { kind: 'cut', showId: 'show', ids: ['B', 'C'] });
  assert.equal(clipSize(cut), 2);
  const cues = [cue('A'), cue('B', 'F'), cue('C', 'F'), cue('D')];
  assert.equal(cutPlaceRefusal(cues, cut.ids, { after: 'B' }), 'Paste somewhere outside what you cut.');
  assert.equal(cutPlaceRefusal(cues, cut.ids, { into: 'F' }), 'Paste somewhere outside what you cut.');
  assert.equal(cutPlaceRefusal(cues, cut.ids, { after: 'D' }), null);
  assert.equal(cutPlaceRefusal(cues, ['B'], { into: 'F' }), null);
});

test('copying from a record an older build split writes whole folders, every time', () => {
  // A(F) x A2(F): F in two runs. However it is copied and wherever pasted, the copy's folder is one run.
  const folders = [{ id: 'F', name: 'F', mode: 'manual' }, { id: 'G', name: 'G', mode: 'manual' }];
  const split = record([cue('a1', 'F'), cue('x'), cue('a2', 'F'), cue('g1', 'G'), cue('y')], folders);
  const ids = split.cues.map((c) => c.id);
  const subsets = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) subsets.push(ids.filter((_, i) => mask & (1 << i)));
  const places = [...ids.flatMap((id) => [{ before: id }, { after: id }]), { into: 'F' }, { into: 'G' }, { end: true }];
  for (const chosen of subsets) {
    const copied = copyClip(split, chosen);
    for (const place of places) {
      const out = pasteCopies(split, copied, place, newId);
      if ('cues' in out) assert.ok(foldersContiguous(out.cues), `${chosen.join()} to ${JSON.stringify(place)}: ${shape(out.cues)}`);
    }
  }
});

test('a selection holding a whole folder is never moved into a folder', () => {
  const folders = [{ id: 'F', name: 'F', mode: 'manual' }, { id: 'G', name: 'G', mode: 'manual' }];
  const rec = record([cue('a', 'F'), cue('b', 'F'), cue('x'), cue('g', 'G')], folders);
  assert.equal(placeRefusal(rec, { cueIds: ['a', 'b', 'x'] }, { into: 'G' }), 'A folder cannot go inside another folder.');
  assert.equal(placeRefusal(rec, { cueIds: ['a', 'b', 'x'] }, { into: 'F' }), 'A folder cannot go inside another folder.');
  assert.equal(placeRefusal(rec, { cueIds: ['a', 'b', 'x'] }, { end: true }), null);
  assert.equal(placeRefusal(rec, { cueIds: ['a', 'x'] }, { into: 'G' }), null);
});
