// The set door (api/_lib/me/graphicSets.ts) with no network: a set arrives whole or not at all,
// and sending it again - after a failure, a lost answer or a restart that rebuilt the records -
// never adds a second copy. The store's set call stands for migration 0093's one transaction; the
// SQL itself is exercised by that migration's own self-check (created, replayed, conflict, and a
// failing second record leaving nothing) and by e2e/configured/agent-access.spec.ts.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { canonicalJson, createGraphicSetsHandler, MAX_SET_GRAPHICS, payloadHash, type SetResponse } from './graphicSets.js';
import { createDeliveriesHandler } from './deliveries.js';
import { createGraphicsHandler } from './graphics.js';
import type { DeliveryReceipt } from './deliveryReceipt.js';
import { memoryAgentAccessStore } from '../agentAccessStore.js';
import { sha256 } from '../http.js';
import { newGraphicDoc } from '../../../src/model/graphicDoc.js';
import { AGENT_KEY_PREFIX } from '../../../src/entitlements/permissions.js';
import type { SpxTemplate } from '../../../src/model/types.js';

const ENV = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT_SAVE_RATE_MAX', 'AGENT_SAVE_USER_RATE_MAX', 'AGENT_DELIVERIES_RATE_MAX'] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));
beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  process.env.AGENT_SAVE_RATE_MAX = '1000';
  process.env.AGENT_SAVE_USER_RATE_MAX = '1000';
  process.env.AGENT_DELIVERIES_RATE_MAX = '1000';
});
afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const ORIGIN = 'https://noacg.test';
const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const KEY = `${AGENT_KEY_PREFIX}${'ab'.repeat(32)}`;
const SECOND_KEY = `${AGENT_KEY_PREFIX}${'cd'.repeat(32)}`;
const READ_ONLY_KEY = `${AGENT_KEY_PREFIX}${'ef'.repeat(32)}`;
const OP = '0b7c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const OTHER_OP = '1c8d4e5f-6071-4b82-9ca3-b4c5d6e7f809';

function template(name: string): SpxTemplate {
  return {
    name,
    type: 'lower-third',
    resolution: { width: 1920, height: 1080, label: '1920×1080' },
    fps: 50,
    html: '<!doctype html><html><body><script>window.SPXGCTemplateDefinition = { DataFields: [] };</script><div id="f0"></div></body></html>',
    css: '',
    js: 'function play(){} function stop(){} function update(d){} function next(){}',
    fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: name }],
    settings: { playserver: 'OVERLAY' },
    assets: [],
    layers: [],
  } as unknown as SpxTemplate;
}

/** The three records the bridge would build - built afresh on every call, with new client ids and
 *  timestamps, exactly as a restarted CLI would build them again. */
const NAMES = ['Strap', 'Score', 'Clock'];
const threeRecords = (names = NAMES) => names.map((name) => newGraphicDoc(template(name), { name, origin: { tool: 'noacg-cli', version: '0.12.0' } }));

