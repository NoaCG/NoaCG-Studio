// guards: src/model/rundownHistory.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rundownSlice, replaceRundown, sameRundown, RundownHistory } from '../src/model/rundownHistory.ts';
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
  for (const bad of [{ ...before, graphics: [] }, { ...before, cues: [before.cues[0], before.cues[0]] }, { ...before, cues: [{ ...before.cues[0], folderId: 'gone' }] }]) assert.ok(replaceRundown(show, before, bad).refused);
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
