// The connector's side of Supabase Auth's OAuth server (docs/REMOTE_MCP_PLAN.md, key decisions 1
// and 2): is the server on at all, where it lives, how a connector's token is verified, and the
// three calls NoaCG makes to it with the user's own session (read an authorization, approve it,
// end a client's sessions).
//
// OFF IS A STATE, NOT A FAULT. Production's Auth has no OAuth server today, and the connector
// stays off there until the owner turns it on. So "on" is read from the authorization server's
// own discovery document, never from a NoaCG setting that could disagree with it: while Auth
// answers no metadata, every connector path answers 503 `connector_disabled` and nothing else
// changes. The document is cached per warm instance for a minute.
//
// A CONNECTOR TOKEN IS VERIFIED HERE, LOCALLY, against the issuer's JWKS - never with Auth's
// /user or /oauth/userinfo. Those endpoints are the account surface a connector token must not
// reach (issue #1083), and the access token hook (migration 0091) makes them refuse such tokens
// outright: it moves the user id from `sub` to `noacg_uid` and points `session_id` at no session.
// So the MCP route trusts exactly three things: the signature (asymmetric only), the expiry and
// issuer, and a live `connector_grants` row the caller checks next. Revocation is that row; the
// token's session is not consulted. The user id is read through `connectorUserId`.

import { webcrypto } from 'node:crypto';
import { oauthClientOf, supabaseEnv } from './auth.js';

/** Supabase Auth's issuer, which the protected resource metadata names. Null without a backend. */
export function authServerUrl(): string | null {
  const env = supabaseEnv();
  return env ? `${env.url.replace(/\/+$/, '')}/auth/v1` : null;
}

interface AuthServerMetadata {
  issuer: string;
  jwksUri: string;
}

const METADATA_TTL_MS = 60_000;
/** An unreachable Auth is retried sooner than a minute, but not on every request. */
const METADATA_FAILURE_TTL_MS = 10_000;
const JWKS_TTL_MS = 10 * 60_000;
/** A token naming a key not in the cache forces a refetch at most this often, so made-up `kid`s
 *  cannot turn every request into a fetch against Auth. */
const JWKS_REFRESH_MIN_MS = 30_000;
let metadataCache: { at: number; meta: AuthServerMetadata | null } | null = null;
let jwksCache: { at: number; uri: string; keys: webcrypto.JsonWebKey[] } | null = null;

/** Test seam: forget the cached discovery document and keys. */
export function resetConnectorEnabledCache(): void {
  metadataCache = null;
  jwksCache = null;
}

/** The OAuth server's discovery document, or null while Auth runs none (dynamic registration is
 *  what a chat client needs, so a server without it counts as off). */
