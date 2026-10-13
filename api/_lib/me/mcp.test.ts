// The remote MCP connector's endpoint (api/_lib/me/mcp.ts) and the principal it admits, with no
// network: off answers 503 everywhere; only a connector token with a LIVE grant is a principal,
// and only on this path; a session or nothing is 401 with the metadata pointer; both protocol eras
// answer; a tool call asks permits(); verifyUser refuses a connector token outright.

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import {
  createMcpHandler,
  createProtectedResourceHandler,
  LEGACY_VERSIONS,
  MODERN_VERSIONS,
  PROTECTED_RESOURCE_PATH,
  TOOLS,
  type McpTool,
} from './mcp.js';
import { memoryConnectorStore, type MemoryConnectorStore } from '../connectorStore.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { oauthClientOf, verifyUser } from '../auth.js';
import { connectorUserId, resetConnectorEnabledCache, verifyConnectorToken } from '../connectorAuth.js';
import { CONNECTOR_PERMISSIONS, NEVER_ON_AGENT_KEYS } from '../../../src/entitlements/permissions.js';

const ENV = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'CONNECTOR_RATE_MAX'] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));
beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  process.env.CONNECTOR_RATE_MAX = '1000';
  resetConnectorEnabledCache();
});
afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const CLIENT = '6c1f0c3e-6a0e-4a43-9d0a-1c2b3d4e5f60';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** A JWT-shaped token; its signature is never checked here (verifyConnector is the fake). */
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: 'ES256' })}.${b64(claims)}.sig`;
const CONNECTOR_TOKEN = jwt({ sub: USER, client_id: CLIENT, role: 'noacg_connector' });
const SESSION_TOKEN = jwt({ sub: USER, role: 'authenticated' });

function setup(tools?: readonly McpTool[]) {
  const grants: MemoryConnectorStore = memoryConnectorStore();
  const deps: PrincipalDeps = {
    grants,
    configured: () => true,
    verifyConnector: async (token) => (token === CONNECTOR_TOKEN ? { userId: USER, clientId: CLIENT } : null),
  };
  const handler = createMcpHandler({ ...deps, enabled: async () => true, ...(tools ? { tools } : {}) });
  return { grants, deps, handler };
}

async function grant(grants: MemoryConnectorStore, permissions = [...CONNECTOR_PERMISSIONS]) {
  return (await grants.createGrant({ userId: USER, clientId: CLIENT, clientName: 'Claude', permissions })).row;
}

function rpc(body: unknown, { token = CONNECTOR_TOKEN as string | null, headers = {} as Record<string, string> } = {}): Request {
  return new Request('http://studio.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const modern = (method: string, params: Record<string, unknown> = {}, version: string = MODERN_VERSIONS[0]) => ({
  body: { jsonrpc: '2.0', id: 7, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': version } } },
  headers: { 'mcp-protocol-version': version, 'mcp-method': method, ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}) },
});

test('a deployment with no OAuth server answers 503 connector_disabled on every connector path', async () => {
  const mcp = createMcpHandler({ enabled: async () => false });
  for (const req of [rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }), new Request('http://studio.test/mcp')]) {
    const res = await mcp.fetch(req);
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'connector_disabled');
  }
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY = 'anon';
  const prm = await createProtectedResourceHandler({ enabled: async () => false }).fetch(new Request(`http://studio.test${PROTECTED_RESOURCE_PATH}`));
  assert.equal(prm.status, 503);
  // And the real discovery check: an Auth whose metadata says the feature is off is "off".
  const { connectorEnabled } = await import('../connectorAuth.js');
  const off = async () => new Response(JSON.stringify({ error_code: 'feature_disabled' }), { status: 404 });
  assert.equal(await connectorEnabled(off as unknown as typeof fetch), false);
  resetConnectorEnabledCache();
  const on = async () => new Response(JSON.stringify({ issuer: 'http://127.0.0.1:9/auth/v1', registration_endpoint: 'http://127.0.0.1:9/auth/v1/oauth/clients/register' }));
  assert.equal(await connectorEnabled(on as unknown as typeof fetch), true);
});

test('the protected resource metadata names this resource and the Auth issuer', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321/';
  process.env.SUPABASE_ANON_KEY = 'anon';
  const res = await createProtectedResourceHandler({ enabled: async () => true }).fetch(new Request(`http://studio.test${PROTECTED_RESOURCE_PATH}`));
  assert.equal(res.status, 200);
  const meta = (await res.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] };
  assert.equal(meta.resource, 'http://studio.test/mcp');
  assert.deepEqual(meta.authorization_servers, ['http://127.0.0.1:54321/auth/v1']);
  assert.deepEqual(meta.scopes_supported, ['openid', 'email']);
});

