// Delivery receipts and their readback (api/_lib/me/deliveries.ts, deliveryReceipt.ts) with no
// network: the states a receipt can say, what the doors answer, and - the security half - that a
// key reads back only what IT delivered, in its own account, and that every miss looks the same.
//
// A signed-in session cannot be minted here (verifyUser is network-bound, as agentKeys.test.ts
// says), so the session's readback and settle are walked in e2e/configured/agent-access.spec.ts.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createDeliveriesHandler } from './deliveries.js';
import { createGraphicsHandler } from './graphics.js';
import { createPackagesHandler } from './packages.js';
import { buildReceipt, currentState, operationIdOf, overallState, type DeliveryReceipt } from './deliveryReceipt.js';
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
const OTHER_USER = '6c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5';
const KEY = `${AGENT_KEY_PREFIX}${'ab'.repeat(32)}`;
const SECOND_KEY = `${AGENT_KEY_PREFIX}${'cd'.repeat(32)}`;
const OTHER_ACCOUNT_KEY = `${AGENT_KEY_PREFIX}${'ef'.repeat(32)}`;
const OP = '0b7c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';

function template(): SpxTemplate {
  return {
    name: 'Agent L3',
    type: 'lower-third',
    resolution: { width: 1920, height: 1080, label: '1920×1080' },
    fps: 50,
    html: '<!doctype html><html><body><script>window.SPXGCTemplateDefinition = { DataFields: [] };</script><div id="f0"></div></body></html>',
    css: '',
    js: 'function play(){} function stop(){} function update(d){} function next(){}',
    fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Anna' }],
    settings: { playserver: 'OVERLAY' },
    assets: [],
    layers: [],
  } as unknown as SpxTemplate;
}

const PACK = {
  format: 'noacg-pack',
  version: 1,
  name: 'Fight Night',
  graphics: [{ name: 'Strap', type: 'lower-third', html: template().html, css: ':root{--x:1}', js: template().js, resolution: { width: 1920, height: 1080 }, fps: 50 }],
};

let clientCounter = 0;
function req(path: string, init: { method?: string; token?: string | null; body?: unknown; headers?: Record<string, string> } = {}): Request {
  clientCounter += 1;
  const headers: Record<string, string> = { 'x-forwarded-for': `10.7.${Math.floor(clientCounter / 250)}.${clientCounter % 250}`, ...init.headers };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? KEY}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
}

async function world() {
  const store = memoryAgentAccessStore();
  await store.createKey({ userId: USER, name: 'Claude Code', keyHash: sha256(KEY), prefix: 'a', scopes: ['graphics:create'] });
  await store.createKey({ userId: USER, name: 'Codex', keyHash: sha256(SECOND_KEY), prefix: 'b', scopes: ['graphics:create'] });
  await store.createKey({ userId: OTHER_USER, name: 'Someone else', keyHash: sha256(OTHER_ACCOUNT_KEY), prefix: 'c', scopes: ['graphics:create'] });
  store.emails.set(USER, 'maker@example.test');
  const deps = { store, configured: () => true };
  return {
    store,
    graphics: createGraphicsHandler(deps),
    packages: createPackagesHandler(deps),
    deliveries: createDeliveriesHandler(deps),
  };
}

const status = (w: Awaited<ReturnType<typeof world>>, id: string, token: string = KEY) => w.deliveries.fetch(req(`/api/me/deliveries?id=${id}`, { token }));
const receiptOf = async (res: Response): Promise<DeliveryReceipt> => ((await res.json()) as { receipt: DeliveryReceipt }).receipt;

// ── the pure rules ─────────────────────────────────────────────────────────────────────────

test('a recorded delivery reads as what is true now', () => {
  assert.equal(currentState({ state: 'saved' }, true), 'saved');
  assert.equal(currentState({ state: 'saved' }, false), 'missing', 'a deleted graphic is not still saved');
  assert.equal(currentState({ state: 'pending_install' }, true), 'pending_install');
  assert.equal(currentState({ state: 'pending_install' }, false), 'missing', 'gone with no install recorded (an older tab deleted it)');
  assert.equal(currentState({ state: 'installed' }, true), 'installed');
  assert.equal(currentState({ state: 'installed' }, false), 'missing', 'its production was deleted since');
  assert.equal(currentState({ state: 'dismissed' }, false), 'dismissed');
});

