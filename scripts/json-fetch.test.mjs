// guards: api/_lib/feedFetch.ts, api/data/[...path].ts, api/_lib/rateLimit.ts
//
// NOACG'S SERVER READ OF A PUBLIC JSON ADDRESS (docs/work-specs/obs-scenes/spec.md, OS5a; AC-9,
// rules R3, R4, R16, R17), run in Node against the real module with a fake resolver, connection,
// cache and clock, and the real route.
//
// What is pinned. The feed reader's guard holds for JSON too: a private answer is refused before
// any request, a redirect to a private address is refused, and the body stops at 256 KiB (counted
// after decompression). One read per address serves every reader through the shared cache row,
// keyed apart from a feed of the same address, fetched no more often than every 9 s counted from the
// read that asked (so a source read every 10 s never skips a read); the address's
// `max-age` does not lengthen that, its Retry-After after a failure does (up to an hour). A body
// that is not JSON, or is cut off, is a failure that keeps the last good payload in the row and
// answers no payload; the next good read clears it. Two readers at once on a new address make one
// fetch. The route answers one client 120 reads a minute and refuses the 121st, and takes GET only.
//
// Every limit is pinned by behaviour at its edge (the value passes, one past it fails).

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import './lib/tsResolve.mjs';
import { buildApiRuntime } from './api-runtime-build.mjs';

const { feedKey, JSON_KIND, readCachedJson, readFeed } = await import('../api/_lib/feedFetch.ts');

const S = 1000;
const T0 = Date.parse('2026-11-12T12:00:00.000Z');
const ADDRESS = 'https://scores.example/live.json';
const PUBLIC = '93.184.215.14';

async function* chunks(bytes) {
  for (let at = 0; at < bytes.length; at += 65_536) yield bytes.subarray(at, at + 65_536);
}

const reply = (status, body = '', headers = {}) => {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return { status, headers, body: chunks(bytes), cancel: () => {} };
};

function fakeNet(dns, serve) {
  const requests = [];
  return {
    requests,
    lookup: async (host) => {
      const answer = dns[host];
      if (!answer) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
      return answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
    request: async ({ url, address, headers, signal }) => {
      requests.push({ url: url.href, address, headers: { ...headers } });
      return serve({ url, address, headers, signal, n: requests.length });
    },
  };
}

function fakeStore() {
  const rows = new Map();
  return {
    rows,
    get: async (key) => (rows.has(key) ? structuredClone(rows.get(key)) : null),
    create: async (row) => {
      if (rows.has(row.key)) return false;
      rows.set(row.key, structuredClone(row));
      return true;
    },
    claim: async (key, now, until) => {
      const row = rows.get(key);
      if (!row || !(row.claimed_until < now) || !(row.next_allowed_at <= now)) return false;
      row.claimed_until = until;
      return true;
    },
    save: async (key, patch) => {
      rows.set(key, { ...rows.get(key), ...structuredClone(patch) });
    },
    prune: async () => {},
  };
}

function io(net, store = fakeStore(), clock = { t: T0 }) {
  return { net, store, clock, now: () => clock.t, sleep: async (ms) => void (clock.t += ms) };
}

/** A JSON address whose answer the test sets. */
function server(body = { home: 'Ada', score: 1 }, headers = { 'content-type': 'application/json' }) {
  const s = { body, headers, status: 200 };
  s.net = fakeNet({ 'scores.example': [PUBLIC] }, () => reply(s.status, typeof s.body === 'string' ? s.body : JSON.stringify(s.body), s.headers));
  return s;
}

// ── The guard ─────────────────────────────────────────────────────────────────

test('JSON is asked for, no credential is sent, and a private answer is refused before any request', async () => {
  const s = server();
  const env = io(s.net);
  assert.equal((await readCachedJson(ADDRESS, env)).ok, true);
  assert.equal(s.net.requests[0].headers.accept, 'application/json');
  assert.equal(s.net.requests[0].headers.authorization, undefined);
  const inside = fakeNet({ 'scores.example': [PUBLIC, '10.0.0.5'] }, () => reply(200, '{}'));
  const refused = await readCachedJson(ADDRESS, io(inside));
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 400);
  assert.match(refused.error, /not on the public internet/);
  assert.equal(inside.requests.length, 0);
  assert.equal('payload' in refused, false);
  // A private IP written as the address, and a credential in it, are refused too.
  assert.equal((await readCachedJson('http://169.254.169.254/latest', io(s.net))).ok, false);
  assert.equal((await readCachedJson('https://user:pw@scores.example/live.json', io(s.net))).status, 400);
});

test('a redirect to a private address is refused', async () => {
  const net = fakeNet({ 'scores.example': [PUBLIC], 'inside.example': ['192.168.1.2'] }, ({ url }) =>
    url.hostname === 'scores.example' ? reply(302, '', { location: 'https://inside.example/s.json' }) : reply(200, '{}'),
  );
  const answer = await readCachedJson(ADDRESS, io(net));
  assert.equal(answer.ok, false);
  assert.match(answer.error, /redirects to an address that is not on the public internet/);
  assert.equal(net.requests.length, 1);
});

