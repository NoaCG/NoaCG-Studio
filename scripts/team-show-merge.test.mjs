// guards: src/model/teamShowMerge.ts, src/model/showFolders.ts
//
// The three-way merge a refused team save goes through (docs/TEAMS_PLAN.md §7 stage 4). It is pure,
// so these run it directly: Node strips the module's types on import, and its only import is a type.
//
// The case that earned this file: two members each add a graphic from the same base. Each add takes
// the lowest free layer, so both land on one number, and two graphics on one layer replace each
// other on air. The three-member walk in e2e/configured/teams.spec.ts found it.

import test from 'node:test';
import assert from 'node:assert/strict';

const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');

const AT = '2026-09-27T00:00:00.000Z';
const graphic = (id, layer) => ({ id, name: id, layer });
const show = (graphics, extra = {}) => ({ id: 'show', name: 'Show', graphics, updatedAt: '2026-09-26T00:00:00.000Z', ...extra });

test('two graphics added from the same base on one layer end up on two layers, theirs unmoved', () => {
  const base = show([graphic('anna', 20)]);
  const theirs = show([graphic('anna', 20), graphic('ben', 21)]);
  const ours = show([graphic('anna', 20), graphic('cleo', 21)]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  const layers = Object.fromEntries(doc.graphics.map((g) => [g.id, g.layer]));
  assert.deepEqual(layers, { anna: 20, ben: 21, cleo: 22 });
  assert.deepEqual(lost, []);
});

test('the moved graphic skips every layer already in use', () => {
  const base = show([graphic('anna', 20), graphic('dan', 22)]);
  const theirs = show([graphic('anna', 20), graphic('dan', 22), graphic('ben', 21)]);
  const ours = show([graphic('anna', 20), graphic('dan', 22), graphic('cleo', 21)]);
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(doc.graphics.find((g) => g.id === 'cleo').layer, 23);
});

test('the moved graphic follows the add rule: a missing layer counts as 20, and a full top wraps below it', () => {
  // `anna` has no layer and so airs on 20; layers 21-100 are all taken; both new graphics picked 19.
  const taken = Array.from({ length: 80 }, (_, i) => graphic(`t${i + 21}`, i + 21));
  const base = show([graphic('anna', undefined), ...taken]);
  const theirs = show([...base.graphics, graphic('ben', 19)]);
  const ours = show([...base.graphics, graphic('cleo', 19)]);
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(doc.graphics.find((g) => g.id === 'ben').layer, 19);
  assert.equal(doc.graphics.find((g) => g.id === 'cleo').layer, 1);
});

test('a layer shared with a graphic from before is somebody’s choice and is left alone', () => {
  // Ours puts the new graphic on anna's layer on purpose; theirs adds one elsewhere.
  const base = show([graphic('anna', 20)]);
  const theirs = show([graphic('anna', 20), graphic('ben', 21)]);
  const ours = show([graphic('anna', 20), graphic('cleo', 20)]);
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(doc.graphics.find((g) => g.id === 'cleo').layer, 20);
});

test('both new graphics are kept, and the other lists still merge per item', () => {
  const base = show([graphic('anna', 20)], { cues: [{ id: 'c-anna', sourceId: 'anna', label: 'Anna', values: {} }] });
  const theirs = show([graphic('anna', 20), graphic('ben', 21)], {
    cues: [
      { id: 'c-anna', sourceId: 'anna', label: 'Anna', values: {} },
      { id: 'c-ben', sourceId: 'ben', label: 'Ben', values: { f0: 'Ben' } },
    ],
  });
  const ours = show([graphic('anna', 20), graphic('cleo', 21)], {
    cues: [
      { id: 'c-anna', sourceId: 'anna', label: 'Anna', values: {} },
      { id: 'c-cleo', sourceId: 'cleo', label: 'Cleo', values: { f0: 'Cleo' } },
    ],
  });
  const { doc } = mergeTeamShow(base, ours, theirs, AT);
  assert.deepEqual(doc.graphics.map((g) => g.id).sort(), ['anna', 'ben', 'cleo']);
  assert.deepEqual(doc.cues.map((c) => c.id).sort(), ['c-anna', 'c-ben', 'c-cleo']);
  assert.equal(doc.updatedAt, AT);
});

// ── FOLDERS (docs/CLIP_PLAYBACK_PLAN.md §7 and §18 case 21). A folder's cues stand together in the
// flat list. The merge can tear them apart, empty a folder, or leave a cue naming a folder that is
// gone; whatever it did, the result is settled and anything moved is reported as the folders.

const cue = (id, folderId) => ({ id, sourceId: 'g', label: id, values: {}, ...(folderId ? { folderId } : {}) });
const folder = (id, extra = {}) => ({ id, name: id, mode: 'manual', ...extra });
const rundown = (cues, folders) => show([graphic('g', 20)], { cues, ...(folders ? { folders } : {}) });
/** The rundown as `A(F) C B(F)`: each cue, and its folder in brackets. */
const order = (doc) => doc.cues.map((c) => (c.folderId ? `${c.id}(${c.folderId})` : c.id)).join(' ');

test('one teammate folders A and B while the other orders A, C, B, D: the folder is gathered and reported', () => {
  const base = rundown([cue('A'), cue('B'), cue('C'), cue('D')]);
  const ours = rundown([cue('A', 'F'), cue('B', 'F'), cue('C'), cue('D')], [folder('F')]);
  const theirs = rundown([cue('A'), cue('C'), cue('B'), cue('D')]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  // Without the gathering this is A(F) C B(F) D: one folder in two runs.
  assert.equal(order(doc), 'A(F) B(F) C D');
  assert.deepEqual(doc.folders.map((f) => f.id), ['F']);
  assert.deepEqual(lost, ['the folders']);
});

test('two teammates adding folders at once keep both, and nothing is reported', () => {
  const base = rundown([cue('A'), cue('B'), cue('C'), cue('D')]);
  const ours = rundown([cue('A', 'F'), cue('B', 'F'), cue('C'), cue('D')], [folder('F')]);
  const theirs = rundown([cue('A'), cue('B'), cue('C', 'G'), cue('D', 'G')], [folder('G', { mode: 'together' })]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(order(doc), 'A(F) B(F) C(G) D(G)');
  assert.deepEqual(doc.folders.map((f) => [f.id, f.mode]), [['G', 'together'], ['F', 'manual']]);
  assert.deepEqual(lost, []);
});

test('a split that came whole from one side is gathered too, however the lists merged', () => {
  // Ours only renamed the folder; theirs (an older build) moved C into the middle of it by one swap.
  // The cues come from theirs whole, without any per-item merge, and still land gathered.
  const base = rundown([cue('A', 'F'), cue('B', 'F'), cue('C')], [folder('F')]);
  const ours = rundown([cue('A', 'F'), cue('B', 'F'), cue('C')], [folder('F', { name: 'Round 1' })]);
  const theirs = rundown([cue('A', 'F'), cue('C'), cue('B', 'F')], [folder('F')]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(order(doc), 'A(F) B(F) C');
  assert.equal(doc.folders[0].name, 'Round 1');
  assert.deepEqual(lost, ['the folders']);
});

test('a folder the merge leaves with no cues goes, and a cue naming a removed folder is in none', () => {
  // Ours removed folder F (its cues stay, in no folder); theirs put a new cue E into F meanwhile.
  const base = rundown([cue('A', 'F'), cue('B', 'F'), cue('C')], [folder('F')]);
  const ours = rundown([cue('A'), cue('B'), cue('C')]);
  const theirs = rundown([cue('A', 'F'), cue('B', 'F'), cue('E', 'F'), cue('C')], [folder('F')]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  assert.equal(order(doc), 'A B E C');
  assert.equal(doc.folders, undefined);
  assert.deepEqual(lost, ['the folders']);
  // Theirs removed both cues of the folder ours made: no folder is left with nothing in it.
  const b2 = rundown([cue('A'), cue('B'), cue('C')]);
  const o2 = rundown([cue('A', 'F'), cue('B', 'F'), cue('C')], [folder('F')]);
  const t2 = rundown([cue('C')]);
  const merged = mergeTeamShow(b2, o2, t2, AT).doc;
  assert.equal(order(merged), 'C');
  assert.equal(merged.folders, undefined);
});

test('a merge that keeps every folder whole reports nothing, and settling is idempotent', () => {
  const base = rundown([cue('A', 'F'), cue('B', 'F'), cue('C')], [folder('F')]);
  const ours = rundown([cue('A', 'F'), cue('B', 'F'), cue('C'), cue('D')], [folder('F')]);
  const theirs = rundown([cue('C'), cue('A', 'F'), cue('B', 'F')], [folder('F')]);
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  // Our D goes after C, the cue it followed on our side (the merge's own rule), clear of the folder.
  assert.equal(order(doc), 'C D A(F) B(F)');
  assert.deepEqual(lost, []);
  const again = mergeTeamShow(doc, doc, doc, AT);
  assert.deepEqual(again.doc, doc);
  assert.deepEqual(again.lost, []);
});
