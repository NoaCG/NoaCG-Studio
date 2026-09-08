// THE ENTITLEMENT CONTRACT - one resolver, one precedence order, one explanation.
//
// PURE MODULE, and deliberately so (the same discipline as the render purity trio in
// src/render/limits.ts): no DOM, no import.meta, no Supabase, no process.env. It is
// imported by the browser (to render the admin page and any "you have reached your
// limit" copy), by api/ (the authoritative check), and by the unit tests. The rows it
// merges are loaded server-side in api/_lib/entitlements.ts; this module only decides
// what those rows MEAN.
//
// Why one module: before this, "what may this user do" was answered in three unrelated
// places - resolveTier(signedIn) for render, ~40 AI_LITE_* environment variables plus an
// AI_LITE_OVERRIDE_USER_IDS list for AI, and nothing at all for storage or projects. An
// admin page that cannot state WHY a user has access is a page that will eventually lie,
// so every resolved value here carries its source.
//
// THE PRECEDENCE ORDER, lowest to highest:
//
//   default plan  <  assigned plan  <  temporary grant  <  manual override
//
// A suspended account short-circuits everything above it: no feature is allowed, whatever
// the plan says. Suspension is an account state, not an entitlement.
//
// THE NEUTRALITY RULE: a numeric limit of `null` means "inherit whatever the server
// already used" - for AI that is the AI_LITE_* environment configuration, for storage and
// projects it means unlimited. The built-in default plan sets every number to null, so an
// instance with no plans table, no assignments and no grants resolves to EXACTLY today's
// behaviour. That equivalence is asserted in contract.test.ts and must stay true: rolling
// out entitlements is not allowed to quietly restrict anyone.

// ── features ───────────────────────────────────────────────────────────────────────────

/** Every gateable surface. These are the ACCOUNT features
 *  (`root/keep-studio-open-there-login-wall`):
 *  the editor, the catalog, local preview and the six local export targets are free-forever
 *  core and deliberately absent from this union - there is no key here that can paywall
 *  them, which is the point. Cloud rendering appears because it costs real compute. */
