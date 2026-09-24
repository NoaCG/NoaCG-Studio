// The package door (api/_lib/me/packages.ts) with no network: who gets in, what shape is stored,
// the waiting cap, and that the template CODE inside a package is never executed on the way.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPackagesHandler, MAX_WAITING_PACKAGES } from './packages.js';
import { PACKAGE_LIMITS, packageSaveShape } from './packageShape.js';
import { memoryAgentAccessStore } from '../agentAccessStore.js';
import { sha256 } from '../http.js';
import { AGENT_KEY_PREFIX } from '../../../src/entitlements/permissions.js';

const ENV = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT_SAVE_RATE_MAX', 'AGENT_SAVE_USER_RATE_MAX'] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));
beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  process.env.AGENT_SAVE_RATE_MAX = '1000';
  process.env.AGENT_SAVE_USER_RATE_MAX = '1000';
});
afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const KEY = `${AGENT_KEY_PREFIX}${'ab'.repeat(32)}`;

// The definition literal is PRESENT (the regex the guard tests) and hostile to parsing: if
// anything on this path ran it, `globalThis.__executed` would be set - the last test checks.
const HTML = `<!doctype html><html><body><script>
window.SPXGCTemplateDefinition = (function(){ globalThis.__executed = true; return { DataFields: [] }; })();
</script><div id="f0"></div></body></html>`;

/** One graphic entry the way `noacg pack` writes it (bridge.packEntry). */
function entry(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    type: 'lower-third',
    html: HTML,
    css: ':root{--x:1}',
    js: 'function play(){} function stop(){} function update(d){} function next(){}',
    resolution: { width: 1920, height: 1080 },
    fps: 50,
    ...extra,
  };
}

function pack(overrides: Record<string, unknown> = {}) {
  return {
    format: 'noacg-pack',
    version: 1,
    name: 'Fight Night',
    description: 'Three bouts',
    graphics: [entry('Name strap', { layer: 20 }), entry('Round card', { layer: 30 })],
    cues: [
      { graphic: 'Round card', label: 'Round 1', values: { f0: 'ROUND 1' } },
      { graphic: 'Name strap', label: 'Anna', values: { f0: 'Anna' }, note: 'first up' },
    ],
    ...overrides,
  };
}

