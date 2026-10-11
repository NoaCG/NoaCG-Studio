// guards: src/community/librarySource.ts, src/community/packSources.ts
// A community pack made from Home (docs/work-specs/community-packs/slice-4-research.md (a)): a
// folder or a selection keeps only the maker's own graphics, says how many it left out, and a
// selection is named after its folder only when every graphic shares one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownLibrarySource } from '../src/community/librarySource.ts';

const doc = (id, folder, fromPack) => ({
  id,
  name: `Graphic ${id}`,
  folder,
  template: { id },
  ...(fromPack ? { fromPack: { id: 'community:x', version: 1, author: 'Someone' } } : {}),
});

test('a folder keeps its own graphics, names itself, and counts the installed ones it leaves out', () => {
  const { source, leftOut } = ownLibrarySource([doc('a', 'Quiz night'), doc('b', 'Quiz night', true), doc('c', 'Quiz night')], 'Quiz night');
  assert.equal(source.id, 'folder:Quiz night');
  assert.equal(source.kind, 'folder');
  assert.equal(source.name, 'Quiz night');
  assert.deepEqual(source.graphics.map((g) => g.key), ['a', 'c']);
  assert.deepEqual(source.graphics[0], { key: 'a', name: 'Graphic a', template: { id: 'a' } });
  assert.equal(leftOut, 1);
});

test('a selection inside one folder takes that folder as its name', () => {
  const { source, leftOut } = ownLibrarySource([doc('a', 'Quiz night'), doc('b', 'Quiz night')]);
  assert.equal(source.id, 'selection');
  assert.equal(source.kind, 'selection');
  assert.equal(source.name, 'Quiz night');
  assert.equal(leftOut, 0);
});

test('a selection across folders, or with an unfiled graphic, has no name', () => {
  assert.equal(ownLibrarySource([doc('a', 'Quiz night'), doc('b', 'Opener')]).source.name, '');
  assert.equal(ownLibrarySource([doc('a', 'Quiz night'), doc('b', undefined)]).source.name, '');
  assert.equal(ownLibrarySource([doc('a', undefined)]).source.name, '');
});

test('a set installed wholly from the shelf has nothing of the maker to submit', () => {
  const { source, leftOut } = ownLibrarySource([doc('a', 'Pack', true), doc('b', 'Pack', true)], 'Pack');
  assert.deepEqual(source.graphics, []);
  assert.equal(leftOut, 2);
});