async function authServerMetadata(fetchFn: typeof fetch, nowMs: number): Promise<AuthServerMetadata | null> {
  if (metadataCache && nowMs - metadataCache.at < METADATA_TTL_MS) return metadataCache.meta;
  const base = authServerUrl();
  let meta: AuthServerMetadata | null = null;
  if (base) {
    try {
      const res = await fetchFn(`${base}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5000) });
      const doc = res.ok ? ((await res.json()) as { issuer?: unknown; jwks_uri?: unknown; registration_endpoint?: unknown }) : null;
      if (typeof doc?.registration_endpoint === 'string' && doc.registration_endpoint && typeof doc.issuer === 'string') {
        meta = { issuer: doc.issuer, jwksUri: typeof doc.jwks_uri === 'string' ? doc.jwks_uri : `${base}/.well-known/jwks.json` };
      }
    } catch {
      // Auth unreachable: the connector cannot sign anyone in, so it is off - remembered for a few
      // seconds rather than the whole minute.
      metadataCache = { at: nowMs - (METADATA_TTL_MS - METADATA_FAILURE_TTL_MS), meta: null };
      return null;
    }
  }
  metadataCache = { at: nowMs, meta };
  return meta;
}

/** True when this deployment's Auth runs the OAuth server with dynamic registration. */
export async function connectorEnabled(fetchFn: typeof fetch = fetch, nowMs = Date.now()): Promise<boolean> {
  return (await authServerMetadata(fetchFn, nowMs)) !== null;
}

async function signingKeys(uri: string, fetchFn: typeof fetch, nowMs: number, fresh: boolean): Promise<webcrypto.JsonWebKey[]> {
  const age = jwksCache && jwksCache.uri === uri ? nowMs - jwksCache.at : Infinity;
  if (age < (fresh ? JWKS_REFRESH_MIN_MS : JWKS_TTL_MS)) return jwksCache!.keys;
  const res = await fetchFn(uri, { signal: AbortSignal.timeout(5000) });
  const keys = res.ok ? (((await res.json()) as { keys?: webcrypto.JsonWebKey[] }).keys ?? []) : [];
  jwksCache = { at: nowMs, uri, keys };
  return keys;
}

const ALGORITHMS: Record<string, [webcrypto.EcKeyImportParams | webcrypto.RsaHashedImportParams, webcrypto.EcdsaParams | webcrypto.AlgorithmIdentifier]> = {
  ES256: [{ name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }],
  RS256: [{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }],
};

/** The user a connector token speaks for: `noacg_uid`, where the access token hook (0091) moves
 *  it so that Auth's own account endpoints refuse the token (issue #1083). A token without it was
 *  issued with no hook or an older one, whose `sub` still opens those endpoints, so it is refused
 *  here too: the connector never runs on an Auth that has not closed them. */
export function connectorUserId(claims: Record<string, unknown>): string | null {
  const uid = claims.noacg_uid;
  return typeof uid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid) ? uid : null;
}

export interface ConnectorVerifyOptions {
  fetchFn?: typeof fetch;
  nowMs?: number;
}

/** A connector's token, verified locally: the user and the OAuth client it was issued to, or
 *  null when it is not an OAuth client's token, is not signed by the issuer's current keys with an
 *  asymmetric algorithm, has expired, or names another issuer. The grant is the caller's check. */
export async function verifyConnectorToken(
  token: string | null,
  { fetchFn = fetch, nowMs = Date.now() }: ConnectorVerifyOptions = {},
): Promise<{ userId: string; clientId: string } | null> {
  const [h, p, s, extra] = (token ?? '').split('.');
  if (!h || !p || !s || extra !== undefined) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg?: unknown; kid?: unknown };
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
    const algorithm = typeof header.alg === 'string' ? ALGORITHMS[header.alg] : undefined;
    if (!algorithm || typeof header.kid !== 'string') return null;
    const meta = await authServerMetadata(fetchFn, nowMs);
    if (!meta) return null;
    if (claims.iss !== meta.issuer || typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null;
    const clientId = oauthClientOf(token);
    const userId = connectorUserId(claims);
    if (!clientId || !userId) return null;
    // An unknown kid may be a key Auth rotated in since the cache filled: look once more.
    let jwk = (await signingKeys(meta.jwksUri, fetchFn, nowMs, false)).find((k) => (k as { kid?: string }).kid === header.kid);
    jwk ??= (await signingKeys(meta.jwksUri, fetchFn, nowMs, true)).find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return null;
    const { d: _private, ...publicJwk } = jwk;
    const key = await webcrypto.subtle.importKey('jwk', publicJwk, algorithm[0], false, ['verify']);
    const valid = await webcrypto.subtle.verify(algorithm[1], key, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
    return valid ? { userId, clientId } : null;
  } catch {
    return null; // malformed, or the keys could not be read: fail closed
  }
}

/** What the consent page approves, as Supabase Auth records it for this user's session. */
export interface AuthorizationDetails {
  clientId: string;
  clientName: string;
  /** The scopes the client asked for, as Auth recorded them; null when Auth did not say. */
  scopes: string[] | null;
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
  const { client, scope } = (await res.json()) as { client?: { id?: unknown; name?: unknown }; scope?: unknown };
  if (typeof client?.id !== 'string' || !client.id) return null;
  return {
    clientId: client.id,
    clientName: typeof client.name === 'string' ? client.name.trim().slice(0, 80) : '',
    scopes: typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : null,
  };
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