let clientCounter = 0;
function post(body: unknown, token: string | null = KEY, headers: Record<string, string> = {}): Request {
  clientCounter += 1;
  const h: Record<string, string> = { 'x-forwarded-for': `10.3.${Math.floor(clientCounter / 250)}.${clientCounter % 250}`, 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  return new Request('https://noacg.test/api/me/packages', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

async function seeded() {
  const store = memoryAgentAccessStore();
  await store.createKey({ userId: USER, name: 'Claude Code', keyHash: sha256(KEY), prefix: 'noacg_ak_ababab…', scopes: ['graphics:create'] });
  return store;
}

test('the shape guard admits a pack file and refuses what is not one', () => {
  assert.equal(packageSaveShape(pack()).ok, true);
  assert.equal(packageSaveShape(null).ok, false);
  assert.equal(packageSaveShape({ ...pack(), format: 'something' }).ok, false);
  assert.equal(packageSaveShape({ ...pack(), version: 2 }).ok, false, 'only v1');
  assert.equal(packageSaveShape(pack({ graphics: [] })).ok, false, 'an empty package');
  assert.equal(packageSaveShape(pack({ graphics: [entry('A'), entry('A')], cues: [] })).ok, false, 'duplicate names collapse in the pool');
  assert.equal(packageSaveShape(pack({ graphics: [entry('A', { type: 'nope' })], cues: [] })).ok, false, 'a real TemplateType');
  assert.equal(packageSaveShape(pack({ graphics: [entry('A', { html: '<div></div>' })], cues: [] })).ok, false, 'no definition marker');
  assert.equal(packageSaveShape(pack({ graphics: [entry('A', { layer: 101 })], cues: [] })).ok, false, 'layer range');
  assert.equal(packageSaveShape(pack({ graphics: [entry('A', { assets: [{ path: '../x', data: 'data:,' }] })], cues: [] })).ok, false, 'asset path escape');
  assert.equal(packageSaveShape(pack({ graphics: [entry('A', { assets: [{ path: 'x.png', data: 'https://cdn/x.png' }] })], cues: [] })).ok, false, 'assets inlined');
  assert.equal(packageSaveShape(pack({ cues: [{ graphic: 'Nobody', label: 'x' }] })).ok, false, 'a rundown row must name a graphic in the package');
  assert.equal(packageSaveShape(pack({ cues: [{ graphic: 'Round card', label: 'x', values: { f0: 1 } }] })).ok, false, 'cue values are strings');
  assert.equal(
    packageSaveShape(pack({ graphics: [entry('A', { cues: [{ label: 'one' }] })], cues: [{ graphic: 'A', label: 'two' }] })).ok,
    false,
    'a rundown and per-graphic cues together',
  );
  const tooMany = Array.from({ length: PACKAGE_LIMITS.graphics + 1 }, (_, i) => entry(`G${i}`));
  assert.equal(packageSaveShape(pack({ graphics: tooMany, cues: [] })).ok, false, 'graphic cap');

  // Narrowing: unknown keys never reach the stored body; what the format names travels.
  const shaped = packageSaveShape(pack({ evil: 'payload', graphics: [entry('A', { layer: 5, evil: 1 })], cues: [{ graphic: 'A', label: 'Go', extra: 1 }] }));
  assert.ok(shaped.ok);
  assert.equal('evil' in shaped.pack, false);
  assert.equal('evil' in shaped.pack.graphics[0], false);
  assert.equal(shaped.pack.graphics[0].layer, 5);
  assert.deepEqual(shaped.pack.cues, [{ graphic: 'A', label: 'Go', values: {} }]);
});

test('an anonymous caller is 401, a key without the permission is 403, a revoked key is 401', async () => {
  const store = await seeded();
  const handler = createPackagesHandler({ store, configured: () => true });
  assert.equal((await handler.fetch(post(pack(), null))).status, 401);
  assert.equal((await handler.fetch(post(pack(), `${AGENT_KEY_PREFIX}unknown`))).status, 401);

  const readOnly = `${AGENT_KEY_PREFIX}${'cd'.repeat(32)}`;
  await store.createKey({ userId: USER, name: 'read only', keyHash: sha256(readOnly), prefix: 'x', scopes: ['graphics:read'] });
  assert.equal((await handler.fetch(post(pack(), readOnly))).status, 403);

  assert.equal((await handler.fetch(post(pack()))).status, 201);
  await store.revokeKey(USER, store.keys[0].id);
  assert.equal((await handler.fetch(post(pack()))).status, 401);
});

test('a package is stored narrowed, with the server\'s origin, and answers where it waits', async () => {
  const store = await seeded();
  const handler = createPackagesHandler({ store, configured: () => true });
  const res = await handler.fetch(post(pack({ evil: 'payload' }), KEY, { 'x-noacg-cli-version': '0.9.0' }));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; url: string };
  assert.equal(body.url, 'https://noacg.test/app#/home/productions');
  assert.equal(store.packages.length, 1);
  const row = store.packages[0];
  assert.equal(row.id, body.id);
  assert.equal(row.userId, USER);
  assert.equal(row.name, 'Fight Night');
  assert.equal(row.graphicCount, 2);
  assert.deepEqual(row.origin, { tool: 'noacg-cli', version: '0.9.0' });
  assert.equal('evil' in (row.body as Record<string, unknown>), false);
});

test('refusals: offline, wrong method, bad JSON, bad shape, and the waiting cap', async () => {
  const store = await seeded();
  assert.equal((await createPackagesHandler({ store, configured: () => false }).fetch(post(pack()))).status, 503);
  const handler = createPackagesHandler({ store, configured: () => true });
  assert.equal((await handler.fetch(new Request('https://noacg.test/api/me/packages', { method: 'GET' }))).status, 405);
  assert.equal((await handler.fetch(post('{not json'))).status, 400);
  assert.equal((await handler.fetch(post({ format: 'noacg-pack', version: 1, name: 'x', graphics: [] }))).status, 400);

  for (let i = 0; i < MAX_WAITING_PACKAGES; i++) {
    assert.equal((await handler.fetch(post(pack()))).status, 201);
  }
  const full = await handler.fetch(post(pack()));
  assert.equal(full.status, 409);
  assert.match(((await full.json()) as { error: { message: string } }).error.message, /install or dismiss/);
});

test('nothing on the path ever executed the package\'s code', () => {
  assert.equal((globalThis as { __executed?: boolean }).__executed, undefined);
});
