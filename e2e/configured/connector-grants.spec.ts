// covers: api/_lib/me/mcp.ts, api/_lib/me/connectors.ts, api/_lib/connectorAuth.ts, api/_lib/connectorStore.ts
// covers: src/backend/connectorAccess.ts, src/components/auth/ConnectorConsent.tsx, supabase/migrations/0090_connector_grants.sql
//
// THE REMOTE MCP CONNECTOR'S CONSENT, GRANT, REVOCATION AND CLOSED DATABASE, on the runner's local
// stack (docs/REMOTE_MCP_PLAN.md, AC-2). A scripted MCP client (@modelcontextprotocol/sdk, the
// CLI's own dependency) stands in for Claude.ai: it meets the 401, reads the protected resource
// metadata, registers itself with Supabase Auth and sends the user to sign in. The consent page is
// driven in the browser as a throwaway account: Don't allow leaves no grant; Allow writes one with
// exactly the two connector permissions, and the client's next call is served as that connector.
// With the connector's token, NoaCG's own API refuses it, and PostgREST and Storage refuse it on
// every public table, storage.objects and a capability-slug RPC. The client holds no ID token, and
// a client that asks for `openid` is refused at Allow (issue #1083). Revoke in Settings ends both
// the next call and the refresh.
//
// It registers OAuth clients, so it runs on a local stack or on the hosted test project named in
// NOACG_CONNECTOR_TEST_REF. Wherever Auth runs no OAuth server (hosted staging until the owner
// switches it on), the second test proves the other half of AC-2: every connector path answers 503.

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { isConnectorTestStack } from '../../scripts/connector-oauth-spike.mjs';
import { mintAccount, shot, signInOnHome, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
import { allowAs, connect, consentPath, deleteOAuthClient, REDIRECT, ScriptedClaude } from './_connector';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const CLIENT_NAME = 'Claude (scripted)';
const ROLE_REFUSED = 'permission denied to set role "noacg_connector"';


/** Answer the consent page and return the callback URL the browser was sent to. */
async function answerConsent(page: Page, path: string, button: 'connector-consent-allow' | 'connector-consent-deny'): Promise<URL> {
  let callback: URL | null = null;
  await page.route(`${REDIRECT}**`, async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'back in the chat client' });
  });
  await page.goto(path);
  await expect(page.getByTestId('connector-consent')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(CLIENT_NAME);
  const labels = page.getByTestId('connector-consent-permissions').locator('li');
  await expect(labels).toHaveText([/Read your library/, /Create graphics in your library and send graphics packages to your Home/]);
  if (button === 'connector-consent-allow') await shot(page, 'connector-consent');
  await page.getByTestId(button).click();
  await expect.poll(() => callback?.href ?? '').toContain(REDIRECT);
  await page.unroute(`${REDIRECT}**`);
  return callback!;
}