test('no token, a session or an unknown token is 401 with the metadata pointer', async () => {
  const { handler, grants } = setup();
  await grant(grants);
  const expected = `Bearer resource_metadata="http://studio.test${PROTECTED_RESOURCE_PATH}"`;
  const bare = await handler.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { token: null }));
  assert.equal(bare.status, 401);
  assert.equal(bare.headers.get('www-authenticate'), expected);
  for (const token of [SESSION_TOKEN, 'noacg_ak_' + 'ab'.repeat(32), jwt({ sub: USER, client_id: 'someone-else' })]) {
    const res = await handler.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { token }));
    assert.equal(res.status, 401, token.slice(0, 12));
    assert.equal(res.headers.get('www-authenticate'), `${expected}, error="invalid_token"`);
  }
});

test('a connector token resolves to a connector principal only with a live grant, and only where asked', async () => {
  const { deps, grants } = setup();
  const req = () => new Request('http://studio.test/mcp', { headers: { authorization: `Bearer ${CONNECTOR_TOKEN}` } });
  assert.equal((await resolvePrincipal(req(), { ...deps, connector: true })).kind, 'anonymous', 'no grant yet');
  const row = await grant(grants, ['graphics:read', 'graphics:create', 'playout:operate']);
  const principal = await resolvePrincipal(req(), { ...deps, connector: true });
  assert.equal(principal.kind, 'connector');
  assert.equal(principal.userId, USER);
  assert.equal(principal.clientId, CLIENT);
  assert.equal(principal.grantId, row.id);
  // NEVER_ON_AGENT_KEYS applies to grants, whatever a row says.
  assert.deepEqual(principal.granted, ['graphics:read', 'graphics:create']);
  assert.ok(row.lastUsedAt, 'a resolved call stamps last_used_at');
  // Every other path: the same token is anonymous.
  assert.equal((await resolvePrincipal(req(), deps)).kind, 'anonymous');
  // Revoked: anonymous again, on the very next call.
  await grants.revokeGrant(USER, row.id);
  assert.equal((await resolvePrincipal(req(), { ...deps, connector: true })).kind, 'anonymous');
});

test('verifyUser refuses a connector token before asking Auth', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY = 'anon';
  assert.equal(oauthClientOf(CONNECTOR_TOKEN), CLIENT);
  assert.equal(oauthClientOf(SESSION_TOKEN), null);
  assert.equal(oauthClientOf('not.a-jwt'), null);
  assert.equal(await verifyUser(CONNECTOR_TOKEN), null);
});

test('a connector token is verified locally against the issuer\'s JWKS, never by asking Auth who it is', async () => {
  process.env.SUPABASE_URL = 'http://auth.test';
  process.env.SUPABASE_ANON_KEY = 'anon';
  const issuer = 'http://auth.test/auth/v1';
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await webcrypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'ES256' };
  const asked: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return new Response(JSON.stringify({ issuer, jwks_uri: `${issuer}/.well-known/jwks.json`, registration_endpoint: `${issuer}/oauth/clients/register` }));
    }
    if (url.endsWith('/.well-known/jwks.json')) return new Response(JSON.stringify({ keys: [jwk] }));
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const sign = async (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'ES256', kid: 'k1' }) => {
    const input = `${b64(header)}.${b64(claims)}`;
    const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, Buffer.from(input));
    return `${input}.${Buffer.from(sig).toString('base64url')}`;
  };
  const nowMs = Date.UTC(2026, 9, 12);
  // As the access token hook (0091) issues it: the user in noacg_uid, `sub` no UUID.
  const claims = { iss: issuer, sub: `noacg-connector:${USER}`, noacg_uid: USER, client_id: CLIENT, exp: nowMs / 1000 + 600, role: 'noacg_connector' };
  const verify = (token: string) => verifyConnectorToken(token, { fetchFn, nowMs });

  assert.deepEqual(await verify(await sign(claims)), { userId: USER, clientId: CLIENT });
  assert.equal(await verify(await sign({ ...claims, exp: nowMs / 1000 - 1 })), null, 'expired');
  assert.equal(await verify(await sign({ ...claims, iss: 'http://elsewhere/auth/v1' })), null, 'another issuer');
  assert.equal(await verify(await sign({ ...claims, client_id: undefined })), null, 'a first-party token');
  assert.equal(await verify(await sign(claims, { alg: 'ES256', kid: 'unknown' })), null, 'a key Auth never published');
  const good = await sign(claims);
  const [h, , s] = good.split('.');
  assert.equal(await verify(`${h}.${b64({ ...claims, noacg_uid: '0b2c3d47-58cc-4372-a567-f47ac10be9d4' })}.${s}`), null, 'a tampered payload');
  assert.equal(await verify(`${b64({ alg: 'HS256', kid: 'k1' })}.${b64(claims)}.${s}`), null, 'a symmetric algorithm');
  assert.equal(await verify(`${b64({ alg: 'none' })}.${b64(claims)}.`), null, 'no signature');
  // A token from no hook or 0089's: its `sub` still opens Auth's account endpoints (#1083).
  assert.equal(await verify(await sign({ ...claims, sub: USER, noacg_uid: undefined })), null, 'issued without the account lock');
  assert.equal(connectorUserId({ noacg_uid: 'not-a-uuid' }), null);
  assert.equal(connectorUserId({ sub: USER }), null, 'sub is never read');
  // Only the discovery document and the keys were fetched: no /user, no /oauth/userinfo.
  assert.ok(asked.every((url) => url.includes('/.well-known/')), asked.join(', '));
});

