// The per-IP burst gate, in front of POST /api/render/start and POST /api/ai/generate.
//
// Three guards sit on the render route, and they stop different things:
//   WAF rate-limit rule  — refuses a flood at the edge, before a function is invoked at
//                          all (docs/RENDER.md; configured on Vercel, not in this repo).
//   THIS                 — refuses one hammering client before the handler reads a body
//                          of up to 4 MB and makes four ledger queries.
//   admission.ts         — caps how many renders actually RUN, fleet-wide.
// The tier quotas in src/render/limits.ts are none of these: they are the per-visitor
// entitlement, checked after the request has already been parsed.
//
// Counting is IN PROCESS and therefore PER INSTANCE — no Redis, no extra round trip, and
// nothing to configure for a self-hosted deployment. Fluid Compute reuses instances, so a
// hammering client keeps meeting the same counter, but N instances mean the effective
// ceiling is up to N× the number below. That is fine for what this layer is for (making
// abuse cheap to refuse); the globally-exact limit is the WAF rule, and the guarantee that
// actually bounds cost is the fleet ceiling.

import { RENDER_CONFIG } from '../../src/render/limits.js';
import { envInt } from './env.js';
import { ipHash } from './http.js';

export interface RateLimitCaps {
  windowMs: number;
  /** Requests allowed per window per key. 0 disables the gate. */
  max: number;
}

export function startRateLimitCaps(): RateLimitCaps {
  const d = RENDER_CONFIG.startRateLimit;
  return {
    windowMs: Math.max(1, envInt('RENDER_START_RATE_WINDOW_SEC', d.windowSec)) * 1000,
    max: envInt('RENDER_START_RATE_MAX', d.maxRequests),
  };
}

interface Bucket {
  /** Index of the window this bucket's `count` belongs to. */
  window: number;
  /** The bucket's own gate's window length. Buckets from gates with different windows share
   *  the one map, so a sweep can only compare AGES in milliseconds - window indices are
   *  incommensurable across gates (a 5 s gate's indices dwarf a 60 s gate's, and an
   *  index-compared sweep would wipe every other gate's live counters). */
  windowMs: number;
  count: number;
  /** The immediately previous window's count, for the weighted estimate below. */
  prevCount: number;
}

/** Keys are salted IP hashes, so this map is bounded by distinct clients in a window.
 *  Stashed on globalThis so Vite HMR of the api modules in dev doesn't reset the counters. */
function buckets(): Map<string, Bucket> {
  const g = globalThis as { __noacgRenderRate?: Map<string, Bucket> };
  g.__noacgRenderRate ??= new Map();
  return g.__noacgRenderRate;
}

/** Past this many tracked clients, drop the ones that can no longer influence an estimate.
 *  A long-lived Fluid instance must not accumulate a key per IP it has ever seen. */
const SWEEP_ABOVE = 5000;

function sweep(map: Map<string, Bucket>, nowMs: number): void {
  // A bucket is dead once two of ITS OWN windows have passed since its window began - the
  // same condition the read path uses, stated in ms so gates with different windows can
  // share the map without sweeping each other's live counters.
  for (const [key, b] of map) if (nowMs - b.window * b.windowMs >= 2 * b.windowMs) map.delete(key);
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the pressure eases — the Retry-After on a refusal. */
  retryAfterSec: number;
}

/** Count one request against `key` and decide. Exported for testing; the handler calls
 *  checkStartRateLimit.
 *
 *  A sliding window approximated by two fixed ones: the previous window's count decays
 *  linearly as the current one fills. That costs O(1) memory per client (a plain fixed
 *  window is cheaper still, but lets a client fire 2× the limit across the boundary —
 *  precisely the burst this gate exists to flatten). A refused request is still counted,
 *  so hammering keeps the client refused rather than resetting the pressure. */
export function hitRateLimit(key: string, caps: RateLimitCaps, nowMs: number): RateLimitDecision {
  if (caps.max <= 0) return { allowed: true, retryAfterSec: 0 };

  const map = buckets();
  const window = Math.floor(nowMs / caps.windowMs);
  const intoWindow = nowMs % caps.windowMs;
  const remainingSec = Math.max(1, Math.ceil((caps.windowMs - intoWindow) / 1000));

  let b = map.get(key);
  if (!b || b.windowMs !== caps.windowMs || b.window < window - 1) b = { window, windowMs: caps.windowMs, count: 0, prevCount: 0 };
  else if (b.window === window - 1) b = { window, windowMs: caps.windowMs, count: 0, prevCount: b.count };

  // The question is whether ADMITTING this request would exceed the budget, not whether
  // the budget is already gone: asking it the second way leaves exactly one request of
  // slack at a window boundary, where a decayed previous count lands a hair under max.
  const decayedPrev = b.prevCount * (1 - intoWindow / caps.windowMs);
  const wouldExceed = decayedPrev + b.count + 1 > caps.max;

  b.count += 1;
  map.set(key, b);
  if (map.size > SWEEP_ABOVE) sweep(map, nowMs);

  return wouldExceed ? { allowed: false, retryAfterSec: remainingSec } : { allowed: true, retryAfterSec: 0 };
}

/** The gate as the handler uses it: null when the request may proceed. Keyed on the same
 *  salted IP hash as the anonymous render quota — raw IPs are never stored. */
export function checkStartRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`start:${ipHash(req)}`, startRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

// ── The AI model gateway's burst gate ────────────────────────────────────────────────────
// Same posture as the render gate: refuse one hammering client before the handler reads a
// body of up to 12 MB, per instance, before any provider is contacted. It limits BYO-key
// traffic too — the user's own key is still the platform's egress. The limit matches the
// Lite gate's classroom-NAT-friendly stance (a shared IP must not starve a class).

