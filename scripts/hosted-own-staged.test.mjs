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
const { addOwnStaged, dropOwnStaged, settleOwnStaged, withOwnStaged } = await import(
  `data:text/javascript,${encodeURIComponent(js)}`
);

const shared = { 'Quiz board': { f5: 'A', f6: '' } };

test('an edit counts at once, before the shared buffer has heard of it', () => {
  const own = addOwnStaged({}, 'Quiz board', { f5: 'C' });
  assert.deepEqual(withOwnStaged(shared, own)['Quiz board'], { f5: 'C', f6: '' });
});

test('nothing pending returns the shared buffer itself', () => {
  assert.equal(withOwnStaged(shared, {}), shared);
});

test('the row that carries our value settles it, and the graphic leaves the overlay', () => {
  const own = addOwnStaged({}, 'Quiz board', { f5: 'C', f6: 'B' });
  assert.deepEqual(settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: 'B' }), {});
});

test('an OLDER row does not settle a newer edit of the same key', () => {
  // Typed C, then D before C's row came back: C's row must leave D pending.
  let own = addOwnStaged({}, 'Quiz board', { f5: 'C' });
  own = addOwnStaged(own, 'Quiz board', { f5: 'D' });
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' });
  assert.deepEqual(own, { 'Quiz board': { f5: 'D' } });
  assert.equal(withOwnStaged(shared, own)['Quiz board'].f5, 'D');
});

test('a row settles only the keys it shows, and only on its own graphic', () => {
  let own = addOwnStaged({}, 'Quiz board', { f5: 'C', f6: 'B' });
  own = addOwnStaged(own, 'Team score', { f1: '3' });
  own = settleOwnStaged(own, 'Quiz board', { f5: 'C', f6: '' });
  assert.deepEqual(own, { 'Quiz board': { f6: 'B' }, 'Team score': { f1: '3' } });
});

test('a refused write leaves the overlay, but a key edited again since keeps its new value', () => {
  let own = addOwnStaged({}, 'Quiz board', { f5: 'C', f6: 'B' });
  own = addOwnStaged(own, 'Quiz board', { f6: 'D' });
  own = dropOwnStaged(own, 'Quiz board', { f5: 'C', f6: 'B' });
  assert.deepEqual(own, { 'Quiz board': { f6: 'D' } });
});

test('an empty edit changes nothing', () => {
  const own = {};
  assert.equal(addOwnStaged(own, 'Quiz board', {}), own);
});