test('a set is only as delivered as its least delivered part', () => {
  assert.equal(overallState(['saved', 'saved']), 'saved');
  assert.equal(overallState(['saved', 'missing', 'saved']), 'missing');
  assert.equal(overallState(['installed', 'pending_install']), 'pending_install');
  assert.equal(overallState(['saved', 'delivery_unverified']), 'delivery_unverified');
  assert.equal(overallState([]), 'delivery_unverified', 'nothing found is never "done"');
});

test('an installed package\'s receipt names the production and opens it', () => {
  const receipt = buildReceipt({
    operationId: OP,
    deployment: ORIGIN,
    account: { id: USER, email: 'maker@example.test' },
    rows: [{ kind: 'package', resourceId: 'p1', state: 'installed', productionId: 's1', present: true }],
    verified: true,
    checkedAt: '2026-10-15T00:00:00.000Z',
  });
  assert.equal(receipt.version, 1);
  assert.equal(receipt.state, 'installed');
  assert.equal(receipt.destination, 'home');
  assert.deepEqual(receipt.resources.map((r) => [r.kind, r.id, r.state]), [['package', 'p1', 'installed'], ['production', 's1', 'installed']]);
  assert.equal(receipt.link, `${ORIGIN}/app#/production/s1`);
  assert.equal(receipt.nextAction, null);
});

test('an operation id is the client\'s uuid or a fresh one, never anything else', () => {
  const mint = () => 'minted';
  assert.equal(operationIdOf(new Request(ORIGIN, { headers: { 'x-noacg-operation': OP.toUpperCase() } }), mint), OP);
  assert.equal(operationIdOf(new Request(ORIGIN, { headers: { 'x-noacg-operation': 'x,resource_id.neq.0' } }), mint), 'minted');
  assert.equal(operationIdOf(new Request(ORIGIN), mint), 'minted');
});

// ── the doors' receipts, and readback ──────────────────────────────────────────────────────

test('a save answers a receipt naming deployment, account and operation; the readback verifies it', async () => {
  const w = await world();
  const saved = await w.graphics.fetch(req('/api/me/graphics', { body: newGraphicDoc(template(), { name: 'Agent L3' }), headers: { 'x-noacg-operation': OP } }));
  assert.equal(saved.status, 201);
  const body = (await saved.json()) as { id: string; url: string; receipt: DeliveryReceipt };
  assert.equal(body.url, `${ORIGIN}/app#/graphic/${body.id}`, 'the link older clients print is unchanged');
  assert.deepEqual(
    { ...body.receipt, checkedAt: 'x' },
    {
      version: 1,
      operationId: OP,
      deployment: ORIGIN,
      account: { id: USER, email: 'maker@example.test' },
      destination: 'library',
      state: 'saved',
      resources: [{ kind: 'graphic', id: body.id, state: 'saved', link: body.url }],
      link: body.url,
      nextAction: null,
      verified: false,
      checkedAt: 'x',
    },
  );

  // By the operation and by the resource: the same receipt, now verified.
  for (const id of [OP, body.id]) {
    const res = await status(w, id);
    assert.equal(res.status, 200);
    const receipt = await receiptOf(res);
    assert.equal(receipt.verified, true);
    assert.equal(receipt.state, 'saved');
    assert.equal(receipt.operationId, OP);
    assert.deepEqual(receipt.account, { id: USER, email: 'maker@example.test' });
  }

  // Deleted in the studio since: the readback says so rather than repeating "saved".
  w.store.deletedGraphics.add(body.id);
  const after = await receiptOf(await status(w, OP));
  assert.equal(after.state, 'missing');
  assert.match(after.nextAction ?? '', /no longer in the account/);
});