test.describe('remote MCP connector: consent, grant, revocation and the closed database', () => {
  test.setTimeout(150_000);

  test('a chat client signs in through the consent page, is served as a connector, and is stopped by Revoke', async ({ page, request, baseURL }) => {
    test.skip(!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY, 'needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
    test.skip(!isConnectorTestStack(SUPABASE_URL), 'local stack or the hosted test project named in NOACG_CONNECTOR_TEST_REF only: it registers OAuth clients');
    const origin = baseURL!.replace(/\/+$/, '');
    const mcpUrl = new URL(`${origin}/mcp`);
    const supabase = SUPABASE_URL.replace(/\/+$/, '');
    const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const email = `connector-grants-${Date.now()}@noacg.local`;
    const password = `pw-${randomBytes(9).toString('base64url')}`;
    const userId = await mintAccount(admin, email, password);
    const provider = new ScriptedClaude(CLIENT_NAME);
    let otherClient: string | undefined;
    const grantsOf = async () => {
      const { data, error } = await admin.from('connector_grants').select('client_id, client_name, permissions, last_used_at, revoked_at').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return data ?? [];
    };

    try {
      // 1. Unauthenticated: 401 with the metadata pointer; the metadata names the local Auth.
      const bare = await request.post(mcpUrl.href, { data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } });
      expect(bare.status()).toBe(401);
      expect(bare.headers()['www-authenticate']).toBe(`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
      const metadata = await (await request.get(`${origin}/.well-known/oauth-protected-resource/mcp`)).json();
      expect(metadata).toMatchObject({ resource: mcpUrl.href, authorization_servers: [`${supabase}/auth/v1`] });

      await signInOnHome(page, email, password);

      // 2. The client registers and sends the user to sign in; Don't allow leaves no grant.
      await expect(connect(mcpUrl, provider)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(provider.info?.client_id, 'registered dynamically with Supabase Auth').toBeTruthy();
      const denied = await answerConsent(page, await consentPath(request, provider.authorizationUrl!), 'connector-consent-deny');
      expect(denied.searchParams.get('error')).toBe('access_denied');
      expect(await grantsOf()).toEqual([]);

      // 3. Allow writes the grant, and the code buys the client a token.
      await expect(connect(mcpUrl, provider)).rejects.toBeInstanceOf(UnauthorizedError);
      const allowed = await answerConsent(page, await consentPath(request, provider.authorizationUrl!), 'connector-consent-allow');
      const code = allowed.searchParams.get('code');
      expect(code, allowed.href).toBeTruthy();
      const [row] = await grantsOf();
      expect(row).toMatchObject({ client_id: provider.info!.client_id, client_name: CLIENT_NAME, permissions: ['graphics:read', 'graphics:create'], revoked_at: null });
      await new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider }).finishAuth(code!);
      const token = provider.saved!.access_token;
      expect(token).toBeTruthy();
      // The client asked for the metadata's `email` scope, so it holds no ID token: that would be
      // a second bearer with the real user id, which Auth's /user accepts (issue #1083).
      expect(provider.saved!.id_token, 'no ID token for the email scope').toBeUndefined();

      // 4. The next call is served as the connector: the handshake answers, the read tools are
      //    listed (connector-tools.spec.ts calls them), and a tool call resolves the grant (its
      //    last use is stamped) before it meets the tool table.
      const { client } = await connect(mcpUrl, provider);
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['noacg_catalog', 'noacg_library', 'noacg_send_package']);
      await expect(client.callTool({ name: 'noacg_probe', arguments: {} })).rejects.toThrow(/Unknown tool/);
      expect((await grantsOf())[0].last_used_at).not.toBeNull();

      // 5. NoaCG's own API refuses the connector token everywhere but the connector path.
      const asConnector = { authorization: `Bearer ${token}` };
      expect((await request.get(`${origin}/api/me/agent-keys`, { headers: asConnector })).status()).toBe(401);
      expect((await request.get(`${origin}/api/me/connectors`, { headers: asConnector })).status()).toBe(401);
      expect((await request.post(`${origin}/api/me/graphics`, { headers: asConnector, data: {} })).status()).toBe(401);

      // 5b. A client that asks for `openid` is refused at Allow, before any grant or code.
      const openidClient = (await (await fetch(`${supabase}/auth/v1/oauth/clients/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: 'Asks for openid', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }),
      })).json()) as { client_id?: string };
      otherClient = openidClient.client_id;
      expect(otherClient, 'registered').toBeTruthy();
      const openidAuthorize = new URL(`${supabase}/auth/v1/oauth/authorize`);
      openidAuthorize.search = new URLSearchParams({
        response_type: 'code', client_id: otherClient!, redirect_uri: REDIRECT, code_challenge: randomBytes(32).toString('base64url'), code_challenge_method: 'S256', scope: 'openid email',
      }).toString();
      const openidAllow = await allowAs(request, origin, { url: SUPABASE_URL, anonKey: ANON_KEY }, email, password, openidAuthorize);
      expect(openidAllow.status(), await openidAllow.text()).toBe(403);
      expect((await openidAllow.json()).error.message).toMatch(/openid/);
      expect((await grantsOf()).map((g) => g.client_id), 'no grant for the openid client').toEqual([provider.info!.client_id]);

      // 6. The closed database: every public table read and written, storage.objects, and a
      //    capability-slug RPC, each refused for the connector role before anything is read.
      const openapi = await (await fetch(`${supabase}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).json();
      const tables = Object.keys(openapi.paths as Record<string, unknown>).filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1));
      expect(tables).toEqual(expect.arrayContaining(['documents', 'connector_grants', 'agent_keys']));
      const raw = { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      /** Status and the error's own message (PostgREST and Storage both answer JSON). */
      const refusedFor = async (res: Response) => {
        const text = await res.text();
        try {
          const body = JSON.parse(text) as { message?: string };
          return `${res.status} ${body.message ?? text}`;
        } catch {
          return `${res.status} ${text}`;
        }
      };
      const write = { method: 'POST', headers: { ...raw, prefer: 'return=minimal' }, body: '{}' };
      const probes: Array<[string, string, RequestInit]> = [
        ...tables.flatMap((table): Array<[string, string, RequestInit]> => [
          [`GET ${table}`, `${supabase}/rest/v1/${table}?limit=1`, { headers: raw }],
          [`POST ${table}`, `${supabase}/rest/v1/${table}`, write],
        ]),
        ['rpc control_show_by_slug', `${supabase}/rest/v1/rpc/control_show_by_slug`, { method: 'POST', headers: raw, body: JSON.stringify({ p_slug: 'connector-grants' }) }],
        ['storage.objects list', `${supabase}/storage/v1/object/list/user-assets`, { method: 'POST', headers: raw, body: JSON.stringify({ prefix: '', limit: 1 }) }],
      ];
      const answers = await Promise.all(probes.map(async ([name, url, init]) => [name, await refusedFor(await fetch(url, init))] as const));
      const leaks = answers.filter(([, answer]) => !answer.includes(ROLE_REFUSED)).map(([name, answer]) => `${name}: ${answer.slice(0, 160)}`);
      console.log(`connector grants: ${tables.length} public tables read and written, storage.objects and rpc control_show_by_slug refused for the connector role`);
      expect(leaks).toEqual([]);

      // 7. Settings → Account → Agent access lists the connector beside keys; Revoke ends it.
      await page.goto('/app#/home');
      await page.getByTestId('account-button').click();
      await page.getByTestId('account-menu').getByRole('menuitem', { name: /Settings/ }).click();
      await expect(page.getByTestId('settings-account')).toBeVisible();
      const listed = page.getByTestId('connector-row').filter({ hasText: CLIENT_NAME });
      await expect(listed).toBeVisible();
      await shot(page, 'settings-connected-app');
      await listed.getByTestId('connector-revoke').click();
      await expect(listed).toHaveCount(0);
      await expect(page.getByTestId('agent-keys-error')).toHaveCount(0);

      // The next tool call fails, and so does the refresh.
      const after = await request.post(mcpUrl.href, {
        headers: { ...asConnector, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
        data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'noacg_probe', arguments: {} } },
      });
      expect(after.status()).toBe(401);
      const discovery = await (await fetch(`${supabase}/auth/v1/.well-known/oauth-authorization-server`)).json();
      const refresh = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: provider.saved!.refresh_token ?? '', client_id: provider.info!.client_id }),
      });
      const refreshBody = await refresh.text();
      expect(refresh.status, refreshBody).toBeGreaterThanOrEqual(400);
      expect((await grantsOf())[0].revoked_at).not.toBeNull();
      console.log(`connector grants: after Revoke the tool call answers ${after.status()} and the refresh ${refresh.status} ${refreshBody.slice(0, 120)}`);
    } finally {
      await deleteOAuthClient(SUPABASE_URL, SERVICE_ROLE_KEY, provider.info?.client_id);
      await deleteOAuthClient(SUPABASE_URL, SERVICE_ROLE_KEY, otherClient);
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  test('a deployment whose Auth runs no OAuth server answers 503 connector_disabled on every connector path', async ({ request, baseURL }) => {
    test.skip(!SUPABASE_URL, 'needs VITE_SUPABASE_URL');
    // Asked of Auth itself, as the server decides "on" (connectorEnabled): a project the owner has
    // switched on is not "off", whatever its URL.
    const disco = await request.get(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/.well-known/oauth-authorization-server`);
    const on = disco.ok() && Boolean(((await disco.json().catch(() => ({}))) as { registration_endpoint?: string }).registration_endpoint);
    test.skip(on, "this deployment's Auth runs the OAuth server; the 503 half needs one that does not");
    const origin = baseURL!.replace(/\/+$/, '');
    for (const res of [
      await request.post(`${origin}/mcp`, { data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } }),
      await request.get(`${origin}/.well-known/oauth-protected-resource/mcp`),
      await request.get(`${origin}/api/me/connectors`),
    ]) {
      expect(res.status(), res.url()).toBe(503);
      expect((await res.json()).error.code).toBe('connector_disabled');
    }
  });
});
