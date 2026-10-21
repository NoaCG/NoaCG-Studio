// Runtime operational controls, read from the database instead of from the environment.
//
// The point is the incident case: when a model starts returning garbage or a feature breaks
// at 9pm, the fix should be a switch, not a redeploy. Everything here is therefore read on
// the request path - and, because it is on the request path, everything here FAILS OPEN on a
// read error. A control plane that cannot be reached must not take the product down with it;
// the controls exist to turn things off deliberately, never by accident.
//
// The exception to fail-open is model routing, and it is deliberate: a route that has been
// switched off stays off, because the reason to switch a route off is usually that its output
// is wrong or its cost has spiked, and serving it anyway is the outcome the switch exists to
// prevent. See disabledRoute() below. The server tick's switch fails closed for the same reason
// (dataTickOn() at the end).

import { adminConfigured, adminDb } from './adminAuth.js';
import { isFeatureKey, type FeatureKey } from '../../src/entitlements/contract.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

export interface MaintenanceNotice {
  message: string;
  level: 'info' | 'warning';
  until: string | null;
}

export interface SystemSettings {
  disabledFeatures: FeatureKey[];
  /** provider:model keys that may NOT serve traffic. */
  disabledRoutes: string[];
  maintenanceNotice: MaintenanceNotice | null;
  betaUserIds: string[];
}

const EMPTY: SystemSettings = {
  disabledFeatures: [],
  disabledRoutes: [],
  maintenanceNotice: null,
  betaUserIds: [],
};

/** Cached briefly so a burst of requests does not become a burst of settings queries. Short
 *  enough that flipping a switch takes effect while an operator is still watching the page. */
const TTL_MS = 10_000;
let cache: { at: number; value: SystemSettings } | null = null;

function stringArray(value: unknown, limit = 200): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, limit) : [];
}

function toNotice(value: unknown): MaintenanceNotice | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const message = typeof row.message === 'string' ? row.message.trim() : '';
  if (!message) return null;
  // A notice with an expiry in the past has already stopped applying. Deciding that here
  // rather than at every read point means no consumer has to remember to check.
  const until = typeof row.until === 'string' && Number.isFinite(Date.parse(row.until)) ? row.until : null;
  if (until && Date.parse(until) <= Date.now()) return null;
  return { message: message.slice(0, 500), level: row.level === 'warning' ? 'warning' : 'info', until };
}

export function resetSystemSettingsCache(): void {
  cache = null;
}

export async function systemSettings(): Promise<SystemSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (!adminConfigured()) return EMPTY;
  try {
    const db = await adminDb();
    const { data, error } = await db.from('system_settings').select('key, value');
    if (error) return EMPTY;

    const byKey = new Map((data ?? []).map((row) => [row.key as string, (row as { value: unknown }).value]));
    const value: SystemSettings = {
      disabledFeatures: stringArray(byKey.get('disabled_features')).filter(isFeatureKey),
      disabledRoutes: stringArray(byKey.get('disabled_routes')),
      maintenanceNotice: toNotice(byKey.get('maintenance_notice')),
      betaUserIds: stringArray(byKey.get('beta_user_ids'), 500),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return EMPTY;
  }
}

/** Has this route been switched off? Reads the already-loaded settings rather than querying,
 *  so a caller checking three routes makes zero extra round trips. */
export function routeDisabled(settings: SystemSettings, route: ModelRoute): boolean {
  return settings.disabledRoutes.includes(`${route.provider}:${route.model}`);
}

// ── The server tick's switch (docs/work-specs/data-sources/spec.md, phase C2) ───────────────────
// The OPPOSITE of this module's fail-open rule, like a switched-off model route: the switch is a
// cost control, so anything unreadable reads as off. It holds an expiry, never a flag: on means on
// until `until`, which may lie at most 48 hours ahead, so a lost coordinator or a mistaken write
// can never leave the tick running (the 48-hour window bounds even a runaway tick to about $5,
// docs/work-specs/data-sources/evidence/tick-cost-estimate.md). Migration 0097's `data_tick_on()`
// states the same rule for the sources line.

/** The setting's key; its value is `{ "until": "<ISO time>" }`. Absent ships the tick off. */
export const DATA_TICK_KEY = 'data_tick_until';
/** The furthest ahead `until` may lie and still read as on. */
export const DATA_TICK_WINDOW_MS = 48 * 3600 * 1000;

/** Whether a stored switch value reads as on at `now`. */
export function dataTickOnAt(value: unknown, now: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const until = (value as { until?: unknown }).until;
  if (typeof until !== 'string') return false;
  const at = Date.parse(until);
  return Number.isFinite(at) && at > now && at - now <= DATA_TICK_WINDOW_MS;
}

/** Read the switch now, uncached (once a minute): false on any error, or with no backend. */
export async function dataTickOn(now = Date.now()): Promise<boolean> {
  if (!adminConfigured()) return false;
  try {
    const db = await adminDb();
    const { data, error } = await db.from('system_settings').select('value').eq('key', DATA_TICK_KEY).maybeSingle();
    if (error || !data) return false;
    return dataTickOnAt((data as { value: unknown }).value, now);
  } catch {
    return false;
  }
}
