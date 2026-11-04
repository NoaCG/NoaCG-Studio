// guards: src/backend/supabase.ts, src/backend/sync.ts
// A cloud request with no answer has no end of its own, and a sync pass or a team save waiting on
// one keeps the sync chip amber with nothing able to run behind it (#2090). The shared client ends
// it, without touching the requests that are allowed to take long, and a pass stops at the first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const clientExports = async () => (await clientFetch()).exports;

/** The shared client's fetch, over a browser fetch that never answers and a clock this test moves. */
async function clientFetch() {
  const exports = {};
  const asked = [];
  const timers = new Map();
  let nextTimer = 0;
  let options;
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/supabase.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const stubs = {
    './config': { loadBackendConfig: () => ({ url: 'https://cloud.invalid', anonKey: 'key' }), isBackendConfigured: () => true },
    './realtimeReconnect': { realtimeReconnectAfterMs: () => 1000 },
    '@supabase/supabase-js': { createClient: (url, key, given) => { options = given; return {}; } },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.ok(name in stubs, `unexpected dependency: ${name}`);
      return stubs[name];
    },
    URL, Request, Response, TransformStream, AbortController, DOMException, Blob, FormData,
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    fetch: (input, init) => new Promise((resolve, reject) => {
      asked.push({ input, init, answer: resolve });
      if (init?.signal?.aborted) reject(init.signal.reason);
      init?.signal?.addEventListener('abort', () => reject(init.signal.reason));
    }),
  });
  await exports.getSupabase();
  return { exports, fetch: options.global.fetch, asked, expire: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } }, timers };
}

const failure = (promise) => promise.then(() => assert.fail('it should have failed'), (e) => e);

test('a request nobody answers fails as an abort, so the library does not retry it', async () => {
  for (const path of ['/rest/v1/documents?kind=eq.show', '/rest/v1/rpc/team_production_save', '/auth/v1/user', '/storage/v1/object/user-assets/a.png']) {
    const { fetch, expire } = await clientFetch();
    const answer = fetch(`https://cloud.invalid${path}`, { method: 'GET' });
    expire();
    const error = await failure(answer);
    assert.equal(error.name, 'AbortError', path);
    assert.match(error.message, /did not answer/, path);
  }
});

test('an answer in time ends the limit, so a long body still takes as long as it takes', async () => {
  const { fetch, asked, timers } = await clientFetch();
  const answer = fetch('https://cloud.invalid/rest/v1/documents', { method: 'GET' });
  assert.equal(timers.size, 1);
  assert.ok([...timers.values()][0].ms > 60_000, 'past the minute after which the chip turns amber');
  const response = { ok: true };
  asked[0].answer(response);
  assert.equal(await answer, response);
  assert.equal(timers.size, 0);
});

test('an answer that waits on a large body being sent gets the time to send it', async () => {
  const limitFor = async (path, body) => {
    const { fetch, timers } = await clientFetch();
    void fetch(`https://cloud.invalid${path}`, { method: 'POST', body });
    return [...timers.values()][0].ms;
  };
  const small = await limitFor('/rest/v1/rpc/team_production_save', '{}');
  assert.ok(await limitFor('/rest/v1/rpc/team_production_save', 'x'.repeat(25_000_000)) > small + 500_000, 'a 25 MB document');
  const form = new FormData();
  form.append('', new Blob([new Uint8Array(25_000_000)]));
  assert.ok(await limitFor('/storage/v1/object/user-assets/big.png', form) > small + 500_000, 'a 25 MB upload');
  assert.ok(await limitFor('/storage/v1/object/user-assets/big.png', new Blob([new Uint8Array(25_000_000)])) > small + 500_000, 'a bare blob');
});

test('an edge function keeps its own time', async () => {
  const { fetch, timers } = await clientFetch();
  void fetch('https://cloud.invalid/functions/v1/anything', { method: 'POST' });
  assert.equal(timers.size, 0);
});

