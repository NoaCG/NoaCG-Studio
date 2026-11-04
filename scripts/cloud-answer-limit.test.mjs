// guards: src/backend/supabase.ts
// A cloud request with no answer has no end of its own, and a sync pass or a team save waiting on
// one keeps the sync chip amber with nothing able to run behind it (#2090). The shared client ends
// it, without touching the requests that are allowed to take long.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
    URL, Request, AbortController, DOMException,
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    fetch: (input, init) => new Promise((resolve, reject) => {
      asked.push({ input, init, answer: resolve });
      if (init?.signal?.aborted) reject(init.signal.reason);
      init?.signal?.addEventListener('abort', () => reject(init.signal.reason));
    }),
  });
  await exports.getSupabase();
  return { fetch: options.global.fetch, asked, expire: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } }, timers };
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

test('a Storage write and an edge function have no limit: their answers can take long', async () => {
  const { fetch, timers } = await clientFetch();
  void fetch('https://cloud.invalid/storage/v1/object/user-assets/big.mp4', { method: 'POST' });
  void fetch('https://cloud.invalid/functions/v1/anything', { method: 'POST' });
  assert.equal(timers.size, 0);
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
