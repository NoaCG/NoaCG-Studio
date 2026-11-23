// IS A COMPANION CONNECTED? (docs/work-specs/live-production-reliability/spec.md P4). The page
// answering the panel cannot see Companion itself; the module reports liveness every 15 s with its
// version and status (`panel_seen`, supabase/migrations/0128_panel_seen.sql), and `panel_list`
// says how many seconds ago each paired panel last did. This reads that into one state for the
// header chip and one per panel for the dialog. Pure: the page passes the list and its clock.

import type { PanelKeyRow, PanelList } from './panelRelay';

/** A panel whose last report is younger than this is connected: three reports at 15 s, so one
 *  lost report, and the page's 8 s between reads, never turn it amber. */
export const SEEN_FRESH_S = 45;

export type CompanionHealth =
  /** A paired Companion reported in the last 45 s and its keys work. */
  | { kind: 'connected' }
  /** It reported, and its own connection to the production is being made again. */
  | { kind: 'reconnecting' }
  /** It runs a module too old to work with this production, or to report at all. */
  | { kind: 'update' }
  /** A Companion still holds a key this production revoked. */
  | { kind: 'refused' }
  /** Not heard from in 45 s: `since` is when it last was (this page's clock), null for never. */
  | { kind: 'unseen'; since: number | null }
  /** No panel is paired. */
  | { kind: 'none' };

/** When a listed panel last reported, on this page's clock, or null. The database counts the
 *  seconds, so a page whose clock is wrong still reads it right. */
function seenAt(p: PanelKeyRow, readAt: number): number | null {
  return typeof p.seen_s === 'number' ? readAt - p.seen_s * 1000 : null;
}

/** One paired panel's state. */
export function panelHealth(p: PanelKeyRow, readAt: number, now: number): CompanionHealth {
  const at = seenAt(p, readAt);
  if (at !== null && now - at < SEEN_FRESH_S * 1000) {
    if (p.module_status === 'outdated') return { kind: 'update' };
    if (p.module_status === 'revoked') return { kind: 'refused' };
    if (p.module_status === 'offline') return { kind: 'reconnecting' };
    return { kind: 'connected' };
  }
  // A module from before the report has said hello or pressed, and never reported.
  if (at === null && !p.module_version && p.last_used_at) return { kind: 'update' };
  return { kind: 'unseen', since: at };
}

const RANK: Record<CompanionHealth['kind'], number> = { connected: 0, refused: 1, update: 2, reconnecting: 3, unseen: 4, none: 5 };

/** The production's state: green when any paired Companion is connected; else what most needs doing. */
export function companionHealth(list: PanelList | null, now: number): CompanionHealth | null {
  if (!list) return null;
  const each = list.panels.map((p) => panelHealth(p, list.readAt, now));
  if (typeof list.refused_s === 'number' && now - (list.readAt - list.refused_s * 1000) < SEEN_FRESH_S * 1000) {
    each.push({ kind: 'refused' });
  }
  if (!each.length) return { kind: 'none' };
  const best = each.reduce((a, b) => (RANK[b.kind] < RANK[a.kind] ? b : a));
  if (best.kind !== 'unseen') return best;
  // Not seen: since the newest report of any of them.
  const times = each.flatMap((h) => (h.kind === 'unseen' && h.since !== null ? [h.since] : []));
  return { kind: 'unseen', since: times.length ? Math.max(...times) : null };
}

/** A time of day, or the date for one more than a day back. */
export function seenTime(at: number, now: number): string {
  const d = new Date(at);
  return now - at < 20 * 3_600_000 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
}

/** The header chip's words. */
export function healthWords(h: CompanionHealth, now: number): string {
  switch (h.kind) {
    case 'connected':
      return 'Companion connected';
    case 'reconnecting':
      return 'Companion reconnecting';
    case 'update':
      return 'Companion needs an update';
    case 'refused':
      return 'Panel key refused, pair again';
    case 'none':
      return 'No panel paired';
    case 'unseen':
      return h.since === null ? 'Companion not seen yet' : `Companion not seen since ${seenTime(h.since, now)}`;
  }
}

/** One panel's words in the dialog's list, after its name. */
export function panelWords(h: CompanionHealth, now: number): string {
  switch (h.kind) {
    case 'connected':
      return 'connected';
    case 'reconnecting':
      return 'reconnecting';
    case 'update':
      return 'needs an update';
    case 'refused':
      return 'key refused';
    case 'none':
      return '';
    case 'unseen':
      return h.since === null ? 'not seen yet' : `not seen since ${seenTime(h.since, now)}`;
  }
}

/** Green only for connected, red for a refused key, amber for the rest. */
export function healthTone(h: CompanionHealth): 'ok' | 'warn' | 'bad' {
  return h.kind === 'connected' ? 'ok' : h.kind === 'refused' ? 'bad' : 'warn';
}
