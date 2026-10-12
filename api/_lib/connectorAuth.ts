// The connector's side of Supabase Auth's OAuth server (docs/REMOTE_MCP_PLAN.md, key decisions 1
// and 2): is the server on at all, where it lives, and the three calls NoaCG makes to it with the
// user's own session (read an authorization, approve it, end a client's sessions).
//
// OFF IS A STATE, NOT A FAULT. Production's Auth has no OAuth server today, and the connector
// stays off there until the owner turns it on. So "on" is read from the authorization server's
// own discovery document, never from a NoaCG setting that could disagree with it: while Auth
// answers no metadata, every connector path answers 503 `connector_disabled` and nothing else
// changes. The answer is cached per warm instance for a minute, so the check costs one fetch a
// minute rather than one per call.

import { supabaseEnv } from './auth.js';

/** Supabase Auth's issuer, which the protected resource metadata names. Null without a backend. */
export function authServerUrl(): string | null {
  const env = supabaseEnv();
  return env ? `${env.url.replace(/\/+$/, '')}/auth/v1` : null;
}

const ENABLED_TTL_MS = 60_000;
let enabledCache: { at: number; enabled: boolean } | null = null;

/** Test seam: forget the cached answer. */
export function resetConnectorEnabledCache(): void {
  enabledCache = null;
}

/** True when this deployment's Auth runs the OAuth server with dynamic registration. */
export async function connectorEnabled(fetchFn: typeof fetch = fetch, nowMs = Date.now()): Promise<boolean> {
  if (enabledCache && nowMs - enabledCache.at < ENABLED_TTL_MS) return enabledCache.enabled;
  const issuer = authServerUrl();
  let enabled = false;
  if (issuer) {
    try {
      const res = await fetchFn(`${issuer}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5000) });
      const meta = res.ok ? ((await res.json()) as { registration_endpoint?: unknown }) : null;
      enabled = typeof meta?.registration_endpoint === 'string' && meta.registration_endpoint !== '';
    } catch {
      // Auth unreachable: the connector cannot sign anyone in, so it is off - but do not cache a
      // transient failure for the whole minute.
      return false;
    }
  }
  enabledCache = { at: nowMs, enabled };
  return enabled;
}

/** What the consent page approves, as Supabase Auth records it for this user's session. */
export interface AuthorizationDetails {
  clientId: string;
  clientName: string;
}

async function asUser(path: string, userToken: string, init: RequestInit = {}): Promise<Response> {
  const env = supabaseEnv();
  if (!env) throw new Error('no account backend');
  return fetch(`${authServerUrl()}${path}`, {
    ...init,
    headers: {
      apikey: env.anonKey,
      authorization: `Bearer ${userToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

/** The client an authorization is for. Null when Auth does not know it for this user, or when
 *  the user already consented (Auth then answers only a redirect, and there is nothing to ask). */
export async function authorizationDetails(userToken: string, authorizationId: string): Promise<AuthorizationDetails | null> {
  const res = await asUser(`/oauth/authorizations/${encodeURIComponent(authorizationId)}`, userToken);
  if (!res.ok) return null;
  const { client } = (await res.json()) as { client?: { id?: unknown; name?: unknown } };
  if (typeof client?.id !== 'string' || !client.id) return null;
  return { clientId: client.id, clientName: typeof client.name === 'string' ? client.name.trim().slice(0, 80) : '' };
}

/** Approve an authorization; the URL that returns the code to the client, or null on refusal. */
export async function approveAuthorization(userToken: string, authorizationId: string): Promise<string | null> {
  const res = await asUser(`/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, userToken, {
    method: 'POST',
    body: JSON.stringify({ action: 'approve' }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { redirect_url?: unknown };
  return typeof body.redirect_url === 'string' ? body.redirect_url : null;
}

/** End a client's sessions and refresh tokens for this user. True when Auth confirms, or when it
 *  already had no grant for the client. */
export async function revokeClientSessions(userToken: string, clientId: string): Promise<boolean> {
  const res = await asUser(`/user/oauth/grants?client_id=${encodeURIComponent(clientId)}`, userToken, { method: 'DELETE' });
  return res.ok || res.status === 404;
}
