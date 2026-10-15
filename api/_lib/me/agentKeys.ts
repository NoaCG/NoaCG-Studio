// /api/me/agent-keys - mint, list and revoke the SCOPED AGENT KEYS a coding agent's CLI holds
// (docs/AGENT_SAVE.md, migration 0050).
//
//   POST { action: 'begin',  name, challenge }   JWT required   -> { code, expiresIn }
//   POST { action: 'redeem', code, verifier }    no auth        -> 201 { key, id, name, prefix, scopes, createdAt,
//                                                                       account, deployment }
//   GET                                          JWT or key     -> a session: { keys: [...] };
//                                                                  an agent key: { key: {...its own row},
//                                                                                  account, deployment }
//   DELETE ?id=<uuid>                            JWT            -> { revoked: true }
//   DELETE (no id)                               an agent key   -> revokes ITSELF (noacg logout)
//
// THE HANDOFF, so the key never transits the browser. The CLI invents a PKCE verifier, opens the
// consent page with sha256(verifier) as `challenge`, and listens on 127.0.0.1. Consent calls
// `begin` with the user's session: a ONE-TIME CODE is minted (hashed at rest, 120 s, bound to
// that challenge) and the browser carries the plaintext code to the loopback listener. The CLI
// calls `redeem` with the code AND the verifier - the server consumes the code atomically,
// checks the verifier against the stored challenge, mints the key and returns its plaintext
// exactly once. A wrong verifier still burns the code (an intercepted code must not remain
// redeemable), and a second redeem of the same code finds nothing.
//
// WHAT A KEY CARRIES: exactly AGENT_KEY_PERMISSIONS (`graphics:create` in v1). The list is
// minted here, never taken from the request - a consent page cannot ask for more than the
// release offers, and `playout:operate` is refused structurally (NEVER_ON_AGENT_KEYS).
//
// WHICH ACCOUNT. Redeem and a key describing itself (`noacg whoami`) also answer `account` - the
// account's id and sign-in email - and `deployment`, the origin that answered: the identity the
// consent page showed and every delivery receipt carries (deliveries.ts), so the key, the consent
// and the saves visibly name one account. It is the key owner's own identity, not access to
// anything in the account.
//
// The handler is a FACTORY over the store interface so every decision here runs under
// `node --test` with no network (agentKeys.test.ts). The default export binds the Supabase
// store; an instance with no service key answers every route with one honest 503.

import { apiError, bearerToken, json, newSecret, readJson, sha256 } from '../http.js';
import { verifyUser } from '../auth.js';
import { checkAgentKeysRateLimit, checkAgentRedeemRateLimit } from '../rateLimit.js';
import { agentAccessConfigured, supabaseAgentAccessStore, type AgentAccessStore, type AgentKeyRow } from '../agentAccessStore.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { accountFor } from './deliveries.js';
import {
  AGENT_KEY_PERMISSIONS,
  AGENT_KEY_PREFIX,
  NEVER_ON_AGENT_KEYS,
  isAgentKeyToken,
} from '../../../src/entitlements/permissions.js';

/** How long a minted code stays redeemable. Long enough for a browser redirect and a CLI round
 *  trip, short enough that a code left in a log is worthless by the time anyone reads it. */
export const AUTH_CODE_TTL_SEC = 120;

/** The consent name ("Claude Code on LAPTOP-7"); display only, so the cap is about the list. */
export const MAX_KEY_NAME = 80;

/** Comfortably above the largest legal body (a name, a hex challenge, a hex code, a verifier). */
const MAX_BODY_BYTES = 4_000;

/** The hex sha256 the CLI sends as the challenge, and the only challenge shape accepted. */
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export interface AgentKeysDeps extends PrincipalDeps {
  store?: AgentAccessStore;
  configured?: () => boolean;
  now?: () => Date;
  /** The secret generator - the real one by default; a test may pin it. */
  secret?: () => string;
}

/** The public shape of a key row - the plaintext is never in it. */
export interface AgentKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export function keyView(row: AgentKeyRow): AgentKeyView {
  return { id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt };
}

/** The display prefix the Settings list shows: the marker + the first 6 secret characters. */
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, AGENT_KEY_PREFIX.length + 6) + '…';
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_KEY_NAME) return null;
  return name;
}

const rateLimited = (retryAfterSec: number): Response =>
  apiError('rate_limited', 'Too many requests - slow down.', 429, {}, { 'retry-after': String(retryAfterSec) });

