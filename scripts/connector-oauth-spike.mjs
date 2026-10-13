#!/usr/bin/env node
// The remote MCP connector's sign-in, end to end against a LOCAL Supabase stack, the way a chat
// client does it (docs/REMOTE_MCP_PLAN.md, AC-1 and key decision 4):
//
//   1. read the authorization server's discovery metadata and its JWKS;
//   2. register a client dynamically (no apikey, as Claude.ai or ChatGPT would);
//   3. run the authorization code flow with PKCE (S256) as a throwaway test account, standing in
//      for the consent page with the account's own session;
//   4. exchange the code, verify the access token's ES256 signature against the JWKS, and read its
//      `client_id` and `role`;
//   5. probe the token boundary: the connector token against PostgREST (a table read, a write, a
//      capability-slug RPC) and Storage, the same read with a first-party token, a refresh, and
//      Auth's own account endpoints (the user read and changed, MFA enrolment, the client's
//      grants, another client's request read and approved, sign-out), which the access token
//      hook (migration 0091, issue #1083) makes refuse it;
//   6. ask whether a port-agnostic loopback redirect (`http://localhost/callback` registered,
//      `http://localhost:<port>/callback` used, as Claude Code does) is accepted.
//
// Run it with a local stack up (`npx supabase@2.111.0 start`, the version CI pins):
//   node scripts/connector-oauth-spike.mjs            # reads `supabase status` for URL and keys
//   node scripts/connector-oauth-spike.mjs --json     # the full evidence as JSON
// VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY win when set, which is
// how e2e/configured/connector-oauth.spec.ts runs it on CI's local stack. It refuses any URL that
// is not localhost, unless NOACG_CONNECTOR_TEST_REF names the hosted test project the URL
// points at (never production): it creates and deletes an account and OAuth clients.
// Exit 1 when a step of AC-1, decision 4 or the account lock fails.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PINNED_CLI = '2.111.0';
export const CONNECTOR_ROLE = 'noacg_connector';
/** What NoaCG's protected resource metadata advertises (api/_lib/me/mcp.ts CONNECTOR_SCOPES).
 *  Never `openid`: its ID token is a second bearer the hook never sees (connectors.ts refuses it). */
export const CONNECTOR_SCOPE = 'email';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decodePart = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Header and payload of a JWT, unverified. */
export function decodeJwt(token) {
  const [h, p] = String(token).split('.');
  return { header: decodePart(h), payload: decodePart(p) };
}

