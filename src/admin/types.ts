// The wire contract between api/admin/* and the admin page. Types only - this file is
// imported by both sides, so it must stay free of runtime code, React and browser globals.
//
// What is NOT here is as deliberate as what is: no table names, no column names, no role
// predicate, no route list beyond the calls the page actually makes. The admin bundle is a
// public static asset (docs/ADMIN.md section 1), so anything written here is readable by
// anyone. Identifiers and labels are fine; a description of the schema is not.

import type { EntitlementValue, FeatureKey, LimitKey } from '../entitlements/contract';

export type AdminRole = 'owner' | 'admin' | 'support';

/** GET /api/admin/session. The whole answer: who am I, and what may I do. */
export interface AdminSessionResponse {
  email: string;
  role: AdminRole;
}

/** Every admin endpoint has exactly one failure shape. The page never distinguishes
 *  "not allowed" from "no such route", because the server does not either. */
export interface AdminErrorResponse {
  error: { code: string; message: string };
}

// ── users ──────────────────────────────────────────────────────────────────────────────

export type AccountState = 'active' | 'suspended';

/** One row in the user list. Enough to triage; the detail call carries the rest. */
export interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  /** Set when the account was invited and has not yet accepted. */
  pendingInvite: boolean;
  state: AccountState;
  /** An operator-owned account - development, testing, a demo. Excluded from the default
   *  admin usage scope (migration 0027) and NOTHING ELSE: it grants nothing, withdraws
   *  nothing, and is not a role. Separate from `isAdmin` on purpose, because the two come
   *  apart in both directions - on this instance the account that produced every AI
   *  generation is a test account with no admin row, and the one admin has produced none. */
  internal: boolean;
  planName: string;
  isAdmin: AdminRole | null;
  /** Rolling 30-day AI generation count and provider cost. */
  aiGenerations30d: number;
  aiCostUsd30d: number;
}

export interface AdminUserListResponse {
  users: AdminUserSummary[];
  /** True when the account directory was longer than one page and the list is a prefix. */
  truncated: boolean;
  total: number;
}

/** A grant or override as the admin page sees it. */
export interface AdminGrant {
  id: string;
  kind: 'feature' | 'quota';
  key: string;
  value: boolean | number | null;
  reason: string;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Present only on revoked rows, which the page shows greyed rather than hiding. */
  revokedAt: string | null;
}

/** What this user actually gets, and why, straight off the resolver. */
export interface AdminAccess {
  planKey: string;
  planName: string;
  planExpiresAt: string | null;
  features: Record<FeatureKey, EntitlementValue<boolean>>;
  limits: Record<LimitKey, EntitlementValue<number | null>>;
  renderTier: EntitlementValue<string>;
}

/** Measured usage. Always the truth from the ledgers, never an estimate. */
export interface AdminUsage {
  aiGenerations30d: number;
  aiSuccesses30d: number;
  aiFailures30d: number;
  aiCostUsd30d: number;
  aiGenerationsToday: number;
  renderJobs30d: number;
  documents: number;
  storageBytes: number;
  /** Allowance keys the user is currently at or over. Empty when nothing is pinched. */
  atLimit: LimitKey[];
}

export interface AdminUserDetail {
  user: AdminUserSummary;
  access: AdminAccess;
  usage: AdminUsage;
  grants: AdminGrant[];
  recentActivity: AdminActivityEntry[];
}

export interface AdminActivityEntry {
  at: string;
  kind: 'ai' | 'render' | 'admin';
  summary: string;
}

// ── plans ──────────────────────────────────────────────────────────────────────────────

export interface AdminPlan {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  isDefault: boolean;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<LimitKey, number | null>>;
  renderTier: string;
  /** Email domains whose users inherit this plan when they have no explicit assignment
   *  (migration 0045). Lowercase and bare - no `@`. Empty = assigned explicitly only. */
  autoAssignEmailDomains: string[];
  renderFormats: string[] | null;
  /** Billing preparation only. Nothing in the product reads this. */
  billing: { amountCents?: number; currency?: string; interval?: string; externalPriceRef?: string };
  sortOrder: number;
  /** How many users are on this plan right now, so archiving is an informed decision. */
  assignedCount: number;
}

