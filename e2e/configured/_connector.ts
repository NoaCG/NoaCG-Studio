// A scripted chat client for the remote MCP connector specs (docs/REMOTE_MCP_PLAN.md): what
// Claude.ai keeps for one connection - its dynamic registration, its tokens, its PKCE verifier -
// over the MCP SDK the CLI already depends on.

import { expect, type APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
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
