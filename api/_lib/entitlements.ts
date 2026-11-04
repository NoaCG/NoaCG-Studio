// The server-side entitlement loader: rows in, one resolved Entitlement out.
//
// It does no deciding. Precedence, expiry, suspension and the source labels all live in the
// pure contract (src/entitlements/contract.ts), which the browser and the tests use too;
// this module's whole job is fetching the four inputs that contract needs and handing them
// over. Splitting it that way is what keeps "why does this user have access" answerable with
// the same code that granted it.
//
// FAILURE POSTURE, two of them. resolveUserEntitlement() degrades every load failure to the
// built-in defaults rather than throwing: a deployment with no Supabase configuration has no
// plans to read and must keep working exactly as it does today, and a deployment whose
// database is briefly unreachable must not start refusing renders because a plans lookup timed
// out. Both land on DEFAULT_SIGNED_IN_PLAN.
//
// That default is the wrong answer when the request SPENDS money: it would read a suspended
// account, or a plan that turns a paid AI feature off, as allowed (#2034). So every paid AI
// request resolves through resolvePaidAiAccess() instead, which says when a read failed, and
// refuses before any reservation or model call.
//
// It is also NOT the sign-in check. Callers resolve for whoever they already authenticated:
// pass null for an anonymous request and the anonymous defaults come back.

import {
  allows,
  enforceableLimit,
  resolveEntitlement,
  type AccountState,
  type Entitlement,
  type FeatureKey,
  type GrantShape,
  type PlanShape,
} from '../../src/entitlements/contract.js';
import type { AiGatewaySurface } from '../../src/ai/modelTypes.js';
import { adminDb, adminConfigured } from './adminAuth.js';
import { liteProfile, type LiteProfile } from './aiLiteProfile.js';
import { readSystemSettings, systemSettings, type SystemSettings } from './systemSettings.js';

interface PlanRow {
  key: string;
  name: string;
  features: unknown;
  limits: unknown;
  render_tier: string;
  render_formats: string[] | null;
}