export interface AdminPlanListResponse {
  plans: AdminPlan[];
  /** The tier names a plan may name, so the editor offers a list instead of a free text box. */
  renderTiers: string[];
  /** The cloud render formats a plan may allow. */
  renderFormats: string[];
}

// ── audit ──────────────────────────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: string;
  at: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}

export interface AdminAuditResponse {
  entries: AdminAuditEntry[];
  /** Pass back as `before` to page further into the past. */
  nextBefore: string | null;
}

// ── usage dashboard ────────────────────────────────────────────────────────────────────

export interface AdminUsageDay {
  day: string;
  generations: number;
  successes: number;
  /** Broke. `unsupported` is a decline and `expired` an abandoned reservation - neither is
   *  here, matching migration 0026's split for the overview. */
  failures: number;
  /** Lite refusing a brief outside its scope: the guardrail firing, never a fault. */
  declined: number;
  /** Real spend - only generations that reached a provider (see the API's `spent`). */
  costUsd: number;
}

export interface AdminUsageOverview {
  days: AdminUsageDay[];
  /** Rejection reason -> count for generations that BROKE, over the window. The operator's
   *  first debugging surface. */
  failureReasons: { reason: string; count: number }[];
  /** Rejection reason -> count for briefs Lite DECLINED. Kept apart from the failures: a
   *  rising count here is demand for something Lite cannot do yet, not breakage. */
  declineReasons: { reason: string; count: number }[];
  /** Users who hit an allowance in the window, worst first. */
  pinched: { userId: string; email: string; refusals: number; lastAt: string }[];
  /** Whose activity produced every number here. Same vocabulary and same default as the
   *  overview - the two sections read one ledger and must not disagree about who is in it. */
  scope: AdminActivityScope;
  /** Accounts carrying the internal mark, unfiltered. Zero means the exclusion is inert. */
  internalAccounts: number;
  totals: { generations: number; costUsd: number; gatewayRequests: number; renderJobs: number };
  /** Today's spend against the deployment's daily fleet ceiling. */
  fleetSpendTodayUsd: number;
  fleetSpendCeilingUsd: number;
}

// ── the overview dashboard ─────────────────────────────────────────────────────────────
//
// One rule governs every number below: the SHAPE of a measurement rides with it. An event
// count, a count of distinct browsers, a count of accounts and an amount of money are four
// different questions, and a dashboard that renders them as four identical tiles invites the
// reader to add them together. The field names say which is which, and the section renders
// each with its own unit rather than trusting the label alone.

export type AdminPeriodId = 'day' | 'week' | 'month';

/** Which ledger a metric is counted from. It exists so a comparison can be withheld for the
 *  metrics whose history is too short WITHOUT withholding it for the ones whose history is
 *  fine - these ledgers were switched on months apart, and treating them as one would hide a
 *  registration trend because the funnel is young. */
export type AdminLedgerId = 'accounts' | 'funnel' | 'lite' | 'gateway' | 'render';

/** Everything countable inside one window. Every field is defined in docs/ADMIN.md §8 -
 *  if a name here does not obviously say what it counts, the definition is the doc, not a
 *  guess from the identifier. */
