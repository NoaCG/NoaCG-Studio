// guards: src/model/showFolders.ts
//
// THE RUNDOWN'S FOLDERS STAY WHOLE (docs/CLIP_PLAYBACK_PLAN.md §7, §10 and §18 cases 20 to 22). A
// folder's cues stand together in the flat cue list, and every writer of the cue order keeps them
// so. The writers themselves live in src/model/shows.ts, behind the browser's durable store; each
// one's cue-order step is a pure function in src/model/showFolders.ts, and these run them in Node
// (which strips the module's types on import), on every rundown shape a small one can take.

import test from 'node:test';
import assert from 'node:assert/strict';

const folders = await import('../src/model/showFolders.ts');
const { appendCue, folderMode, foldersContiguous, foldSelection, gatherFolders, insertAfter, liveFolderIds, nextFolderName, placeInOrder, placeRefusal, pruneFolders, settleFolders, stepInOrder, throughRefusal, unfold } = folders;

const cue = (id, folderId) => ({ id, sourceId: 'g', label: id, values: {}, ...(folderId ? { folderId } : {}) });
/** `A B(F) C(F) D` -> cues: a letter per cue, its folder in brackets. */
const parse = (text) => text.split(' ').filter(Boolean).map((t) => {
  const m = /^([^(]+)(?:\((\w+)\))?$/.exec(t);
  return cue(m[1], m[2]);
});
const show = (cues) => cues.map((c) => (c.folderId ? `${c.id}(${c.folderId})` : c.id)).join(' ');
/** Every folder the cues name, as the record's folder list. */
const foldersOf = (cues) => [...new Set(cues.map((c) => c.folderId).filter(Boolean))].map((id) => ({ id, name: id, mode: 'manual' }));

/** Every contiguous rundown of `n` cues over up to two folders, each folder in one run. */
function contiguousRundowns(n) {
  const out = [];
  const labels = ['', 'F', 'G'];
  const walk = (prefix) => {
    if (prefix.length === n) {
      if (foldersContiguous(prefix)) out.push(prefix);
      return;
    }
    for (const f of labels) walk([...prefix, cue(String.fromCharCode(65 + prefix.length), f || undefined)]);
  };
  walk([]);
  return out;
}

test('contiguity: a folder in one run is whole; the same folder in two runs is split', () => {
  assert.equal(foldersContiguous(parse('A B(F) C(F) D')), true);
  assert.equal(foldersContiguous(parse('A(F) B(G) C(G)')), true);
  assert.equal(foldersContiguous(parse('A(F) C B(F) D')), false);
  assert.equal(foldersContiguous(parse('A(F) B(G) C(F)')), false);
});

test('gathering brings a split folder together where its first cue stands, and moves nothing else', () => {
  assert.equal(show(gatherFolders(parse('A(F) C B(F) D'))), 'A(F) B(F) C D');
  assert.equal(show(gatherFolders(parse('X A(F) B(G) C(F) D(G) Y'))), 'X A(F) C(F) B(G) D(G) Y');
  // A whole rundown comes back as the very same array: nothing to write.
  const whole = parse('A B(F) C(F)');
  assert.equal(gatherFolders(whole), whole);
});

test('pruning drops a folder no cue names and clears a folderId naming no folder; nothing moves', () => {
  const cues = parse('A(F) B(GONE) C');
  const { cues: kept, folders: live, changed } = pruneFolders(cues, [{ id: 'F' }, { id: 'EMPTY' }]);
  assert.equal(changed, true);
  assert.equal(show(kept), 'A(F) B C');
  assert.deepEqual(live.map((f) => f.id), ['F']);
  // A tidy record is left as it was.
  const tidy = parse('A(F) B');
  const same = pruneFolders(tidy, [{ id: 'F' }]);
  assert.equal(same.changed, false);
  assert.equal(same.cues, tidy);
  assert.deepEqual([...liveFolderIds(parse('A(F) B(G)'), [{ id: 'F' }])], ['F']);
});

test('settling prunes, then gathers', () => {
  const { cues, folders: live } = settleFolders(parse('A(F) B(GONE) C D(F)'), [{ id: 'F' }]);
  assert.equal(show(cues), 'A(F) D(F) B C');
  assert.deepEqual(live.map((f) => f.id), ['F']);
});

test('an append never lands inside a folder, even after a folder at the end', () => {
  assert.equal(show(appendCue(parse('A B(F) C(F)'), cue('N', 'F'))), 'A B(F) C(F) N');
});

test('a duplicate goes right after its original, in its folder', () => {
  assert.equal(show(insertAfter(parse('A B(F) C(F) D'), 'B', cue('B2'))), 'A B(F) B2(F) C(F) D');
  assert.equal(show(insertAfter(parse('A B(F) C(F) D'), 'C', cue('C2'))), 'A B(F) C(F) C2(F) D');
  // Outside a folder, right after it too, in none.
  assert.equal(show(insertAfter(parse('A B(F) C(F) D'), 'A', cue('A2', 'F'))), 'A A2 B(F) C(F) D');
  // Its original gone meanwhile: appended, in none.
  assert.equal(show(insertAfter(parse('A B(F)'), 'GONE', cue('X'))), 'A B(F) X');
});

test('a new folder from the selection takes the chosen cues where the first stood, clear of another folder', () => {
  const fold = (text, ids) => show(foldSelection(parse(text), new Set(ids), 'N'));
  assert.equal(fold('A B C D', ['B', 'D']), 'A B(N) D(N) C');
  // A chosen cue leaves the folder it was in.
  assert.equal(fold('A(F) B(F) C', ['B', 'C']), 'A(F) B(N) C(N)');
  // The first chosen is in the middle of another folder: the new one goes right after that folder.
  assert.equal(fold('A(F) B(F) C(F) D', ['B', 'D']), 'A(F) C(F) B(N) D(N)');
  // Every cue of a folder chosen: that folder is empty now (the writer prunes it).
  assert.equal(fold('A(F) B(F) C', ['A', 'B']), 'A(N) B(N) C');
  assert.equal(foldSelection(parse('A B'), new Set(['X']), 'N'), null);
});

test('removing a folder keeps its cues where they stand, in none', () => {
  assert.equal(show(unfold(parse('A B(F) C(F) D(G)'), 'F')), 'A B C D(G)');
});

test('only a clip or an audio file may play through, and the reason names the cue', () => {
  const items = [
    { id: 'clip', kind: 'media', mediaKind: 'movie' },
    { id: 'audio', kind: 'media', mediaKind: 'audio' },
    { id: 'old', kind: 'media' },
    { id: 'still', kind: 'media', mediaKind: 'still' },
    { id: 'tpl', kind: 'template' },
  ];
  const onItem = (id) => ({ label: id.toUpperCase(), source: 'playout', sourceId: id });
  assert.equal(throughRefusal(onItem('clip'), items), null);
  assert.equal(throughRefusal(onItem('audio'), items), null);
  // Its kind not known yet: it may join, and the folder's Take waits for the kind.
  assert.equal(throughRefusal(onItem('old'), items), null);
  assert.equal(throughRefusal(onItem('still'), items), 'STILL is a still, which never ends, and a folder that plays through plays clips and audio files only.');
  assert.equal(throughRefusal(onItem('tpl'), items), 'TPL is a server template, and a folder that plays through plays clips and audio files only.');
  assert.equal(throughRefusal({ label: 'Lower third', sourceId: 'g' }, items), 'Lower third is a graphic, and a folder that plays through plays clips and audio files only.');
});

test('every writer\'s step keeps every folder whole, on every small rundown', () => {
  const rundowns = contiguousRundowns(5);
  assert.ok(rundowns.length > 100);
  for (const cues of rundowns) {
    const name = show(cues);
    assert.ok(foldersContiguous(appendCue(cues, cue('N'))), `append to ${name}`);
    for (const c of cues) {
      assert.ok(foldersContiguous(insertAfter(cues, c.id, cue('N'))), `duplicate ${c.id} in ${name}`);
      assert.ok(foldersContiguous(cues.filter((x) => x.id !== c.id)), `remove ${c.id} from ${name}`);
      for (const d of cues) {
        const chosen = foldSelection(cues, new Set([c.id, d.id]), 'N');
        assert.ok(foldersContiguous(pruneFolders(chosen, [{ id: 'F' }, { id: 'G' }, { id: 'N' }]).cues), `fold ${c.id} and ${d.id} in ${name}`);
      }
    }
    for (const f of ['F', 'G']) assert.ok(foldersContiguous(unfold(cues, f)), `unfold ${f} in ${name}`);
  }
});

/** Every rundown of `n` cues over up to two folders, contiguous or split, as an older build or a merge
 *  may leave it. */
function everyRundown(n) {
  const out = [];
  const walk = (prefix) => {
    if (prefix.length === n) return void out.push(prefix);
    for (const f of ['', 'F', 'G']) walk([...prefix, cue(String.fromCharCode(65 + prefix.length), f || undefined)]);
  };
  walk([]);
  return out;
}

/** The drag as shipped before this phase: a chain of neighbour swaps (CueRundown.tsx onDrop, and
 *  moveShowCue's body at the merge base), over plain ids. */
function oldDrag(ids, from, to) {
  const out = [...ids];
  const step = from < to ? 1 : -1;
  for (let k = from; k !== to; k += step) [out[k], out[k + step]] = [out[k + step], out[k]];
  return out;
}

test("a drop in a row's middle is today's drag exactly: after the row moving down, before it moving up", () => {
  const ids = ['A', 'B', 'C', 'D', 'E'];
  for (let from = 0; from < ids.length; from++) {
    for (let to = 0; to < ids.length; to++) {
      if (from === to) continue;
      const place = from < to ? { after: ids[to] } : { before: ids[to] };
      const moved = placeInOrder(parse(ids.join(' ')), [], { cueId: ids[from] }, place);
      assert.deepEqual(moved.map((c) => c.id), oldDrag(ids, from, to), `${ids[from]} onto ${ids[to]}`);
    }
  }
});

test('a drag moves a cue in or out of a folder, or a whole folder, in one step', () => {
  const move = (text, what, place) => show(placeInOrder(parse(text), foldersOf(parse(text)), what, place));
  // Into a folder: beside one of its cues, or last in it through its header.
  assert.equal(move('A B(F) C(F) D', { cueId: 'A' }, { after: 'B' }), 'B(F) A(F) C(F) D');
  assert.equal(move('A B(F) C(F) D', { cueId: 'D' }, { into: 'F' }), 'A B(F) C(F) D(F)');
  assert.equal(move('A B(F) C(F) D', { cueId: 'D' }, { before: 'B' }), 'A D(F) B(F) C(F)');
  // Out of it: above the folder, below it, or to the end.
  assert.equal(move('A B(F) C(F) D', { cueId: 'C' }, { beforeFolder: 'F' }), 'A C B(F) D');
  assert.equal(move('A B(F) C(F)', { cueId: 'B' }, { afterFolder: 'F' }), 'A C(F) B');
  assert.equal(move('A B(F) C(F)', { cueId: 'B' }, { end: true }), 'A C(F) B');
  // A whole folder, past a cue, and beside another folder but never inside it.
  assert.equal(move('A B(F) C(F) D', { folderId: 'F' }, { after: 'D' }), 'A D B(F) C(F)');
  // Dropped before a cue inside another folder, it lands right after that folder instead.
  assert.equal(move('C(F) D(F) A(G) B(G) E', { folderId: 'F' }, { before: 'B' }), 'A(G) B(G) C(F) D(F) E');
  assert.equal(move('A(G) B(G) C(F) D(F)', { folderId: 'F' }, { beforeFolder: 'G' }), 'C(F) D(F) A(G) B(G)');
  // Nothing changes: onto itself, a folder onto its own cue, a place that is gone.
  assert.equal(placeInOrder(parse('A B'), [], { cueId: 'A' }, { before: 'A' }), null);
  assert.equal(placeInOrder(parse('A(F) B(F) C'), foldersOf(parse('A(F)')), { folderId: 'F' }, { after: 'B' }), null);
  assert.equal(placeInOrder(parse('A B'), [], { cueId: 'A' }, { before: 'GONE' }), null);
  assert.equal(placeInOrder(parse('A B'), [], { cueId: 'A' }, { before: 'B' }), null);
  // A folderId naming no folder reads as none, so the move treats that cue as in none.
  assert.equal(show(placeInOrder(parse('A(GONE) B C'), [], { cueId: 'C' }, { after: 'A' })), 'A C B');
  // The next move gathers a folder an older build split, whatever it moves.
  assert.equal(move('A(F) X B(F) Y', { cueId: 'Y' }, { beforeFolder: 'F' }), 'Y A(F) B(F) X');
  assert.equal(move('A(F) X B(F) Y', { cueId: 'Y' }, { before: 'A' }), 'Y(F) A(F) B(F) X');
});

test('one step never splits a folder: in it, a cue swaps; at its edge it steps out; outside, it steps over the folder', () => {
  const step = (text, id, dir) => show(stepInOrder(parse(text), foldersOf(parse(text)), id, dir));
  assert.equal(step('A B(F) C(F) D', 'B', 1), 'A C(F) B(F) D');
  assert.equal(step('A B(F) C(F) D', 'C', 1), 'A B(F) C D');
  assert.equal(step('A B(F) C(F) D', 'B', -1), 'A B C(F) D');
  assert.equal(step('A B(F) C(F) D', 'A', 1), 'B(F) C(F) A D');
  assert.equal(step('A B(F) C(F) D', 'D', -1), 'A D B(F) C(F)');
  assert.equal(step('A B C', 'A', 1), 'B A C');
  assert.equal(stepInOrder(parse('A B'), [], 'B', 1), null);
  // A cue naming a folder that is gone steps as a cue in none.
  assert.equal(show(stepInOrder(parse('A(GONE) B'), [], 'A', 1)), 'B A');
});

test('every move and every step keeps every folder whole, on every small rundown, split ones included', () => {
  for (const cues of everyRundown(5)) {
    const name = show(cues);
    const ids = cues.map((c) => c.id);
    const places = [...ids.flatMap((id) => [{ before: id }, { after: id }]), { into: 'F' }, { into: 'G' }, { beforeFolder: 'F' }, { afterFolder: 'G' }, { end: true }];
    for (const what of [...ids.map((cueId) => ({ cueId })), { folderId: 'F' }, { folderId: 'G' }]) {
      for (const place of places) {
        const out = placeInOrder(cues, foldersOf(cues), what, place);
        if (out) assert.ok(foldersContiguous(out), `${JSON.stringify(what)} to ${JSON.stringify(place)} in ${name}`);
      }
    }
    for (const id of ids) for (const dir of [-1, 1]) {
      const out = stepInOrder(cues, foldersOf(cues), id, dir);
      if (out) assert.ok(foldersContiguous(out), `step ${id} ${dir} in ${name}`);
    }
  }
});

test('a drag is refused where it cannot go, and says why before it is let go', () => {
  const items = [
    { id: 'clip', kind: 'media', mediaKind: 'movie' },
    { id: 'still', kind: 'media', mediaKind: 'still' },
  ];
  const onItem = (id, item, folderId) => ({ id, sourceId: item, source: 'playout', label: id, values: {}, ...(folderId ? { folderId } : {}) });
  const record = {
    cues: [onItem('V1', 'clip', 'T'), onItem('V2', 'clip', 'T'), { ...cue('GFX'), label: 'Lower third' }, onItem('LOGO', 'still'), onItem('V3', 'clip')],
    folders: [{ id: 'T', name: 'Opening', mode: 'through' }],
    playoutItems: items,
  };
  // A graphic or a still at a Play-through folder's door, however it gets there.
  assert.equal(placeRefusal(record, { cueId: 'GFX' }, { into: 'T' }), 'Lower third is a graphic, and a folder that plays through plays clips and audio files only.');
  assert.equal(placeRefusal(record, { cueId: 'LOGO' }, { after: 'V1' }), 'LOGO is a still, which never ends, and a folder that plays through plays clips and audio files only.');
  // A clip joins; a member moves within the folder and leaves it.
  assert.equal(placeRefusal(record, { cueId: 'V3' }, { before: 'V1' }), null);
  assert.equal(placeRefusal(record, { cueId: 'V2' }, { before: 'V1' }), null);
  assert.equal(placeRefusal(record, { cueId: 'V2' }, { end: true }), null);
  // A folder never goes inside another, and a piece or place that has gone is said so.
  const two = { ...record, cues: [...record.cues, { ...cue('X', 'G') }], folders: [...record.folders, { id: 'G', name: 'G', mode: 'manual' }] };
  assert.equal(placeRefusal(two, { folderId: 'G' }, { after: 'V1' }), 'A folder cannot go inside another folder.');
  assert.equal(placeRefusal(two, { folderId: 'G' }, { into: 'T' }), 'A folder cannot go inside another folder.');
  assert.equal(placeRefusal(two, { folderId: 'G' }, { afterFolder: 'T' }), null);
  assert.equal(placeRefusal(record, { cueId: 'GONE' }, { end: true }), 'The rundown changed while you dragged. Drag it again.');
  assert.equal(placeRefusal(record, { cueId: 'V3' }, { before: 'GONE' }), 'The rundown changed while you dragged. Drag it again.');
});

test('a new folder is named one past the highest in use; a mode this build does not know reads as One by one', () => {
  assert.equal(nextFolderName(undefined), 'Folder 1');
  assert.equal(nextFolderName([{ name: 'Folder 1' }, { name: 'Folder 3' }, { name: 'Round one' }]), 'Folder 4');
  assert.equal(folderMode({ mode: 'through' }), 'through');
  assert.equal(folderMode({ mode: 'shuffle' }), 'manual');
});

test('a folder id written twice is read once, the first entry winning, and the next write keeps one', () => {
  const { folders: kept, changed } = pruneFolders(parse('A(F)'), [{ id: 'F', name: 'first' }, { id: 'F', name: 'second' }]);
  assert.equal(changed, true);
  assert.deepEqual(kept, [{ id: 'F', name: 'first' }]);
});