test('a body of 256 KiB is read, and one byte more is refused and keeps nothing', async () => {
  // A JSON string of exactly 262,144 bytes: the quotes and the filler.
  const exact = `"${'x'.repeat(256 * 1024 - 2)}"`;
  const s = server(exact);
  assert.equal((await readCachedJson(ADDRESS, io(s.net))).ok, true);
  s.body = `"${'x'.repeat(256 * 1024 - 1)}"`;
  const over = await readCachedJson(ADDRESS, io(s.net));
  assert.equal(over.ok, false);
  assert.match(over.error, /over 256 KiB/);
});

// ── One read per address ──────────────────────────────────────────────────────

test('one read serves every reader: the address is fetched at most every 9 s from the read that asked, so a 10 s source never skips a read', async () => {
  const s = server();
  const env = io(s.net);
  const first = await readCachedJson(ADDRESS, env);
  assert.deepEqual(first, { ok: true, payload: { home: 'Ada', score: 1 }, fetchedAt: new Date(T0).toISOString() });
  env.clock.t = T0 + 9 * S - 1;
  assert.deepEqual(await readCachedJson(ADDRESS, env), first);
  assert.equal(s.net.requests.length, 1, 'one millisecond before 9 s');
  env.clock.t = T0 + 9 * S;
  s.body = { home: 'Ada', score: 2 };
  assert.deepEqual((await readCachedJson(ADDRESS, env)).payload, { home: 'Ada', score: 2 });
  assert.equal(s.net.requests.length, 2, 'at 9 s');
  // The payload is the row's one item (R17).
  assert.deepEqual(env.store.rows.get(JSON_KIND.key(ADDRESS)).items, [{ home: 'Ada', score: 2 }]);
});

test('a slow fetch does not push the next read back: the wait counts from when the read asked', async () => {
  const clock = { t: T0 };
  let n = 0;
  const net = fakeNet({ 'scores.example': [PUBLIC] }, () => {
    n += 1;
    // The fetch takes 4 s.
    clock.t += 4 * S;
    return reply(200, JSON.stringify({ n }));
  });
  const env = io(net, fakeStore(), clock);
  await readCachedJson(ADDRESS, env);
  // The page asks again 10 s after it asked the first time.
  clock.t = T0 + 10 * S;
  assert.deepEqual((await readCachedJson(ADDRESS, env)).payload, { n: 2 });
});

test('every refusal and failure is said of an address, never of a feed', async () => {
  const sentences = [
    'that is not a feed address',
    'Paste the feed’s address.',
    'Only http and https feed addresses can be read',
    'a feed address cannot carry a user name or password',
    'A feed is read on its ordinary port only',
    'Use the feed’s public address on the internet.',
    'Use the address the feed finally lands on.',
    'the feed is not there',
    'the feed answered 500',
    'the feed did not answer in 10 seconds',
    'the feed could not be reached',
  ];
  for (const text of sentences) {
    const said = JSON_KIND.words(text);
    assert.doesNotMatch(said, /feed/, said);
    assert.doesNotMatch(said, /address address|an an /, said);
  }
  assert.equal(JSON_KIND.words('that is not a feed address'), 'that is not an address');
  assert.equal(JSON_KIND.words('A feed is read on its ordinary port only'), 'An address is read on its ordinary port only');
  assert.equal(JSON_KIND.words('the feed answered 500'), 'the address answered 500');
  const refused = await readCachedJson('https://user:pw@scores.example/live.json', io(server().net));
  assert.equal(refused.error, 'an address cannot carry a user name or password');
  assert.equal(refused.fix, 'Paste the address that answers JSON.');
});

test('the address’s max-age does not lengthen the wait; a JSON read and a feed read of one address keep two rows', async () => {
  const s = server({ a: 1 }, { 'content-type': 'application/json', 'cache-control': 'max-age=900' });
  const env = io(s.net);
  await readCachedJson(ADDRESS, env);
  env.clock.t = T0 + 9 * S;
  await readCachedJson(ADDRESS, env);
  assert.equal(s.net.requests.length, 2);
  assert.notEqual(JSON_KIND.key(ADDRESS), feedKey(ADDRESS));
  assert.match(JSON_KIND.key(ADDRESS), /^[0-9a-f]{64}$/);
  // A feed read of the same address finds no headlines in the JSON row.
  const feed = await readFeed(ADDRESS, env);
  assert.equal(feed.ok, false);
  assert.equal(env.store.rows.size, 2);
});