export interface AdminOverviewMetrics {
  /** Accounts whose registration timestamp falls in the window. An invitation counts when it
   *  is sent, because that is when the account row exists. */
  newAccounts: number;
  /** Distinct BROWSERS that reported anything. Not people: one human on a phone and a laptop
   *  is two, and a browser that opted out of the funnel is none. */
  activeVisitors: number;
  /** Distinct ACCOUNTS behind those browsers - the same window restricted to events that
   *  carried a signed-in token. The only unique-person figure this ledger can honestly give. */
  activeAccounts: number;
  /** Page loads, first and returning. An event count. */
  visits: number;
  /** Email sign-ups reported by the browser. Deliberately excludes OAuth (docs/FUNNEL_EVENTS.md),
   *  so it is always at or below `newAccounts` and is shown as a channel figure, never as
   *  registrations. */
  signups: number;
  /** SPX graphics created, one per create. An event count, not a count of people. */
  graphicsCreated: number;
  /** Video projects created. Only recorded from the release that added the event - earlier
   *  months read zero because nothing was counting, which the page states. */
  videosCreated: number;
  /** Distinct browsers that created at least one thing. */
  creatingVisitors: number;
  /** Of those, the ones with no earlier create anywhere in the ledger. */
  firstTimeCreators: number;
  /** Creates made while signed out, and while signed in. They sum to graphics + videos. */
  anonymousCreates: number;
  signedInCreates: number;
  /** Graphics made with NO ACCOUNT. The editor has no login wall, so this is the free core's
   *  promise measured rather than assumed. Graphics only, matching the split above. */
  anonymousGraphics: number;
  /** Distinct browsers that created something while signed out - so one enthusiastic
   *  anonymous visitor cannot read as adoption. */
  anonymousCreators: number;
  /** Export packages that reached the disk. Every row is a success; there is no failure
   *  counterpart, so no rate is computed from this. */
  exports: number;
  exportingVisitors: number;
  /** Exports completed with no account - the free core delivering its whole value to someone
   *  the product will never see again, which is the point rather than a leak. */
  anonymousExports: number;
  /** The NoaCG-funded Lite ledger: attempts, and their resolved outcomes. Successes, failures
   *  and declines do not sum to attempts - a generation still running is none of them. */
  aiGenerations: number;
  aiSuccesses: number;
  /** Broke. Not a brief Lite declined - that is the next field - and not an abandoned
   *  reservation. */
  aiFailures: number;
  /** Briefs Lite refused as outside its scope: multi-graphic, advanced state machine, too
   *  complex. The guardrail FIRING, so it is never counted as a failure - but worth watching,
   *  because a rising number is people asking for something Lite cannot do yet. */
  aiDeclined: number;
  /** Distinct accounts that started a Lite generation. */
  aiUsers: number;
  /** Provider cost, in USD, over generations that actually reached a provider. A generation
   *  that never chose a route still carries the reservation's cost CEILING rather than a real
   *  charge (the fleet-budget check books it up front on purpose), so including those
   *  overstated spend more than sixfold on this instance. */
  aiCostUsd: number;
  /** Model-gateway traffic, split by whose key paid. Only the managed half is NoaCG's money. */
  gatewayManaged: number;
  gatewayByo: number;
  /** AI calls with NO ACCOUNT AT ALL. Independent of the byo/managed split above - anonymity
   *  and whose key paid are separate facts, and an anonymous caller can be on ours. The Lite
   *  ledger cannot answer this either (hosted generation always has an account behind it), so
   *  it is the only place account-free AI is counted. */
  anonymousGatewayCalls: number;
  gatewayManagedCostUsd: number;
  gatewayFailures: number;
  /** Cloud render jobs by submission time. A job submitted inside the window and finished
   *  after it counts as started here and delivered nowhere. */
  rendersStarted: number;
  /** Reached completion, whether or not the output file still exists. `expired` is reachable
   *  only from `complete` (the TTL cron deletes the blob and keeps the row), so counting
   *  `complete` alone would decay this toward zero on a perfectly healthy instance. */
  rendersDelivered: number;
  /** Actually failed. Not `cancelled` - somebody changing their mind - and emphatically not
   *  `expired`, which is a delivered render whose file has since aged out. */
  rendersFailed: number;
  /** Median wall-clock time from submission to the last status write, over jobs whose output
   *  is STILL LIVE. It cannot widen to the delivered set: expiring a job overwrites the row's
   *  timestamp with the deletion time, so an aged-out render would report the age of its file
   *  rather than how long it took. Null when no live output falls in the window. */
  renderMedianMs: number | null;
}

