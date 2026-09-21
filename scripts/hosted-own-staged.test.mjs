// guards: src/components/control/ownStaged.ts
//
// The hosted control page's own staged edits, laid over the shared buffer until it shows them
// back (src/components/control/ownStaged.ts).
//
// The defect this pins: an operator picked a quiz key and pressed Take inside the shared buffer's
// round trip, the Take read the buffer, and air got the cue's stored key. Reveal correct then lit
// the wrong answer while every screen logged the press (configured run 35633742370). The page
// that renders it can only run against a backend, so the rule itself is pinned here and the
// configured walk (e2e/configured/dashboard-hosted-walk.spec.ts) proves it on air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// The module imports nothing, so one transpile is the whole load (the combine-control precedent).
const source = readFileSync(fileURLToPath(new URL('../src/components/control/ownStaged.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { answerOwnStaged, noteOwnStaged, sendOwnStaged, settleOwnStaged, withOwnStaged } = await import(
  `data:text/javascript,${encodeURIComponent(js)}`
);

const shared = { 'Quiz board': { f5: 'A', f6: '' } };

/** Stage `data` the way the page does: noted, then written. */
const stage = (own, graphic, data) => sendOwnStaged(noteOwnStaged(own, graphic, data), graphic, data);
const valueOf = (own, key) => withOwnStaged(shared, own)['Quiz board'][key];

test('an edit counts at once, before the shared buffer has heard of it', () => {
  const own = noteOwnStaged({}, 'Quiz board', { f5: 'C' });
  assert.deepEqual(withOwnStaged(shared, own)['Quiz board'], { f5: 'C', f6: '' });
});

test('nothing pending returns the shared buffer itself', () => {
  assert.equal(withOwnStaged(shared, {}), shared);
});

test('the write answers first, then its row settles it', () => {
  let own = stage({}, 'Quiz board', { f5: 'C', f6: 'B' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C', f6: 'B' }, true, shared['Quiz board']);
  assert.equal(valueOf(own, 'f5'), 'C', 'answered but not yet shown: still ours');
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: 'B' });
  assert.deepEqual(own, {});
});

test('the row arrives first, then the answer settles it', () => {
  let own = stage({}, 'Quiz board', { f5: 'C' });
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' });
  assert.equal(valueOf(own, 'f5'), 'C', 'the write is still in flight');
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C' }, true, { f5: 'C', f6: '' });
  assert.deepEqual(own, {});
});

test('an edit still in the debounce is never settled by a row', () => {
  const own = noteOwnStaged({}, 'Quiz board', { f5: 'C' });
  assert.equal(settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' }), own);
});

test('C, B, then C again: the first C row does not settle the second C', () => {
  let own = stage({}, 'Quiz board', { f5: 'C' });
  own = stage(own, 'Quiz board', { f5: 'B' });
  own = noteOwnStaged(own, 'Quiz board', { f5: 'C' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C' }, true, shared['Quiz board']);
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'B' }, true, { f5: 'C', f6: '' });
  own = settleOwnStaged(own, 'Quiz board', { f5: 'B', f6: '' });
  assert.equal(valueOf(own, 'f5'), 'C', 'a Take here must air the C on screen, not the B in the buffer');
  own = sendOwnStaged(own, 'Quiz board', { f5: 'C' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C' }, true, { f5: 'B', f6: '' });
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' });
  assert.deepEqual(own, {});
});

test('a row settles only the keys it shows, and only on its own graphic', () => {
  let own = stage({}, 'Quiz board', { f5: 'C', f6: 'B' });
  own = stage(own, 'Team score', { f1: '3' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C', f6: 'B' }, true, shared['Quiz board']);
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' });
  assert.deepEqual(withOwnStaged({}, own), { 'Quiz board': { f6: 'B' }, 'Team score': { f1: '3' } });
});

test('a refused write leaves the overlay, but a key edited again since keeps its new value', () => {
  let own = stage({}, 'Quiz board', { f5: 'C', f6: 'B' });
  own = noteOwnStaged(own, 'Quiz board', { f6: 'D' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C', f6: 'B' }, false, shared['Quiz board']);
  assert.deepEqual(withOwnStaged({}, own), { 'Quiz board': { f6: 'D' } });
});

test('a refused write waits for another write of the same key still in flight', () => {
  let own = stage({}, 'Quiz board', { f5: 'C' });
  own = stage(own, 'Quiz board', { f5: 'C' });
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C' }, false, shared['Quiz board']);
  assert.equal(valueOf(own, 'f5'), 'C');
  own = answerOwnStaged(own, 'Quiz board', { f5: 'C' }, true, { f5: 'C', f6: '' });
  assert.deepEqual(own, {});
});

test('an empty edit changes nothing', () => {
  const own = {};
  assert.equal(noteOwnStaged(own, 'Quiz board', {}), own);
});