test('only a failure that is the whole message turns into words', async () => {
  const { cloudFailureWords, CLOUD_NO_ANSWER } = await clientExports();
  for (const message of ['Cloud list(look) failed: AbortError: The cloud did not answer.', 'Cloud put(show) failed: TypeError: Failed to fetch', 'TypeError: Failed to fetch', 'The cloud did not answer.', 'Load failed', 'asset upload failed: The cloud did not answer.', 'Cloud get(asset) failed: The cloud did not answer.']) {
    assert.equal(cloudFailureWords(message), CLOUD_NO_ANSWER, message);
  }
  for (const message of ['3 records failed to sync — graphic "A": too large; show "C": Cloud put(show) failed: TypeError: Failed to fetch', 'graphic "Load failed": refused', 'Browser storage is full']) {
    assert.equal(cloudFailureWords(message), message);
  }
});

test('a body that goes silent fails too, while one that keeps moving takes as long as it takes', async () => {
  const { fetch, asked, timers, expire } = await clientFetch();
  const answer = fetch('https://cloud.invalid/rest/v1/documents', { method: 'GET' });
  let send;
  asked[0].answer(new Response(new ReadableStream({ start(controller) { send = controller; } }), { status: 200, headers: { 'x-kept': 'yes' } }));
  const response = await answer;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-kept'), 'yes');
  // What a browser's fetch does to a body when its signal aborts.
  asked[0].init.signal.addEventListener('abort', () => send.error(asked[0].init.signal.reason));
  const text = response.text();
  send.enqueue(new TextEncoder().encode('{"partial":'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.size, 1, 'a chunk starts the wait again');
  expire();
  const error = await failure(text);
  assert.match(error.message, /did not answer/);

  const whole = await clientFetch();
  const done = whole.fetch('https://cloud.invalid/rest/v1/documents', { method: 'GET' });
  whole.asked[0].answer(new Response('[]'));
  assert.equal(await (await done).text(), '[]');
  assert.equal(whole.timers.size, 0, 'a body that ended leaves no limit behind');
});

/** The real sync engine over a bookmark this test can read. */
function syncEngine() {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/sync.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const store = new Map();
  const stubs = {
    './assets': { hasStorageSentinel: (body) => JSON.stringify(body).includes('spx-storage:') },
    './storage': { isPutDenied: () => false, isSingleton: () => false },
    '../model/id': { uuid: () => crypto.randomUUID() },
    '../model/accountScope': { accountKey: (key) => key },
  };
  vm.runInNewContext(compiled, {
    exports, Date, JSON, Error,
    require: (name) => stubs[name],
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  });
  return { ...exports, meta: () => JSON.parse([...store.values()][0]) };
}

const NO_ANSWER = () => new Error('Cloud put(graphic) failed: AbortError: The cloud did not answer.');
const stoppedAnswering = (error) => /did not answer/.test(error.message);
const graphicAt = (id, updatedAt, name = id) => ({ kind: 'graphic', id, updatedAt, deleted: false, body: { id, name, updatedAt } });
/** One side as the engine sees it, in memory. A record whose file cannot be read fails `get`. */
function memory(records, extra = {}) {
  const held = new Map(records.map((r) => [r.id, r]));
  return {
    held,
    list: async (kind) => (kind === 'graphic' ? [...held.values()] : []),
    get: async (_kind, id) => held.get(id) ?? null,
    put: async (record) => { held.set(record.id, record); },
    ...extra,
  };
}
const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

test('a cloud that stops answering is asked once in a pass, and what the pass did land still moves the bookmark', async () => {
  const engine = syncEngine();
  const updatedAt = ago(5);
  const asked = [];
  // The first record lands, the second gets no answer, the third is never asked about.
  const remote = memory([], {
    stoppedAnswering,
    put: async (record) => {
      asked.push(record.id);
      if (asked.length > 1) throw NO_ANSWER();
    },
  });
  const result = await engine.runSync(memory(['a', 'b', 'c'].map((id) => graphicAt(id, updatedAt))), remote);
  assert.deepEqual(asked, ['a', 'b']);
  assert.equal(result.pushed, 1);
  assert.equal(result.unanswered, true);
  assert.deepEqual(Array.from(result.failures, (f) => f.id), ['b', 'c']);
  assert.ok(engine.meta().lastSyncedAt > updatedAt, 'the bookmark moved past what landed');
  assert.deepEqual(engine.meta().pendingPush, ['graphic:b', 'graphic:c'], 'and the rest are owed');
});

test('an edit made after a failed pull does not overwrite the other device\'s version', async () => {
  const engine = syncEngine();
  // This device holds a stale copy. Another device's version is in the cloud, with a stored file
  // the cloud does not answer for.
  const theirs = { ...graphicAt('g', ago(30), 'their edit'), body: { id: 'g', name: 'their edit', updatedAt: ago(30), font: 'spx-storage:u/a' } };
  theirs.updatedAt = theirs.body.updatedAt;
  const local = memory([graphicAt('g', ago(60), 'stale')]);
  const remote = memory([theirs], { stoppedAnswering, get: async () => { throw NO_ANSWER(); } });
  const first = await engine.runSync(local, remote);
  assert.equal(first.pulled, 0);
  assert.deepEqual(engine.meta().pendingPull, ['graphic:g'], 'the pull is owed past the bookmark');
  // Edited on this device before the next pass, with the cloud answering again.
  local.held.set('g', graphicAt('g', new Date(Date.now() + 1000).toISOString(), 'my edit'));
  remote.get = async (_kind, id) => remote.held.get(id);
  const second = await engine.runSync(local, remote);
  assert.equal(remote.held.get('g').body.name, 'their edit', 'the cloud keeps their version');
  assert.equal(local.held.get('g').body.name, 'their edit', 'and this device takes it');
  assert.equal(second.conflicts, 1);
  assert.ok([...local.held.values()].some((r) => r.body.name === 'my edit (conflicted copy)'), 'and my edit survives as a copy');
  assert.deepEqual(engine.meta().pendingPull, [], 'the debt is paid');
});

test('a pull still owed with no edit since is taken, even when the cloud\'s version is the older one', async () => {
  const engine = syncEngine();
  // A true conflict the local edit lost, though its clock reads later: its copy was made, the copy's
  // upload got no answer, and so the winner's pull was never asked for.
  const since = ago(100);
  const winner = graphicAt('g', ago(50), 'winner');
  const loser = graphicAt('g', ago(40), 'loser');
  const plan = engine.reconcile([loser], [winner], since, { pull: new Set(['graphic:g']) });
  assert.equal(plan.toRemote.length, 0, 'the loser is not pushed over the winner');
  assert.deepEqual(Array.from(plan.toLocal, (r) => r.body.name), ['winner']);
  assert.equal(plan.conflicts.length, 1, 'edited since the bookmark, so a copy is kept');
  const clean = engine.reconcile([loser], [winner], ago(10), { pull: new Set(['graphic:g']) });
  assert.equal(clean.toRemote.length, 0);
  assert.deepEqual(Array.from(clean.toLocal, (r) => r.body.name), ['winner']);
  assert.equal(clean.conflicts.length, 0, 'not edited since, so nothing to keep twice');
  // Edited while the cloud's version was arriving: both are owed, and the edit still gets its copy.
  const editing = engine.reconcile([loser], [winner], ago(10), { pull: new Set(['graphic:g']), conflict: new Set(['graphic:g']) });
  assert.equal(editing.conflicts.length, 1);
});

test('the caller\'s own abort still ends the request, with the caller\'s reason', async () => {
  const { fetch } = await clientFetch();
  const caller = new AbortController();
  const reason = new DOMException('Take superseded', 'AbortError');
  const answer = fetch('https://cloud.invalid/rest/v1/rpc/control_send_many', { method: 'POST', signal: caller.signal });
  caller.abort(reason);
  assert.equal(await failure(answer), reason);
  const late = fetch('https://cloud.invalid/rest/v1/teams', { signal: caller.signal });
  assert.equal(await failure(late), reason);
});