export function createAgentKeysHandler(deps: AgentKeysDeps = {}): { fetch(req: Request): Promise<Response> } {
  const configured = deps.configured ?? agentAccessConfigured;
  const now = deps.now ?? (() => new Date());
  const secret = deps.secret ?? newSecret;
  const storeOf = (): AgentAccessStore => deps.store ?? supabaseAgentAccessStore();

  // The authoring permission list, checked once at module use rather than trusted by name: a
  // later edit that put a playout verb into AGENT_KEY_PERMISSIONS must fail loudly here.
  const scopes = AGENT_KEY_PERMISSIONS.filter((key) => !NEVER_ON_AGENT_KEYS.has(key)) as string[];

  async function begin(req: Request, body: Record<string, unknown>): Promise<Response> {
    const token = bearerToken(req);
    // Only a SESSION can consent to a new key. A key presenting itself here is the wrong
    // credential by design, and the message says so rather than 401ing vaguely.
    if (isAgentKeyToken(token)) return apiError('forbidden', 'An agent key cannot mint another key - sign in to allow access.', 403);
    const user = await verifyUser(token);
    if (!user) return apiError('unauthorized', 'Sign in to allow agent access.', 401);
    const name = cleanName(body.name);
    if (!name) return apiError('invalid', `\`name\` is required (1-${MAX_KEY_NAME} characters).`, 400);
    const challenge = typeof body.challenge === 'string' ? body.challenge.toLowerCase() : '';
    if (!HEX_SHA256.test(challenge)) return apiError('invalid', '`challenge` must be the hex sha256 of the verifier.', 400);

    const store = storeOf();
    const code = secret();
    const at = now();
    await store.createCode({
      codeHash: sha256(code),
      userId: user.userId,
      name,
      scopes,
      challenge,
      expiresAt: new Date(at.getTime() + AUTH_CODE_TTL_SEC * 1000).toISOString(),
    });
    // Hygiene on the way through: anything whose expiry is a day old can go.
    await store.purgeExpiredCodes(new Date(at.getTime() - 24 * 3600 * 1000).toISOString());
    return json({ code, expiresIn: AUTH_CODE_TTL_SEC, scopes });
  }

  async function redeem(req: Request, body: Record<string, unknown>): Promise<Response> {
    const refused = checkAgentRedeemRateLimit(req);
    if (refused) return rateLimited(refused.retryAfterSec);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const verifier = typeof body.verifier === 'string' ? body.verifier.trim() : '';
    if (!code || !verifier) return apiError('invalid', '`code` and `verifier` are required.', 400);

    const store = storeOf();
    // Consumed FIRST, whatever the verifier says: a code is single use even when the redeem
    // that spent it was the wrong party's.
    const bound = await store.consumeCode(sha256(code));
    if (!bound) return apiError('invalid', 'This code is unknown, already used or expired - run `noacg login` again.', 400);
    if (sha256(verifier) !== bound.challenge) {
      return apiError('invalid', 'The verifier does not match this code - run `noacg login` again.', 400);
    }
    const plaintext = `${AGENT_KEY_PREFIX}${secret()}`;
    const row = await store.createKey({
      userId: bound.userId,
      name: bound.name,
      keyHash: sha256(plaintext),
      prefix: keyPrefix(plaintext),
      // The scopes the code was minted with - i.e. what consent showed, never the request's.
      scopes: bound.scopes.filter((s) => !NEVER_ON_AGENT_KEYS.has(s as never)),
    });
    // The plaintext, ONCE. Nothing stores it; nothing can return it again.
    const account = await accountFor(store, bound.userId);
    return json({ key: plaintext, ...keyView(row), account, deployment: new URL(req.url).origin }, 201);
  }

  async function list(req: Request): Promise<Response> {
    const principal = await resolvePrincipal(req, { store: deps.store, configured });
    const store = storeOf();
    if (principal.kind === 'agent-key' && principal.keyId) {
      const row = await store.keyById(principal.keyId);
      if (!row) return apiError('unauthorized', 'This key is no longer valid.', 401);
      return json({ key: keyView(row), account: await accountFor(store, row.userId), deployment: new URL(req.url).origin });
    }
    if (principal.kind !== 'session' || !principal.userId) {
      return apiError('unauthorized', 'Sign in to see your agent keys.', 401);
    }
    const rows = await store.listKeys(principal.userId);
    return json({ keys: rows.map(keyView) });
  }

  async function revoke(req: Request): Promise<Response> {
    const principal = await resolvePrincipal(req, { store: deps.store, configured });
    const store = storeOf();
    const id = new URL(req.url).searchParams.get('id');
    // An agent key may revoke ITSELF (noacg logout) and nothing else.
    if (principal.kind === 'agent-key' && principal.keyId && principal.userId) {
      if (id && id !== principal.keyId) return apiError('forbidden', 'An agent key can only revoke itself.', 403);
      const ok = await store.revokeKey(principal.userId, principal.keyId);
      return ok ? json({ revoked: true }) : apiError('not_found', 'This key is no longer valid.', 404);
    }
    if (principal.kind !== 'session' || !principal.userId) {
      return apiError('unauthorized', 'Sign in to revoke an agent key.', 401);
    }
    if (!id) return apiError('invalid', '`id` is required.', 400);
    const ok = await store.revokeKey(principal.userId, id);
    return ok ? json({ revoked: true }) : apiError('not_found', 'No such key.', 404);
  }

  return {
    async fetch(req: Request): Promise<Response> {
      if (!configured()) {
        return apiError('unavailable', 'This NoaCG has no account backend, so agent keys are not available here.', 503);
      }
      // Pre-body, like every other burst gate: refuse a hammering client before parsing.
      const refused = checkAgentKeysRateLimit(req);
      if (refused) return rateLimited(refused.retryAfterSec);

      try {
        if (req.method === 'GET') return await list(req);
        if (req.method === 'DELETE') return await revoke(req);
        if (req.method !== 'POST') return apiError('invalid', `${req.method} not allowed`, 405);

        let body: unknown;
        try {
          body = await readJson<unknown>(req, MAX_BODY_BYTES);
        } catch (e) {
          const tooLarge = (e as { code?: string }).code === 'too_large';
          return apiError(tooLarge ? 'too_large' : 'invalid', tooLarge ? 'Request body too large.' : 'The body must be JSON.', tooLarge ? 413 : 400);
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError('invalid', 'The body must be a JSON object.', 400);
        const record = body as Record<string, unknown>;
        if (record.action === 'begin') return await begin(req, record);
        if (record.action === 'redeem') return await redeem(req, record);
        return apiError('invalid', '`action` must be "begin" or "redeem".', 400);
      } catch (e) {
        console.error('[agent-keys]', e instanceof Error ? e.message : e);
        return apiError('internal', 'Request failed.', 500);
      }
    },
  };
}

export default createAgentKeysHandler();
