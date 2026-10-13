// The consent page's and Settings' side of a connector (api/_lib/me/connectors.ts), with no
// network: Allow records exactly the connector permissions for the client Auth names, then
// approves; a failed approval leaves no grant; list and revoke are the user's own; revoke ends the
// client's sessions and can be repeated; off is 503; only a session gets in.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createConnectorsHandler, type ConnectorsDeps } from './connectors.js';
import { memoryConnectorStore, type MemoryConnectorStore } from '../connectorStore.js';
import { CONNECTOR_PERMISSIONS } from '../../../src/entitlements/permissions.js';

const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER = '0b2c3d47-58cc-4372-a567-f47ac10be9d4';
const CLIENT = '6c1f0c3e-6a0e-4a43-9d0a-1c2b3d4e5f60';
const AUTHZ = 'authz-0123456789';

beforeEach(() => {
  process.env.AGENT_KEYS_RATE_MAX = '1000';
});

interface Harness {
  store: MemoryConnectorStore;
  ended: string[];
  approved: string[];
  handler: ReturnType<typeof createConnectorsHandler>;
}

function setup(overrides: Partial<ConnectorsDeps> = {}): Harness {
  const store = memoryConnectorStore();
  const ended: string[] = [];
  const approved: string[] = [];
  const handler = createConnectorsHandler({
    store,
    enabled: async () => true,
    user: async (token) => (token === 'session-a' ? { userId: USER } : token === 'session-b' ? { userId: OTHER } : null),
    details: async (_token, id) => (id === AUTHZ ? { clientId: CLIENT, clientName: 'Claude', scopes: ['email'] } : null),
    approve: async (_token, id) => {
      approved.push(id);
      return `http://127.0.0.1:53682/callback?code=c0de&state=s`;
    },
    endSessions: async (_token, clientId) => {
      ended.push(clientId);
      return true;
    },
    ...overrides,
  });
  return { store, ended, approved, handler };
}

const req = (method: string, { token = 'session-a', body, query = '' }: { token?: string | null; body?: unknown; query?: string } = {}) =>
  new Request(`http://studio.test/api/me/connectors${query}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const allow = (h: Harness, authorizationId = AUTHZ, token = 'session-a') =>
  h.handler.fetch(req('POST', { token, body: { action: 'allow', authorizationId } }));

test('off is 503 connector_disabled; no session is 401', async () => {
  const off = setup({ enabled: async () => false });
  const res = await off.handler.fetch(req('GET'));
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'connector_disabled');
  const h = setup();
  assert.equal((await h.handler.fetch(req('GET', { token: null }))).status, 401);
  assert.equal((await allow(h, AUTHZ, 'a-connector-token')).status, 401);
  assert.equal(h.store.grants.length, 0);
});

test('Allow records the connector permissions for the client Auth names, then approves', async () => {
  const h = setup();
  const res = await allow(h);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { redirectUrl: string }).redirectUrl, 'http://127.0.0.1:53682/callback?code=c0de&state=s');
  assert.deepEqual(h.approved, [AUTHZ]);
  assert.equal(h.store.grants.length, 1);
  const [row] = h.store.grants;
  assert.equal(row.userId, USER);
  assert.equal(row.clientId, CLIENT);
  assert.equal(row.clientName, 'Claude');
  assert.deepEqual(row.permissions, [...CONNECTOR_PERMISSIONS]);
  // A second Allow for the same client keeps the one live grant.
  await allow(h);
  assert.equal(h.store.grants.filter((g) => !g.revokedAt).length, 1);
});

test('an unknown request or a refused approval leaves no grant', async () => {
  const h = setup();
  assert.equal((await allow(h, 'authz-unknown-000')).status, 404);
  assert.equal(h.store.grants.length, 0);
  const refused = setup({ approve: async () => null });
  assert.equal((await allow(refused)).status, 502);
  assert.equal(await refused.store.resolveGrant(USER, CLIENT), null);
  assert.equal((await allow(h, '../../x')).status, 400);
});

test('a request for the openid scope is refused before any grant: its ID token would open Auth\'s account endpoints', async () => {
  const h = setup({ details: async () => ({ clientId: CLIENT, clientName: 'Claude', scopes: ['openid', 'email'] }) });
  const res = await allow(h);
  assert.equal(res.status, 403);
  const { error } = (await res.json()) as { error: { code: string; message: string } };
  assert.equal(error.code, 'forbidden');
  assert.match(error.message, /Deny this request/);
  assert.deepEqual(h.approved, [], 'nothing approved at Auth, so the client gets no code');
  assert.equal(h.store.grants.length, 0);
  // An answer that names no scope is not taken as "no openid".
  const unknown = setup({ details: async () => ({ clientId: CLIENT, clientName: 'Claude', scopes: null }) });
  assert.equal((await allow(unknown)).status, 403);
  assert.equal(unknown.store.grants.length, 0);
});

test('the list is the user\'s own live grants; Revoke ends the grant and the client\'s sessions', async () => {
  const h = setup();
  await allow(h);
  const listed = (await (await h.handler.fetch(req('GET'))).json()) as { connectors: Array<{ id: string; name: string; permissions: string[] }> };
  assert.equal(listed.connectors.length, 1);
  assert.equal(listed.connectors[0].name, 'Claude');
  const { id } = listed.connectors[0];
  const others = (await (await h.handler.fetch(req('GET', { token: 'session-b' }))).json()) as { connectors: unknown[] };
  assert.deepEqual(others.connectors, []);
  assert.equal((await h.handler.fetch(req('DELETE', { token: 'session-b', query: `?id=${id}` }))).status, 404, 'not theirs');

  const revoked = await h.handler.fetch(req('DELETE', { query: `?id=${id}` }));
  assert.equal(revoked.status, 200);
  assert.deepEqual(h.ended, [CLIENT]);
  assert.equal(await h.store.resolveGrant(USER, CLIENT), null);
  const after = (await (await h.handler.fetch(req('GET'))).json()) as { connectors: unknown[] };
  assert.deepEqual(after.connectors, []);
});

test('when Auth does not end the sessions, the grant is still revoked and Revoke can be repeated', async () => {
  let authUp = false;
  const h = setup({ endSessions: async () => authUp });
  await allow(h);
  const [{ id }] = h.store.grants;
  assert.equal((await h.handler.fetch(req('DELETE', { query: `?id=${id}` }))).status, 502);
  assert.equal(await h.store.resolveGrant(USER, CLIENT), null, 'the next tool call already fails');
  authUp = true;
  assert.equal((await h.handler.fetch(req('DELETE', { query: `?id=${id}` }))).status, 200);
});
