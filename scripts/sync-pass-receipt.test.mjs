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
function load(file, stubs, window = new EventTarget(), timers = [], browser = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/backend/${file}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency: ${name}`);
    return stubs[name];
  }, window, CustomEvent: Event, ...browser,
  setTimeout: (fn, ms) => { const timer = Object.assign(() => { timer.fired = true; fn(); }, { ms }); return timers.push(timer); }, clearTimeout: (id) => { if (id) timers[id - 1].cleared = true; } });
  return exports;
}
function controller(timers = [], browser = { navigator: {} }) {
  const window = new EventTarget(), passes = [];
  let user = 'owner', auth;
  const noop = () => {};
  const stubs = {
    './config': { isBackendConfigured: () => true },
    './pacing': { focusPassDue: () => true, backoffDelay: (failures, base, max) => Math.min(max, base * 2 ** (failures - 1)) },
    './supabase': { CLOUD_NO_ANSWER: 'no answer', cloudFailureWords: (message) => (/did not answer/.test(message) ? 'no answer' : message) },
    './auth': { getSignedInUserId: async () => user, subscribeAuth: cb => { auth = cb; }, consumeDeliberateSignOut: () => true },
    './accountLibrary': { followLibraryChangesInOtherTabs: noop, bindLibraryToAccount: async () => 'ready' },
    '../model/durableStore': { libraryInUse: () => 'owner', canAuthorAccount: () => true,
      commitDurableWrites: async () => null, markOwnWritesSynced: noop, setAccountAuthoringEnabled: noop,
      changeSyncedElsewhere: (event) => event.adopted === true },
    './storage': { LocalStorageProvider: class {} },
    './supabaseProvider': { SupabaseProvider: class { async purgeTombstones() {} } },
    './sync': { libraryHasArrived: () => true, runSync: () => { const pass = deferred(); passes.push(pass); return pass.promise; } },
    '../model/packets': { purgeOldTombstones: noop },
    '../model/shows': { purgeOldShowTombstones: noop, loadShows: () => [], settleShowCopies: () => ({ shows: [], error: null, changed: false }) },
    '../model/copySettle': { needsSettle: () => false },
    '../model/videoProject': { purgeOldVideoTombstones: noop },
    '../model/library': { purgeOldGraphicTombstones: noop },
  };
  const api = load('syncController', stubs, window, timers, browser);
  api.startAutoSync();
  return { api, passes, timers, edit: () => window.dispatchEvent(new Event('spx-data-changed')),
    adopt: () => window.dispatchEvent(Object.assign(new Event('spx-data-changed'), { adopted: true })),
    loseSession() { user = null; },
    signIn(expiresAt) { auth({ status: 'signed-in', user: { id: user }, expiresAt }); },
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
  // The edit that landed during pass 1 does not chain a pass at once (#2494): it waits for the
  // debounce it armed, so the follow-up is one pass per pause, not one pass per pass.
  await tick(); assert.equal(h.passes.length, 2);
  assert.equal(h.api.getSyncState().phase, 'pending');
  const debounce = h.timers.filter((fn) => fn.ms === 2500 && !fn.cleared && !fn.fired);
  assert.equal(debounce.length, 1);
  debounce[0](); await tick();
  assert.equal(h.passes.length, 3);
  assert.equal(h.api.getSyncState().phase, 'syncing');
  h.passes[2].resolve(result()); await tick();
});

test('continuous edits during a pass cost one pass per pause, not one pass per pass (#2494)', async () => {
  const timers = [], h = controller(timers);
  void h.api.syncNow();               // the pass at page load overlaps the edits
  await tick();
  assert.equal(h.passes.length, 1);
  h.edit(); h.edit(); h.edit();       // edits land faster than the pass completes
  h.passes[0].resolve(result());
  await tick();
  // The pass ended with a newer revision waiting. Pre-fix it re-ran at once and kept re-running
  // for as long as the edits continued, slowing every Take; now it waits for the debounce.
  assert.equal(h.passes.length, 1, 'no pass-to-pass chain while edits keep arriving');
  assert.equal(h.api.getSyncState().phase, 'pending');
  const debounce = () => timers.filter((fn) => fn.ms === 2500 && !fn.cleared && !fn.fired);
  assert.equal(debounce().length, 1, 'the follow-up waits for the debounce, not an immediate re-run');
  // When typing pauses the debounce fires: exactly one pass confirms the latest revision.
  debounce()[0](); await tick();
  assert.equal(h.passes.length, 2, 'a pass still runs once the edits stop');
  h.passes[1].resolve(result()); await tick();
  assert.equal(h.api.getSyncState().phase, 'synced', 'the revision is confirmed — no edit lost');
  assert.equal(h.passes.length, 2, 'and the chain has ended');
});

test('an adopted cross-tab change during a pass triggers no local pass or debounce (#2494)', async () => {
  const timers = [], h = controller(timers);
  void h.api.syncNow();              // a pass is running
  await tick();
  assert.equal(h.passes.length, 1);
  h.adopt();                         // another tab's change arrives from IndexedDB during the pass
  h.passes[0].resolve(result());
  await tick();
  // The tab that made the change owns pushing it and broadcasts its confirmation; this tab must
  // not run a redundant per-tab pass, nor arm a debounce (which would stall that confirmation).
  assert.equal(h.passes.length, 1, 'the tab that made the change pushes it; this tab runs no pass');
  assert.equal(timers.filter((fn) => fn.ms === 2500 && !fn.cleared && !fn.fired).length, 0,
    'and arms no debounce of its own');
});

test('coalesced callers released without a runnable next pass receive no completion', async () => {
  const h = controller(), first = h.api.syncNow();
  await tick(); const second = h.api.syncNow(); await tick();
  h.signOut(); h.passes[0].resolve(result());
  assert.equal((await first).completed, false);
  assert.equal((await second).completed, false);
  assert.equal(h.passes.length, 1);
});

test('a pass the cloud did not answer tries again by itself, later each time, until one is answered (#2154)', async () => {
  const timers = [], h = controller(timers);
  // The debounce after an edit is shorter; what waits a retry's base or longer is a retry.
  const retries = () => timers.filter((fn) => fn.ms >= 15_000).map((fn) => fn.ms);
  void h.api.syncNow();
  await tick(); h.passes[0].resolve({ failures: [{ kind: 'look', name: 'A', message: 'Cloud get(look) failed: The cloud did not answer.' }], unanswered: true });
  await tick(); assert.deepEqual(retries(), [15_000]);
  timers.at(-1)(); await tick();
  assert.equal(h.passes.length, 2, 'the retry runs a pass with nobody pressing');
  h.passes[1].reject(new Error('Cloud list(look) failed: AbortError: The cloud did not answer.'));
  await tick(); assert.deepEqual(retries(), [15_000, 30_000]);
  timers.at(-1)(); await tick();
  h.passes[2].resolve(result());
  await tick(); assert.equal(h.api.getSyncState().phase, 'synced');
  assert.deepEqual(retries(), [15_000, 30_000], 'an answered pass arms nothing');
});

test('a pass that failed for another reason waits for its usual triggers', async () => {
  const timers = [], h = controller(timers);
  void h.api.syncNow();
  await tick(); h.passes[0].reject(new Error('Browser storage is full'));
  await tick(); assert.equal(h.api.getSyncState().phase, 'error');
  assert.deepEqual(timers.filter((fn) => fn.ms >= 15_000), []);
});

/** Tabs of one browser: what one posts on a channel the others hear, and one Web Lock each name. */
function browserTabs() {
  const channels = [], held = new Set();
  class BroadcastChannel {
    constructor(name) { this.name = name; this.onmessage = null; channels.push(this); }
    postMessage(data) { for (const other of channels) if (other !== this && other.name === this.name) other.onmessage?.({ data }); }
  }
  const locks = { request(name, _options, callback) {
    if (held.has(name)) return Promise.resolve().then(() => callback(null));
    held.add(name);
    return Promise.resolve().then(() => callback({ name })).finally(() => held.delete(name));
  } };
  return { held, tab: () => controller([], { BroadcastChannel, navigator: { locks } }) };
}
const NO_ANSWER = { failures: [{ kind: 'look', name: 'A', message: 'Cloud list(look) failed: The cloud did not answer.' }], unanswered: true };
const armed = (h) => h.timers.filter((fn) => fn.ms >= 15_000 && !fn.cleared && !fn.fired);
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

test('a tab that takes another tab\'s confirmed pass as its own stops its own retry', async () => {
  const browser = browserTabs(), a = browser.tab(), b = browser.tab();
  void a.api.syncNow(); void b.api.syncNow();
  await tick(); b.passes[0].resolve(result()); await settle(); a.passes[0].resolve(NO_ANSWER);
  await settle(); assert.equal(armed(a).length, 1);
  a.adopt(); assert.equal(a.api.getSyncState().phase, 'pending');
  void b.api.syncNow(); await tick(); b.passes[1].resolve(result()); await settle();
  assert.equal(a.api.getSyncState().phase, 'synced');
  assert.deepEqual(armed(a), [], 'no retry left to run a pass the other tab already ran');
});

test('only one tab of a browser retries against a silent cloud; the others follow its answer', async () => {
  const browser = browserTabs(), a = browser.tab(), b = browser.tab();
  void a.api.syncNow(); void b.api.syncNow();
  await tick(); a.passes[0].resolve(NO_ANSWER); b.passes[0].resolve(NO_ANSWER);
  await settle(); assert.equal(armed(a).length, 1); assert.equal(armed(b).length, 1);
  armed(a)[0](); await settle();
  assert.equal(a.passes.length, 2);
  armed(b)[0](); await settle();
  assert.equal(b.passes.length, 1, 'the other tab skips its tick while one retries');
  a.passes[1].resolve(NO_ANSWER); await settle();
  armed(b).at(-1)(); await settle();
  assert.equal(b.passes.length, 1, 'the retrying tab keeps its turn between its tries');
  armed(a).at(-1)(); await settle();
  a.passes[2].resolve(result()); await settle();
  assert.equal(a.api.getSyncState().phase, 'synced');
  assert.equal(b.api.getSyncState().phase, 'synced', 'the skipping tab takes the answer as its own');
  assert.deepEqual(armed(b), []);
  assert.equal(browser.held.size, 0);
});

test('an account change ends the retries of the account before it', async () => {
  const h = controller();
  void h.api.syncNow();
  await tick(); h.passes[0].resolve(NO_ANSWER); await settle();
  assert.equal(armed(h).length, 1);
  h.signOut(); await settle();
  assert.deepEqual(armed(h), []);
});

test('a retrying tab that can no longer sync gives the turn up', async () => {
  const browser = browserTabs(), a = browser.tab();
  void a.api.syncNow();
  await tick(); a.passes[0].resolve(NO_ANSWER); await settle();
  armed(a)[0](); await settle();
  a.passes[1].resolve(NO_ANSWER); await settle();
  assert.equal(browser.held.size, 1);
  a.loseSession(); armed(a)[0](); await settle();
  assert.equal(browser.held.size, 0, 'a tab that cannot sync keeps no other tab from retrying');
  assert.deepEqual(armed(a), []);
});

test('a session that expires during another pass of the retrying tab gives the turn up', async () => {
  const browser = browserTabs(), a = browser.tab();
  a.signIn(Date.now() + 5_000); await settle();
  a.passes[0].resolve(NO_ANSWER); await settle();
  armed(a)[0](); await settle();
  a.passes[1].resolve(NO_ANSWER); await settle();
  assert.equal(browser.held.size, 1);
  void a.api.syncNow(); await settle();
  a.timers.find((fn) => fn.ms > 2_500 && fn.ms <= 5_000)();
  a.passes[2].resolve(NO_ANSWER); await settle();
  assert.equal(browser.held.size, 0, 'the lock is not held by a tab whose retries are over');
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