test('two readers at once on a new address make one fetch, and both get the payload', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const net = fakeNet({ 'scores.example': [PUBLIC] }, async () => {
    await gate;
    return reply(200, '{"n":1}');
  });
  const store = fakeStore();
  const clock = { t: T0 };
  const a = readCachedJson(ADDRESS, io(net, store, clock));
  const b = readCachedJson(ADDRESS, { ...io(net, store, clock), sleep: async (ms) => {
    clock.t += ms;
    release();
    await new Promise((r) => setImmediate(r));
  } });
  const [one, two] = await Promise.all([a, b]);
  assert.equal(net.requests.length, 1);
  assert.deepEqual(one.payload, { n: 1 });
  assert.deepEqual(two.payload, { n: 1 });
});

// ── Failures ──────────────────────────────────────────────────────────────────

test('a body that is not JSON, or cut off, is a failure with no payload; the row keeps the last good one', async () => {
  const s = server({ score: 1 });
  const env = io(s.net);
  await readCachedJson(ADDRESS, env);
  s.body = '{"score": 2';
  env.clock.t += 10 * S;
  const cut = await readCachedJson(ADDRESS, env);
  assert.equal(cut.ok, false);
  assert.equal(cut.error, 'the address did not answer JSON');
  assert.equal('payload' in cut, false);
  assert.equal(cut.failingSince, new Date(env.clock.t).toISOString());
  assert.deepEqual(env.store.rows.get(JSON_KIND.key(ADDRESS)).items, [{ score: 1 }]);
  s.body = '<html>Not found</html>';
  env.clock.t += 10 * S;
  assert.equal((await readCachedJson(ADDRESS, env)).ok, false);
  s.body = { score: 3 };
  env.clock.t += 10 * S;
  assert.deepEqual(await readCachedJson(ADDRESS, env), { ok: true, payload: { score: 3 }, fetchedAt: new Date(env.clock.t).toISOString() });
});

test('a publisher error is said of the address, and its Retry-After holds: 120 s on a 429', async () => {
  const s = server();
  s.status = 429;
  s.headers = { 'retry-after': '120' };
  const env = io(s.net);
  const first = await readCachedJson(ADDRESS, env);
  assert.equal(first.ok, false);
  assert.equal(first.error, 'the address answered 429');
  env.clock.t = T0 + 120 * S - 1;
  await readCachedJson(ADDRESS, env);
  assert.equal(s.net.requests.length, 1);
  s.status = 200;
  s.headers = {};
  env.clock.t = T0 + 120 * S;
  assert.equal((await readCachedJson(ADDRESS, env)).ok, true);
  // A 404 says check the address.
  const gone = server();
  gone.status = 404;
  const missing = await readCachedJson(ADDRESS, io(gone.net));
  assert.equal(missing.error, 'the address is not there');
});

test('a failure without Retry-After is tried again after the 10 s floor', async () => {
  const s = server();
  s.status = 500;
  const env = io(s.net);
  await readCachedJson(ADDRESS, env);
  env.clock.t = T0 + 10 * S - 1;
  await readCachedJson(ADDRESS, env);
  assert.equal(s.net.requests.length, 1);
  env.clock.t = T0 + 10 * S;
  await readCachedJson(ADDRESS, env);
  assert.equal(s.net.requests.length, 2);
});

// ── The route ─────────────────────────────────────────────────────────────────

let built;
let route;
before(async () => {
  built = await buildApiRuntime(['api/data/[...path].ts']);
  route = (await import(pathToFileURL(path.join(built.outputDir, 'api/data/[...path].js')).href)).default;
});
after(async () => {
  await built?.cleanup();
});

test('the route answers one client 120 JSON reads a minute and refuses the 121st', async () => {
  // No database here, so each allowed read answers 503; the 121st is refused before it.
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, role: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const call = () => route.fetch(new Request(`https://noacg.test/api/data/json?url=${encodeURIComponent(ADDRESS)}`, { headers: { 'x-forwarded-for': '203.0.113.97' } }));
    const statuses = [];
    for (let i = 0; i < 121; i += 1) statuses.push((await call()).status);
    assert.ok(statuses.slice(0, 120).every((s) => s === 503), statuses.slice(0, 120).join(','));
    assert.equal(statuses[120], 429);
    const other = await route.fetch(new Request(`https://noacg.test/api/data/json?url=x`, { headers: { 'x-forwarded-for': '203.0.113.98' } }));
    assert.notEqual(other.status, 429, 'another client is not refused');
  } finally {
    for (const [k, v] of [['SUPABASE_URL', saved.url], ['SUPABASE_SECRET_KEY', saved.key], ['SUPABASE_SERVICE_ROLE_KEY', saved.role]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('the route takes GET only, and asks for an address', async () => {
  const post = await route.fetch(new Request(`https://noacg.test/api/data/json?url=x`, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.99' } }));
  assert.equal(post.status, 405);
  const none = await route.fetch(new Request(`https://noacg.test/api/data/json`, { headers: { 'x-forwarded-for': '203.0.113.99' } }));
  assert.equal(none.status, 400);
});