export interface AdminOverviewWindow {
  id: AdminPeriodId;
  /** ISO instants. Boundaries are local midnight in the reporting timezone, and every window
   *  ends at `to` = the moment the page was generated. */
  from: string;
  to: string;
  /** The same elapsed length, one period earlier - month-to-date against the same number of
   *  days at the start of the previous month, never against a whole month. */
  previousFrom: string;
  previousTo: string;
  metrics: AdminOverviewMetrics;
  /** Null when the comparison span could not be read. Never silently zero. */
  previous: AdminOverviewMetrics | null;
  /** The ledgers whose history does not cover this comparison span, so "last period" is partly
   *  a stretch of time they were not recording. A change measured against one of those would
   *  render as growth when what actually changed is that counting began, so the page withholds
   *  it - but ONLY for the metrics counted from those ledgers. The rest keep their comparison,
   *  because the ledgers were switched on months apart and a single flag would hide a
   *  registration trend on the grounds that the funnel is young. */
  previousPartialLedgers: AdminLedgerId[];
}

/** The standing picture, not a window. */
export interface AdminOverviewState {
  totalAccounts: number;
  suspendedAccounts: number;
  /** Registered accounts with no create ATTRIBUTED to them. Attribution needs the person to
   *  have been signed in at the time, so somebody who built a graphic before registering is
   *  counted here - an upper bound on "never made anything", not an exact figure. */
  accountsNeverCreated: number;
  /** Accounts carrying the internal mark. NOT scoped - it is the same number under every
   *  scope, because it describes the filter rather than being filtered by it. */
  internalAccounts: number;
  activeGrants: number;
  grantsExpiringSoon: number;
  rendersInFlight: number;
  /** Past their own deadline and still not terminal - the sweep has not caught them. */
  rendersOverdue: number;
  /** The oldest row in each ledger, ONE PER LEDGER. A window reaching back further than one of
   *  these is short for a reason nothing else on the page would show. They differ by months on
   *  this instance, which is exactly why they are not collapsed into one number. */
  accountsSince: string | null;
  funnelSince: string | null;
  generationsSince: string | null;
  gatewaySince: string | null;
  rendersSince: string | null;
}

/** An enumerated distribution: `bucket` names the question, `key` is a slug the product
 *  itself writes (a creation door, an export target, a render format, a failure code). Never
 *  user text - the underlying ledgers cannot hold any. */
export interface AdminOverviewMixEntry {
  bucket: string;
  key: string;
  count: number;
}

/**
 * Whose activity a usage section is counting.
 *
 * `external` is the default everywhere and excludes accounts marked internal - the operator's
 * own development, testing and demo accounts (migration 0027). `internal` is the exact
 * complement, so that activity stays inspectable for debugging instead of merely hidden. `all`
 * is the unfiltered number these endpoints returned before the scope existed.
 *
 * The two halves partition the whole, which is what makes the filter checkable rather than
 * plausible - asserted against the live tables by 0027's self-check.
 */
export const ADMIN_ACTIVITY_SCOPES = ['external', 'internal', 'all'] as const;
export type AdminActivityScope = (typeof ADMIN_ACTIVITY_SCOPES)[number];

export interface AdminOverviewResponse {
  /** Which scope produced every number below. Echoed rather than assumed: a filtered total
   *  that does not announce itself is more misleading than an unfiltered one. */
  scope: AdminActivityScope;
  /** How many accounts carry the internal mark, ALWAYS unfiltered. Zero here means the
   *  exclusion is doing nothing, which is the difference between a working filter and one
   *  nobody has configured yet. */
  internalAccounts: number;
  /** The IANA zone every boundary above is expressed in. Stated because a dashboard whose
   *  "today" is undefined is a dashboard two people read differently. */
  timezone: string;
  generatedAt: string;
  windows: AdminOverviewWindow[];
  state: AdminOverviewState | null;
  /** Over the month-to-date window. */
  mix: AdminOverviewMixEntry[];
  /** False when the aggregation is not available on this database - a deployment whose
   *  migrations are behind. The page says so rather than rendering an instance-wide zero. */
  available: boolean;
  /** NoaCG-funded Lite spend against the ceiling the reservation RPC actually enforces -
   *  measured its way, a ROLLING 24 hours over the Lite ledger alone, not the calendar day
   *  the windows above use. The two differ, and a bar drawn against a differently-measured
   *  ceiling would mislead exactly when it matters. */
  fleet: { spendLast24hUsd: number; ceilingUsd: number } | null;
  /** Things an operator will look for and NOT find, named on the page. An absent metric that
   *  is not explained reads as a zero. */
  notTracked: string[];
}