test('the connector permissions are exactly read and create, never a playout verb', () => {
  assert.deepEqual([...CONNECTOR_PERMISSIONS], ['graphics:read', 'graphics:create']);
  for (const key of CONNECTOR_PERMISSIONS) assert.ok(!NEVER_ON_AGENT_KEYS.has(key));
});

test('the 2025 handshake: initialize negotiates, a notification is 202, tools list and call', async () => {
  const { handler, grants } = setup();
  await grant(grants);
  const init = await handler.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }));
  assert.equal(init.status, 200);
  const initBody = (await init.json()) as { result: { protocolVersion: string; serverInfo: { name: string }; capabilities: { tools: unknown }; instructions: string } };
  assert.equal(initBody.result.protocolVersion, '2025-06-18');
  assert.equal(initBody.result.serverInfo.name, 'noacg');
  assert.match(initBody.result.instructions, /noacg_catalog/);
  assert.ok(initBody.result.capabilities.tools);
  assert.equal(init.headers.get('mcp-session-id'), null, 'stateless: no session is minted');

  const newest = await handler.fetch(rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } }));
  assert.equal(((await newest.json()) as { result: { protocolVersion: string } }).result.protocolVersion, LEGACY_VERSIONS[0]);

  const note = await handler.fetch(rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  assert.equal(note.status, 202);

  const headers = { 'mcp-protocol-version': '2025-06-18' };
  const list = await handler.fetch(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { headers }));
  assert.deepEqual(((await list.json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map((t) => t.name), ['noacg_catalog', 'noacg_library', 'noacg_send_package']);
  const unknown = await handler.fetch(rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'noacg_nothing', arguments: {} } }, { headers }));
  assert.equal(((await unknown.json()) as { error: { code: number } }).error.code, -32602);
  const missing = await handler.fetch(rpc({ jsonrpc: '2.0', id: 5, method: 'resources/list' }, { headers }));
  assert.equal(((await missing.json()) as { error: { code: number } }).error.code, -32601);
});

test('the 2026-07-28 request metadata: headers must mirror the body; discover, list, versions', async () => {
  const { handler, grants } = setup();
  await grant(grants);
  const discover = modern('server/discover');
  const found = await handler.fetch(rpc(discover.body, { headers: discover.headers }));
  assert.equal(found.status, 200);
  const result = ((await found.json()) as { result: { resultType: string; supportedVersions: string[] } }).result;
  assert.equal(result.resultType, 'complete');
  assert.ok(result.supportedVersions.includes('2026-07-28') && result.supportedVersions.includes('2025-11-25'));

  const list = modern('tools/list');
  const listed = (await (await handler.fetch(rpc(list.body, { headers: list.headers }))).json()) as { result: { resultType: string; tools: unknown[] } };
  assert.equal(listed.result.resultType, 'complete');

  const mismatch = await handler.fetch(rpc(list.body, { headers: { ...list.headers, 'mcp-method': 'tools/call' } }));
  assert.equal(mismatch.status, 400);
  assert.equal(((await mismatch.json()) as { error: { code: number } }).error.code, -32020);

  const future = modern('tools/list', {}, '2099-01-01');
  const refused = await handler.fetch(rpc(future.body, { headers: future.headers }));
  assert.equal(refused.status, 400);
  const err = ((await refused.json()) as { error: { code: number; data: { supported: string[]; requested: string } } }).error;
  assert.equal(err.code, -32022);
  assert.equal(err.data.requested, '2099-01-01');

  const unknown = modern('prompts/list');
  assert.equal((await handler.fetch(rpc(unknown.body, { headers: unknown.headers }))).status, 404);
});

