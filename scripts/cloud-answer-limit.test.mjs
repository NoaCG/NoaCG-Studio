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

test('a cloud that stops answering is asked once in a pass, and what the pass did land still moves the bookmark', async () => {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/backend/sync.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const store = new Map();
  const stubs = {
    './assets': { hasStorageSentinel: () => false },
    './storage': { isPutDenied: () => false, isSingleton: () => false },
    '../model/id': { uuid: () => crypto.randomUUID() },
    '../model/accountScope': { accountKey: (key) => key },
  };
  vm.runInNewContext(compiled, {
    exports, Date, JSON, Error,
    require: (name) => stubs[name],
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  });
  const updatedAt = new Date().toISOString();
  const records = ['a', 'b', 'c'].map((id) => ({ kind: 'graphic', id, updatedAt, deleted: false, body: { id, updatedAt } }));
  const local = { list: async (kind) => (kind === 'graphic' ? records : []), get: async () => null, put: async () => {} };
  const asked = [];
  // The first record lands, the second gets no answer, the third is never asked about.
  const remote = {
    list: async () => [],
    put: async (record) => {
      asked.push(record.id);
      if (asked.length > 1) throw new Error('Cloud put(graphic) failed: AbortError: The cloud did not answer.');
    },
  };
  const result = await exports.runSync(local, remote);
  assert.deepEqual(asked, ['a', 'b']);
  assert.equal(result.pushed, 1);
  assert.deepEqual(Array.from(result.failures, (f) => f.id), ['b', 'c']);
  const meta = JSON.parse([...store.values()][0]);
  assert.ok(meta.lastSyncedAt > updatedAt || meta.lastSyncedAt === updatedAt, 'the bookmark moved past what landed');
  assert.deepEqual(meta.pendingPush, ['graphic:b', 'graphic:c'], 'and the rest are owed');
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
