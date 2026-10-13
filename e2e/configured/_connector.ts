// A scripted chat client for the remote MCP connector specs (docs/REMOTE_MCP_PLAN.md): what
// Claude.ai keeps for one connection - its dynamic registration, its tokens, its PKCE verifier -
// over the MCP SDK the CLI already depends on.

import { expect, type APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

export const REDIRECT = 'http://127.0.0.1:53682/callback';

export class ScriptedClaude implements OAuthClientProvider {
  info: OAuthClientInformationMixed | undefined;
  saved: OAuthTokens | undefined;
  verifier = '';
  authorizationUrl: URL | null = null;
  readonly redirectUrl = REDIRECT;
  readonly clientMetadata: OAuthClientMetadata;
  constructor(clientName: string) {
    this.clientMetadata = {
      client_name: clientName,
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state() { return randomBytes(12).toString('base64url'); }
  clientInformation() { return this.info; }
  saveClientInformation(info: OAuthClientInformationMixed) { this.info = info; }
  tokens() { return this.saved; }
  saveTokens(tokens: OAuthTokens) { this.saved = tokens; }
  redirectToAuthorization(url: URL) { this.authorizationUrl = url; }
  saveCodeVerifier(verifier: string) { this.verifier = verifier; }
  codeVerifier() { return this.verifier; }
}

/** Delete a client the spec registered, so the local stack does not collect them. */
export async function deleteOAuthClient(supabaseUrl: string, serviceKey: string, clientId: string | undefined): Promise<void> {
  if (!clientId) return;
  await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/oauth/clients/${clientId}`, { method: 'DELETE', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } }).catch(() => undefined);
}

/** Connect; the first time this throws UnauthorizedError after sending the user to sign in. */
export async function connect(mcpUrl: URL, provider: ScriptedClaude): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider });
  const client = new Client({ name: 'scripted-claude', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

/** Follow the authorization URL as a browser would, to the consent page's query. Auth redirects
 *  to its configured site_url, which on the runner is another port. */
export async function consentPath(request: APIRequestContext, authorizationUrl: URL): Promise<string> {
  const res = await request.get(authorizationUrl.href, { maxRedirects: 0 });
  expect(res.status(), await res.text()).toBe(302);
  const id = new URL(res.headers().location).searchParams.get('authorization_id');
  expect(id).toBeTruthy();
  return `/?authorization_id=${id}`;
}

/** Sign one account in to a fresh scripted client, approving it through NoaCG's consent endpoint
 *  with the account's own session - the call the consent page's Allow makes. */
export async function signedInClient(
  request: APIRequestContext,
  origin: string,
  supabase: { url: string; anonKey: string },
  email: string,
  password: string,
  provider: ScriptedClaude,
): Promise<Client> {
  const mcpUrl = new URL(`${origin}/mcp`);
  await expect(connect(mcpUrl, provider)).rejects.toBeInstanceOf(UnauthorizedError);
  const authorizationId = new URLSearchParams((await consentPath(request, provider.authorizationUrl!)).split('?')[1]).get('authorization_id');
  const { data, error } = await createClient(supabase.url, supabase.anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in: ${error?.message}`);
  const allow = await request.post(`${origin}/api/me/connectors`, {
    headers: { authorization: `Bearer ${data.session.access_token}` },
    data: { action: 'allow', authorizationId },
  });
  expect(allow.status(), await allow.text()).toBe(200);
  const code = new URL((await allow.json()).redirectUrl).searchParams.get('code');
  expect(code).toBeTruthy();
  await new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider }).finishAuth(code!);
  return (await connect(mcpUrl, provider)).client;
}

export type ToolAnswer = { isError?: boolean; content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown> };
export const callTool = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolAnswer;