test('a key reads back only its own deliveries; every miss is the same 404', async () => {
  const w = await world();
  const saved = (await (await w.graphics.fetch(req('/api/me/graphics', { body: newGraphicDoc(template(), { name: 'Mine' }), headers: { 'x-noacg-operation': OP } }))).json()) as { id: string };

  const misses = [
    await status(w, OP, SECOND_KEY), // another key of the SAME account
    await status(w, saved.id, SECOND_KEY),
    await status(w, OP, OTHER_ACCOUNT_KEY), // a key of another account
    await status(w, '11111111-2222-4333-8444-555555555555'), // never delivered
  ];
  const bodies = await Promise.all(misses.map(async (r) => [r.status, await r.text()]));
  for (const answer of bodies) assert.deepEqual(answer, bodies[0], 'a miss must not say whether the id exists elsewhere');
  assert.equal(bodies[0][0], 404);
  assert.doesNotMatch(String(bodies[0][1]), /Mine|maker@/, 'nothing about the other delivery leaks');

  assert.equal((await status(w, OP, `${AGENT_KEY_PREFIX}unknown`)).status, 401);
  assert.equal((await w.deliveries.fetch(req(`/api/me/deliveries?id=${OP}`, { token: null }))).status, 401);
  assert.equal((await status(w, 'not-a-uuid')).status, 400);
  // A revoked key reads back nothing either.
  await w.store.revokeKey(USER, w.store.keys[0].id);
  assert.equal((await status(w, OP)).status, 401);
});

test('a package is pending Install until the studio settles it; the receipt outlives the waiting row', async () => {
  const w = await world();
  const sent = (await (await w.packages.fetch(req('/api/me/packages', { body: PACK, headers: { 'x-noacg-operation': OP } }))).json()) as { id: string; url: string };
  assert.equal(sent.url, `${ORIGIN}/app#/home/productions/${sent.id}`);
  const pending = await receiptOf(await status(w, OP));
  assert.equal(pending.state, 'pending_install');
  assert.equal(pending.link, sent.url);

  // Install in the studio (agent_package_settle): the row goes, the receipt names the production.
  const production = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
  assert.equal(await w.store.settlePackage(USER, sent.id, production), true);
  assert.equal(w.store.packages.length, 0);
  const installed = await receiptOf(await status(w, sent.id));
  assert.equal(installed.state, 'installed');
  assert.equal(installed.link, `${ORIGIN}/app#/production/${production}`);
  assert.equal(await w.store.settlePackage(USER, sent.id, production), false, 'a package settles once');

  // The production deleted in the studio since: the receipt no longer claims it.
  w.store.deletedProductions.add(production);
  const gone = await receiptOf(await status(w, sent.id));
  assert.equal(gone.state, 'missing');
  assert.equal(gone.resources.some((r) => r.kind === 'production'), false);
  w.store.deletedProductions.delete(production);

  // An older studio deleted a second one directly: gone, and no install recorded - said as such.
  const op2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const second = (await (await w.packages.fetch(req('/api/me/packages', { body: PACK, headers: { 'x-noacg-operation': op2 } }))).json()) as { id: string };
  w.store.packages = w.store.packages.filter((p) => p.id !== second.id);
  assert.equal((await receiptOf(await status(w, op2))).state, 'missing');
});

test('only the studio settles a package: an agent key and an anonymous caller are refused', async () => {
  const w = await world();
  const sent = (await (await w.packages.fetch(req('/api/me/packages', { body: PACK }))).json()) as { id: string };
  const body = { action: 'settle', package: sent.id, production: null };
  assert.equal((await w.deliveries.fetch(req('/api/me/deliveries', { body }))).status, 403);
  assert.equal((await w.deliveries.fetch(req('/api/me/deliveries', { body, token: null }))).status, 401);
  assert.equal(w.store.packages.length, 1, 'nothing was settled');
});

test('a receipt that could not be recorded never fails the save; the readback then cannot verify it', async () => {
  const w = await world();
  w.store.failDeliveries = true;
  const saved = await w.graphics.fetch(req('/api/me/graphics', { body: newGraphicDoc(template(), { name: 'Agent L3' }), headers: { 'x-noacg-operation': OP } }));
  assert.equal(saved.status, 201, 'the graphic is in the library; failing here would invite a duplicate retry');
  assert.equal(w.store.graphics.length, 1);
  assert.equal((await status(w, OP)).status, 404);
});

test('an offline deployment answers one honest 503', async () => {
  const handler = createDeliveriesHandler({ store: memoryAgentAccessStore(), configured: () => false });
  assert.equal((await handler.fetch(req(`/api/me/deliveries?id=${OP}`))).status, 503);
});
