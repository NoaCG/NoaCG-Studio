// The scoped agent key's whole lifecycle, with no network (api/_lib/me/agentKeys.ts over the
// in-memory store): begin -> one-time code; redeem -> the key, exactly once, only with the
// right verifier, only inside the TTL; list; revoke; and the permission vocabulary the key
// carries (src/entitlements/permissions.ts). Every negative path is the security posture,
// so each is pinned: a second redeem, a wrong verifier, an expired code, an anonymous begin,
// a key trying to mint a key, a key revoking another key.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createAgentKeysHandler, AUTH_CODE_TTL_SEC, keyPrefix } from './agentKeys.js';
import { memoryAgentAccessStore } from '../agentAccessStore.js';
import { resolvePrincipal } from '../principal.js';
import { sha256 } from '../http.js';
import {
  AGENT_KEY_PERMISSIONS,
  AGENT_KEY_PREFIX,
  ENFORCED_PERMISSION_KEYS,
  NEVER_ON_AGENT_KEYS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  permits,
  type Principal,
} from '../../../src/entitlements/permissions.js';
import { resolveEntitlement } from '../../../src/entitlements/contract.js';

// verifyUser() is network-bound; the tests drive the "session" branch through a fake token the
// auth module resolves to anonymous (no backend configured), so `begin` is exercised through
// the handler's own seam: a valid JWT cannot be minted here, and the property under test is the
// code/key mechanics, so the session half is covered by the configured e2e spec
// (e2e/configured/agent-access.spec.ts) while everything below the session is pinned here.
const ENV = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT_KEYS_RATE_MAX', 'AGENT_REDEEM_RATE_MAX'] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));
beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  // The shared burst counters live on globalThis; give every test its own client.
  process.env.AGENT_KEYS_RATE_MAX = '1000';
  process.env.AGENT_REDEEM_RATE_MAX = '1000';
});
afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