export function aiGenerateRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('AI_GENERATE_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('AI_GENERATE_RATE_MAX', 60),
  };
}

/** Null when the request may proceed, else the refusal with its Retry-After. */
export function checkAiGenerateRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`ai-generate:${ipHash(req)}`, aiGenerateRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

// ── The funnel ledger's burst gate ───────────────────────────────────────────────────────
// POST /api/events costs almost nothing per call, so this is not about protecting the
// function — it is about the DATA. An unthrottled endpoint lets one client manufacture a
// funnel, and a made-up activation rate is worse than a missing one. The cap is generous
// against a real session (a page load reports at most a handful of events) and still makes
// bulk forgery tedious. Same shared-IP stance as the other two: a classroom must not be
// starved by a neighbour.

export function eventsRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('EVENTS_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('EVENTS_RATE_MAX', 60),
  };
}

export function checkEventsRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`events:${ipHash(req)}`, eventsRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

// ── The Production Data API's two gates (docs/DATA_API.md) ───────────────────────────────────
// The per-IP gate is the usual posture: refuse a hammering client before the handler reads a
// body or touches the database. The per-PRODUCTION budget is the one that matters editorially:
// the DB's own cap is 50 commands per 5 s per show, SHARED with the operator - and operator
// precedence (docs/CLOUD_PLAYOUT.md §7) must survive a runaway feed. So ingest may spend at
// most half that window by default, and the operator keeps the rest. A scorebug clock at one
// update per second costs 5 of the 25. Same per-instance caveat as the render gate; the
// DB-side cap is the globally-exact ceiling.

export function dataIpRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('DATA_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('DATA_RATE_MAX', 300),
  };
}

/** Null when the request may proceed, else the refusal with its Retry-After. */
export function checkDataIpRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`data-ip:${ipHash(req)}`, dataIpRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

export function dataIngestBudgetCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('DATA_INGEST_RATE_WINDOW_SEC', 5)) * 1000,
    max: envInt('DATA_INGEST_RATE_MAX', 25),
  };
}

/** The per-production budget, keyed by show id (one feed and one hammering integrator are the
 *  same key on purpose - the budget protects the PRODUCTION, not the client). */
export function checkDataIngestBudget(showId: string): RateLimitDecision | null {
  const decision = hitRateLimit(`data-show:${showId}`, dataIngestBudgetCaps(), Date.now());
  return decision.allowed ? null : decision;
}

// ── feedback ──────────────────────────────────────────────────────────────────────────────
// Tighter than the funnel's 60/minute, and deliberately so: this is the only route on the
// product that accepts free text from an unauthenticated caller, which makes it the only one
// worth spamming. A real person sends a handful of notes in a session and never approaches
// twelve in an hour; a script trying to fill the table hits the wall immediately.
//
// Per IP like the others, with the same shared-address stance: a classroom behind one NAT is a
// realistic case, so the cap is set where a room full of people can all still be heard.

export function feedbackRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('FEEDBACK_RATE_WINDOW_SEC', 3600)) * 1000,
    max: envInt('FEEDBACK_RATE_MAX', 12),
  };
}

export function checkFeedbackRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`feedback:${ipHash(req)}`, feedbackRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

// ── The agent access doors (docs/AGENT_SAVE.md) ──────────────────────────────────────────
// Three gates, per IP like the others and for the same reasons: refuse a hammering client
// before the handler reads a body or touches the database. `redeem` is the tight one - it is
// the only unauthenticated POST on the key routes (the code it consumes IS the credential,
// 256 bits of it, so this is about cost rather than brute force). The save door carries a
// SECOND, per-principal budget: one leaked key must not be able to fill a library faster
// than its owner can revoke it, whatever IPs it arrives from.

export function agentKeysRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('AGENT_KEYS_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('AGENT_KEYS_RATE_MAX', 30),
  };
}

export function checkAgentKeysRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`agent-keys:${ipHash(req)}`, agentKeysRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

export function agentRedeemRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('AGENT_REDEEM_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('AGENT_REDEEM_RATE_MAX', 10),
  };
}

export function checkAgentRedeemRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`agent-redeem:${ipHash(req)}`, agentRedeemRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

export function agentSaveRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('AGENT_SAVE_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('AGENT_SAVE_RATE_MAX', 60),
  };
}

/** Per IP, in front of everything else on the save door. */
export function checkAgentSaveIpRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`agent-save-ip:${ipHash(req)}`, agentSaveRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

export function agentSavePrincipalRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('AGENT_SAVE_USER_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('AGENT_SAVE_USER_RATE_MAX', 30),
  };
}

/** Per PRINCIPAL (the account the key belongs to), keyed on the user id - one leaked key and
 *  one busy agent are the same key on purpose: the budget protects the LIBRARY. */
export function checkAgentSavePrincipalRateLimit(userId: string): RateLimitDecision | null {
  const decision = hitRateLimit(`agent-save-user:${userId}`, agentSavePrincipalRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}

// ── the remote MCP connector (docs/REMOTE_MCP_PLAN.md) ─────────────────────────────────────
// Per IP, in front of the token check: every connector call verifies a token with Supabase Auth
// and reads a grant row, so a flood is refused before either round trip.

export function connectorRateLimitCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('CONNECTOR_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('CONNECTOR_RATE_MAX', 120),
  };
}

export function checkConnectorRateLimit(req: Request): RateLimitDecision | null {
  const decision = hitRateLimit(`connector:${ipHash(req)}`, connectorRateLimitCaps(), Date.now());
  return decision.allowed ? null : decision;
}
