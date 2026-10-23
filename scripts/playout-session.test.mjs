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

test('a new session holds the data part at "not yet known", with no optional capability', async () => {
  const { NO_DATA } = await import('../src/control/playoutSession.ts');
  const session = createPlayoutSession('prod-1');
  assert.equal(session.data.get(), NO_DATA);
  assert.deepEqual(NO_DATA, { liveData: {}, dataKey: undefined, treeRead: false });
});

test('apply moves the parts in one fold, and a part\'s listeners hear only its own change', () => {
  const session = createPlayoutSession('prod-1');
  let heard = 0;
  session.data.subscribe(() => (heard += 1));
  session.apply((parts) => parts);
  assert.equal(heard, 0, 'a fold that moves nothing is heard by nobody');
  session.apply((parts) => ({ ...parts, data: { ...parts.data, dataKey: null } }));
  assert.equal(heard, 1);
  assert.equal(session.data.get().dataKey, null);
  session.dispose();
  session.apply((parts) => ({ ...parts, data: { ...parts.data, dataKey: 'late' } }));
  assert.equal(session.data.get().dataKey, null, 'a fold after disposal changes nothing');
  assert.equal(heard, 1);
});

test('apply sets data before bridge, and a bridge-only fold is heard by the bridge part alone', async () => {
  const { NO_BRIDGE } = await import('../src/control/playoutSession.ts');
  const session = createPlayoutSession('prod-1');
  assert.equal(session.bridge.get(), NO_BRIDGE);
  const heard = [];
  session.data.subscribe(() => heard.push(`data bridge=${session.bridge.get().slotSeenOurs}`));
  session.bridge.subscribe(() => heard.push(`bridge data=${session.data.get().dataKey}`));
  session.apply((parts) => ({ ...parts, bridge: { ...parts.bridge, slotSeenOurs: true } }));
  assert.deepEqual(heard, ['bridge data=undefined']);
  session.apply((parts) => ({ data: { ...parts.data, dataKey: 'k' }, bridge: { ...parts.bridge, slotSeenOurs: false } }));
  assert.deepEqual(heard, ['bridge data=undefined', 'data bridge=true', 'bridge data=k'], 'data is set first, then bridge');
});

test('the folders part starts empty and is set after the arms, in one fold', async () => {
  const { NO_FOLDERS } = await import('../src/control/playoutSession.ts');
  const session = createPlayoutSession('prod-1');
  assert.equal(session.folders.get(), NO_FOLDERS);
  assert.deepEqual({ ...NO_FOLDERS, sending: [...NO_FOLDERS.sending] }, { folderSteps: {}, takeMisses: {}, sending: [] });
  const heard = [];
  session.arms.subscribe(() => heard.push(`arms folders=${Object.keys(session.folders.get().folderSteps)}`));
  session.folders.subscribe(() => heard.push(`folders arms=${Object.keys(session.arms.get())}`));
  session.apply((parts) => ({ ...parts, arms: { G: {} }, folders: { ...parts.folders, folderSteps: { M: null } } }));
  assert.deepEqual(heard, ['arms folders=', 'folders arms=G'], 'arms first, then folders');
  session.dispose();
  session.apply((parts) => ({ ...parts, folders: NO_FOLDERS }));
  assert.deepEqual(session.folders.get().folderSteps, { M: null }, 'a fold after the end changes nothing');
});

test('the air and log parts start empty and are set last, air before log, in one fold', async () => {
  const { NO_AIR, NO_LOG } = await import('../src/control/playoutSession.ts');
  const session = createPlayoutSession('prod-1');
  assert.equal(session.air.get(), NO_AIR);
  assert.deepEqual(NO_AIR, { liveCue: {}, moves: 0, aired: {}, clocks: {}, speaking: {}, commands: 0, reports: null, bootReplay: null, bootLive: null });
  assert.equal(session.log.get(), NO_LOG);
  assert.deepEqual(NO_LOG, { entries: [], localId: 0 });
  const heard = [];
  session.data.subscribe(() => heard.push('data'));
  session.folders.subscribe(() => heard.push('folders'));
  session.air.subscribe(() => heard.push(`air log=${session.log.get().entries.length}`));
  session.log.subscribe(() => heard.push(`log air=${Object.keys(session.air.get().liveCue)}`));
  session.apply((parts) => ({
    ...parts,
    log: { entries: [{ id: -1 }], localId: -1 },
    air: { ...parts.air, liveCue: { lt: 'c1' } },
    folders: { ...parts.folders, takeMisses: { c: 'x' } },
    data: { ...parts.data, dataKey: null },
  }));
  assert.deepEqual(heard, ['data', 'folders', 'air log=0', 'log air=lt'], 'the fixed order: the earlier parts, then air, then log');
  session.apply((parts) => ({ ...parts, log: parts.log }));
  assert.equal(heard.length, 4, 'an unmoved part is heard by nobody');
  session.dispose();
  session.apply((parts) => ({ ...parts, air: NO_AIR }));
  assert.deepEqual(session.air.get().liveCue, { lt: 'c1' }, 'a fold after the end changes nothing');
});

test('each session remembers the commands it applied, apart from every other session', async () => {
  const one = createPlayoutSession('prod-1');
  const two = createPlayoutSession('prod-1');
  assert.equal(one.applied.claim({ t: 'play', oid: 'p1' }), true);
  assert.equal(one.applied.claim({ t: 'play', oid: 'p1' }), false, 'the echo');
  assert.equal(two.applied.claim({ t: 'play', oid: 'p1' }), true, 'a reopened production starts with nothing applied');
});

test('AC-13: a session constructs from the production id alone, with no optional capability, and runs every part', async () => {
  const { NO_AIR, NO_BRIDGE, NO_DATA, NO_FOLDERS, NO_LOG } = await import('../src/control/playoutSession.ts');
  const { moveLiveCue } = await import('../src/control/airState.ts');
  // No Bridge, no local data tree, no PROGRAM monitor, no folders: nothing else is passed.
  const session = createPlayoutSession('hosted-reuse');
  assert.equal(createPlayoutSession.length, 1, 'the id is the only input');
  assert.equal(session.data.get(), NO_DATA);
  assert.equal(session.bridge.get(), NO_BRIDGE);
  assert.deepEqual(session.arms.get(), {});
  assert.equal(session.folders.get(), NO_FOLDERS);
  assert.equal(session.air.get(), NO_AIR);
  assert.equal(session.log.get(), NO_LOG);
  session.apply((parts) => ({ ...parts, air: moveLiveCue(parts.air, { lt: 'c1' }) }));
  assert.deepEqual(session.air.get().liveCue, { lt: 'c1' });
  let stopped = 0;
  session.onDispose(() => (stopped += 1));
  session.dispose();
  assert.equal(stopped, 1);
});
