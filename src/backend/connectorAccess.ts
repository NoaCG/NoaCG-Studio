// The browser's half of a chat client's CONNECTOR (docs/REMOTE_MCP_PLAN.md): the consent page
// Supabase Auth sends a signing-in user to (`/?authorization_id=<id>`, forwarded to /app), and the
// Settings list that names and revokes connectors.
//
// Reading the request and DENYING it go straight to Supabase Auth with the user's session: Deny
// must leave nothing behind, so it never touches NoaCG's server. ALLOWING goes through
// /api/me/connectors, which records the grant (what the connector may do in NoaCG) before it
// approves the sign-in. Where the browser goes next is always Auth's own answer.

import { getSupabase } from './supabase';
import { authedFetch, errorMessage } from './agentAccess';

/** Schemes that run or read something inside the page that opens them. Every other scheme either
 *  loads a web page or hands the address to an installed app. */
const PAGE_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'filesystem:', 'about:', 'view-source:']);

/** Where Auth sends the browser next. A client registers its own redirect URIs, and a desktop app
 *  registers its own scheme for them (RFC 8252 7.1): the Claude app's is
 *  `claude://claude.ai/mcp-auth-callback/sdk`, measured on staging 2026-10-13, which an http(s)-only
 *  rule refused after Auth had already approved. Refused: a scheme that would run or read
 *  something in the studio's own page. */
export function webRedirect(url: string): string {
  const { protocol } = new URL(url);
  if (PAGE_SCHEMES.has(protocol.toLowerCase())) throw new Error('The app asked to return to an address this page will not open.');
  return url;
}

/** Is this page load a connector consent request? */
export function isConnectorConsentUrl(params: URLSearchParams): boolean {
  return params.has('authorization_id');
}

export type ConnectorRequest =
  | { kind: 'ask'; clientName: string; returnsTo: string }
  /** The user approved this client before; Auth answers with where to go and asks nothing. */
  | { kind: 'redirect'; url: string };

async function oauth() {
  const sb = await getSupabase();
  if (!sb) throw new Error('No account backend.');
  return sb.auth.oauth;
}

const reading = new Map<string, Promise<ConnectorRequest>>();

/** What the client asks for, as Supabase Auth records it. Callers asking while a read of the same
 *  authorization is in flight share it (React StrictMode runs the page's effect twice): Auth
 *  answers one of two OVERLAPPING reads of a fresh authorization with a 404, which the page would
 *  show as an expired request. A later read asks Auth again, under the session the page has then. */
export function readConnectorRequest(authorizationId: string): Promise<ConnectorRequest> {
  let request = reading.get(authorizationId);
  if (!request) {
    request = fetchConnectorRequest(authorizationId).finally(() => reading.delete(authorizationId));
    reading.set(authorizationId, request);
  }
  return request;
}

async function fetchConnectorRequest(authorizationId: string): Promise<ConnectorRequest> {
  const { data, error } = await (await oauth()).getAuthorizationDetails(authorizationId);
  if (error || !data) throw new Error('This sign-in request is unknown or has expired. Start again from the chat.');
  if (!('authorization_id' in data)) return { kind: 'redirect', url: webRedirect(data.redirect_url) };
  let returnsTo = '';
  try {
    returnsTo = new URL(data.redirect_uri).host;
  } catch {
    /* shown without it */
  }
  return { kind: 'ask', clientName: data.client.name || 'An app', returnsTo };
}

/** Allow: NoaCG records the grant, then approves the sign-in. Returns where to send the browser. */
export async function allowConnector(authorizationId: string): Promise<string> {
  const response = await authedFetch('/api/me/connectors', {
    method: 'POST',
    body: JSON.stringify({ action: 'allow', authorizationId }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, `Could not allow the connector (${response.status}).`));
  const body = (await response.json()) as { redirectUrl?: unknown };
  if (typeof body.redirectUrl !== 'string') throw new Error('The server returned nowhere to go.');
  return webRedirect(body.redirectUrl);
}

/** Deny: Auth tells the client no. Nothing is written in NoaCG. */
export async function denyConnector(authorizationId: string): Promise<string> {
  const { data, error } = await (await oauth()).denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data) throw new Error('Could not answer the sign-in request. Close this tab; nothing was allowed.');
  return webRedirect(data.redirect_url);
}

export interface ConnectorSummary {
  id: string;
  name: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** The user's connectors, for Settings. Empty where the connector is not turned on. */
export async function listConnectors(): Promise<ConnectorSummary[]> {
  const response = await authedFetch('/api/me/connectors');
  if (response.status === 503 || response.status === 404) return [];
  if (!response.ok) throw new Error(await errorMessage(response, `Could not load connectors (${response.status}).`));
  const body = (await response.json()) as { connectors?: unknown };
  return Array.isArray(body.connectors) ? (body.connectors as ConnectorSummary[]) : [];
}

/** Revoke one connector: its next call fails, and so does its next sign-in refresh. */
export async function revokeConnector(id: string): Promise<void> {
  const response = await authedFetch(`/api/me/connectors?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await errorMessage(response, `Could not revoke the connector (${response.status}).`));
}
