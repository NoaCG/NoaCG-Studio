// /api/me/connectors - the user's side of a chat client's CONNECTOR (docs/REMOTE_MCP_PLAN.md, key
// decisions 3 and 8): approve one from NoaCG's consent page, list them in Settings, revoke one.
//
//   POST { action: 'allow', authorizationId }   session -> { redirectUrl }
//   GET                                         session -> { connectors: [...] }
//   DELETE ?id=<uuid>                           session -> { revoked: true }
//
// ALLOW writes the grant FIRST and approves the Supabase authorization second, both here with the
// user's own session. The client a grant names is read from Supabase Auth's record of the
// authorization, never from the page, so a consent page cannot be made to grant another client.
// If the approval fails, a grant this call made is dropped again. DENY never reaches this file:
// the page tells Auth directly, and no grant row is ever written for it.
//
// REVOKE marks the row (the next tool call resolves to anonymous, because every call reads it) and
// then asks Auth to end the client's sessions, so its refresh token is refused too. The row is
// revoked even when Auth does not answer, and the call says so; revoking again repeats Auth's half.
//
// Only a SESSION may do any of this: verifyUser refuses a connector's own token, so a chat client
// cannot approve, list or revoke connectors. While Auth runs no OAuth server, every route answers
// 503 connector_disabled like the MCP endpoint.

import { apiError, bearerToken, json, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { checkAgentKeysRateLimit } from '../rateLimit.js';
import { approveAuthorization, authorizationDetails, connectorEnabled, revokeClientSessions } from '../connectorAuth.js';
import { supabaseConnectorStore, type ConnectorStore } from '../connectorStore.js';
import { connectorDisabled } from './mcp.js';
import { CONNECTOR_PERMISSIONS } from '../../../src/entitlements/permissions.js';

const MAX_BODY_BYTES = 2_000;
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConnectorView {
  id: string;
  name: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ConnectorsDeps {
  store?: ConnectorStore;
  enabled?: () => Promise<boolean>;
  user?: typeof verifyUser;
  details?: typeof authorizationDetails;
  approve?: typeof approveAuthorization;
  endSessions?: typeof revokeClientSessions;
}

export function createConnectorsHandler(deps: ConnectorsDeps = {}): { fetch(req: Request): Promise<Response> } {
  const enabled = deps.enabled ?? (() => connectorEnabled());
  const storeOf = (): ConnectorStore => deps.store ?? supabaseConnectorStore();
  const user = deps.user ?? verifyUser;
  const details = deps.details ?? authorizationDetails;
  const approve = deps.approve ?? approveAuthorization;
  const endSessions = deps.endSessions ?? revokeClientSessions;

  async function allow(token: string, userId: string, body: Record<string, unknown>): Promise<Response> {
    const authorizationId = typeof body.authorizationId === 'string' ? body.authorizationId : '';
    if (!AUTHORIZATION_ID.test(authorizationId)) return apiError('invalid', '`authorizationId` is required.', 400);
    const request = await details(token, authorizationId);
    if (!request) return apiError('not_found', 'This sign-in request is unknown or has expired. Start again from the chat.', 404);
    const store = storeOf();
    const { row, created } = await store.createGrant({
      userId,
      clientId: request.clientId,
      clientName: request.clientName,
      permissions: [...CONNECTOR_PERMISSIONS],
    });
    const redirectUrl = await approve(token, authorizationId).catch(() => null);
    if (!redirectUrl) {
      if (created) await store.revokeGrant(userId, row.id);
      return apiError('unavailable', 'Supabase Auth did not accept the approval. Start again from the chat.', 502);
    }
    return json({ redirectUrl });
  }

  async function revoke(token: string, userId: string, id: string): Promise<Response> {
    if (!UUID.test(id)) return apiError('invalid', '`id` must be a connector id.', 400);
    const revoked = await storeOf().revokeGrant(userId, id);
    if (!revoked) return apiError('not_found', 'No such connector.', 404);
    if (!(await endSessions(token, revoked.clientId).catch(() => false))) {
      return apiError('unavailable', 'The connector can no longer use NoaCG, but its sign-in could not be ended. Try Revoke again.', 502);
    }
    return json({ revoked: true });
  }

  async function route(req: Request): Promise<Response> {
    if (!(await enabled())) return connectorDisabled();
    const limited = checkAgentKeysRateLimit(req);
    if (limited) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, { 'retry-after': String(limited.retryAfterSec) });
    const token = bearerToken(req);
    const who = await user(token);
    if (!token || !who) return apiError('unauthorized', 'Sign in to manage connectors.', 401);

    if (req.method === 'GET') {
      const grants = await storeOf().listGrants(who.userId);
      const connectors: ConnectorView[] = grants.map((g) => ({
        id: g.id,
        name: g.clientName,
        permissions: g.permissions,
        createdAt: g.createdAt,
        lastUsedAt: g.lastUsedAt,
      }));
      return json({ connectors });
    }
    if (req.method === 'DELETE') return revoke(token, who.userId, new URL(req.url).searchParams.get('id') ?? '');
    if (req.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = await readJson<Record<string, unknown>>(req, MAX_BODY_BYTES);
      } catch {
        return apiError('invalid', 'The body must be JSON.', 400);
      }
      if (body?.action === 'allow') return allow(token, who.userId, body);
      return apiError('invalid', 'Unknown action.', 400);
    }
    return apiError('invalid', `${req.method} not allowed`, 405);
  }

  return {
    async fetch(req) {
      try {
        return await route(req);
      } catch {
        return apiError('internal', 'Something went wrong. Try again.', 500);
      }
    },
  };
}

export default createConnectorsHandler();