let clientCounter = 0;
function request(init: { method?: string; body?: unknown; token?: string; query?: string } = {}): Request {
  clientCounter += 1;
  const headers: Record<string, string> = { 'x-forwarded-for': `10.1.${Math.floor(clientCounter / 250)}.${clientCounter % 250}` };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://localhost/api/me/agent-keys${init.query ?? ''}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VERIFIER = 'a-verifier-only-the-cli-knows';
const CHALLENGE = sha256(VERIFIER);

/** A clock the tests move. */
function clock(startMs = Date.UTC(2026, 7, 22, 12, 0, 0)) {
  let nowMs = startMs;
  return { now: () => new Date(nowMs), iso: () => new Date(nowMs).toISOString(), advance: (ms: number) => (nowMs += ms) };
}

/** Plant a consented code the way `begin` would, bypassing verifyUser (see the header). */
async function plantCode(store: ReturnType<typeof memoryAgentAccessStore>, at: string, overrides: Partial<{ challenge: string; scopes: string[]; ttlSec: number }> = {}) {
  const code = 'code-' + Math.random().toString(16).slice(2);
  await store.createCode({
    codeHash: sha256(code),
    userId: USER,
    name: 'Claude Code on LAPTOP',
    scopes: overrides.scopes ?? [...AGENT_KEY_PERMISSIONS],
    challenge: overrides.challenge ?? CHALLENGE,
    expiresAt: new Date(Date.parse(at) + (overrides.ttlSec ?? AUTH_CODE_TTL_SEC) * 1000).toISOString(),
  });
  return code;
}

test('the permission vocabulary is labelled, enforced honestly, and never hands playout to a key', () => {
  for (const key of PERMISSION_KEYS) assert.ok(PERMISSION_LABELS[key].length > 0, `${key} unlabelled`);
  assert.deepEqual([...ENFORCED_PERMISSION_KEYS], ['graphics:create', 'graphics:read']);
  assert.deepEqual([...AGENT_KEY_PERMISSIONS], ['graphics:create']);
  for (const key of AGENT_KEY_PERMISSIONS) assert.ok(!NEVER_ON_AGENT_KEYS.has(key), `${key} is both minted and forbidden`);
  assert.ok(NEVER_ON_AGENT_KEYS.has('playout:operate'));
});

test('permits() asks both questions: the credential carries it AND the account allows it', () => {
  const now = new Date().toISOString();
  const active = resolveEntitlement({ userId: USER, accountState: 'active', plan: null, grants: [], now });
  const suspended = resolveEntitlement({ userId: USER, accountState: 'suspended', plan: null, grants: [], now });
  const anonymous = resolveEntitlement({ userId: null, accountState: 'active', plan: null, grants: [], now });

  const session: Principal = { kind: 'session', userId: USER, entitlement: active, granted: null };
  const key: Principal = { kind: 'agent-key', userId: USER, entitlement: active, granted: ['graphics:create'], keyId: 'k' };
  const nobody: Principal = { kind: 'anonymous', userId: null, entitlement: anonymous, granted: [] };

  assert.equal(permits(session, 'graphics:create'), true);
  assert.equal(permits(session, 'playout:operate'), true, 'a session holds every permission its account has');
  assert.equal(permits(key, 'graphics:create'), true);
  assert.equal(permits(key, 'graphics:read'), false, 'a key holds only its list');
  assert.equal(permits(key, 'playout:operate'), false);
  assert.equal(permits(nobody, 'graphics:create'), false);
  // The entitlement half: a suspended account's key is dead even though the key says yes.
  assert.equal(permits({ ...key, entitlement: suspended }, 'graphics:create'), false);
  // The instance-wide switch on sync.cloud reaches the key too (it is how an operator stops agent saves).
  const switched = resolveEntitlement({ userId: USER, accountState: 'active', plan: null, grants: [], now, disabledFeatures: ['sync.cloud'] });
  assert.equal(permits({ ...key, entitlement: switched }, 'graphics:create'), false);
});

test('an unconfigured backend answers every key route with one honest 503', async () => {
  const handler = createAgentKeysHandler({ store: memoryAgentAccessStore(), configured: () => false });
  for (const req of [request(), request({ body: { action: 'begin' } }), request({ method: 'DELETE' })]) {
    const res = await handler.fetch(req);
    assert.equal(res.status, 503);
  }
});

test('begin refuses an anonymous caller and a malformed consent', async () => {
  const handler = createAgentKeysHandler({ store: memoryAgentAccessStore(), configured: () => true });
  const anon = await handler.fetch(request({ body: { action: 'begin', name: 'x', challenge: CHALLENGE } }));
  assert.equal(anon.status, 401);
  const unknownAction = await handler.fetch(request({ body: { action: 'mint' } }));
  assert.equal(unknownAction.status, 400);
  const notJson = await handler.fetch(new Request('http://localhost/api/me/agent-keys', { method: 'POST', body: 'nope', headers: { 'x-forwarded-for': '10.9.9.9' } }));
  assert.equal(notJson.status, 400);
});

test('redeem mints the key ONCE, with the verifier, inside the TTL - and burns the code either way', async () => {
  const t = clock();
  const store = memoryAgentAccessStore(t.iso);
  const handler = createAgentKeysHandler({ store, configured: () => true, now: t.now });

  // Wrong verifier: refused, and the code is spent.
  const burnt = await plantCode(store, t.iso());
  const wrong = await handler.fetch(request({ body: { action: 'redeem', code: burnt, verifier: 'not-it' } }));
  assert.equal(wrong.status, 400);
  const again = await handler.fetch(request({ body: { action: 'redeem', code: burnt, verifier: VERIFIER } }));
  assert.equal(again.status, 400, 'a code a wrong party spent must not remain redeemable');

  // Right verifier: the key, exactly once.
  const code = await plantCode(store, t.iso());
  const ok = await handler.fetch(request({ body: { action: 'redeem', code, verifier: VERIFIER } }));
  assert.equal(ok.status, 201);
  const minted = (await ok.json()) as { key: string; id: string; prefix: string; scopes: string[]; name: string };
  assert.ok(minted.key.startsWith(AGENT_KEY_PREFIX));
  assert.equal(minted.prefix, keyPrefix(minted.key));
  assert.deepEqual(minted.scopes, ['graphics:create']);
  assert.equal(minted.name, 'Claude Code on LAPTOP');
  assert.equal(store.keys.length, 1);
  assert.equal(store.keyHashes.has(sha256(minted.key)), true, 'only the hash is stored');

  const second = await handler.fetch(request({ body: { action: 'redeem', code, verifier: VERIFIER } }));
  assert.equal(second.status, 400, 'single use');

  // Expired: a code past its TTL is dead.
  const late = await plantCode(store, t.iso());
  t.advance((AUTH_CODE_TTL_SEC + 1) * 1000);
  const expired = await handler.fetch(request({ body: { action: 'redeem', code: late, verifier: VERIFIER } }));
  assert.equal(expired.status, 400);

  // A planted code that somehow carries a forbidden scope is minted WITHOUT it.
  const sneaky = await plantCode(store, t.iso(), { scopes: ['graphics:create', 'playout:operate'] });
  const res = await handler.fetch(request({ body: { action: 'redeem', code: sneaky, verifier: VERIFIER } }));
  assert.equal(res.status, 201);
  assert.deepEqual(((await res.json()) as { scopes: string[] }).scopes, ['graphics:create']);
});

test('the minted key resolves to a scoped principal; revocation ends it; it can only revoke itself', async () => {
  const t = clock();
  const store = memoryAgentAccessStore(t.iso);
  const handler = createAgentKeysHandler({ store, configured: () => true, now: t.now });
  const deps = { store, configured: () => true };

  const code = await plantCode(store, t.iso());
  const minted = (await (await handler.fetch(request({ body: { action: 'redeem', code, verifier: VERIFIER } }))).json()) as { key: string; id: string };

  const principal = await resolvePrincipal(request({ token: minted.key }), deps);
  assert.equal(principal.kind, 'agent-key');
  assert.equal(principal.userId, USER);
  assert.deepEqual(principal.granted, ['graphics:create']);
  assert.equal(principal.keyId, minted.id);
  assert.equal(permits(principal, 'graphics:create'), true);
  assert.equal(permits(principal, 'playout:operate'), false);
  assert.ok(store.keys[0].lastUsedAt, 'resolving stamps last-used');

  // A key describes itself on GET, and may not mint another key.
  const me = await handler.fetch(request({ token: minted.key }));
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { key: { id: string } }).key.id, minted.id);
  const mint = await handler.fetch(request({ token: minted.key, body: { action: 'begin', name: 'x', challenge: CHALLENGE } }));
  assert.equal(mint.status, 403, 'a key is not a session: begin needs a signed-in user');

  // Another key's id is refused; its own id (or no id) revokes itself.
  const other = await handler.fetch(request({ token: minted.key, method: 'DELETE', query: '?id=00000000-0000-4000-8000-000000000099' }));
  assert.equal(other.status, 403);
  const self = await handler.fetch(request({ token: minted.key, method: 'DELETE' }));
  assert.equal(self.status, 200);

  // Revoked: the same bearer is now anonymous everywhere.
  const after = await resolvePrincipal(request({ token: minted.key }), deps);
  assert.equal(after.kind, 'anonymous');
  assert.equal((await handler.fetch(request({ token: minted.key }))).status, 401);
  assert.equal((await handler.fetch(request({ token: minted.key, method: 'DELETE' }))).status, 401);
});

test('an unknown or malformed bearer is anonymous, never an error', async () => {
  const store = memoryAgentAccessStore();
  const deps = { store, configured: () => true };
  for (const token of [`${AGENT_KEY_PREFIX}nope`, 'not-a-key', '']) {
    const p = await resolvePrincipal(request({ token }), deps);
    assert.equal(p.kind, 'anonymous', `token "${token}"`);
    assert.equal(p.userId, null);
  }
  // The key path is fail-closed when the backend is not configured, even for a real-looking key.
  const p = await resolvePrincipal(request({ token: `${AGENT_KEY_PREFIX}abc` }), { store, configured: () => false });
  assert.equal(p.kind, 'anonymous');
});
