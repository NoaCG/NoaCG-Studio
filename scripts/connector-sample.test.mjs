// guards: api/data/[...path].ts, src/control/externalSource.ts, src/control/sourceMapping.ts, api/_lib/feedFetch.ts
//
// THE ROUTE'S SAMPLE AND RECIPE DOORS, BEHAVIOURALLY (docs/work-specs/playout-api-mapping/spec.md,
// E5.2; AC-1, AC-4), in Node against the real route (`api/data/[...path].ts`) and a stand-in for
// the database's HTTP API: an in-memory table set behind the same PostgREST paths the service-role
// client calls, so what the route reads and writes is observed, not its source text.
//   - a report is evaluated through the registration's recipe: the writes it hands the database
//     are the recipe's formatted values (this replaces row 28's source-text check);
//   - `op: "sample"`: the page's ask is kept only while an agent holds the source; the agent posts
//     under its live claim and only to an ask; the page reads it; nothing is applied (no apply
//     function is called and the tree is never touched); the claim and the report tell the agent
//     a sample is wanted;
//   - the hosted JSON sample (`/api/data/feed?as=json`): the feed reader's guard (a private address
//     refused), a credential-needing endpoint named as such, not JSON, and the 256 KiB edge.
// The real database is e2e/configured/external-data-connector.spec.ts's.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import './lib/tsResolve.mjs';

/** The stand-in: tables of rows, RPCs answered by `rpc[name]`, every call recorded. */
const db = { tables: { control_shows: [], production_source_snapshots: [], control_source_reads: [] }, rpc: {}, calls: [] };
const KEYS = { control_shows: ['id'], production_source_snapshots: ['show_id', 'source_id'], control_source_reads: ['show_id', 'source_id'] };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  for await (const chunk of req) body += chunk;
  const send = (status, value) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
  if (rpc) {
    const args = JSON.parse(body || '{}');
    db.calls.push({ rpc: rpc[1], args });
    const answer = db.rpc[rpc[1]];
    return answer ? send(200, await answer(args)) : send(404, { message: `no ${rpc[1]}` });
  }
  const table = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)?.[1];
  if (!table || !db.tables[table]) return send(404, { message: 'no table' });
  if (req.method === 'GET') {
    const filters = [...url.searchParams].filter(([k]) => k !== 'select').map(([k, v]) => [k, v.replace(/^eq\./, '')]);
    db.calls.push({ get: table, filters: Object.fromEntries(filters) });
    return send(200, db.tables[table].filter((row) => filters.every(([k, v]) => String(row[k]) === v)));
  }
  if (req.method === 'POST') {
    const rows = [JSON.parse(body)].flat();
    db.calls.push({ upsert: table, rows });
    for (const row of rows) {
      const same = (r) => KEYS[table].every((k) => r[k] === row[k]);
      const at = db.tables[table].findIndex(same);
      if (at >= 0) db.tables[table][at] = { ...db.tables[table][at], ...row };
      else db.tables[table].push(row);
    }
    return send(201, rows);
  }
  return send(405, {});
});

let route;
let feedFetch;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SECRET_KEY = 'unit-test-key-not-a-real-one';
  route = (await import('../api/data/[...path].ts')).default;
  feedFetch = await import('../api/_lib/feedFetch.ts');
});
after(() => server.close());

const SHOW = '00000000-0000-4000-8000-000000000e52';
const KEY = 'data-key-e52';
const RECIPE = { v: 1, sourceId: 'e1', configRevision: 1, outputs: { share: { from: 'parties.kok.share', format: { kind: 'number', locale: 'fi-FI', decimals: 1 } } } };
const ENTRY = { id: 'e1', kind: 'external', label: 'Results', config: { v: 1, configRevision: 1, endpoint: 'https://results.example/live', mapping: RECIPE } };

const reset = ({ agent = true } = {}) => {
  db.tables.control_shows = [{ id: SHOW, data_key: KEY }];
  db.tables.production_source_snapshots = [];
  db.tables.control_source_reads = agent ? [{ show_id: SHOW, source_id: 'e1', owner: 'agent', lease_until: new Date(Date.now() + 30_000).toISOString() }] : [];
  db.calls = [];
  db.rpc = {
    control_source_context_by_key: () => ({ entry: ENTRY, payload: null, bindings: { Board: { f0: 'external.e1.share' } }, fields: { Board: [{ field: 'f0', ftype: 'textfield', title: 'Share' }] } }),
    control_source_report_by_key: ({ p_writes }) => ({ ok: true, writes: Object.keys(p_writes).length }),
    control_source_claim_by_key: ({ p_claim }) => ({ ok: true, claim: p_claim ?? 'agent:fresh01', ownerEpoch: 2, acceptedRevision: 0, providerSequence: null, paused: false }),
  };
};

