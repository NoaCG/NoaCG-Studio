// guards: src/model/rundownRows.ts, src/control/spaceMode.ts
//
// THE RUNDOWN AS THE PRODUCTION PAGE DRAWS IT (docs/CLIP_PLAYBACK_PLAN.md §6.2 and §7, §18 cases 20
// and 21): the rows - a header for each run of a folder, its cues under it unless it is collapsed -
// where the keys stand, what a shift-click covers and where a drag lands. It only reads, so a record an
// older build left split, orphaned or empty is drawn as it is and nothing reorders.

import test from 'node:test';
import assert from 'node:assert/strict';

const { bandAt, cursorRowId, folderName, folderRowId, headerBandAt, planDrop, rangeCueIds, rowTestId, rundownView } = await import('../src/model/rundownRows.ts');
const { spaceAction, spaceActionTable } = await import('../src/control/spaceMode.ts');

const cue = (id, folderId) => ({ id, sourceId: 'g', label: id, values: {}, ...(folderId ? { folderId } : {}) });
/** `A B(F) C(F) D` -> cues: a letter per cue, its folder in brackets. */
const parse = (text) => text.split(' ').filter(Boolean).map((t) => {
  const m = /^([^(]+)(?:\((\w+)\))?$/.exec(t);
  return cue(m[1], m[2]);
});
const folder = (id, extra = {}) => ({ id, name: id, mode: 'manual', ...extra });
const record = (text, folders = []) => ({ cues: parse(text), folders });
/** The drawn rows, as `A [F] B C`: a cue by its id, a header in brackets, a later run with a `+`. */
const drawn = (view) => view.rows.map((r) => (r.kind === 'cue' ? r.id : `[${r.folder.id}${r.run ? '+' : ''}]`)).join(' ');

test('a rundown without folders draws exactly its cues, numbered by their place', () => {
  const view = rundownView(record('A B C'));
  assert.deepEqual(view.rows.map((r) => [r.kind, r.id, r.no]), [['cue', 'A', 1], ['cue', 'B', 2], ['cue', 'C', 3]]);
  assert.deepEqual([...view.rowOf], [['A', 'A'], ['B', 'B'], ['C', 'C']]);
});

test('a folder is drawn as a header before its cues; an orphaned id reads as none and an empty folder is not drawn', () => {
  const view = rundownView(record('A B(F) C(F) D(GONE)', [folder('F', { name: '  ' }), folder('EMPTY'), folder('F', { name: 'second entry' })]));
  assert.equal(drawn(view), 'A [F] B C D');
  // A cue keeps its number, which a header does not take.
  assert.deepEqual(view.rows.filter((r) => r.kind === 'cue').map((r) => r.no), [1, 2, 3, 4]);
  assert.deepEqual([...view.folders.keys()], ['F']);
  // The first entry of a repeated id is the one read, and a blank name reads as a name.
  assert.equal(folderName(view.folders.get('F')), 'Untitled folder');
  assert.equal(view.rows.find((r) => r.id === 'D').folderId, null);
});

test('a split folder is drawn run by run, the later ones "(continued)", and nothing moves', () => {
  const view = rundownView(record('A(F) B C(F)', [folder('F')]));
  assert.equal(drawn(view), '[F] A B [F+] C');
  assert.deepEqual(view.rows.filter((r) => r.kind === 'folder').map((r) => [r.id, r.run, r.runCues.map((c) => c.id)]), [
    [folderRowId('F'), 0, ['A']],
    [folderRowId('F', 1), 1, ['C']],
  ]);
  assert.deepEqual(view.members.get('F').map((c) => c.id), ['A', 'C']);
  assert.deepEqual(view.rows.filter((r) => r.kind === 'folder').map(rowTestId), ['folder-row-F', 'folder-row-F-1']);
});

test('a collapsed folder is its headers alone, and each hidden cue is shown by its own run\'s header', () => {
  const view = rundownView(record('A(F) B C(F) D(F)', [folder('F', { collapsed: true })]));
  assert.equal(drawn(view), '[F] B [F+]');
  assert.equal(view.rowOf.get('A'), 'folder:F');
  assert.equal(view.rowOf.get('D'), 'folder:F:1');
});

test('the cursor: a held folder row, or the row showing the selected cue - its header while hidden', () => {
  const view = rundownView(record('A B(F) C(F) D', [folder('F', { collapsed: true })]));
  assert.equal(cursorRowId(view, null, 'C'), 'folder:F');
  assert.equal(cursorRowId(view, { folderId: 'F', rowId: 'folder:F:1' }, 'A'), 'folder:F', 'a run gathered away falls back to the first');
  assert.equal(cursorRowId(view, { folderId: 'GONE', rowId: 'folder:GONE' }, 'D'), 'D', 'a folder that has gone gives the cue back');
  assert.equal(cursorRowId(view, null, null), null);
});

test('a shift-click covers the drawn rows between, a header standing for its whole folder', () => {
  const view = rundownView(record('A B(F) C(F) D(G) E F2(F)', [folder('F', { collapsed: true }), folder('G')]));
  assert.equal(drawn(view), 'A [F] [G] D E [F+]');
  // Down and up alike, in flat order; the collapsed header brings its hidden cues, and a later run of
  // the same folder too.
  assert.deepEqual(rangeCueIds(view, 'A', 'folder:G'), ['A', 'B', 'C', 'D', 'F2']);
  assert.deepEqual(rangeCueIds(view, 'E', 'D'), ['D', 'E']);
  assert.deepEqual(rangeCueIds(view, 'folder:F:1', 'E'), ['B', 'C', 'E', 'F2']);
  assert.deepEqual(rangeCueIds(view, null, 'E'), ['E']);
  assert.deepEqual(rangeCueIds(view, 'GONE', 'D'), ['D']);
});

test('the thirds of a row, and the quarter of a header', () => {
  assert.deepEqual([bandAt(5, 34), bandAt(17, 34), bandAt(30, 34)], ['top', 'middle', 'bottom']);
  // A header's top quarter lands above its folder; the rest of it is the folder.
  assert.deepEqual([headerBandAt(5, 34), headerBandAt(9, 34), headerBandAt(30, 34)], ['top', 'middle', 'middle']);
});

/** The drag as shipped before this phase: a chain of neighbour swaps. */
function oldDrag(ids, from, to) {
  const out = [...ids];
  const step = from < to ? 1 : -1;
  for (let k = from; k !== to; k += step) [out[k], out[k + step]] = [out[k + step], out[k]];
  return out;
}

test('a drop in the middle of a row is the drag as it always was', async () => {
  const { placeInOrder } = await import('../src/model/showFolders.ts');
  const ids = ['A', 'B', 'C', 'D', 'E'];
  const rec = record(ids.join(' '));
  const view = rundownView(rec);
  for (let from = 0; from < ids.length; from++) {
    for (let to = 0; to < ids.length; to++) {
      if (from === to) continue;
      const plan = planDrop(rec, view, { cueId: ids[from] }, { rowId: ids[to], band: 'middle' });
      assert.deepEqual(placeInOrder(rec.cues, [], { cueId: ids[from] }, plan.place).map((c) => c.id), oldDrag(ids, from, to));
    }
  }
});

test('where a drop lands, row by row and third by third', () => {
  const rec = record('A B(F) C(F) D E(G) X', [folder('F'), folder('G')]);
  const view = rundownView(rec);
  const plan = (what, rowId, band) => planDrop(rec, view, what, { rowId, band });
  // A cue onto a cue: before, after, and joining that cue's folder.
  assert.deepEqual(plan({ cueId: 'A' }, 'C', 'top').place, { before: 'C' });
  assert.deepEqual(plan({ cueId: 'A' }, 'C', 'bottom'), { place: { after: 'C' }, mark: { rowId: 'C', edge: 'after', inside: true }, refused: null });
  // A cue onto an open header: its top above the folder, the rest last in it, the folder lit
  // (docs/CLIP_PLAYBACK_PLAN.md §20.2).
  assert.deepEqual(plan({ cueId: 'D' }, 'folder:F', 'top').place, { beforeFolder: 'F' });
  assert.deepEqual(plan({ cueId: 'D' }, 'folder:F', 'middle'), { place: { into: 'F' }, mark: { rowId: 'folder:F', edge: 'into', inside: true, folder: 'F' }, refused: null });
  // A folder onto another folder's cue or header lands beside it, by direction in the middle.
  assert.deepEqual(plan({ folderId: 'F' }, 'E', 'middle').place, { afterFolder: 'G' });
  assert.deepEqual(plan({ folderId: 'G' }, 'folder:F', 'middle').place, { beforeFolder: 'F' });
  assert.deepEqual(plan({ folderId: 'G' }, 'C', 'bottom').mark, { rowId: 'C', edge: 'after', inside: false });
  assert.deepEqual(plan({ folderId: 'F' }, 'X', 'middle').place, { after: 'X' });
  // Onto itself, or a drop that would change nothing: no plan at all.
  assert.equal(plan({ folderId: 'F' }, 'B', 'middle'), null);
  assert.equal(plan({ cueId: 'B' }, 'B', 'top'), null);
  assert.equal(plan({ cueId: 'A' }, 'folder:F', 'top'), null, 'A is already right above the folder');
  // ...while the top third of the folder's first cue takes A into it.
  assert.deepEqual(plan({ cueId: 'A' }, 'B', 'top').place, { before: 'B' });
  assert.equal(planDrop(rec, view, { cueId: 'X' }, 'end'), null);
  assert.deepEqual(planDrop(rec, view, { cueId: 'C' }, 'end').place, { end: true });
  // A collapsed header takes a cue last in the folder.
  const shut = { ...rec, folders: [folder('F', { collapsed: true }), folder('G')] };
  assert.deepEqual(planDrop(shut, rundownView(shut), { cueId: 'D' }, { rowId: 'folder:F', band: 'middle' }), { place: { into: 'F' }, mark: { rowId: 'folder:F', edge: 'into', inside: true, folder: 'F' }, refused: null });
});

test('a refused drop says why while it hovers', () => {
  const items = [{ id: 'clip', kind: 'media', mediaKind: 'movie' }];
  const rec = {
    cues: [{ id: 'V1', sourceId: 'clip', source: 'playout', label: 'V1', values: {}, folderId: 'T' }, { ...cue('GFX'), label: 'Lower third' }],
    folders: [folder('T', { mode: 'through' })],
    playoutItems: items,
  };
  const plan = planDrop(rec, rundownView(rec), { cueId: 'GFX' }, { rowId: 'folder:T', band: 'bottom' });
  assert.equal(plan.refused, 'Lower third is a graphic, and a folder that plays through plays clips and audio files only.');
});

test('SPACE on a folder row never previews: a folder is decided as already on PREVIEW, and the shipped table is unchanged', () => {
  for (const mode of ['take', 'preview-then-take']) {
    assert.equal(spaceAction(mode, { live: false, previewed: true }), 'take');
    assert.equal(spaceAction(mode, { live: true, previewed: true }), 'take-off');
  }
  // The exported controller carries this table; folders must not change it.
  assert.deepEqual(spaceActionTable(), {
    take: ['take', 'take', 'take-off', 'take-off'],
    'preview-then-take': ['preview', 'take', 'take-off', 'take-off'],
  });
});

test('a selection drags as one block, in its order, and joins the folder it lands in (§20.2)', async () => {
  const { placeInOrder } = await import('../src/model/showFolders.ts');
  const rec = record('A B(F) C(F) D E(G) X', [folder('F'), folder('G')]);
  const view = rundownView(rec);
  const plan = (ids, rowId, band) => planDrop(rec, view, { cueIds: ids }, { rowId, band });
  const land = (ids, p) => placeInOrder(rec.cues, rec.folders, { cueIds: ids }, p.place).map((c) => (c.folderId ? `${c.id}(${c.folderId})` : c.id)).join(' ');
  // Two loose cues to the end of the list, then into a folder by its header: last in it, in order.
  assert.equal(land(['A', 'D'], plan(['A', 'D'], 'X', 'bottom')), 'B(F) C(F) E(G) X A D');
  assert.equal(land(['A', 'D'], plan(['A', 'D'], 'folder:F', 'middle')), 'B(F) C(F) A(F) D(F) E(G) X');
  // A cue of a folder and a loose one, dropped beside a cue of another folder: both join it.
  assert.equal(land(['B', 'X'], plan(['B', 'X'], 'E', 'top')), 'A C(F) D B(G) X(G) E(G)');
  // A whole folder in the selection moves as a folder: beside another, the loose cue in none.
  const withFolder = plan(['B', 'C', 'X'], 'E', 'middle');
  assert.deepEqual(withFolder.place, { afterFolder: 'G' });
  assert.equal(land(['B', 'C', 'X'], withFolder), 'A D E(G) B(F) C(F) X');
  assert.deepEqual(plan(['B', 'C', 'X'], 'folder:G', 'bottom').place, { afterFolder: 'G' });
  // Onto a row it carries, or onto its own whole folder: nothing to do.
  assert.equal(plan(['A', 'D'], 'D', 'middle'), null);
  assert.equal(plan(['B', 'C'], 'folder:F', 'middle'), null);
});

test('a selection at a Play-through folder is refused if any cue of it cannot play through', () => {
  const items = [{ id: 'clip', kind: 'media', mediaKind: 'movie' }];
  const clip = (id, folderId) => ({ id, sourceId: 'clip', source: 'playout', label: id, values: {}, ...(folderId ? { folderId } : {}) });
  const rec = { cues: [clip('V1', 'T'), clip('V2'), { ...cue('GFX'), label: 'Lower third' }], folders: [folder('T', { mode: 'through' })], playoutItems: items };
  const view = rundownView(rec);
  assert.equal(planDrop(rec, view, { cueIds: ['V2', 'GFX'] }, { rowId: 'folder:T', band: 'middle' }).refused, 'Lower third is a graphic, and a folder that plays through plays clips and audio files only.');
  assert.equal(planDrop(rec, view, { cueIds: ['V2'] }, { rowId: 'folder:T', band: 'middle' }).refused, null);
});