export const FEATURE_KEYS = [
  'ai.lite',
  'ai.import-analysis',
  'ai.pro',
  'ai.video',
  'ai.byo-key',
  'render.cloud',
  'sync.cloud',
  'community.publish',
  'control.hosted',
  'showchat',
  // A NEW key, never a widening of `showchat`: the 0022 kill-switch contract promises the admin
  // page states exactly what a switch stops, and these are two different surfaces - showchat is
  // the standalone send-in page, `audience` is production-scoped audience participation
  // (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5).
  'audience',
  'templates.beta',
  'templates.internal',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Human labels for the admin UI. Kept beside the union so a new key cannot ship unlabelled. */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  'ai.lite': 'Managed AI graphic generation',
  'ai.import-analysis': 'AI analysis of imported graphics',
  'ai.pro': 'NoaCG Pro image-guided generation',
  'ai.video': 'AI video and animation generation',
  'ai.byo-key': 'Bring-your-own AI provider key',
  'render.cloud': 'Cloud video rendering',
  'sync.cloud': 'Cloud sync of saved work',
  'community.publish': 'Publish to the community gallery',
  'control.hosted': 'Hosted control pages',
  showchat: 'Audience send-in and show chat',
  audience: 'Audience participation in a production',
  'templates.beta': 'Templates marked beta',
  'templates.internal': 'Templates marked internal',
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

/** The feature keys that a server path actually CHECKS today (the enforcement table in
 *  docs/ADMIN.md names the call site for each).
 *
 *  It exists so the admin surface can be honest: the remaining keys resolve correctly and are
 *  stored correctly, but nothing consults them yet, so switching one off changes a row and
 *  stops nothing. Presenting all eleven switches identically would make the System page claim
 *  a power it does not have - and a kill switch believed in during an incident, that does not
 *  kill, is worse than no switch at all.
 *
 *  Add a key here in the SAME change that adds its enforcing call site, never before. */
export const ENFORCED_FEATURE_KEYS: ReadonlySet<FeatureKey> = new Set([
  'ai.lite',
  'ai.import-analysis',
  'ai.byo-key',
  'ai.pro',
  'ai.video',
  'render.cloud',
  // Template visibility is enforced through the hidden-template list rather than by a direct
  // allows() call, but it is enforced (api/_lib/templateVisibility.ts).
  'templates.beta',
  'templates.internal',
  // These three have no endpoint - they write straight from the browser - so their enforcement
  // is RLS rather than an allows() call: supabase/migrations/0022_entitlement_absolutes.sql.
  // Only the precedence-free absolutes reach them; see the note beside each one below.
  'community.publish',
  'control.hosted',
  'showchat',
  // The fourth RLS-enforced key, added in the SAME change as its call site (migration 0035):
  // every audience RPC checks `feature_denied_for(owner, 'audience')` before it writes, and the
  // join resolve folds a denial into `open = false` so a viewer sees a closed door rather than
  // an error.
  'audience',
  // Reached by exactly ONE server path: the agent save door (POST /api/me/graphics,
  // api/_lib/me/graphics.ts) - `permits(principal, 'graphics:create')` rides on this feature
  // (permissions.ts PERMISSION_FEATURE). The browser's own sync writes straight through RLS and
  // is deliberately NOT gated (docs/ADMIN.md: it would stop a user saving their own work), so
  // the note below says exactly how far the switch reaches.
  'sync.cloud',
]);

/** Where an enforced key does not reach EVERY caller, in the words the admin page shows.
 *
 *  The System page's promise is "off means off for everyone", and a switch believed in during
 *  an incident that turns out to leave traffic running is the failure this whole file exists to
 *  prevent. A key with a caveat states it here rather than in a comment nobody reads at 9pm. */
export const FEATURE_ENFORCEMENT_NOTES: Partial<Record<FeatureKey, string>> = {
  'ai.pro': 'reaches recognised accounts; an account-free caller on their own provider key is not stopped',
  'ai.video': 'reaches recognised accounts; an account-free caller on their own provider key is not stopped',
  // The three RLS-enforced keys. Two caveats are true of all of them and are worth the repetition
  // on a page an operator reads during an incident: only the ABSOLUTES reach the database (a plan
  // that withholds one of these does not bite), and nothing already published or already saved is
  // withdrawn - reads stay open by design, so a takedown remains a moderation action.
  'community.publish':
    'stops new and edited publishes in the database; already-published templates stay up, and moderators can still act',
  'control.hosted':
    'stops creating pages and stops every operator command on existing ones; the pages stay readable',
  showchat: 'stops new send-ins and moderation; messages already on air stay on air',
  audience:
    'stops the join page taking anything and stops moderation; the join link keeps working and says it is closed, and anything already on air stays on air',
  'sync.cloud':
    'reaches only the agent save door (noacg save / POST /api/me/graphics); the browser\'s own cloud sync of saved work is not stopped',
};

// ── limits ─────────────────────────────────────────────────────────────────────────────

/** Numeric allowances. The `ai*` names match the LiteProfile / TaskProfile fields they
 *  override one-for-one, so a plan number lands on the server path without translation.
 *  `null` anywhere means "not set by this layer" - see THE NEUTRALITY RULE above. */
export const LIMIT_KEYS = [
  'aiDailyStarts',
  'aiMonthlyStarts',
  'aiDailySuccesses',
  'aiMonthlySuccesses',
  'aiUserConcurrency',
  'storageBytes',
  'projects',
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

export const LIMIT_LABELS: Record<LimitKey, string> = {
  aiDailyStarts: 'AI generations started per day',
  aiMonthlyStarts: 'AI generations started per month',
  aiDailySuccesses: 'AI generations delivered per day',
  aiMonthlySuccesses: 'AI generations delivered per month',
  aiUserConcurrency: 'Concurrent AI generations',
  storageBytes: 'Cloud storage',
  projects: 'Saved projects',
};

/** Limits that are MEASURED AND DISPLAYED but never enforced in this release. Nothing in
 *  the product has ever counted a user's projects or bytes, so there is no baseline from
 *  which to pick a safe number; enforcing an invented one could lock a real person out of
 *  saving their work. The admin page shows usage against the plan value and this set is
 *  what stops any server path from acting on it. Enforcement is its own later change. */
export const OBSERVE_ONLY_LIMITS: ReadonlySet<LimitKey> = new Set(['storageBytes', 'projects']);

export function isLimitKey(value: string): value is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(value);
}

// ── the rows this module merges ────────────────────────────────────────────────────────

export type AccountState = 'active' | 'suspended';

/** A plan as stored (public.plans). Plan names and keys are DATA - no code branches on a
 *  particular plan key, which is why `key` is a free string and not a union. */
export interface PlanShape {
  key: string;
  name: string;
  /** Feature -> allowed. A key the plan omits falls through to the built-in default. */
  features: Partial<Record<FeatureKey, boolean>>;
  /** Limit -> value, or null for "inherit". A key the plan omits also falls through. */
  limits: Partial<Record<LimitKey, number | null>>;
  /** Which src/render/limits.ts tier this plan renders at. Unknown values are ignored by
   *  the render path, which falls back to the signed-in default. */
  renderTier: string;
  /** Cloud render output formats, or null for "whatever the render tier already allows".
   *  LOCAL export targets (SPX, CasparCG, OGraf, OBS, vMix, HTML) are free-forever core
   *  and are deliberately not expressible here. */
  renderFormats: readonly string[] | null;
}

export type GrantKind = 'feature' | 'quota';

/** A per-user grant (public.user_grants). `expiresAt` set = a temporary access grant;
 *  `expiresAt` null = a permanent manual override. ONE row shape covers both because they
 *  differ only in whether they end, and collapsing them keeps the precedence order short
 *  enough to state in one line. */
export interface GrantShape {
  id: string;
  kind: GrantKind;
  /** A FeatureKey when kind is 'feature', a LimitKey when kind is 'quota'. */
  key: string;
  /** Boolean for a feature grant, number (or null to clear) for a quota grant. */
  value: boolean | number | null;
  startsAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string;
}

/** Everything the resolver needs, already loaded. Keeping this a plain input makes the
 *  merge testable without a database and identical in the browser and on the server. */
export interface EntitlementInput {
  userId: string | null;
  accountState: AccountState;
  plan: PlanShape | null;
  grants: readonly GrantShape[];
  /** ISO instant used for every expiry comparison, passed in so the merge stays pure. */
  now: string;
  /** Legacy AI_LITE_OVERRIDE_USER_IDS membership. Removed one release after plans ship;
   *  until then it resolves like a permanent override so nobody's access changes. */
  envOverride?: boolean;
  /** Features switched off instance-wide from the admin surface's system controls.
   *
   *  This is an INCIDENT CONTROL, not an entitlement: it outranks the plan, the grant and
   *  the override, because the reason to reach for it is "this is broken right now" and a
   *  kill switch that a per-user override could defeat is not a kill switch. It is the one
   *  input that can deny something a manual override allowed, and the resolved source says
   *  so plainly rather than leaving an operator wondering why their override did nothing. */
  disabledFeatures?: readonly FeatureKey[];
}

// ── the resolved answer ────────────────────────────────────────────────────────────────

export type EntitlementSource =
  | 'default'
  | 'plan'
  | 'grant'
  | 'override'
  | 'env-override'
  | 'suspended'
  | 'disabled';

/** One resolved value plus the reason it holds that value. The admin page renders this
 *  triple directly - "why does this user have access" is not a separate query. */
export interface EntitlementValue<T> {
  value: T;
  source: EntitlementSource;
  /** Display text for the source: a plan name, a grant reason, 'Default', 'Suspended'. */
  sourceLabel: string;
  /** When a temporary grant stops applying; null for everything permanent. */
  expiresAt: string | null;
}

export interface Entitlement {
  userId: string | null;
  signedIn: boolean;
  accountState: AccountState;
  planKey: string;
  planName: string;
  features: Record<FeatureKey, EntitlementValue<boolean>>;
  limits: Record<LimitKey, EntitlementValue<number | null>>;
  renderTier: EntitlementValue<string>;
  renderFormats: EntitlementValue<readonly string[] | null>;
}

// ── the built-in defaults ──────────────────────────────────────────────────────────────

/** What an ANONYMOUS visitor may do. Matches today exactly: no account features, but cloud
 *  rendering works (RENDER_LIMITS.anonymous already bounds it) because the open editor has
 *  never required an account to produce output. */
export const ANONYMOUS_PLAN: PlanShape = {
  key: 'anonymous',
  name: 'Not signed in',
  features: {
    'ai.lite': false,
    'ai.import-analysis': false,
    'ai.pro': false,
    'ai.video': false,
    'ai.byo-key': true,
    'render.cloud': true,
    'sync.cloud': false,
    'community.publish': false,
    'control.hosted': false,
    showchat: false,
    audience: false,
    'templates.beta': false,
    'templates.internal': false,
  },
  limits: {
    aiDailyStarts: null,
    aiMonthlyStarts: null,
    aiDailySuccesses: null,
    aiMonthlySuccesses: null,
    aiUserConcurrency: null,
    storageBytes: null,
    projects: null,
  },
  renderTier: 'anonymous',
  renderFormats: null,
};

/** What a SIGNED-IN user with no assigned plan may do. Every account feature on, every
 *  number inherited from the environment: this is the behaviour the product shipped with,
 *  written down. A deployment may override it with a plans row flagged is_default. */
export const DEFAULT_SIGNED_IN_PLAN: PlanShape = {
  key: 'free',
  name: 'Free',
  features: {
    'ai.lite': true,
    'ai.import-analysis': true,
    'ai.pro': true,
    'ai.video': true,
    'ai.byo-key': true,
    'render.cloud': true,
    'sync.cloud': true,
    'community.publish': true,
    'control.hosted': true,
    showchat: true,
    audience: true,
    'templates.beta': false,
    'templates.internal': false,
  },
  limits: {
    aiDailyStarts: null,
    aiMonthlyStarts: null,
    aiDailySuccesses: null,
    aiMonthlySuccesses: null,
    aiUserConcurrency: null,
    storageBytes: null,
    projects: null,
  },
  renderTier: 'free',
  renderFormats: null,
};

// ── the merge ──────────────────────────────────────────────────────────────────────────

/** Is this grant in force at `now`? Revoked beats everything; a start in the future and an
 *  expiry in the past both mean "not yet / no longer", and an unparseable timestamp is
 *  treated as NOT in force - a malformed date must never silently widen access. */
function grantActive(grant: GrantShape, nowMs: number): boolean {
  if (grant.revokedAt) return false;
  if (grant.startsAt) {
    const starts = Date.parse(grant.startsAt);
    if (!Number.isFinite(starts) || starts > nowMs) return false;
  }
  if (grant.expiresAt) {
    const expires = Date.parse(grant.expiresAt);
    if (!Number.isFinite(expires) || expires <= nowMs) return false;
  }
  return true;
}

/** A temporary grant outranks a plan, and a permanent override outranks both. Ordering the
 *  active grants this way lets a single last-wins pass produce the right answer, so the
 *  precedence lives in ONE comparator instead of being re-derived per key. */
function rankGrant(grant: GrantShape): number {
  return grant.expiresAt ? 1 : 2; // 1 = temporary grant, 2 = permanent override
}

function grantSource(grant: GrantShape): EntitlementSource {
  return grant.expiresAt ? 'grant' : 'override';
}

function grantLabel(grant: GrantShape): string {
  const reason = grant.reason.trim();
  const kind = grant.expiresAt ? 'Temporary grant' : 'Manual override';
  return reason ? `${kind}: ${reason}` : kind;
}

/**
 * Resolve one user's entitlement. Pure: same input, same answer, no clock of its own.
 *
 * A SUSPENDED account resolves every feature to false with source 'suspended' while
 * keeping its plan's limits visible - the admin page needs to show what the account WILL
 * get back on reactivation, and a suspension that erased the plan would lose that.
 */
export function resolveEntitlement(input: EntitlementInput): Entitlement {
  const signedIn = input.userId !== null;
  const base = signedIn ? DEFAULT_SIGNED_IN_PLAN : ANONYMOUS_PLAN;
  const plan = signedIn ? input.plan : null;
  const nowMs = Date.parse(input.now);
  const suspended = input.accountState === 'suspended';

  const active = input.grants
    .filter((grant) => signedIn && grantActive(grant, Number.isFinite(nowMs) ? nowMs : 0))
    .sort((a, b) => rankGrant(a) - rankGrant(b));

  const planLabel = plan ? `Plan: ${plan.name}` : 'Default';
  const planSource: EntitlementSource = plan ? 'plan' : 'default';

  const features = {} as Record<FeatureKey, EntitlementValue<boolean>>;
  for (const key of FEATURE_KEYS) {
    let resolved: EntitlementValue<boolean> = {
      value: plan?.features[key] ?? base.features[key] ?? false,
      source: plan?.features[key] === undefined ? 'default' : planSource,
      sourceLabel: plan?.features[key] === undefined ? 'Default' : planLabel,
      expiresAt: null,
    };
    for (const grant of active) {
      if (grant.kind !== 'feature' || grant.key !== key || typeof grant.value !== 'boolean') continue;
      resolved = {
        value: grant.value,
        source: grantSource(grant),
        sourceLabel: grantLabel(grant),
        expiresAt: grant.expiresAt,
      };
    }
    // The legacy env list only ever WIDENED access, so it may not take a feature away.
    if (input.envOverride && !resolved.value && key.startsWith('ai.')) {
      resolved = { value: true, source: 'env-override', sourceLabel: 'AI_LITE_OVERRIDE_USER_IDS', expiresAt: null };
    }
    // Order matters: the instance-wide kill switch is checked LAST so it wins over every
    // other source, including a manual override. Suspension is checked before it only
    // because "this account is suspended" is the more useful explanation of the two.
    features[key] = suspended
      ? { value: false, source: 'suspended', sourceLabel: 'Account suspended', expiresAt: null }
      : resolved;
    if (input.disabledFeatures?.includes(key)) {
      features[key] = { value: false, source: 'disabled', sourceLabel: 'Switched off instance-wide', expiresAt: null };
    }
  }

  const limits = {} as Record<LimitKey, EntitlementValue<number | null>>;
  for (const key of LIMIT_KEYS) {
    const planValue = plan?.limits[key];
    let resolved: EntitlementValue<number | null> = {
      value: planValue ?? base.limits[key] ?? null,
      source: planValue === undefined || planValue === null ? 'default' : planSource,
      sourceLabel: planValue === undefined || planValue === null ? 'Default' : planLabel,
      expiresAt: null,
    };
    for (const grant of active) {
      if (grant.kind !== 'quota' || grant.key !== key) continue;
      if (typeof grant.value !== 'number' && grant.value !== null) continue;
      resolved = {
        value: grant.value,
        source: grantSource(grant),
        sourceLabel: grantLabel(grant),
        expiresAt: grant.expiresAt,
      };
    }
    limits[key] = resolved;
  }

  const renderTier: EntitlementValue<string> = {
    value: plan?.renderTier ?? base.renderTier,
    source: plan ? planSource : 'default',
    sourceLabel: plan ? planLabel : 'Default',
    expiresAt: null,
  };

  return {
    userId: input.userId,
    signedIn,
    accountState: input.accountState,
    planKey: plan?.key ?? base.key,
    planName: plan?.name ?? base.name,
    features,
    limits,
    renderTier: suspended
      ? { value: ANONYMOUS_PLAN.renderTier, source: 'suspended', sourceLabel: 'Account suspended', expiresAt: null }
      : renderTier,
    renderFormats: {
      value: plan?.renderFormats ?? base.renderFormats,
      source: plan?.renderFormats ? planSource : 'default',
      sourceLabel: plan?.renderFormats ? planLabel : 'Default',
      expiresAt: null,
    },
  };
}

// ── reading the answer ─────────────────────────────────────────────────────────────────

/** The one question every gated call site asks. Written as a helper so no caller reaches
 *  into `.features[key].value` and accidentally forgets the suspension case. */
export function allows(entitlement: Entitlement, feature: FeatureKey): boolean {
  return entitlement.features[feature].value;
}

/** An enforceable numeric limit, or null when this layer sets none. Returns null for the
 *  observe-only limits no matter what a plan says, so a server path physically cannot
 *  enforce one by accident (OBSERVE_ONLY_LIMITS above explains why). */
export function enforceableLimit(entitlement: Entitlement, key: LimitKey): number | null {
  if (OBSERVE_ONLY_LIMITS.has(key)) return null;
  return entitlement.limits[key].value;
}

/** The plan's value for display, including the observe-only ones. */
export function displayedLimit(entitlement: Entitlement, key: LimitKey): number | null {
  return entitlement.limits[key].value;
}
