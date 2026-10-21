// guards: src/control/liveCue.ts
//
// The live map's pure folds (production-page refactor phase 2, spec §2 and §5.3 "Take", "Out"):
// which cue is up on each layer, read from every snapshot format the server has written, moved one
// marker at a time, and `leftAlone`, the list of graphics an answer must not write over because a
// later press of this page already moved them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { leftAlone, readLiveCue, withLiveCue } from '../src/control/liveCue.ts';

test('readLiveCue reads format 2, migrates format 1, and degrades to empty', () => {
  assert.deepEqual(readLiveCue({ v: 2, layers: { Bug: { cue: 'c1' }, Lower: { cue: 'c2' } } }), { Bug: 'c1', Lower: 'c2' });
  assert.deepEqual(readLiveCue({ v: 2, layers: { Bug: { cue: '' }, Lower: null, Score: { cue: 7 } } }), {}, 'no usable entry is no layer');
  assert.deepEqual(readLiveCue({ v: 2 }), {});
  assert.deepEqual(readLiveCue({ v: 3, layers: { Bug: { cue: 'c1' } } }), { Bug: 'c1' }, 'a newer version with layers still reads');
  assert.deepEqual(readLiveCue({ cue: 'c1', graphic: 'Bug' }), { Bug: 'c1' }, 'format 1 is its one entry');
  assert.deepEqual(readLiveCue({ v: 1, cue: null, graphic: 'Bug' }), {});
  for (const nothing of [null, undefined, 'x', 3]) assert.deepEqual(readLiveCue(nothing), {});
});

test('withLiveCue puts a layer up, replaces it, and takes it off as an absent key', () => {
  const empty = {};
  const up = withLiveCue(empty, 'Bug', 'c1');
  assert.deepEqual(up, { Bug: 'c1' });
  assert.deepEqual(empty, {}, 'the old map is not touched');
  const two = withLiveCue(up, 'Lower', 'c2');
  assert.deepEqual(two, { Bug: 'c1', Lower: 'c2' }, 'a Take touches its own layer only');
  const replaced = withLiveCue(two, 'Bug', 'c3');
  assert.deepEqual(replaced, { Bug: 'c3', Lower: 'c2' });
  const off = withLiveCue(replaced, 'Bug', null);
  assert.deepEqual(off, { Lower: 'c2' });
  assert.equal('Bug' in off, false, 'off air is no key, never a stored null');
});

test('withLiveCue answers the same map when nothing moved', () => {
  const map = { Bug: 'c1' };
  assert.equal(withLiveCue(map, 'Bug', 'c1'), map);
  assert.equal(withLiveCue(map, 'Lower', null), map);
  assert.equal(withLiveCue(map, 'Lower', ''), map, 'an empty cue id is off');
});

test('leftAlone lists every graphic an answer must not write over', () => {
  assert.deepEqual(leftAlone({ skipped: [], superseded: [], pressedAgain: [] }), []);
  assert.deepEqual(
    leftAlone({ skipped: ['Bug'], superseded: ['Lower'], pressedAgain: ['Score'] }),
    ['Bug', 'Lower', 'Score'],
  );
});

test('the hosted control module still offers the same folds', async () => {
  // hostedControl.ts itself does not import in Node (spec §5.2); its re-export is checked by
  // the type check and the browser suites, so here only the source's re-export line is read.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/control/hostedControl.ts', import.meta.url), 'utf8');
  assert.match(source, /export \{ leftAlone, readLiveCue, withLiveCue, type LiveCueMap, type VerbSent \};/);
  assert.doesNotMatch(source, /export function (leftAlone|readLiveCue|withLiveCue)\b/, 'one definition, in liveCue.ts');
});