test('a tool call asks permits() for the tool\'s permission', async () => {
  const calls: string[] = [];
  const tool = (name: string, permission: McpTool['permission']): McpTool => ({
    name,
    title: name,
    description: name,
    inputSchema: { type: 'object' },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    permission,
    async call(principal) {
      calls.push(`${name}:${principal.kind}`);
      return { content: [{ type: 'text', text: 'ok' }] };
    },
  });
  const broken: McpTool = { ...tool('t_broken', null), async call() { throw new Error('store down'); } };
  const { handler, grants } = setup([tool('t_read', 'graphics:read'), tool('t_operate', 'playout:operate'), broken]);
  await grant(grants);
  const call = (name: string) => handler.fetch(rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: {} } }));
  const failed = await call('t_broken');
  assert.equal(failed.status, 200, 'a tool that throws is a tool result, not a broken transport');
  assert.equal(((await failed.json()) as { result: { isError?: boolean } }).result.isError, true);
  const read = (await (await call('t_read')).json()) as { result: { isError?: boolean } };
  assert.notEqual(read.result.isError, true);
  const operate = (await (await call('t_operate')).json()) as { result: { isError?: boolean } };
  assert.equal(operate.result.isError, true);
  assert.deepEqual(calls, ['t_read:connector']);
});

/** The plan's schema ceiling (docs/REMOTE_MCP_PLAN.md, key decision 6): every tool together under
 *  1,000 tokens, because a chat client puts the list into the model's context in every
 *  conversation where the connector is added, about NoaCG or not. Counted in characters of the
 *  JSON `tools/list` answers, at 3.5 characters a token - below what JSON schemas measure (the
 *  CLI's own MCP schema measured about 4.1, docs/AGENT_CLI.md "What a session pays") - so this
 *  many characters stays under 1,000 tokens. Phase 4's send tool has to fit beside the read tools;
 *  raise this only with a token measurement written beside it. */
const SCHEMA_CHAR_CEILING = 3500;

test('every tool has a title and all three hints, and the whole list stays under the schema ceiling', async () => {
  const { handler, grants } = setup();
  await grant(grants);
  const res = await handler.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { headers: { 'mcp-protocol-version': '2025-11-25' } }));
  const { tools } = ((await res.json()) as { result: { tools: Array<{ name: string; title: string; annotations: Record<string, unknown> }> } }).result;
  assert.equal(tools.length, TOOLS.length);
  for (const tool of tools) {
    assert.ok(tool.title, `${tool.name} has a title`);
    for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations[hint], 'boolean', `${tool.name} ${hint}`);
  }
  assert.deepEqual(tools.map((t) => t.name), ['noacg_catalog', 'noacg_library', 'noacg_send_package']);
  for (const name of ['noacg_catalog', 'noacg_library']) {
    assert.deepEqual(tools.find((t) => t.name === name)?.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, name);
  }
  // The send tool writes (a waiting package), destroys nothing and reaches nothing outside NoaCG.
  assert.deepEqual(tools.find((t) => t.name === 'noacg_send_package')?.annotations, { readOnlyHint: false, destructiveHint: false, openWorldHint: false });
  assert.equal(TOOLS.find((t) => t.name === 'noacg_send_package')?.permission, 'graphics:create');
  const chars = JSON.stringify(tools).length;
  assert.ok(chars <= SCHEMA_CHAR_CEILING, `the tool list is ${chars} characters, over the ${SCHEMA_CHAR_CEILING} ceiling`);
});

test('GET and DELETE are 405, a foreign Origin is 403, a batch is refused', async () => {
  const { handler, grants } = setup();
  await grant(grants);
  assert.equal((await handler.fetch(new Request('http://studio.test/mcp'))).status, 405);
  assert.equal((await handler.fetch(new Request('http://studio.test/mcp', { method: 'DELETE' }))).status, 405);
  const foreign = await handler.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { headers: { origin: 'https://evil.example' } }));
  assert.equal(foreign.status, 403);
  const batch = await handler.fetch(rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }]));
  assert.equal(batch.status, 400);
});
