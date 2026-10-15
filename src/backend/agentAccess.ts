// The browser's half of AGENT ACCESS (docs/AGENT_SAVE.md): the consent request a CLI opens in
// the user's browser, the one-time code the consent returns to it, and the Settings list that
// names and revokes the keys. The keys themselves are minted and honoured by the function at
// /api/me (api/_lib/me/agentKeys.ts) - this module only talks to it with the user's session.
//
// It lives in backend/ for the same reason myEntitlement.ts does: it is the SERVICE half, the
// one that fetches. The vocabulary it shows (what a key may do) is src/entitlements/permissions.ts,
// pure and shared with the server.
//
// THE ONE RULE THIS FILE HOLDS: the redirect target is ALWAYS `http://127.0.0.1:<port>/callback`.
// A consent URL cannot name any other host, any other path, or any other scheme - the port is
// the only variable, and it is checked - so a link somebody was tricked into opening can only
// ever deliver a code to a listener on the user's own machine. The code is one-shot, bound to a
// PKCE challenge the CLI holds the answer to, and dead in 120 s; the key it mints never passes
// through the browser at all.

import { getAccessToken } from './auth';
import { AGENT_KEY_PERMISSIONS, type PermissionKey } from '../entitlements/permissions';

/** The consent URL's query, parsed: `/app?agent=<state>&port=<n>&name=<host>&challenge=<hex>`. */
export interface AgentAccessRequest {
  /** The CLI's opaque state, echoed back so the listener can match the reply to its own request. */
  state: string;
  /** The loopback port the CLI is listening on (1024-65535). */
  port: number;
  /** What the CLI calls itself ("Claude Code on LAPTOP-7") - becomes the key's name. */
  name: string;
  /** Hex sha256 of the CLI's verifier. */
  challenge: string;
  /** What the key will be allowed to do - the release's fixed authoring list. */
  permissions: readonly PermissionKey[];
  /** The CLI's listener also takes a REFUSAL (`deny=1`): "Don't allow" then tells it at once
   *  instead of leaving it to time out. An older CLI does not send this and is never sent one. */
  acceptsDeny: boolean;
}

const STATE = /^[A-Za-z0-9_-]{8,128}$/;
const CHALLENGE = /^[0-9a-f]{64}$/;
export const MAX_AGENT_NAME = 80;

/** Parse the consent query. Null = not an agent request at all, or a malformed one (the page
 *  says so; it never guesses a port or a name). */
export function parseAgentRequest(params: URLSearchParams): AgentAccessRequest | null {
  const state = params.get('agent') ?? '';
  if (!STATE.test(state)) return null;
  const port = Number(params.get('port'));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  const challenge = (params.get('challenge') ?? '').toLowerCase();
  if (!CHALLENGE.test(challenge)) return null;
  const name = (params.get('name') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_AGENT_NAME) || 'noacg CLI';
  return { state, port, name, challenge, permissions: AGENT_KEY_PERMISSIONS, acceptsDeny: params.get('deny') === '1' };
}

/** Is this page load an agent consent request at all (well-formed or not)? */
export function isAgentRequestUrl(params: URLSearchParams): boolean {
  return params.has('agent');
}

/** The ONLY place the browser may send the code: the CLI's loopback listener, in the URL
 *  fragment (never the query, never a request line the server would log). */
export function agentCallbackUrl(port: number, code: string, state: string): string {
  return `http://127.0.0.1:${port}/callback#code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
}

/** The same listener, told that the user pressed "Don't allow". It carries no code. */
export function agentDenyUrl(port: number, state: string): string {
  return `http://127.0.0.1:${port}/callback#error=access_denied&state=${encodeURIComponent(state)}`;
}

// ── the calls ─────────────────────────────────────────────────────────────────────────────

export interface AgentKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in.');
  return fetch(path, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
}

export async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

/** Consent: mint the one-time code for this request. Returns the plaintext code the page then
 *  hands to the loopback listener (and nothing else - the key does not exist yet). */
export async function beginAgentKey(req: Pick<AgentAccessRequest, 'name' | 'challenge'>): Promise<{ code: string; expiresIn: number }> {
  const response = await authedFetch('/api/me/agent-keys', {
    method: 'POST',
    body: JSON.stringify({ action: 'begin', name: req.name, challenge: req.challenge }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, `Could not start agent access (${response.status}).`));
  const body = (await response.json()) as { code?: unknown; expiresIn?: unknown };
  if (typeof body.code !== 'string' || !body.code) throw new Error('The server returned no code.');
  return { code: body.code, expiresIn: typeof body.expiresIn === 'number' ? body.expiresIn : 120 };
}

/** The user's live keys, for Settings. */
export async function listAgentKeys(): Promise<AgentKeySummary[]> {
  const response = await authedFetch('/api/me/agent-keys');
  if (!response.ok) throw new Error(await errorMessage(response, `Could not load agent keys (${response.status}).`));
  const body = (await response.json()) as { keys?: unknown };
  return Array.isArray(body.keys) ? (body.keys as AgentKeySummary[]) : [];
}

/** Revoke one key. Takes effect on the key's next request. */
export async function revokeAgentKey(id: string): Promise<void> {
  const response = await authedFetch(`/api/me/agent-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await errorMessage(response, `Could not revoke the key (${response.status}).`));
}