// ── model eligibility ──────────────────────────────────────────────────────────────────

/** `approved` = an audited entry in this repository's catalog. `eligible` = the live listing
 *  clears every mechanical check but nothing has audited or benched it. `ineligible` = at
 *  least one check fails. None of the three is a statement about quality. */
export type AdminModelVerdict = 'approved' | 'eligible' | 'ineligible';

export type ModelBlockCode =
  | 'not-funded-provider'
  | 'over-price-ceiling'
  | 'price-unknown'
  | 'no-structured-output'
  | 'unavailable';

export interface AdminModelRow {
  key: string;
  provider: string;
  model: string;
  name: string;
  contextLength: number | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  structuredOutput: boolean;
  vision: boolean;
  openWeight: boolean;
  free: boolean;
  available: boolean;
  /** Zero-data-retention is an audited fact here, never a discovered one: the provider listing
   *  carries no per-model flag, so anything outside the catalog is honestly unknown. */
  zdr: 'audited' | 'unknown';
  zdrAvailable: boolean | null;
  approved: boolean;
  verdict: AdminModelVerdict;
  blocks: ModelBlockCode[];
  createdAt: string | null;
  isNew: boolean;
  /** Where this route is actually wired in right now, read off the code that chooses it -
   *  the task registry for the registered tasks, `PRO_STANDARD_ROUTES` for the Pro tier.
   *  Empty for the great majority of listed models. */
  usedBy: AdminRouteUse[];
}

/** One caller's use of a route. */
export interface AdminRouteUse {
  /** Human label for what uses it, e.g. "NoaCG Lite" or "NoaCG Pro concept". */
  task: string;
  /** Only where the distinction EXISTS. It is operational, not decorative: a fallback
   *  carrying traffic means the primary is failing. NoaCG Pro pins one curated route per
   *  stage with nothing behind it, so labelling those "primary" would invent a spare that
   *  does not exist - they carry no slot at all. */
  slot?: 'primary' | 'fallback';
}

// ── image models (NoaCG Pro) ───────────────────────────────────────────────────────────
//
// A SEPARATE shape from AdminModelRow on purpose. The funded-route rules are per-million
// TOKENS, which says nothing about a model billed per image, so this listing carries no
// verdict, no blocks and no eligibility language at all. Inventing a ceiling nobody has set
// would mark usable models ineligible on a rule that does not exist.

export interface AdminImageModelRow {
  key: string;
  provider: string;
  model: string;
  name: string;
  /** Price in USD for ONE generated image. Null is "not published", never "free".
   *
   *  Vercel AI Gateway publishes this figure directly (`pricing.image`) and only for dedicated
   *  image models. A multimodal LANGUAGE model that answers with an image - which is what the
   *  Pro concept route is - bills through its ordinary output tokens instead, so it correctly
   *  shows null here and its cost is visible in the token columns. */
  imagePriceUsd: number | null;
  /** Some image routes also bill tokens for the prompt; shown when published. */
  inputPerMillion: number | null;
  /** Same two fields, same meaning and same discipline as the text rows. This tab carries no
   *  eligibility verdict, but ZDR is not a verdict - it is an audit that either happened or
   *  did not, and omitting it here would let "no verdict" read as "nothing audited". */
  zdr: 'audited' | 'unknown';
  zdrAvailable: boolean | null;
  available: boolean;
  createdAt: string | null;
  isNew: boolean;
  /** Same meaning as on the text rows: NoaCG Pro's concept stage pins one image route, so the
   *  operator can see which of these the tier actually draws with. */
  usedBy: AdminRouteUse[];
}

