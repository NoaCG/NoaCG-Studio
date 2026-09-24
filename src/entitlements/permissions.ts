// THE PERMISSION VOCABULARY - what a CREDENTIAL may do on a user's behalf, beside (not inside)
// the entitlement contract.
//
// PURE MODULE, the same discipline as contract.ts: no DOM, no import.meta, no Supabase, no
// process.env. Imported by api/ (the authoritative check in api/_lib/principal.ts), by the
// browser (the consent card names what it grants) and by the unit tests.
//
// WHY A SECOND VOCABULARY. `FEATURE_KEYS` answers "what may this ACCOUNT do" - it is about the
// account features an entitlement unlocks, and it deliberately excludes the free core. A
// permission answers a different question: "what may THIS CREDENTIAL do of what the account
// may do". A session holds every permission the account has; a scoped agent key (docs/AGENT_CLI.md,
// docs/AGENT_SAVE.md) holds a NAMED SUBSET, and a future OAuth access token will hold whatever
// scopes were consented. So a permission only ever NARROWS: nothing here can grant what the
// entitlement withholds, which is why `permits()` asks both questions and the second one is the
// entitlement's own `allows()`.
//
// ENFORCED vs RESERVED. The same honesty rule as ENFORCED_FEATURE_KEYS: a key is added to
// ENFORCED_PERMISSION_KEYS in the SAME change that adds its call site, never before. The
// reserved keys exist so the consent copy, the admin page and the future verbs (`noacg add`,
// `noacg publish`, live playout) share one vocabulary from day one - and so that
// `playout:operate` is named NOW as the permission no authoring key will ever carry.

import { allows, type Entitlement, type FeatureKey } from './contract.js';

/** Every permission a credential can carry. Verbs are the PRODUCT's (docs/AGENT_CLI.md
 *  "Vocabulary"): save = the library, add/publish = a production, operate = live playout. */
export const PERMISSION_KEYS = [
  /** Create a graphic in the user's LIBRARY (`noacg save`, POST /api/me/graphics), and send a
   *  whole graphics PACKAGE to wait on their Home (`noacg pack --save`, POST /api/me/packages).
   *  A package becomes a production only when the user presses Install in their own session. */
  'graphics:create',
  /** Read the user's library (reserved). */
  'graphics:read',
  /** Replace a library graphic the credential created (reserved - `--replace <id>`). */
  'graphics:update',
  /** Pool a graphic into a production without touching what is on air (reserved - `noacg add`). */
  'productions:attach',
  /** Take / Update / Next / Out on a published production (reserved; high-risk; NEVER granted to
   *  an authoring key - see NEVER_ON_AGENT_KEYS). */
  'playout:operate',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Human labels - the consent card and the admin surface read these, so a key cannot ship
 *  without the words a person sees. */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'graphics:create': 'Create graphics in your library and send graphics packages to your Home',
  'graphics:read': 'Read your library',
  'graphics:update': 'Replace graphics it created',
  'productions:attach': 'Add graphics to a production',
  'playout:operate': 'Operate a live production (Take / Update / Next / Out)',
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** The permissions a server path actually CHECKS today. v1 enforces exactly one - the save
 *  door - and says so, rather than listing five switches of which four stop nothing. Add a key
 *  here in the SAME change that adds its `permits()` call site. */
export const ENFORCED_PERMISSION_KEYS: ReadonlySet<PermissionKey> = new Set(['graphics:create']);

/** What a scoped AGENT KEY minted through `noacg login` carries in this release. Authoring
 *  only: the key can put a graphic in the library and nothing else - it cannot read the
 *  library, touch a production, use AI, or delete anything. The consent card states exactly
 *  this list; the redeem handler mints exactly this list. */
export const AGENT_KEY_PERMISSIONS: readonly PermissionKey[] = ['graphics:create'];

/** Permissions that are NEVER granted to an agent key, whatever a future consent flow offers
 *  for authoring. Live playout is a separate, explicitly consented, high-risk grant when it
 *  comes (docs/AGENT_CLI.md "Future") - bundling it with authoring access would hand every
 *  CI runner holding a save key the power to clear the frame. */
export const NEVER_ON_AGENT_KEYS: ReadonlySet<PermissionKey> = new Set(['playout:operate']);

/** The account feature a permission rides on - the SECOND half of `permits()`. A permission
 *  never widens access: the credential may hold `graphics:create`, but if the account's
 *  entitlement withholds cloud sync (a suspended account, the instance-wide switch), the save
 *  is refused all the same. `null` would mean "no account feature gates it"; nothing in v1 is. */
export const PERMISSION_FEATURE: Record<PermissionKey, FeatureKey | null> = {
  'graphics:create': 'sync.cloud',
  'graphics:read': 'sync.cloud',
  'graphics:update': 'sync.cloud',
  'productions:attach': 'sync.cloud',
  'playout:operate': 'control.hosted',
};

/** How a request was authenticated. `session` = the user's own Supabase JWT (every permission
 *  the account has); `agent-key` = a scoped key (the named subset); `anonymous` = nothing. A
 *  future OAuth token is one more kind resolving through the same `permits`. */
export type PrincipalKind = 'session' | 'agent-key' | 'anonymous';

/** The resolved caller - who, what their account may do, and what THIS credential may do of it. */
export interface Principal {
  kind: PrincipalKind;
  /** The account, or null for an anonymous caller. */
  userId: string | null;
  /** The account's resolved entitlement (the anonymous defaults when userId is null). */
  entitlement: Entitlement;
  /** The permissions this credential carries, or `null` for "every permission the account
   *  has" (a full session). A key always carries an explicit list, never null. */
  granted: readonly PermissionKey[] | null;
  /** The agent key's row id when kind is 'agent-key' - for self-revocation and usage rows. */
  keyId?: string;
}

/** The anonymous principal - what `resolvePrincipal` degrades to. */
export function anonymousPrincipal(entitlement: Entitlement): Principal {
  return { kind: 'anonymous', userId: null, entitlement, granted: [] };
}

/**
 * THE ONE QUESTION every permission-gated call site asks. Two halves, both required: the
 * credential carries the permission (a session carries all; a key carries its list), AND the
 * account's entitlement allows the feature the permission rides on. An anonymous caller is
 * refused before either is consulted.
 */
export function permits(principal: Principal, key: PermissionKey): boolean {
  if (!principal.userId) return false;
  if (principal.granted !== null && !principal.granted.includes(key)) return false;
  const feature = PERMISSION_FEATURE[key];
  return feature === null ? true : allows(principal.entitlement, feature);
}

/** The plaintext agent-key prefix, so a bearer token declares what it is before a byte of it
 *  is looked up (`Bearer noacg_ak_…` -> the key path; anything else -> the JWT path). The
 *  display prefix a key list shows is this plus the first characters of the secret. */
export const AGENT_KEY_PREFIX = 'noacg_ak_';

export function isAgentKeyToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.startsWith(AGENT_KEY_PREFIX) && token.length > AGENT_KEY_PREFIX.length;
}