let clientCounter = 0;
function req(path: string, init: { token?: string | null; body?: unknown; op?: string | null; raw?: string } = {}): Request {
  clientCounter += 1;
  const headers: Record<string, string> = { 'x-forwarded-for': `10.9.${Math.floor(clientCounter / 250)}.${clientCounter % 250}`, 'content-type': 'application/json' };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? KEY}`;
  if (init.op !== null) headers['x-noacg-operation'] = init.op ?? OP;
  const body = init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined);
  return new Request(`${ORIGIN}${path}`, { method: body !== undefined ? 'POST' : 'GET', headers, body });
}

async function world() {
  const store = memoryAgentAccessStore();
  await store.createKey({ userId: USER, name: 'Claude Code', keyHash: sha256(KEY), prefix: 'a', scopes: ['graphics:create'] });
  await store.createKey({ userId: USER, name: 'Codex', keyHash: sha256(SECOND_KEY), prefix: 'b', scopes: ['graphics:create'] });
  await store.createKey({ userId: USER, name: 'read only', keyHash: sha256(READ_ONLY_KEY), prefix: 'c', scopes: ['graphics:read'] });
  store.emails.set(USER, 'maker@example.test');
  const deps = { store, configured: () => true };
  const sets = createGraphicSetsHandler(deps);
  const deliveries = createDeliveriesHandler(deps);
  return {
    store,
    graphics: createGraphicsHandler(deps),
    send: (records: unknown[], init: { token?: string | null; op?: string | null } = {}) => sets.fetch(req('/api/me/graphic-sets', { body: { graphics: records }, ...init })),
    sendRaw: (raw: string) => sets.fetch(req('/api/me/graphic-sets', { raw })),
    readBack: async (id: string): Promise<{ status: number; receipt?: DeliveryReceipt }> => {
      const res = await deliveries.fetch(req(`/api/me/deliveries?id=${id}`));
      return { status: res.status, ...(res.status === 200 ? ((await res.json()) as { receipt: DeliveryReceipt }) : {}) };
    },
  };
}

/** Everything the set may have written, to show that a refusal or a failure wrote none of it. */
const footprint = (w: Awaited<ReturnType<typeof world>>) => ({ graphics: w.store.graphics.length, receipts: w.store.deliveries.length, claims: w.store.operations.size });
const NOTHING = { graphics: 0, receipts: 0, claims: 0 };

test('three validated graphics arrive as three library items, with every exact link, verified by readback', async () => {
  const w = await world();
  const res = await w.send(threeRecords());
  assert.equal(res.status, 201);
  const body = (await res.json()) as SetResponse;
  assert.equal(body.operationId, OP);
  assert.equal(body.replayed, false);
  assert.deepEqual(body.graphics.map((g) => g.name), NAMES, 'answered in the order sent');
  for (const g of body.graphics) assert.equal(g.url, `${ORIGIN}/app#/graphic/${g.id}`);
  assert.deepEqual(footprint(w), { graphics: 3, receipts: 3, claims: 1 });
  assert.ok(w.store.graphics.every((g) => g.userId === USER), 'all three are the account\'s own');
  assert.deepEqual(new Set(w.store.graphics.map((g) => g.doc.id)), new Set(body.graphics.map((g) => g.id)), 'the server minted the ids it stored');
  assert.equal(body.receipt.state, 'saved');
  assert.equal(body.receipt.destination, 'library');
  assert.equal(body.receipt.verified, false, 'the write\'s own answer is acceptance, not verification');
  assert.deepEqual(body.receipt.account, { id: USER, email: 'maker@example.test' });

  // The Phase 2 readback, by the operation: all three, in order, verified.
  const back = await w.readBack(OP);
  assert.equal(back.status, 200);
  assert.equal(back.receipt!.verified, true);
  assert.equal(back.receipt!.state, 'saved');
  assert.deepEqual(back.receipt!.resources.map((r) => [r.id, r.state, r.link]), body.graphics.map((g) => [g.id, 'saved', g.url]));
  // And by each resource.
  for (const g of body.graphics) assert.equal((await w.readBack(g.id)).receipt?.operationId, OP);
});

test('one invalid record refuses the whole set before anything is written', async () => {
  const w = await world();
  const records: unknown[] = threeRecords();
  records[1] = { ...(records[1] as object), template: { ...(records[1] as { template: object }).template, html: '<p>no definition</p>' } };
  const res = await w.send(records);
  assert.equal(res.status, 400);
  const { error } = (await res.json()) as { error: { message: string } };
  assert.match(error.message, /^Graphic 2 \("Score"\): .*SPXGCTemplateDefinition.* Nothing was saved\.$/);
  assert.deepEqual(footprint(w), NOTHING);
});

test('an interrupted write leaves nothing, and the same request then delivers the set exactly once', async () => {
  const w = await world();
  w.store.failSetAt = 2; // the third record's insert fails, after the first two were staged
  const failed = await w.send(threeRecords());
  assert.equal(failed.status, 500);
  assert.match(((await failed.json()) as { error: { message: string } }).error.message, /send the same request again; it is never saved twice/);
  assert.deepEqual(footprint(w), NOTHING, 'no partial set: no record, no receipt, no claim');
  assert.equal((await w.readBack(OP)).status, 404, 'and the readback says nothing arrived');

  w.store.failSetAt = null;
  const retried = await w.send(threeRecords());
  assert.equal(retried.status, 201);
  const first = (await retried.json()) as SetResponse;
  assert.deepEqual(footprint(w), { graphics: 3, receipts: 3, claims: 1 });

  // A lost answer, a timeout, a restarted CLI: the same operation, the records built afresh.
  for (let i = 0; i < 3; i += 1) {
    const again = await w.send(threeRecords());
    assert.equal(again.status, 200);
    const replay = (await again.json()) as SetResponse;
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.graphics, first.graphics, 'the same ids and links, in the same order');
    assert.equal(replay.receipt.state, 'saved');
  }
  assert.deepEqual(footprint(w), { graphics: 3, receipts: 3, claims: 1 }, 'the counts never move');
});

