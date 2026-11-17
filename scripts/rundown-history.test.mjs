// guards: src/model/rundownHistory.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rundownSlice, replaceRundown, sameRundown, RundownHistory, liveRundownRefusal } from '../src/model/rundownHistory.ts';
const show = { id: 'p', version: 2, name: 'Keep this name', data: { score: 7 }, graphics: [{ id: 'g', name: 'Graphic', template: {} }], cues: [{ id: 'c', sourceId: 'g', label: 'First', values: { name: 'Ada' }, folderId: 'f' }], folders: [{ id: 'f', name: 'Guests', mode: 'manual', collapsed: true }] };
test('inverse preserves metadata/collapse and restores exact source, cue, folder and value ids', () => {
  const before = rundownSlice(show), deleted = { ...show, cues: [], graphics: [], folders: [] };
  const restored = replaceRundown({ ...deleted, name: 'Renamed', data: { score: 9 } }, rundownSlice(deleted), before).show;
  assert.equal(restored.name, 'Renamed'); assert.deepEqual(restored.data, { score: 9 });
  assert.deepEqual(rundownSlice(restored), before); assert.equal(restored.folders[0].collapsed, undefined);
  const next = { ...show, name: 'Changed', folders: [{ ...show.folders[0], collapsed: false }] };
  assert.equal(sameRundown(rundownSlice(next), before), true);
  assert.equal(replaceRundown(next, before, before).show.folders[0].collapsed, false);
});
test('semantic change refuses inverse; orphan, duplicate and split folders are rejected', () => {
  const before = rundownSlice(show);
  assert.ok(replaceRundown({ ...show, cues: [] }, before, before).refused);
  for (const bad of [
    { ...before, graphics: [] },
    { ...before, cues: [before.cues[0], before.cues[0]] },
    { ...before, cues: [{ ...before.cues[0], folderId: 'gone' }] },
    { ...before, cues: [before.cues[0], { ...before.cues[0], id: 'middle', folderId: 'other' }, { ...before.cues[0], id: 'last' }], folders: [...before.folders, { id: 'other', name: 'Other', mode: 'manual' }] },
  ]) assert.ok(replaceRundown(show, before, bad).refused);
});
test('50 steps retain adjacent shared slices; exact redo and new edit clears redo', () => {
  const h = new RundownHistory(); let before = rundownSlice(show);
  for (let i = 0; i < 51; i++) { const after = structuredClone(before); after.cues[0].label = String(i); h.record(before, after, 'Edit cue'); before = after; }
  assert.equal(h.undo.length, 50); assert.equal(h.undo[0].after, h.undo[1].before);
  const entry = h.peek('undo'); h.accepted('undo', entry); assert.equal(h.redo[0], entry);
  assert.equal(h.record(entry.before, entry.before, 'No-op'), 'unchanged'); assert.equal(h.redo.length, 1);
  h.accepted('redo', entry); assert.equal(h.peek('undo'), entry);
  h.accepted('undo', entry); h.record(entry.before, entry.after, 'New edit'); assert.equal(h.redo.length, 0);
});
test('asset-heavy operation evicts history without rejecting the saved edit', () => {
  const h = new RundownHistory(50, 2000), before = rundownSlice(show), after = structuredClone(before);
  after.graphics[0].template = { image: 'a'.repeat(3000) };
  assert.equal(h.record(before, after, 'Delete'), 'too-large'); assert.equal(h.bytes(), 0);
});

test('live cue/source removal or replacement and running folder changes are refused, prepared values stay editable', () => {
  const before = rundownSlice(show), live = { cues: new Set(['c']), sources: new Set(['g']), folders: new Set(['f']), unidentifiedServer: false };
  const values = structuredClone(before); values.cues[0].values.name = 'Grace';
  assert.equal(liveRundownRefusal(before, values, live), null);
  for (const bad of [
    { ...before, cues: [] }, { ...before, graphics: [] },
    { ...before, graphics: [{ ...before.graphics[0], template: { changed: true } }] },
    { ...before, folders: [{ ...before.folders[0], mode: 'together' }] },
    { ...before, cues: [{ ...before.cues[0], folderId: undefined }] },
  ]) assert.ok(liveRundownRefusal(before, bad, live));
  assert.equal(liveRundownRefusal({ ...before, cues: [], graphics: [], folders: [] }, before, { cues: new Set(), sources: new Set(), folders: new Set(), unidentifiedServer: false }), null);
});

test('unidentified server output refuses source changes without blocking unrelated graphic preparation', () => {
  const before = rundownSlice(show), after = { ...before, playoutItems: [{ id: 'item', name: 'Clip' }] };
  const live = { cues: new Set(), sources: new Set(), folders: new Set(), unidentifiedServer: true };
  assert.ok(liveRundownRefusal(before, after, live));
  assert.equal(liveRundownRefusal(before, before, live), null);
});
