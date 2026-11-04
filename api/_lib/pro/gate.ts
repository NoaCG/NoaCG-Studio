// The ONE admission decision hosted Pro is made of, so the status endpoint, the reservation
// endpoint and the gateway proxy cannot disagree about whether a caller may generate.
//
// This is the lesson `api/_lib/lite/status.ts` already carries in a comment ("if this drifts,
// the panel promises an allowance the reservation will not honour") written as code instead:
// three callers, one function, one answer.

import { bearerToken } from '../http.js';
import { managedAiKey } from '../aiCredentials.js';
import { serverAuthConfigured, verifyUser, type AuthedUser } from '../auth.js';
import { proProfile, proProfileForUser, type ProProfile } from '../aiProProfile.js';
import { proTaskProfile, taskConfigured } from '../aiTaskRegistry.js';
import { liteLedgerConfigured } from '../aiLiteStore.js';
import { resolvePaidAiAccess } from '../entitlements.js';
import { readSystemSettings, routeDisabled } from '../systemSettings.js';
import { allows, type Entitlement } from '../../../src/entitlements/contract.js';
import type { ProUnavailableReason } from '../../../src/ai/pro/types.js';

export interface ProGate {
  profile: ProProfile;
  /** The profile with any per-user development override already applied - what a reservation
   *  must be measured against, and therefore what the status endpoint must report. */
  effectiveProfile: ProProfile;
  user: AuthedUser | null;
  entitlement: Entitlement | null;
  requiresSignIn: boolean;
  available: boolean;
  reason?: ProUnavailableReason;
}

/**
 * The DEPLOYMENT half of the gate, term by term - everything that does not depend on who is
 * asking. The public endpoints collapse these into one `not-configured` on purpose (a refusal
 * must not enumerate the server's configuration), but the operator diagnosing "the tier is
 * absent" needs to know WHICH term failed - an unset provider allowlist, a missing managed
 * key and an admin-disabled route all vanish the tier identically. /admin (system.ts) reads
 * this; it is computed here so the diagnosis and the decision cannot drift apart.
 */
export interface ProGateTerms {
  /** AI_PRO_ENABLED - the tier's own switch. */
  enabled: boolean;
  /** An accounts backend exists (Supabase auth), so a reservation can belong to somebody. */
  auth: boolean;
  /** The generation ledger is configured (Supabase + IP_HASH_SALT), so spend can be metered. */
  ledger: boolean;
  /** The task registry accepts the profile: gateway provider allowlist set, every route in
   *  the approved catalog. An unset AI_PRO_GATEWAY_PROVIDERS/AI_LITE_GATEWAY_PROVIDERS fails
   *  exactly here. */
  task: boolean;
  /** Every funded route has a managed key to spend. */
  managedKey: boolean;
  /** The /admin switches could be read. Unreadable switches refuse hosted Pro (#2034). */
  settingsReadable: boolean;
  /** No funded route is switched off from /admin (false when the switches are unreadable). */
  routesEnabled: boolean;
  /** The AND the public gate acts on: auth && task && ledger && managedKey && routesEnabled. */
  configured: boolean;
}

export async function proGateTerms(profile: ProProfile = proProfile()): Promise<ProGateTerms> {
  const system = await readSystemSettings();
  const auth = serverAuthConfigured();
  const ledger = liteLedgerConfigured();
  const task = taskConfigured(proTaskProfile(profile));
  const managedKey = profile.routes.every((route) => Boolean(managedAiKey(route.provider)));
  const routesEnabled = system.ok && !profile.routes.some((route) => routeDisabled(system.settings, route));
  return {
    enabled: profile.enabled,
    auth,
    ledger,
    task,
    managedKey,
    settingsReadable: system.ok,
    routesEnabled,
    configured: auth && task && ledger && managedKey && routesEnabled,
  };
}

/**
 * Resolve hosted Pro for this request.
 *
 * Every gate fails CLOSED, and the order is deliberate: switched off, then unconfigured (no
 * ledger, no managed key, an unpriced or unapproved route, a route the admin surface has
 * disabled), then not signed in, then not entitled. An account whose plan withdraws `ai.pro`
 * reads the same as the feature being off - there is nothing to buy, so there is no upgrade
 * prompt to show.
 */
export async function resolveProGate(req: Request): Promise<ProGate> {
  const profile = proProfile();
  const user = await verifyUser(bearerToken(req));
  // The deployment terms come from proGateTerms so this decision and the /admin diagnosis are
  // the same computation. Term-by-term reasoning lives there; the one worth restating here: a
  // route switched off from /admin takes the surface down rather than degrading it - the
  // switch exists to stop spend on a model that has gone wrong, and half a generation is not
  // a cheaper outcome than none.
  const terms = await proGateTerms(profile);
  const requiresSignIn = terms.auth;
  const configured = terms.configured;
  // The plan reads strictly too: an unreadable account or plan is not the default plan, so it
  // is refused like unreadable switches - as the retryable 'disabled', never 'not-configured',
  // because it is an outage rather than the deployment's configuration (#2034).
  const access = user && terms.settingsReadable ? await resolvePaidAiAccess(user.userId) : null;
  const unreadable = !terms.settingsReadable || (access !== null && !access.ok);
  const entitlement = access?.ok ? access.entitlement : null;
  const entitled = entitlement ? allows(entitlement, 'ai.pro') : false;
  const available = profile.enabled && configured && Boolean(user) && entitled;
  return {
    profile,
    effectiveProfile: user ? proProfileForUser(profile, user.userId) : profile,
    user,
    entitlement,
    requiresSignIn: requiresSignIn && !user,
    available,
    ...(available
      ? {}
      : !profile.enabled || unreadable
        ? { reason: 'disabled' as const }
        : !configured
          ? { reason: 'not-configured' as const }
          : !user
            ? { reason: 'sign-in' as const }
            : { reason: 'disabled' as const }),
  };
}
