// WHO IS CALLING, and what may this credential do of what the account may do.
//
// `resolvePrincipal(req)` is the one door every permission-gated server path walks through
// (docs/AGENT_SAVE.md). It accepts two credentials today and is shaped so a third is one more
// branch:
//
//   Authorization: Bearer <Supabase JWT>     -> a SESSION: verifyUser() -> the account's full
//                                               entitlement, `granted: null` (everything the
//                                               account may do).
//   Authorization: Bearer noacg_ak_…          -> an AGENT KEY (migration 0050): hash lookup ->
//                                               the account's entitlement, `granted` = the
//                                               key's scopes, `keyId` for self-description.
//   Authorization: Bearer <OAuth client JWT>  -> a CONNECTOR (a chat client signed in through the
//                                               Supabase Auth OAuth server; its token carries
//                                               `client_id`): ONLY where the caller passes
//                                               `connector: true` (the MCP route). The token must
//                                               verify LOCALLY against Auth's JWKS (never via
//                                               Auth's /user), and the user must hold a LIVE
//                                               `connector_grants` row for that client (migration
//                                               0090): `granted` = the row's permissions. Every
//                                               other path resolves such a token to ANONYMOUS,
//                                               as verifyUser() does.
//   anything else / nothing                   -> ANONYMOUS: the anonymous defaults, no grants.
//
// The decision itself lives in src/entitlements/permissions.ts `permits()` - pure, shared with
// the browser and the tests. This module only RESOLVES; it never decides.
//
// FAILURE POSTURE: every lookup failure degrades to ANONYMOUS (fail closed), exactly as
// verifyUser() does - a database hiccup must never widen access, and a refused save is
// retryable while a wrongly admitted one is not.

import { resolveUserEntitlement } from './entitlements.js';
import { bearerToken, sha256 } from './http.js';
import { oauthClientOf, verifyUser } from './auth.js';
import { verifyConnectorToken } from './connectorAuth.js';
import { agentAccessConfigured, supabaseAgentAccessStore, type AgentAccessStore } from './agentAccessStore.js';
import { supabaseConnectorStore, type ConnectorStore } from './connectorStore.js';
import {
  NEVER_ON_AGENT_KEYS,
  anonymousPrincipal,
  isAgentKeyToken,
  isPermissionKey,
  type PermissionKey,
  type Principal,
} from '../../src/entitlements/permissions.js';

export interface PrincipalDeps {
  /** The key store; the Supabase one by default, an in-memory one under test. */
  store?: AgentAccessStore;
  /** Whether agent keys can be honoured on this deployment at all (service key configured). */
  configured?: () => boolean;
  /** Admit a connector's OAuth token. Only the MCP route passes this; everywhere else such a
   *  token is anonymous. */
  connector?: boolean;
  /** The connector grant store; the Supabase one by default. */
  grants?: ConnectorStore;
  /** The token check for a connector; Supabase Auth by default, a fake under test. */
  verifyConnector?: typeof verifyConnectorToken;
}

/** Resolve the caller of `req`. Never throws. */
export async function resolvePrincipal(req: Request, deps: PrincipalDeps = {}): Promise<Principal> {
  const token = bearerToken(req);

  // The connector path admits nothing else, and every other path admits no connector.
  if (deps.connector || oauthClientOf(token)) {
    const configured = deps.configured ?? agentAccessConfigured;
    try {
      const verified = deps.connector && configured() ? await (deps.verifyConnector ?? verifyConnectorToken)(token) : null;
      if (!verified) return anonymousPrincipal(await resolveUserEntitlement(null));
      const [grant, entitlement] = await Promise.all([
        (deps.grants ?? supabaseConnectorStore()).resolveGrant(verified.userId, verified.clientId),
        resolveUserEntitlement(verified.userId),
      ]);
      if (!grant) return anonymousPrincipal(await resolveUserEntitlement(null));
      const granted = grant.permissions.filter(isPermissionKey).filter((key) => !NEVER_ON_AGENT_KEYS.has(key));
      return {
        kind: 'connector',
        userId: verified.userId,
        entitlement,
        granted,
        clientId: verified.clientId,
        grantId: grant.id,
      };
    } catch {
      return anonymousPrincipal(await resolveUserEntitlement(null));
    }
  }

  if (isAgentKeyToken(token)) {
    const configured = deps.configured ?? agentAccessConfigured;
    if (!configured()) return anonymousPrincipal(await resolveUserEntitlement(null));
    try {
      const store = deps.store ?? supabaseAgentAccessStore();
      const key = await store.resolveKey(sha256(token));
      if (!key) return anonymousPrincipal(await resolveUserEntitlement(null));
      const granted: PermissionKey[] = key.scopes.filter(isPermissionKey);
      return {
        kind: 'agent-key',
        userId: key.userId,
        entitlement: await resolveUserEntitlement(key.userId),
        granted,
        keyId: key.id,
      };
    } catch {
      return anonymousPrincipal(await resolveUserEntitlement(null));
    }
  }

  const user = await verifyUser(token);
  if (user) {
    return { kind: 'session', userId: user.userId, entitlement: await resolveUserEntitlement(user.userId), granted: null };
  }
  return anonymousPrincipal(await resolveUserEntitlement(null));
}