test('a different payload, or another credential, under a used operation is refused and writes nothing', async () => {
  const w = await world();
  assert.equal((await w.send(threeRecords())).status, 201);
  const before = footprint(w);

  const changed = await w.send(threeRecords(['Strap', 'Score', 'Clock 2']));
  assert.equal(changed.status, 409);
  const { error } = (await changed.json()) as { error: { code: string; message: string } };
  assert.equal(error.code, 'conflict');
  assert.match(error.message, new RegExp(`noacg status ${OP}`));
  assert.equal((await w.send(threeRecords().slice(0, 2))).status, 409, 'a subset is a different payload too');
  assert.equal((await w.send(threeRecords(), { token: SECOND_KEY })).status, 409, 'another key cannot replay this key\'s operation');
  assert.deepEqual(footprint(w), before);

  // An operation id a single save already used is not a set's to claim.
  assert.equal((await w.graphics.fetch(req('/api/me/graphics', { body: threeRecords()[0], op: OTHER_OP }))).status, 201);
  const reused = await w.send(threeRecords(), { op: OTHER_OP });
  assert.equal(reused.status, 409);
});

test('a database without 0093 answers as a deployment without the set door, having written nothing', async () => {
  const w = await world();
  w.store.noSetFunction = true;
  const res = await w.send(threeRecords());
  assert.equal(res.status, 404, 'the CLI saving one graphic then uses the single save door');
  assert.deepEqual(footprint(w), NOTHING);
});

test('a single save that reuses the operation of a set does not change what the set replays', async () => {
  const w = await world();
  const first = (await (await w.send(threeRecords())).json()) as SetResponse;
  assert.equal((await w.graphics.fetch(req('/api/me/graphics', { body: threeRecords()[0] }))).status, 201, 'the single door records its receipt under OP too');
  const replay = (await (await w.send(threeRecords())).json()) as SetResponse;
  assert.deepEqual(replay.graphics, first.graphics, 'still the three of the set, in order');
});

test('a replay says what is there now: a graphic deleted since reads missing', async () => {
  const w = await world();
  const first = (await (await w.send(threeRecords())).json()) as SetResponse;
  w.store.deletedGraphics.add(first.graphics[1].id);
  const replay = (await (await w.send(threeRecords())).json()) as SetResponse;
  assert.deepEqual(replay.receipt.resources.map((r) => r.state), ['saved', 'missing', 'saved']);
  assert.equal(replay.receipt.state, 'missing');
  assert.equal(w.store.graphics.length, 3, 'and it is not quietly saved again');
});

test('the set door refuses what it cannot make idempotent or bounded, before any write', async () => {
  const w = await world();
  assert.equal((await w.send(threeRecords(), { op: null })).status, 400, 'no operation id');
  assert.equal((await w.send(threeRecords(), { op: 'x,resource_id.neq.0' })).status, 400, 'an operation id that is not a uuid');
  assert.equal((await w.send([])).status, 400, 'an empty set');
  const many = Array.from({ length: MAX_SET_GRAPHICS + 1 }, (_, i) => `G${i}`);
  assert.equal((await w.send(threeRecords(many))).status, 400, `more than ${MAX_SET_GRAPHICS}`);
  assert.equal((await w.sendRaw('{"graphics": [')).status, 400, 'not JSON');
  const huge = threeRecords();
  huge[0].template.assets = [{ path: 'a.png', data: `data:image/png;base64,${'A'.repeat(2_000_000)}` }];
  huge[1].template.assets = [{ path: 'b.png', data: `data:image/png;base64,${'A'.repeat(2_100_000)}` }];
  assert.equal((await w.send(huge)).status, 413, 'the whole set shares the save door\'s 4 MB');
  assert.equal((await w.send(threeRecords(), { token: null })).status, 401);
  assert.equal((await w.send(threeRecords(), { token: READ_ONLY_KEY })).status, 403, 'it rides graphics:create and nothing else');
  assert.deepEqual(footprint(w), NOTHING);
});

test('the payload hash is the content: key order, ids and timestamps do not change it, a value does', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }, null] }), '{"a":[{"d":2},null],"b":1}');
  const [a, b] = [threeRecords(), threeRecords()];
  assert.notEqual(a[0].id, b[0].id);
  assert.equal(payloadHash(a), payloadHash(b), 'rebuilt records are the same payload');
  assert.notEqual(payloadHash(a), payloadHash([a[1], a[0], a[2]]), 'the order is part of the set');
  assert.notEqual(payloadHash(a), payloadHash(threeRecords(['Strap', 'Score', 'Clock!'])));
  assert.match(payloadHash(a), /^[0-9a-f]{64}$/, 'the shape 0093\'s check constraint accepts');
});