const post = (body, key = KEY) =>
  route.fetch(new Request('http://127.0.0.1/api/data/source', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const applied = () => db.calls.filter((c) => c.rpc === 'control_source_report_by_key' || c.rpc === 'control_data_apply' || c.rpc === 'control_data_patch');

describe('a report goes through the registration\'s recipe', () => {
  test('the writes handed to the database are the recipe\'s formatted values', async () => {
    reset();
    const acquisition = { v: 1, sourceId: 'e1', configRevision: 1, ownerEpoch: 2, acceptedRevision: 1, checkedAt: '2026-10-24T12:00:00.000Z', status: 'changed', payload: { parties: { kok: { share: 20.84 } } } };
    const res = await post({ v: 1, op: 'report', sourceId: 'e1', claim: 'agent:abc', acquisition });
    assert.equal(res.status, 200);
    const report = db.calls.find((c) => c.rpc === 'control_source_report_by_key');
    assert.deepEqual(report.args.p_writes, { 'external.e1.share': '20,8' });
    const answer = await res.json();
    assert.deepEqual(answer.provenance, { sourceId: 'e1', recipe: { v: 1, configRevision: 1 } });
  });
});

describe('op "sample"', () => {
  test('the page asks; the agent hears it with its claim and report, posts under its claim, and the page reads it; nothing is applied', async () => {
    reset();
    const ask = await post({ v: 1, op: 'sample', sourceId: 'e1' });
    const asked = await ask.json();
    assert.equal(ask.status, 200);
    assert.equal(asked.waiting, true);
    assert.equal(typeof asked.asked, 'string');
    const row = db.tables.production_source_snapshots.find((r) => r.source_id === 'e1.sample');
    assert.deepEqual([row.show_id, row.payload, row.status], [SHOW, null, { asked: asked.asked }]);

    // Still waiting: the page is told so.
    assert.deepEqual(await (await post({ v: 1, op: 'sample', sourceId: 'e1', asked: asked.asked })).json(), { ok: false, waiting: true });
    // The agent's claim renewal and its next report both say a sample is wanted.
    assert.equal((await (await post({ v: 1, op: 'claim', sourceId: 'e1', configRevision: 1, claim: 'agent:abc' })).json()).sample, true);
    const receipt = { v: 1, sourceId: 'e1', configRevision: 1, ownerEpoch: 2, acceptedRevision: 1, checkedAt: '2026-10-24T12:00:00.000Z', status: 'unchanged' };
    assert.equal((await (await post({ v: 1, op: 'report', sourceId: 'e1', claim: 'agent:abc', acquisition: receipt })).json()).sample, true);

    const sample = { parties: { kok: { share: 21.5 } }, extra: [{ id: 1 }] };
    db.calls = [];
    const posted = await post({ v: 1, op: 'sample', sourceId: 'e1', configRevision: 1, claim: 'agent:abc', sample });
    assert.equal(posted.status, 200);
    assert.deepEqual(applied(), [], 'a sample is never evaluated, reported or applied');
    assert.deepEqual(db.calls.filter((c) => c.rpc).map((c) => [c.rpc, c.args.p_claim, c.args.p_ttl_ms]), [['control_source_claim_by_key', 'agent:abc', 30_000]], 'the post renews and checks the claim');
    const read = await (await post({ v: 1, op: 'sample', sourceId: 'e1', asked: asked.asked })).json();
    assert.deepEqual([read.ok, read.sample], [true, sample]);
    // Answered: the agent is no longer told a sample is wanted.
    assert.equal((await (await post({ v: 1, op: 'claim', sourceId: 'e1', configRevision: 1, claim: 'agent:abc' })).json()).sample, undefined);
    assert.equal(db.tables.production_source_snapshots.filter((r) => r.source_id === 'e1').length, 0, 'the source\'s own snapshot is never written');
  });

  test('no agent holds the source: no ask is kept, and the page reads the hosted way', async () => {
    reset({ agent: false });
    assert.deepEqual(await (await post({ v: 1, op: 'sample', sourceId: 'e1' })).json(), { ok: false, agent: false });
    db.tables.control_source_reads = [{ show_id: SHOW, source_id: 'e1', owner: 'agent', lease_until: new Date(Date.now() - 1000).toISOString() }];
    assert.deepEqual(await (await post({ v: 1, op: 'sample', sourceId: 'e1' })).json(), { ok: false, agent: false }, 'a lapsed claim is no agent');
    db.tables.control_source_reads = [{ show_id: SHOW, source_id: 'e1', owner: 'tick', lease_until: new Date(Date.now() + 30_000).toISOString() }];
    assert.deepEqual(await (await post({ v: 1, op: 'sample', sourceId: 'e1' })).json(), { ok: false, agent: false }, 'another reader is no agent');
    assert.deepEqual(db.tables.production_source_snapshots, []);
  });

  test('the agent posts only under its live claim and only to an ask; a page\'s stale ask reads nothing', async () => {
    reset();
    const sample = { a: 1 };
    const unasked = await post({ v: 1, op: 'sample', sourceId: 'e1', configRevision: 1, claim: 'agent:abc', sample });
    assert.deepEqual([unasked.status, (await unasked.json()).refused], [409, 'not_asked']);
    await post({ v: 1, op: 'sample', sourceId: 'e1' });
    db.rpc.control_source_claim_by_key = () => ({ ok: false, held: true, owner: 'agent' });
    assert.equal((await post({ v: 1, op: 'sample', sourceId: 'e1', configRevision: 1, claim: 'agent:old', sample })).status, 409, 'an agent that lost the claim');
    db.rpc.control_source_claim_by_key = () => ({ ok: false, refused: 'config' });
    assert.equal((await post({ v: 1, op: 'sample', sourceId: 'e1', configRevision: 9, claim: 'agent:abc', sample })).status, 409, 'another configuration');
    assert.equal(db.tables.production_source_snapshots.find((r) => r.source_id === 'e1.sample').payload, null);
    assert.deepEqual(await (await post({ v: 1, op: 'sample', sourceId: 'e1', asked: '2020-01-01T00:00:00.000Z' })).json(), { ok: false, waiting: false });
    // An ask older than a minute is given up: the agent is not told, and a post is refused.
    db.tables.production_source_snapshots[0].status = { asked: new Date(Date.now() - 60_000).toISOString() };
    db.rpc.control_source_claim_by_key = ({ p_claim }) => ({ ok: true, claim: p_claim, ownerEpoch: 2, acceptedRevision: 0 });
    assert.equal((await (await post({ v: 1, op: 'claim', sourceId: 'e1', configRevision: 1, claim: 'agent:abc' })).json()).sample, undefined);
    assert.equal((await post({ v: 1, op: 'sample', sourceId: 'e1', configRevision: 1, claim: 'agent:abc', sample })).status, 409);
  });

  test('a source a later version registered, an unknown source and an unknown key are refused', async () => {
    reset();
    db.rpc.control_source_context_by_key = () => ({ entry: { ...ENTRY, config: { v: 2 } } });
    assert.equal((await post({ v: 1, op: 'sample', sourceId: 'e1' })).status, 422);
    db.rpc.control_source_context_by_key = () => ({ entry: null });
    assert.equal((await post({ v: 1, op: 'sample', sourceId: 'e1' })).status, 404);
    assert.equal((await post({ v: 1, op: 'sample', sourceId: 'e1' }, 'not-a-key')).status, 401);
    assert.deepEqual(db.tables.production_source_snapshots, []);
  });
});

describe('the hosted JSON sample', () => {
  /** The feed reader's network, answering one address. */
  const stub = (address, response) => {
    feedFetch.feedNetwork.current = {
      lookup: async () => [{ address, family: 4 }],
      request: async () => ({
        status: response.status ?? 200,
        headers: response.headers ?? { 'content-type': 'application/json' },
        body: (async function* () {
          yield new TextEncoder().encode(response.body ?? '');
        })(),
        cancel: () => {},
      }),
    };
  };
  const read = (url) => route.fetch(new Request(`http://127.0.0.1/api/data/feed?as=json&url=${encodeURIComponent(url)}`, { headers: { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200)}` } }));
  after(() => (feedFetch.feedNetwork.current = feedFetch.nodeFeedNet));

  test('a public address answering JSON is the sample, parsed; nothing is stored', async () => {
    stub('93.184.216.34', { body: JSON.stringify({ match: { home: 2 } }) });
    db.calls = [];
    const res = await read('https://results.example/live');
    assert.deepEqual([res.status, await res.json()], [200, { ok: true, sample: { match: { home: 2 } } }]);
    assert.deepEqual(db.calls, [], 'no database call: never cached, stored or applied');
  });

  test('a private address is refused by the feed reader\'s guard', async () => {
    stub('10.0.0.7', { body: '{}' });
    const res = await read('https://intranet.example/live');
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /public internet/);
  });

  test('an endpoint that wants a credential is named so; one that is not JSON is refused', async () => {
    stub('93.184.216.34', { status: 401, body: '' });
    assert.deepEqual(await (await read('https://results.example/live')).json(), { ok: false, error: 'the address needs a credential', fix: 'Its agent reads it: register it, start its agent, then read it again.' });
    stub('93.184.216.34', { body: '<rss/>' });
    assert.equal((await read('https://results.example/live')).status, 422);
  });

  test('256 KiB is read; one byte more is refused', async () => {
    const sized = (bytes) => `{"pad":"${'x'.repeat(bytes - 10)}"}`;
    stub('93.184.216.34', { body: sized(256 * 1024) });
    assert.equal((await read('https://results.example/live')).status, 200);
    stub('93.184.216.34', { body: sized(256 * 1024 + 1) });
    assert.equal((await read('https://results.example/live')).status, 413);
  });
});
