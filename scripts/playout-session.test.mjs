// guards: src/control/playoutSession.ts
//
// The playout session's lifetime (production-page refactor spec §3, AC-6): keyed on the production
// id only, alive until disposed, every registered stop run once on disposal, and a fold after
// disposal a no-op.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayoutSession } from '../src/control/playoutSession.ts';

test('a session is keyed on the production id and starts alive', () => {
  const session = createPlayoutSession('prod-1');
  assert.equal(session.key, 'prod-1');
  assert.equal(session.alive(), true);
  assert.notEqual(createPlayoutSession('prod-1'), session, 'each production open is its own session');
});

test('dispose flips alive and runs every stop once, in registration order', () => {
  const session = createPlayoutSession('prod-1');
  const ran = [];
  session.onDispose(() => ran.push('wire'));
  const off = session.onDispose(() => ran.push('removed'));
  session.onDispose(() => {
    ran.push(`data alive=${session.alive()}`);
  });
  off();
  session.dispose();
  assert.equal(session.alive(), false);
  assert.deepEqual(ran, ['wire', 'data alive=false'], 'alive is already false when the stops run');
  session.dispose();
  assert.deepEqual(ran, ['wire', 'data alive=false'], 'a second dispose runs nothing');
});

test('a stop registered after disposal runs at once', () => {
  const session = createPlayoutSession('prod-1');
  session.dispose();
  let ran = 0;
  const off = session.onDispose(() => (ran += 1));
  assert.equal(ran, 1);
  off();
  assert.equal(ran, 1);
});

test('apply runs its fold while alive and is a no-op after disposal', () => {
  const session = createPlayoutSession('prod-1');
  let folds = 0;
  session.apply((parts) => {
    folds += 1;
    return parts;
  });
  session.dispose();
  session.apply((parts) => {
    folds += 1;
    return parts;
  });
  assert.equal(folds, 1);
});
