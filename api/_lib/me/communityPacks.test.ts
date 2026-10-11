// The agent's share door (api/_lib/me/communityPacks.ts) with no network: who gets in, what it
// demands before anything is sent (the licence, the words, a pack with no cues), what reaches the
// submit gate, and that a refusal of the gate comes back as the database's own sentence.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { COMMUNITY_LICENSE, communityShareShape, createCommunityPacksHandler } from './communityPacks.js';
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

// The definition is PRESENT and hostile to parsing: if anything on this path ran it,
// `globalThis.__executed` would be set - the last test checks.
const HTML = `<!doctype html><html><body><script>
window.SPXGCTemplateDefinition = (function(){ globalThis.__executed = true; return { DataFields: [] }; })();
</script><div id="f0"></div></body></html>`;

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

function share(overrides: Record<string, unknown> = {}, packOverrides: Record<string, unknown> = {}) {
  return {
    name: 'Pub Quiz Night',
    description: 'Questions, answers and scores for a pub quiz',
    author: 'Quizmaster K',
    license: COMMUNITY_LICENSE,
    pack: { format: 'noacg-pack', version: 1, name: 'Pub Quiz Night', graphics: [entry('Question'), entry('Scores')], ...packOverrides },
    ...overrides,
  };
}

let clientCounter = 0;
function post(body: unknown, token: string | null = KEY): Request {
  clientCounter += 1;
  const h: Record<string, string> = { 'x-forwarded-for': `10.4.${Math.floor(clientCounter / 250)}.${clientCounter % 250}`, 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return new Request('https://noacg.test/api/me/community-packs', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

async function seeded() {
  const store = memoryAgentAccessStore();
  await store.createKey({ userId: USER, name: 'Claude Code', keyHash: sha256(KEY), prefix: 'noacg_ak_ababab…', scopes: ['graphics:create'] });
  return store;
}

test('the shape demands the licence, the three words and a pack with no cues', () => {
  assert.equal(communityShareShape(share()).ok, true);
  assert.equal(communityShareShape(share({ license: 'CC-BY-4.0' })).ok, true, 'the licence id in either case');
  assert.equal(communityShareShape(share({ license: undefined })).ok, false, 'no licence, no share');
  assert.equal(communityShareShape(share({ license: 'mit' })).ok, false, 'one licence only');
  assert.equal(communityShareShape(share({ author: ' ' })).ok, false, 'the name it is shown under');
  assert.equal(communityShareShape(share({ description: '' })).ok, false);
  assert.equal(communityShareShape(share({ name: 'x'.repeat(81) })).ok, false);
  assert.equal(communityShareShape(share({ pack: { format: 'other' } })).ok, false);
  const cues = communityShareShape(share({}, { cues: [{ graphic: 'Question', label: 'Q1' }] }));
  assert.deepEqual(cues, { ok: false, reason: 'A community pack carries graphics only, with no cues.' });
  assert.equal(communityShareShape(share({}, { graphics: [entry('Question', { cues: [{ label: 'Q1' }] })] })).ok, false);
});

test('an anonymous caller is 401, a key without the permission is 403', async () => {
  const store = await seeded();
  const handler = createCommunityPacksHandler({ store, configured: () => true });
  assert.equal((await handler.fetch(post(share(), null))).status, 401);
  const readOnly = `${AGENT_KEY_PREFIX}${'cd'.repeat(32)}`;
  await store.createKey({ userId: USER, name: 'read only', keyHash: sha256(readOnly), prefix: 'x', scopes: ['graphics:read'] });
  assert.equal((await handler.fetch(post(share(), readOnly))).status, 403);
  assert.equal(store.communityPacks.length, 0);
});

test('a share reaches the submit gate as the key\'s account, narrowed, and waits for review', async () => {
  const store = await seeded();
  const handler = createCommunityPacksHandler({ store, configured: () => true });
  const res = await handler.fetch(post(share({ evil: 1 }, { evil: 'payload' })));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; state: string };
  assert.equal(body.state, 'in_review');
  assert.equal(store.communityPacks.length, 1);
  const row = store.communityPacks[0];
  assert.equal(row.id, body.id);
  assert.equal(row.userId, USER);
  assert.equal(row.author, 'Quizmaster K');
  assert.equal(row.description, 'Questions, answers and scores for a pub quiz');
  const pack = row.pack as Record<string, unknown>;
  assert.equal(pack.format, 'noacg-pack');
  assert.equal('evil' in pack, false);
  assert.equal((pack.graphics as unknown[]).length, 2);
  // Nothing waits on Home from this door: the Home copy is the package door's.
  assert.equal(store.packages.length, 0);
});

test('a refusal of the submit gate is a 409 with its own sentence; nothing is stored', async () => {
  const store = await seeded();
  store.refuseCommunityPack = 'Ten packs are already waiting for review. Wait for a decision first.';
  const handler = createCommunityPacksHandler({ store, configured: () => true });
  const res = await handler.fetch(post(share()));
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { error: { message: string } }).error.message, store.refuseCommunityPack);
  assert.equal(store.communityPacks.length, 0);
});

test('refusals before the gate: offline, wrong method, bad JSON, no licence', async () => {
  const store = await seeded();
  assert.equal((await createCommunityPacksHandler({ store, configured: () => false }).fetch(post(share()))).status, 503);
  const handler = createCommunityPacksHandler({ store, configured: () => true });
  assert.equal((await handler.fetch(new Request('https://noacg.test/api/me/community-packs', { method: 'GET' }))).status, 405);
  assert.equal((await handler.fetch(post('{not json'))).status, 400);
  const unlicensed = await handler.fetch(post(share({ license: undefined })));
  assert.equal(unlicensed.status, 400);
  assert.match(((await unlicensed.json()) as { error: { message: string } }).error.message, /cc-by-4\.0/);
  assert.equal(store.communityPacks.length, 0);
});

test('nothing on the path ever executed the pack\'s code', () => {
  assert.equal((globalThis as { __executed?: boolean }).__executed, undefined);
});