/** True when the JWT's signature verifies against the JWKS key with its `kid` (ES256 or RS256). */
export async function verifyJwt(token, jwks) {
  const [h, p, s] = token.split('.');
  const { alg, kid } = decodePart(h);
  const jwk = (jwks.keys ?? []).find((k) => k.kid === kid);
  if (!jwk) return false;
  const params =
    alg === 'ES256' ? [{ name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }]
    : alg === 'RS256' ? [{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }]
    : null;
  if (!params) return false;
  const pub = { ...jwk };
  delete pub.d;
  const key = await webcrypto.subtle.importKey('jwk', pub, params[0], false, ['verify']);
  return webcrypto.subtle.verify(params[1], key, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
}

export function isLocalUrl(url) {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The project the connector's acceptance never runs against: production, which has real users. */
const NEVER_REFS = ['kprolrchuldgfrzspthy'];

/** Where the connector's acceptance may create accounts and OAuth clients: a local stack, or the
 *  ONE hosted test project named on purpose in NOACG_CONNECTOR_TEST_REF (a preview branch, or
 *  staging once the owner has switched it on), which must be the project the URL points at
 *  (docs/REMOTE_MCP_PLAN.md, phase 5 and the owner's steps). */
export function isConnectorTestStack(url, env = process.env) {
  if (isLocalUrl(url)) return true;
  const ref = env.NOACG_CONNECTOR_TEST_REF ?? '';
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url ?? '');
  return Boolean(ref && match && match[1] === ref && !NEVER_REFS.includes(ref));
}

/** The stack's URL and keys: the environment first, else `npx supabase@<pin> status -o json`. */
export function localStack(env = process.env) {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY) {
    return { apiUrl: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const out = execFileSync('npx', ['-y', `supabase@${PINNED_CLI}`, 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  });
  const status = JSON.parse(out.slice(out.indexOf('{')));
  return { apiUrl: status.API_URL, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
}

async function call(url, { method = 'GET', headers = {}, json, form, redirect = 'follow' } = {}) {
  const init = { method, headers: { ...headers }, redirect };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: keep the text */
  }
  return { status: res.status, location: res.headers.get('location'), body };
}

/** One line of evidence for a probe answer: status and the error code or message, never a token. */
const brief = (r) => {
  const b = r.body && typeof r.body === 'object' ? r.body : {};
  const why = b.error_code ?? b.code ?? b.error ?? b.statusCode ?? '';
  const msg = b.message ?? b.msg ?? b.error_description ?? (typeof r.body === 'string' ? r.body.slice(0, 120) : '');
  return `${r.status}${why ? ` ${why}` : ''}${msg ? ` - ${msg}` : ''}`;
};

/**
 * Run the whole flow and return the evidence. `checks` holds what AC-1 and decision 4 require
 * (each { ok, detail }); `findings` holds answers recorded for the next phases, not judged here.
 * @param {{ apiUrl: string, anonKey: string, serviceKey: string, log?: (line: string) => unknown }} stack
 * @returns {Promise<{ checks: Record<string, { ok: boolean, detail: string }>, findings: Record<string, string> }>}
 */
export async function runConnectorSpike({ apiUrl, anonKey, serviceKey, log = () => {} }) {
  if (!isConnectorTestStack(apiUrl)) throw new Error(`refusing ${apiUrl}: the spike runs against a local stack, or a hosted test project named in NOACG_CONNECTOR_TEST_REF`);
  const base = apiUrl.replace(/\/$/, '');
  const auth = `${base}/auth/v1`;
  const rest = `${base}/rest/v1`;
  const storage = `${base}/storage/v1`;
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const checks = {};
  const findings = {};
  const check = (name, ok, detail) => {
    checks[name] = { ok: Boolean(ok), detail };
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  };
  const note = (name, detail) => {
    findings[name] = detail;
    log(`NOTE  ${name}: ${detail}`);
  };
  const cleanup = { userId: '', clients: [] };

  try {
    // 1. Discovery and keys.
    const disco = await call(`${auth}/.well-known/oauth-authorization-server`);
    const meta = disco.body ?? {};
    check(
      'discovery',
      disco.status === 200 && meta.registration_endpoint && (meta.code_challenge_methods_supported ?? []).includes('S256'),
      `${disco.status}; issuer ${meta.issuer}; registration ${meta.registration_endpoint ?? 'none'}; PKCE ${JSON.stringify(meta.code_challenge_methods_supported)}`,
    );
    if (disco.status !== 200) return { checks, findings };
    const rfc8414Url = `${new URL(apiUrl).origin}/.well-known/oauth-authorization-server/auth/v1`;
    const [rfc8414, keys] = await Promise.all([call(rfc8414Url), call(meta.jwks_uri ?? `${auth}/.well-known/jwks.json`)]);
    note('discovery_path_inserted', `${rfc8414Url} answers ${rfc8414.status} (RFC 8414 form a client derives from the issuer)`);
    const jwks = keys.body ?? { keys: [] };
    /** The authorize URL a browser opens for these parameters. */
    const authorizeHref = (params) => `${meta.authorization_endpoint}?${new URLSearchParams(params)}`;
    note('jwks', (jwks.keys ?? []).map((k) => `${k.kid} ${k.alg ?? k.kty}`).join(', ') || 'no keys');

    // 2. A throwaway account, and its first-party session (what the consent page holds).
    const email = `connector-spike-${Date.now()}@example.test`;
    const password = `spike-${b64url(randomBytes(9))}`;
    const created = await call(`${auth}/admin/users`, { method: 'POST', headers: admin, json: { email, password, email_confirm: true } });
    cleanup.userId = created.body?.id ?? '';
    const signedIn = await call(`${auth}/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey }, json: { email, password } });
    const userToken = signedIn.body?.access_token;
    const firstParty = userToken ? decodeJwt(userToken) : null;
    check(
      'first_party_session',
      Boolean(userToken) && !firstParty.payload.client_id && firstParty.payload.role === 'authenticated',
      userToken ? `alg ${firstParty.header.alg}; role ${firstParty.payload.role}; client_id ${firstParty.payload.client_id ?? 'absent'}` : brief(signedIn),
    );
    if (!userToken) return { checks, findings };

    // 3. Dynamic client registration, no apikey: a chat client has none.
    const redirectUri = 'http://127.0.0.1:53682/callback';
    const reg = await call(meta.registration_endpoint, {
      method: 'POST',
      json: {
        client_name: 'NoaCG connector spike',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
    });
    const clientId = reg.body?.client_id;
    if (clientId) cleanup.clients.push(clientId);
    check('dynamic_registration', reg.status === 201 && clientId, clientId ? `${reg.status}; client_id ${clientId}` : brief(reg));
    if (!clientId) return { checks, findings };

    // 4. Authorization code flow with PKCE.
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const state = b64url(randomBytes(12));
    const authorize = await call(authorizeHref({
      response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
      code_challenge: challenge, code_challenge_method: 'S256', state, scope: CONNECTOR_SCOPE,
    }), { redirect: 'manual' });
    const consentUrl = authorize.location ? new URL(authorize.location) : null;
    const authorizationId = consentUrl?.searchParams.get('authorization_id');
    check(
      'authorize_redirects_to_consent',
      authorize.status === 302 && authorizationId,
      authorizationId ? `302 to ${consentUrl.origin}${consentUrl.pathname}?authorization_id=…` : `${brief(authorize)} location ${authorize.location}`,
    );
    if (!authorizationId) return { checks, findings };

    // What the consent page does, with the signed-in account's own session.
    const asUser = { apikey: anonKey, Authorization: `Bearer ${userToken}` };
    const asPage = { ...asUser, Origin: consentUrl.origin };
    const details = await call(`${auth}/oauth/authorizations/${authorizationId}`, { headers: asPage });
    note('consent_details', details.status === 200
      ? `client "${details.body?.client?.name}", scope "${details.body?.scope}", redirect ${details.body?.redirect_uri}`
      : brief(details));
    const consent = await call(`${auth}/oauth/authorizations/${authorizationId}/consent`, { method: 'POST', headers: asPage, json: { action: 'approve' } });
    const back = consent.body?.redirect_url ? new URL(consent.body.redirect_url) : null;
    const code = back?.searchParams.get('code');
    check(
      'consent_returns_code',
      code && back.searchParams.get('state') === state && back.href.startsWith(redirectUri),
      code ? `redirect to ${back.origin}${back.pathname} with code and the same state` : brief(consent),
    );
    if (!code) return { checks, findings };

    // 5. Exchange the code with the verifier (form-encoded, public client).
    const token = await call(meta.token_endpoint, {
      method: 'POST',
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
    });
    const accessToken = token.body?.access_token;
    const claims = accessToken ? decodeJwt(accessToken) : null;
    check(
      'token_carries_client_id',
      accessToken && claims.payload.client_id === clientId && claims.payload.noacg_uid === cleanup.userId,
      accessToken
        ? `client_id ${claims.payload.client_id}; noacg_uid ${claims.payload.noacg_uid === cleanup.userId ? 'is the test account' : 'MISSING'}; aud ${JSON.stringify(claims.payload.aud)}; scope "${claims.payload.scope ?? ''}"; refresh token ${token.body.refresh_token ? 'issued' : 'absent'}; id_token ${token.body.id_token ? 'issued' : 'absent'}`
        : brief(token),
    );
    if (!accessToken) return { checks, findings };
    const verified = await verifyJwt(accessToken, jwks);
    check('token_signed_asymmetric', verified && claims.header.alg !== 'HS256', `alg ${claims.header.alg}, kid ${claims.header.kid}, signature ${verified ? 'verifies' : 'does NOT verify'} against the JWKS`);

    // 6. Decision 4: the token boundary.
    check('connector_role', claims.payload.role === CONNECTOR_ROLE, `role claim "${claims.payload.role}" (hook ${claims.payload.role === CONNECTOR_ROLE ? 'applied' : 'not applied'})`);
    const asConnector = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
    const list = { prefix: '', limit: 1 };
    const [userRead, userObjects, read, write, rpc, rpcAnon, objects] = await Promise.all([
      call(`${rest}/documents?select=id&limit=1`, { headers: asUser }),
      call(`${storage}/object/list/user-assets`, { method: 'POST', headers: asUser, json: list }),
      call(`${rest}/documents?select=id&limit=1`, { headers: asConnector }),
      call(`${rest}/documents`, { method: 'POST', headers: { ...asConnector, Prefer: 'return=minimal' }, json: {} }),
      call(`${rest}/rpc/control_show_by_slug`, { method: 'POST', headers: asConnector, json: { p_slug: 'connector-spike' } }),
      call(`${rest}/rpc/control_show_by_slug`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, json: { p_slug: 'connector-spike' } }),
      call(`${storage}/object/list/user-assets`, { method: 'POST', headers: asConnector, json: list }),
    ]);
    // Refused for the role, not for another reason: a bad audience or an unknown key is a 401 too.
    const roleRefused = (r) => r.status >= 400 && brief(r).includes(`permission denied to set role "${CONNECTOR_ROLE}"`);
    check(
      'first_party_rest_allowed',
      userRead.status === 200 && userObjects.status === 200,
      `GET documents with a first-party token: ${brief(userRead)} | storage list user-assets: ${brief(userObjects)}`,
    );
    check(
      'connector_rest_refused',
      [read, write, rpc, objects].every(roleRefused),
      `GET documents ${brief(read)} | POST documents ${brief(write)} | rpc control_show_by_slug ${brief(rpc)} (anon key alone: ${rpcAnon.status}) | storage list user-assets ${brief(objects)}`,
    );

    // Refresh: the new token keeps client_id and the hook's role.
    const refreshed = await call(meta.token_endpoint, {
      method: 'POST',
      form: { grant_type: 'refresh_token', refresh_token: token.body.refresh_token ?? '', client_id: clientId },
    });
    const rClaims = refreshed.body?.access_token ? decodeJwt(refreshed.body.access_token).payload : null;
    check(
      'refresh_keeps_boundary',
      rClaims && rClaims.client_id === clientId && rClaims.role === CONNECTOR_ROLE && rClaims.noacg_uid === cleanup.userId && rClaims.sub !== cleanup.userId
        && Boolean(refreshed.body.refresh_token) && refreshed.body.refresh_token !== token.body.refresh_token,
      rClaims
        ? `client_id ${rClaims.client_id === clientId ? 'kept' : 'lost'}; role "${rClaims.role}"; noacg_uid ${rClaims.noacg_uid === cleanup.userId ? 'kept' : 'lost'}; sub ${rClaims.sub === cleanup.userId ? 'is the user id' : 'is not the user id'}; refresh token ${!refreshed.body.refresh_token ? 'missing' : refreshed.body.refresh_token !== token.body.refresh_token ? 'rotated' : 'reused'}`
        : brief(refreshed),
    );

    // The account lock (issue #1083, migration 0091): `sub` is no UUID and `session_id` names no
    // session, so every Auth endpoint that acts as the user refuses the connector's token before
    // reading anything. Each probe is a step a holder of the token would take toward the account.
    // ...and the client holds no second bearer: with the `email` scope Auth issues no ID token,
    // which would carry the real `sub` and no session (Auth's /user accepted one on a hosted
    // branch: GET and PUT 200, the metadata changed).
    check(
      'account_claims_locked',
      claims.payload.sub !== cleanup.userId && !UUID_RE.test(claims.payload.sub ?? '') && UUID_RE.test(claims.payload.session_id ?? '')
        && claims.payload.session_id !== firstParty.payload.session_id && !token.body.id_token,
      `sub "${String(claims.payload.sub).replace(cleanup.userId, '<user id>')}"; session_id ${UUID_RE.test(claims.payload.session_id ?? '') ? 'a UUID' : 'NOT a UUID'}; id_token ${token.body.id_token ? 'ISSUED' : 'none'} for scope "${CONNECTOR_SCOPE}"`,
    );
    // The account's own session still reaches its account (asked before the probes below, which
    // would sign it out if the lock ever failed).
    const ownUser = await call(`${auth}/user`, { headers: asUser });
    check('first_party_account_allowed', ownUser.status === 200 && ownUser.body?.id === cleanup.userId, `GET /auth/v1/user with the first-party session: ${brief(ownUser)}`);
    // Another client's pending request: approving it with the connector's token would grant a
    // client the user never saw, and that grant would survive revoking the first.
    const otherReg = await call(meta.registration_endpoint, {
      method: 'POST',
      json: { client_name: 'NoaCG connector spike (other)', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' },
    });
    if (otherReg.body?.client_id) cleanup.clients.push(otherReg.body.client_id);
    const otherAuthorize = otherReg.body?.client_id
      ? await call(authorizeHref({
        response_type: 'code', client_id: otherReg.body.client_id, redirect_uri: redirectUri,
        code_challenge: challenge, code_challenge_method: 'S256', scope: CONNECTOR_SCOPE,
      }), { redirect: 'manual' })
      : null;
    const otherId = otherAuthorize?.location ? new URL(otherAuthorize.location).searchParams.get('authorization_id') : null;
    const none = { status: 0, body: `no second request (registration ${otherReg.status}, authorize ${otherAuthorize ? brief(otherAuthorize) : 'not tried'})` };
    const probes = {
      'GET /user': await call(`${auth}/user`, { headers: asConnector }),
      'PUT /user metadata': await call(`${auth}/user`, { method: 'PUT', headers: asConnector, json: { data: { connector_spike_probe: true } } }),
      'PUT /user password': await call(`${auth}/user`, { method: 'PUT', headers: asConnector, json: { password: `taken-${b64url(randomBytes(9))}` } }),
      'POST /factors': await call(`${auth}/factors`, { method: 'POST', headers: asConnector, json: { factor_type: 'totp', friendly_name: 'spike' } }),
      'GET /user/oauth/grants': await call(`${auth}/user/oauth/grants`, { headers: asConnector }),
      'GET another request': otherId ? await call(`${auth}/oauth/authorizations/${otherId}`, { headers: asConnector }) : none,
      'approve another client': otherId
        ? await call(`${auth}/oauth/authorizations/${otherId}/consent`, { method: 'POST', headers: asConnector, json: { action: 'approve' } })
        : none,
      'POST /logout global': await call(`${auth}/logout?scope=global`, { method: 'POST', headers: asConnector }),
    };
    const after = await call(`${auth}/admin/users/${cleanup.userId}`, { headers: admin });
    const changed = Boolean(after.body?.user_metadata?.connector_spike_probe);
    const ownPassword = await call(`${auth}/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey }, json: { email, password } });
    check(
      'connector_account_refused',
      Boolean(otherId) && Object.values(probes).every((r) => r.status >= 400) && !changed && ownPassword.status === 200,
      `${Object.entries(probes).map(([what, r]) => `${what} ${brief(r)}`).join(' | ')}; metadata ${changed ? 'CHANGED' : 'unchanged'}; the account's own password ${ownPassword.status === 200 ? 'still signs in' : `fails (${brief(ownPassword)})`}`,
    );

    // 7. Port-agnostic loopback: Claude Code's callback is http://localhost:<any port>/callback.
    const loopReg = await call(meta.registration_endpoint, {
      method: 'POST',
      json: { client_name: 'NoaCG connector spike (loopback)', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], token_endpoint_auth_method: 'none' },
    });
    if (loopReg.body?.client_id) cleanup.clients.push(loopReg.body.client_id);
    const tryRedirect = async (uri) => {
      const r = await call(authorizeHref({ response_type: 'code', client_id: loopReg.body?.client_id ?? '', redirect_uri: uri, code_challenge: challenge, code_challenge_method: 'S256' }), { redirect: 'manual' });
      return r.status === 302 && r.location?.includes('authorization_id=') ? 'accepted' : `refused (${brief(r)})`;
    };
    if (loopReg.body?.client_id) {
      const [anyLocalhost, anyLoopback, exact] = await Promise.all(
        ['http://localhost:49152/callback', 'http://127.0.0.1:49152/callback', 'http://localhost/callback'].map(tryRedirect),
      );
      note('loopback_port_agnostic', `registered without a port: localhost:49152 ${anyLocalhost}, 127.0.0.1:49152 ${anyLoopback}, exact http://localhost/callback ${exact}; registered with its port (step 3, as a client that registers per connection does): accepted`);
    } else {
      note('loopback_port_agnostic', `registration without a port: ${brief(loopReg)}`);
    }
  } finally {
    await Promise.all([
      ...cleanup.clients.map((id) => call(`${auth}/admin/oauth/clients/${id}`, { method: 'DELETE', headers: admin })),
      cleanup.userId && call(`${auth}/admin/users/${cleanup.userId}`, { method: 'DELETE', headers: admin }),
    ].map((p) => Promise.resolve(p).catch(() => {})));
  }
  return { checks, findings };
}

/** The required checks a report did not pass. */
export const failedChecks = (report) => REQUIRED_CHECKS.filter((name) => !report.checks[name]?.ok);

/** The steps every run must pass. */
export const REQUIRED_CHECKS = [
  'discovery', 'first_party_session', 'dynamic_registration', 'authorize_redirects_to_consent',
  'consent_returns_code', 'token_carries_client_id', 'token_signed_asymmetric', 'connector_role',
  'first_party_rest_allowed', 'connector_rest_refused', 'refresh_keeps_boundary',
  'account_claims_locked', 'connector_account_refused', 'first_party_account_allowed',
];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const json = process.argv.includes('--json');
  let stack;
  try {
    stack = localStack();
  } catch {
    console.error(`No local stack answered. Start one with: npx supabase@${PINNED_CLI} start`);
    process.exit(1);
  }
  const report = await runConnectorSpike({ ...stack, log: json ? () => {} : (line) => console.log(line) });
  const missing = failedChecks(report);
  if (json) console.log(JSON.stringify(report, null, 2));
  console.log(missing.length ? `\nFAILED: ${missing.join(', ')}` : `\nAll ${REQUIRED_CHECKS.length} required checks pass.`);
  process.exit(missing.length ? 1 : 0);
}