interface GrantRow {
  id: string;
  kind: string;
  key: string;
  value: unknown;
  reason: string | null;
  starts_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

/** A jsonb column arrives as `unknown`. Accept only a plain object; anything else (a string, an
 *  array, null) is treated as "the plan sets nothing", which falls through to the defaults. */
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toPlan(row: PlanRow): PlanShape {
  const features: PlanShape['features'] = {};
  for (const [key, value] of Object.entries(record(row.features))) {
    if (typeof value === 'boolean') Object.assign(features, { [key]: value });
  }
  const limits: PlanShape['limits'] = {};
  for (const [key, value] of Object.entries(record(row.limits))) {
    if (typeof value === 'number' || value === null) Object.assign(limits, { [key]: value });
  }
  return {
    key: row.key,
    name: row.name,
    features,
    limits,
    renderTier: row.render_tier,
    renderFormats: row.render_formats,
  };
}

function toGrant(row: GrantRow): GrantShape | null {
  if (row.kind !== 'feature' && row.kind !== 'quota') return null;
  // The value column wraps its payload ({"value": …}) so one column can hold either type.
  // A row that does not match that shape is dropped rather than guessed at - a malformed
  // grant must not become an accidental allowance.
  const wrapped = record(row.value);
  if (!('value' in wrapped)) return null;
  const value = wrapped.value;
  if (typeof value !== 'boolean' && typeof value !== 'number' && value !== null) return null;
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    value,
    reason: row.reason ?? '',
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export interface EntitlementRows {
  accountState: AccountState;
  plan: PlanShape | null;
  grants: GrantShape[];
}

/** The domain half of an email address, lowercased - or null for anything that is not one.
 *  Deliberately strict about the shape it will match on: exactly one `@`, something either
 *  side of it, and a dot in the domain. A malformed address must resolve to NO plan rather
 *  than to a surprising one. */
export function emailDomain(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return null;
  const domain = value.slice(at + 1);
  return domain.length > 3 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
    ? domain
    : null;
}

/**
 * The plan this user's EMAIL DOMAIN gives them, for a user with no explicit assignment
 * (migration 0045).
 *
 * It exists because `user_grants` and `user_plans` are both keyed on `user_id`, so neither can
 * authorize somebody who has not signed up yet - which is exactly the population a cohort is
 * made of. A domain is the fact that is known in advance.
 *
 * The email is read SERVER-SIDE from `auth.users` with the service key and never leaves this
 * function; what the resolver receives is a plan, the same shape an explicit assignment
 * produces. Nothing about the address reaches the browser or the ledger.
 *
 * A failure answers no plan, so the built-in defaults, with `failed` set: the fail-open loader
 * uses the defaults, and a paid AI request refuses (resolvePaidAiAccess).
 */
async function planForEmailDomain(
  db: Awaited<ReturnType<typeof adminDb>>,
  userId: string,
): Promise<{ plan: PlanShape | null; failed: boolean }> {
  try {
    const { data: user, error: userError } = await db.auth.admin.getUserById(userId);
    if (userError) return { plan: null, failed: true };
    const domain = emailDomain(user?.user?.email);
    if (!domain) return { plan: null, failed: false };
    // The domain table's PRIMARY KEY is what makes this a single answer rather than a race
    // (see the migration): one domain can only ever name one plan.
    const { data, error } = await db
      .from('plan_email_domains')
      .select('plans!inner(key, name, features, limits, render_tier, render_formats, status)')
      .eq('domain', domain)
      .maybeSingle();
    if (error) return { plan: null, failed: true };
    const row = data as { plans: (PlanRow & { status?: string }) | (PlanRow & { status?: string })[] } | null;
    const planRow = Array.isArray(row?.plans) ? row?.plans[0] : row?.plans;
    // An ARCHIVED plan is not an offer. Its explicit assignments are somebody's deliberate
    // decision and keep working; sweeping a whole domain onto an archived plan is not.
    if (!planRow || planRow.status === 'archived') return { plan: null, failed: false };
    return { plan: toPlan(planRow), failed: false };
  } catch {
    return { plan: null, failed: true };
  }
}

const EMPTY: EntitlementRows = { accountState: 'active', plan: null, grants: [] };

/** The rows for one user, and whether any read behind them failed. The rows are what the
 *  fail-open loader has always answered; `failed` is what a paid AI request refuses on. */
async function fetchEntitlementRows(userId: string): Promise<{ rows: EntitlementRows; failed: boolean }> {
  if (!adminConfigured()) return { rows: EMPTY, failed: false };
  try {
    const db = await adminDb();
    const [account, assignment, grants] = await Promise.all([
      db.from('user_accounts').select('state').eq('user_id', userId).maybeSingle(),
      db
        .from('user_plans')
        .select('expires_at, plans!inner(key, name, features, limits, render_tier, render_formats)')
        .eq('user_id', userId)
        .maybeSingle(),
      // ORDERED, and load-bearing: the contract's merge is LAST-WINS within a precedence rank,
      // and its sort is stable, so the order rows arrive in decides the answer whenever two of
      // equal rank name one key. Unordered, Postgres may return them either way round and the
      // same account resolves differently on two consecutive requests. `0021` makes that state
      // unreachable for new rows, but determinism must not depend on a migration having been
      // applied - a database still carrying a legacy pair has to answer the same way twice.
      // Ascending, so the most recent decision is the one that wins.
      db
        .from('user_grants')
        .select('id, kind, key, value, reason, starts_at, expires_at, revoked_at')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ]);

    const state = account.data?.state === 'suspended' ? 'suspended' : 'active';

    // An EXPIRED plan assignment is not an assignment. Handling it here rather than in the
    // contract keeps the merge free of a second expiry concept: the contract sees either a
    // plan or no plan, exactly as it does for a user who was never assigned one.
    const assigned = assignment.data as { expires_at: string | null; plans: PlanRow | PlanRow[] } | null;
    const expired = assigned?.expires_at ? Date.parse(assigned.expires_at) <= Date.now() : false;
    const planRow = Array.isArray(assigned?.plans) ? assigned?.plans[0] : assigned?.plans;
    // An explicit assignment wins; only a user who has none falls through to their email
    // domain's plan (migration 0045). Both land in the SAME `plan` slot at the same precedence
    // rank, so a grant or a manual override still outranks either - a domain widens who gets a
    // plan, never what a plan outranks.
    const domainPlan = planRow && !expired ? null : await planForEmailDomain(db, userId);
    const plan = planRow && !expired ? toPlan(planRow) : domainPlan?.plan ?? null;

    const rows = (grants.data ?? []) as GrantRow[];
    return {
      rows: { accountState: state, plan, grants: rows.map(toGrant).filter((g): g is GrantShape => g !== null) },
      failed: Boolean(account.error || assignment.error || grants.error || domainPlan?.failed),
    };
  } catch {
    return { rows: EMPTY, failed: true };
  }
}

/**
 * Fetch the rows for one user, failing open to the defaults. Exported so the admin surface can
 * show what was loaded next to what it resolved to, which is how a wrong answer becomes
 * debuggable rather than mysterious.
 */
export async function loadEntitlementRows(userId: string): Promise<EntitlementRows> {
  return (await fetchEntitlementRows(userId)).rows;
}

function signedInEntitlement(userId: string, rows: EntitlementRows, system: SystemSettings): Entitlement {
  return resolveEntitlement({
    userId,
    ...rows,
    now: new Date().toISOString(),
    // The instance-wide kill switches outrank everything the plan or a grant says. An admin
    // reaching for one is saying "this is broken right now", and a per-user override that
    // could defeat it would make the switch useless exactly when it matters.
    disabledFeatures: system.disabledFeatures,
    // The legacy AI_LITE_OVERRIDE_USER_IDS list, resolved as a source the admin page can name
    // rather than as invisible behaviour. Removed one release after plans ship (docs/ADMIN.md).
    envOverride: liteProfile().overrideUserIds.includes(userId),
  });
}

/**
 * The one call every gated server path makes. `userId` null resolves the anonymous defaults
 * without touching the database.
 */
export async function resolveUserEntitlement(userId: string | null): Promise<Entitlement> {
  const system = await systemSettings();
  if (!userId) {
    return resolveEntitlement({
      userId: null,
      ...EMPTY,
      now: new Date().toISOString(),
      disabledFeatures: system.disabledFeatures,
    });
  }
  return signedInEntitlement(userId, await loadEntitlementRows(userId), system);
}

/** What a paid AI request may act on: the account's entitlement and the settings it was
 *  resolved with, or which read failed. There is no default to fall back to on purpose. */
export type PaidAiAccess =
  | { ok: true; entitlement: Entitlement; settings: SystemSettings }
  | { ok: false; failed: 'settings' | 'account' };

/**
 * The entitlement read for a request that spends NoaCG's money (#2034). Unlike
 * resolveUserEntitlement it never answers defaults for a read it could not make: an
 * unreadable kill switch, account state or plan is `ok: false`, and the caller refuses before
 * any reservation, burst count against an allowance, gateway or model call.
 */
export async function resolvePaidAiAccess(userId: string): Promise<PaidAiAccess> {
  const system = await readSystemSettings();
  if (!system.ok) return { ok: false, failed: 'settings' };
  const read = await fetchEntitlementRows(userId);
  if (read.failed) return { ok: false, failed: 'account' };
  return { ok: true, settings: system.settings, entitlement: signedInEntitlement(userId, read.rows, system.settings) };
}

// ── the gateway surface gate ───────────────────────────────────────────────────────────
//
// POST /api/ai/generate is a general model proxy, so it cannot tell what a request is FOR -
// the caller says, with the `surface` discriminator (docs/ADMIN.md, "Gating a surface on a
// shared endpoint"). The two functions below are the whole decision, pulled out of the
// handler because the handler's own path needs a verified Supabase token to reach: that is
// how the refusal shipped untested, with only its no-op half covered.

/** Which feature key a gateway surface is gated on; null for the general harness, which no
 *  feature key gates. One map, so adding a gated surface is one line and cannot disagree with
 *  the enforcement table in docs/ADMIN.md. */
const SURFACE_FEATURES: Record<AiGatewaySurface, FeatureKey> = {
  video: 'ai.video',
  pro: 'ai.pro',
  // The Phase 0 spike gates on `ai.pro` rather than minting a key of its own. It IS Pro work
  // (docs/NOACG_PRO_PLAN.md §0), it spends NoaCG's managed key, and a bench-only surface with
  // a weaker gate than the product surface it belongs to would be a hole rather than a
  // simplification. Nothing user-facing reaches it; it exists to ask for forced-tool
  // structured output (api/_lib/aiSurfacePolicy.ts).
  spike: 'ai.pro',
};

export function gatedFeature(surface: AiGatewaySurface | undefined): FeatureKey | null {
  return surface ? SURFACE_FEATURES[surface] : null;
}

/**
 * Is this surface call refused?
 *
 * `recognised` is the load-bearing half, and it is not a shortcut for "has a token": it means
 * the server resolved that token to an actual account. An UNRECOGNISED caller resolves the
 * ANONYMOUS defaults, which carry no account feature at all - so refusing on that answer would
 * take video away from account-free bring-your-own-key use and from every self-hosted instance
 * with no auth configured. Both work today, and entitlements may not quietly restrict anybody
 * (the neutrality rule, docs/ADMIN.md §2). Managed access still needs an account; the key
 * lookup answers that with a 401 of its own.
 */
export function surfaceRefused(
  feature: FeatureKey,
  recognised: boolean,
  entitlement: Entitlement,
): boolean {
  return recognised && !allows(entitlement, feature);
}

/**
 * Fold a resolved entitlement's AI allowances into a Lite profile.
 *
 * Only the five numbers a plan can express move; routes, prompts, token budgets, timeouts and
 * the fleet ceilings are deployment configuration and stay where they are. A plan must be able
 * to say "this user gets more generations", not "this user gets a different model" - the model
 * catalog is an audited, benchmarked list (docs/AI_TASK_REGISTRY.md) and an entitlement is not
 * a way around it.
 *
 * A limit of null means inherit, so with no plan configured this returns the profile it was
 * given, unchanged.
 */
export function applyEntitlementToLiteProfile(profile: LiteProfile, entitlement: Entitlement): LiteProfile {
  const pick = (key: Parameters<typeof enforceableLimit>[1], current: number): number => {
    const limit = enforceableLimit(entitlement, key);
    return limit === null ? current : Math.max(0, Math.floor(limit));
  };
  return {
    ...profile,
    dailyStarts: pick('aiDailyStarts', profile.dailyStarts),
    monthlyStarts: pick('aiMonthlyStarts', profile.monthlyStarts),
    dailySuccesses: pick('aiDailySuccesses', profile.dailySuccesses),
    monthlySuccesses: pick('aiMonthlySuccesses', profile.monthlySuccesses),
    // The per-user concurrency floor of 1 is load-bearing: a plan that set it to 0 would make
    // every reservation fail admission with no way for the user to tell why.
    maxConcurrentPerUser: Math.max(1, pick('aiUserConcurrency', profile.maxConcurrentPerUser)),
  };
}