export interface AdminImageModelsResponse {
  provider: string;
  syncedAt: string | null;
  models: AdminImageModelRow[];
  discoveryFailed: boolean;
}

export interface AdminModelsResponse {
  provider: string;
  /** When the discovery cache was filled. */
  syncedAt: string | null;
  models: AdminModelRow[];
  /** The rule the verdicts were measured against, so the page states it rather than leaving
   *  the operator to infer it. */
  rule: { provider: string; inputPerMillion: number; outputPerMillion: number; newModelDays: number };
  /** Approved routes the provider stopped listing. The free tier fails closed on one of
   *  these, so it is an outage, not a curiosity. */
  missingApproved: string[];
  /** True when the provider listing could not be read at all. The rest of /admin stays
   *  usable; this section says why it is empty. */
  discoveryFailed: boolean;
}

// ── output quality ─────────────────────────────────────────────────────────────────────

/** One deterministic chassis against one broad intent facet, and what happened to it. Ids and
 *  counts only - the quality ledger is content-free by design (src/ai/AGENTS.md). */
export interface AdminQualityVariant {
  variantId: string;
  intentKind: string;
  /** Generations the user kept. */
  accepted: number;
  /** Generations the user explicitly threw away (`rejection_reason = 'user_discarded'`).
   *  An abandoned tab is neither, and is counted in neither. */
  discarded: number;
}

export interface AdminQualityOverview {
  /** Applies to `emerging`, `reasons` and `totals`. Deliberately NOT to `priors` - those are
   *  the rows the generator is actually fed, and a filtered version would describe a prompt
   *  that does not exist. */
  scope: AdminActivityScope;
  internalAccounts: number;
  /** Rows in the window that are eligible to become a prior (kept or explicitly discarded,
   *  with a chassis and an intent facet), and how many of those came from internal accounts.
   *  Always unscoped, because the question is about what the PROMPT is being fed. A high share
   *  means the generator is learning from our own testing - reported so the owner can decide
   *  whether `ai_lite_variant_quality()` should exclude internal accounts, which would be a
   *  change to generation behaviour rather than to this page. */
  priorRows: number;
  internalPriorRows: number;
  /** The operator's window, in days, after clamping. */
  days: number;
  /** Accept-versus-discard per chassis over that window, WITHOUT the sample floor, worst keep
   *  rate first. This is the signal the generator does not act on yet. */
  emerging: AdminQualityVariant[];
  /** Enumerated discard reason -> count. The reason set is fixed by a CHECK constraint in
   *  `0011_ai_lite_quality_feedback.sql`; free text is deliberately impossible. */
  reasons: { reason: string; count: number }[];
  /** EXACTLY the rows the generator is fed as a tie-breaker right now - same RPC, same window,
   *  same floor as `api/_lib/lite/generations.ts` - so the page shows what is happening rather
   *  than a recomputation that could drift from it. */
  priors: AdminQualityVariant[];
  priorWindowDays: number;
  priorMinSamples: number;
  totals: { generations: number; withVariant: number; withFeedback: number };
  /** The window hit the row cap, so the numbers below it are a floor, not a total. */
  truncated: boolean;
}

// ── system controls ────────────────────────────────────────────────────────────────────

export interface AdminSystemState {
  /** Feature kill switches. A false value disables the feature for EVERY user, plans and
   *  grants included - it is an incident control, not an entitlement. */
  disabledFeatures: FeatureKey[];
  /** Approved model routes and whether each is currently allowed to serve traffic. */
  models: { provider: string; model: string; enabled: boolean; note: string }[];
  /** Shown to every visitor when set. Empty means no notice. */
  maintenanceNotice: { message: string; level: 'info' | 'warning'; until: string | null } | null;
  /** Users who see beta-marked features and templates regardless of their plan. */
  betaUserIds: string[];
  /** Hosted Pro's deployment gate, term by term. The public endpoints answer only
   *  `not-configured`, deliberately - this is the operator's view of WHICH term vanished the
   *  tier. Keys mirror `ProGateTerms` (api/_lib/pro/gate.ts), the one computation both share.
   *  Optional so a client ahead of its server degrades to "unknown" rather than crashing. */
  hostedPro?: {
    enabled: boolean;
    auth: boolean;
    ledger: boolean;
    task: boolean;
    managedKey: boolean;
    routesEnabled: boolean;
    configured: boolean;
  };
}

