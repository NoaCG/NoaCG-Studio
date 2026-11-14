// The live-publishing switch tool against a fake REST API: no network, no real project.
import assert from 'node:assert/strict';
import test from 'node:test';

import { main, SWITCHES } from './production-switch.mjs';

const ENV = { SUPABASE_URL: 'https://fake-project.supabase.example.test', SUPABASE_SERVICE_ROLE_KEY: 'eyJfake.service.key' };

/** A fake PostgREST holding system_settings rows, recording every call. */
function fakeApi(rows = { production_copies: { on: true }, auto_publish: { on: false }, other_key: { on: true } }, { ignoreWrites = false } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const reply = (status, body) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const fetch = async (url, init) => {
    calls.push({ url, ...init });
    const u = new URL(url);
    if (u.pathname !== '/rest/v1/system_settings') return reply(404, { message: 'not here' });
    if (init.method === 'GET') {
      const wanted = u.searchParams.get('key').replace(/^in\.\(|\)$/g, '').split(',');
      return reply(200, Object.entries(rows).filter(([k]) => wanted.includes(k)).map(([key, value]) => ({ key, value })));
    }
    const { key, value } = JSON.parse(init.body);
    if (!ignoreWrites) rows[key] = value;
    return reply(201);
  };
  return { rows, calls, out, err, io: { fetch, env: ENV, out: (l) => out.push(l), err: (l) => err.push(l) } };
}

test('reading is the default, names the project host, and shows all three switches', async () => {
  const api = fakeApi();
  assert.equal(await main([], api.io), 0, api.err.join('\n'));
  assert.equal(api.out[0], 'fake-project.supabase.example.test');
  assert.deepEqual(api.out.slice(1), ['  production_copies: on', '  auto_publish: off', '  partial_writes: unset']);
  assert.ok(api.calls.every((c) => c.method === 'GET'), 'a read writes nothing');
});

test('setting a switch writes only that key, prints before and after, and reads it back', async () => {
  const api = fakeApi();
  assert.equal(await main(['--set', 'production_copies', 'off'], api.io), 0, api.err.join('\n'));
  assert.deepEqual(api.rows.production_copies, { on: false });
  assert.deepEqual(api.rows.other_key, { on: true }, 'another key is untouched');
  const writes = api.calls.filter((c) => c.method === 'POST');
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].body), { key: 'production_copies', value: { on: false } });
  assert.equal(writes[0].headers.authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
  assert.equal(api.out.at(-1), 'fake-project.supabase.example.test: production_copies on -> off');
});

test('any other key, a bad state or extra words are refused before anything is sent', async () => {
  for (const argv of [['--set', 'other_key', 'off'], ['--set', 'disabled_features', 'on'], ['--set', 'auto_publish', 'maybe'], ['--set', 'auto_publish'], ['--set', 'auto_publish', 'on', 'extra'], ['production_copies']]) {
    const api = fakeApi();
    assert.equal(await main(argv, api.io), 1, argv.join(' '));
    assert.match(api.err[0], /^REFUSED: /);
    assert.equal(api.calls.length, 0, `${argv.join(' ')} reached the API`);
  }
  assert.deepEqual(SWITCHES, ['production_copies', 'auto_publish', 'partial_writes']);
});

test('a write that does not take is a failure, and missing settings say what to set', async () => {
  const api = fakeApi(undefined, { ignoreWrites: true });
  assert.equal(await main(['--set', 'auto_publish', 'on'], api.io), 1);
  assert.match(api.err[0], /auto_publish reads off after the write, not on/);
  const bare = fakeApi();
  assert.equal(await main([], { ...bare.io, env: {} }), 1);
  assert.match(bare.err[0], /set SUPABASE_URL and SUPABASE_SECRET_KEY/);
  assert.equal(bare.calls.length, 0);
});
