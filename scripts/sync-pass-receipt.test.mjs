// guards: src/backend/syncController.ts, src/backend/graphicWhenSynced.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const result = () => ({ failures: [] });
function load(file, stubs, window = new EventTarget(), timers = []) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/backend/${file}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency: ${name}`);
    return stubs[name];
  }, window, CustomEvent: Event, setTimeout: fn => timers.push(fn), clearTimeout: () => {} });
  return exports;
}
function controller() {
  const window = new EventTarget(), passes = [];
  let user = 'owner', auth;
  const noop = () => {};
  const stubs = {
    './config': { isBackendConfigured: () => true },
    './auth': { getSignedInUserId: async () => user, subscribeAuth: cb => { auth = cb; }, consumeDeliberateSignOut: () => true },
    './accountLibrary': { followLibraryChangesInOtherTabs: noop },
    '../model/durableStore': { libraryInUse: () => 'owner', canAuthorAccount: () => true,
      commitDurableWrites: async () => null, markOwnWritesSynced: noop, setAccountAuthoringEnabled: noop,
      changeSyncedElsewhere: () => false },
    './storage': { LocalStorageProvider: class {} },
    './supabaseProvider': { SupabaseProvider: class { async purgeTombstones() {} } },
    './sync': { libraryHasArrived: () => true, runSync: () => { const pass = deferred(); passes.push(pass); return pass.promise; } },
    '../model/packets': { purgeOldTombstones: noop },
    '../model/shows': { purgeOldShowTombstones: noop },
    '../model/videoProject': { purgeOldVideoTombstones: noop },
    '../model/library': { purgeOldGraphicTombstones: noop },
  };
  const api = load('syncController', stubs, window);
  api.startAutoSync();
  return { api, passes, edit: () => window.dispatchEvent(new Event('spx-data-changed')),
    signOut() { user = null; auth({ status: 'signed-out' }); } };
}

test('a skipped pass and a thrown cloud read cannot report completion', async () => {
  const skipped = controller(); skipped.signOut();
  assert.equal((await skipped.api.syncNow()).completed, false);
  assert.equal(skipped.passes.length, 0);
  const thrown = controller(), answer = thrown.api.syncNow();
  await tick(); thrown.passes[0].reject(new Error('read unavailable'));
  assert.equal((await answer).completed, false);
  assert.equal(thrown.api.getSyncState().phase, 'error');
});

test('a completed read with an unrelated apply failure still answers its caller', async () => {
  const h = controller(), answer = h.api.syncNow();
  await tick(); h.passes[0].resolve({ failures: [{ kind: 'graphic', name: 'Other', message: 'not applied' }] });
  assert.equal((await answer).completed, true);
  assert.equal(h.api.getSyncState().phase, 'error');
});

test('a pass superseded by an account change cannot report completion', async () => {
  const h = controller(), answer = h.api.syncNow();
  await tick(); h.signOut(); h.passes[0].resolve(result());
  assert.equal((await answer).completed, false);
});

test('coalesced callers receive the next pass receipt even when newer work starts another pass', async () => {
  const h = controller(), first = h.api.syncNow();
  await tick();
  let answered = false;
  const second = h.api.syncNow().then(receipt => { answered = true; return receipt; });
  const third = h.api.syncNow();
  await tick(); h.passes[0].resolve(result());
  assert.equal((await first).completed, true);
  await tick(); assert.equal(answered, false); assert.equal(h.passes.length, 2);
  h.edit(); h.passes[1].resolve(result());
  const receipt = await second;
  assert.equal(receipt.completed, true); assert.equal(await third, receipt);
  await tick(); assert.equal(h.passes.length, 3);
  assert.equal(h.api.getSyncState().phase, 'syncing');
  h.passes[2].resolve(result()); await tick();
});

test('coalesced callers released without a runnable next pass receive no completion', async () => {
  const h = controller(), first = h.api.syncNow();
  await tick(); const second = h.api.syncNow(); await tick();
  h.signOut(); h.passes[0].resolve(result());
  assert.equal((await first).completed, false);
  assert.equal((await second).completed, false);
  assert.equal(h.passes.length, 1);
});

function lookup() {
  const sync = deferred(), window = new EventTarget(), timers = [];
  let doc = null;
  const api = load('graphicWhenSynced', {
    './config': { isBackendConfigured: () => true }, './auth': { getAccessToken: async () => 'session' },
    './syncController': { syncNow: () => sync.promise, getSyncState: () => ({ phase: 'syncing' }) },
    '../model/library': { graphicById: () => doc }, '../model/shows': { loadShows: () => doc ? [doc] : [] },
  }, window, timers);
  return { api, sync, timers, arrive() { doc = { id: 'wanted' }; window.dispatchEvent(new Event('spx-data-changed')); } };
}

test('an absent record uses the completed receipt while the global phase is already syncing', async () => {
  const h = lookup(), answer = h.api.productionWhenSynced('wanted');
  await tick(); h.sync.resolve({ completed: true });
  assert.equal((await answer).status, 'unknown');
});

for (const outcome of ['skipped', 'thrown']) test(`a ${outcome} pass keeps listening instead of declaring absence`, async () => {
  const h = lookup(); let settled = false;
  const answer = h.api.productionWhenSynced('wanted').then(value => { settled = true; return value; });
  await tick();
  if (outcome === 'thrown') h.sync.reject(new Error('unavailable'));
  else h.sync.resolve({ completed: false });
  await tick(); assert.equal(settled, false);
  h.arrive(); assert.equal((await answer).status, 'found');
});