// ── templates ──────────────────────────────────────────────────────────────────────────

export type TemplateVisibility = 'public' | 'beta' | 'internal' | 'hidden';

export interface AdminTemplateEntry {
  key: string;
  source: 'catalog' | 'community';
  name: string;
  category: string;
  visibility: TemplateVisibility;
  /** Times this template was used to create a graphic, from the funnel ledger. */
  uses: number;
  note: string;
}

export interface AdminTemplateListResponse {
  templates: AdminTemplateEntry[];
  /** True when the funnel ledger is not available, so `uses` is zero for a reason. */
  usageUnavailable: boolean;
}

// ── beta feedback and generation ratings ───────────────────────────────────────────────
//
// The one admin surface that carries what a PERSON wrote rather than what the product recorded
// about itself. Everything here comes from `user_feedback` (migration 0028), which is a
// separate table for exactly that reason: the generation ledger and the overview aggregates
// keep their promise that no free text can reach them.
//
// It is operational evidence and never a verdict. A model attracting complaints is a reason to
// go and look; only a NoaCG benchmark can say a model is worse (docs/AI_LITE_PROMOTION.md), and
// the Models section still refuses to rank.

export interface AdminFeedbackItem {
  id: string;
  kind: 'beta' | 'generation';
  sentiment: 'positive' | 'negative';
  /** Enumerated reason codes from src/feedback/contract.ts - never free text. */
  reasons: string[];
  /** The user's own words. Empty when they rated without explaining, which is normal: the
   *  rating is one click and an explanation is never demanded. */
  message: string;
  userId: string | null;
  /** Resolved from the auth directory at read time. Empty for anonymous feedback - the editor
   *  has no login wall, so the most useful note may come from someone with no account. */
  email: string;
  /** Whether this came from an account marked internal. Shown rather than silently filtered,
   *  so a page under the 'all' scope can still be read honestly. */
  internal: boolean;
  /** The funnel's first-party browser id, when the visitor had one. It is what groups several
   *  anonymous notes as one person's session; it is not derived from any account. */
  visitorId: string | null;
  area: string | null;

  // ── investigation context, all server-derived (api/_lib/feedbackStore.ts) ──────────────
  // Enough to reproduce a bad result. Deliberately NOT here: the prompt, the brief, the
  // generated template, or any uploaded asset.
  generationId: string | null;
  tier: string | null;
  model: string | null;
  variantId: string | null;
  intentKind: string | null;
  promptVersion: string | null;

  status: 'new' | 'reviewed' | 'resolved';
  adminNote: string;
  reviewedAt: string | null;
  createdAt: string;
}

/** One dimension's split. `negative` leads the ordering because this is an inbox: three
 *  complaints must not be buried under thirty compliments. */
export interface AdminFeedbackBreakdown {
  key: string;
  positive: number;
  negative: number;
  total: number;
}

export interface AdminFeedbackOverview {
  scope: AdminActivityScope;
  /** Accounts carrying the internal mark, unfiltered - so the scope control can say whether
   *  the exclusion is doing anything at all. */
  internalAccounts: number;
  days: number;
  items: AdminFeedbackItem[];
  totals: {
    all: number;
    positive: number;
    negative: number;
    /** Anything not yet marked resolved - what is still owed an answer. */
    unresolved: number;
    withMessage: number;
    generationRatings: number;
    betaNotes: number;
  };
  reasons: { reason: string; count: number }[];
  byModel: AdminFeedbackBreakdown[];
  byTier: AdminFeedbackBreakdown[];
  byVariant: AdminFeedbackBreakdown[];
  byArea: AdminFeedbackBreakdown[];
  /** The window hit the row cap, so every figure above is a floor rather than a total. */
  truncated: boolean;
}
