// guards: src/control/liveCue.ts
//
// The live map's pure folds (production-page refactor phase 2, spec §2 and §5.3 "Take", "Out"):
// which cue is up on each layer, read from every snapshot format the server has written, moved one
// marker at a time, and `leftAlone`, the list of graphics an answer must not write over because a
// later press of this page already moved them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { answerMarker, foreignMarker, landedLate, leftAlone, pressMarker, readLiveCue, withLiveCue, withoutOwnMarkers } from '../src/control/liveCue.ts';

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
  assert.match(source, /export \{ leftAlone, readLiveCue, withLiveCue, type LiveCueMap, type VerbSent \} from '\.\/liveCue';/);
  assert.doesNotMatch(source, /export function (leftAlone|readLiveCue|withLiveCue)\b/, 'one definition, in liveCue.ts');
});

test('the marker book: a press landed names its cue unless a newer one landed or is out; one that failed gives back the newest landed or what stood before (#1696)', () => {
  // Earlier lands under a later press, the later fails: the earlier cue.
  let book = pressMarker({}, { Bug: 'c0' }, 'Bug', 1, 'c1');
  book = pressMarker(book, { Bug: 'c1' }, 'Bug', 2, 'c2');
  let step = answerMarker(book, { Bug: 'c2' }, 'Bug', 1, true);
  assert.equal(step.write, undefined, 'not under the later press still out');
  step = answerMarker(step.book, { Bug: 'c2' }, 'Bug', 2, false);
  assert.deepEqual(step, { book: {}, write: 'c1' });
  // None lands: what stood before. Already there: nothing to write.
  book = pressMarker({}, { Bug: 'c0' }, 'Bug', 3, null);
  assert.deepEqual(answerMarker(book, {}, 'Bug', 3, false), { book: {}, write: 'c0' });
  assert.deepEqual(answerMarker(book, { Bug: 'c0' }, 'Bug', 3, false), { book: {} });
  // Another screen's cue since: left alone.
  assert.deepEqual(answerMarker(book, { Bug: 'x1' }, 'Bug', 3, false), { book: {} });
  // A late older answer, landed or not, never writes over a newer one that landed.
  book = pressMarker(pressMarker({}, {}, 'Bug', 4, 'c1'), {}, 'Bug', 5, 'c2');
  step = answerMarker(book, {}, 'Bug', 5, true);
  assert.equal(step.write, 'c2');
  for (const landed of [true, false]) assert.deepEqual(answerMarker(step.book, { Bug: 'c2' }, 'Bug', 4, landed), { book: {} });
  // An unknown press or graphic changes nothing.
  assert.equal(answerMarker(book, {}, 'Bug', 9, true).book, book);
  assert.equal(answerMarker(book, {}, 'Lower', 4, true).book, book);
  // A press heard landing late stands over an older one still out.
  book = pressMarker(pressMarker({}, {}, 'Bug', 6, 'c1'), {}, 'Bug', 7, 'c2');
  book = answerMarker(book, {}, 'Bug', 7, false).book;
  book = landedLate(book, 'Bug', 7, 'c2');
  assert.deepEqual(answerMarker(book, { Bug: 'c2' }, 'Bug', 6, true), { book: {} });
  assert.equal(landedLate({}, 'Bug', 7, 'c2').Bug, undefined, 'no press out: nothing to book');
});

test('withoutOwnMarkers drops only the cue markers it is told are owned (#1696)', () => {
  const items = [
    { graphic: 'Bug', msg: { t: 'cue', cue: 'c1', oid: 'mine' } },
    { graphic: 'Bug', msg: { t: 'play', oid: 'mine' } },
    { graphic: 'Bug', msg: { t: 'cue', cue: 'x1', oid: 'theirs' } },
  ];
  assert.deepEqual(withoutOwnMarkers(items, (item) => item.msg.oid === 'mine'), items.slice(1));
});

test("another screen's cue marker heard while a press is out stands over that press failing, whatever cue it names (#1696)", () => {
  let book = pressMarker({}, { Bug: 'c0' }, 'Bug', 1, 'c1');
  book = foreignMarker(book, 'Bug');
  assert.deepEqual(answerMarker(book, { Bug: 'c1' }, 'Bug', 1, false), { book: {} });
  assert.equal(foreignMarker({}, 'Bug').Bug, undefined, 'no press out: nothing to note');
});
