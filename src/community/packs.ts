// The shared half of the Community packs shelf (docs/work-specs/community-packs/spec.md): thin
// calls over the security definer functions of migrations 0079, 0080 and 0083. Every rule - who may
// submit, who decides, what others may read - is the server's; this file only asks.
//
// Offline-invariant, like communityData.ts: with no backend configured `getSupabase()` resolves
// null and every reader answers empty, so the seeded shelf works exactly as it did.

import { getSupabase } from '../backend/supabase';

export type PackState = 'in_review' | 'live' | 'not_accepted' | 'withdrawn' | 'taken_down' | 'replaced';

/** What a pack's state is CALLED where the maker reads it (spec D10). */
export const PACK_STATE_LABEL: Record<PackState, string> = {
  in_review: 'In review',
  live: 'Live',
  not_accepted: 'Not accepted',
  withdrawn: 'Withdrawn',
  taken_down: 'Taken down',
  replaced: 'Replaced',
};

/** A live pack on the shelf, or one waiting for review. Every version of one pack shares its
 *  `lineage`. */
export interface SharedPack {
  id: string;
  name: string;
  description: string;
  author: string;
  graphics: number;
  version: number;
  lineage: string;
}

/** A live pack with reports an admin has not dismissed: how many, and the latest reasons. */
export interface ReportedPack extends SharedPack {
  /** How many accounts reported it. */
  reports: number;
  reasons: string[];
  /** The newest report the list holds; Dismiss covers reports up to it, never a later one. */
  lastReported: string;
}

/** One of the maker's own submissions. */
export interface MyPack extends SharedPack {
  state: PackState;
  reason: string | null;
}

interface Row {
  id: string;
  name: string;
  description: string;
  author_name: string;
  graphics: number;
  version: number;
  lineage?: string;
  state?: PackState;
  reason?: string | null;
  reports?: number;
  reasons?: string[] | null;
  last_reported?: string;
}

const shared = (r: Row): SharedPack => ({
  id: r.id,
  name: r.name,
  description: r.description,
  author: r.author_name,
  graphics: r.graphics,
  version: r.version,
  // Falls back to the row id while a server without 0080 answers no lineage.
  lineage: r.lineage ?? r.id,
});

async function rows(fn: string): Promise<Row[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc(fn);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** Every live pack, newest approval first. Anyone may read it. */
export async function listSharedPacks(): Promise<SharedPack[]> {
  return (await rows('community_pack_shelf')).map(shared);
}

/** The signed-in maker's own submissions. */
export async function listMyPacks(): Promise<MyPack[]> {
  return (await rows('community_pack_mine')).map((r) => ({
    ...shared(r),
    state: r.state ?? 'in_review',
    reason: r.reason ?? null,
  }));
}

/** What waits for review. Empty for anyone but a moderator. */
export async function listWaitingPacks(): Promise<SharedPack[]> {
  return (await rows('community_pack_waiting')).map(shared);
}

/** Live packs with reports waiting, most recently reported first. Empty for anyone but a moderator. */
export async function listReportedPacks(): Promise<ReportedPack[]> {
  return (await rows('community_pack_reported')).map((r) => ({
    ...shared(r),
    reports: r.reports ?? 0,
    reasons: r.reasons ?? [],
    lastReported: r.last_reported ?? '',
  }));
}

/** Report a live pack that is not the caller's own, with what is wrong with it. */
export async function reportPack(id: string, reason: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Reporting needs a connection.');
  const { error } = await sb.rpc('community_pack_report', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** A moderator keeps a reported pack: the reports they read, up to `until`, leave the Reported
 *  list; one filed since stays. */
export async function dismissReports(id: string, until: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('community_pack_reports_dismiss', { p_id: id, p_until: until });
  if (error) throw new Error(error.message);
}

/** A pack file as JSON text, ready for `parsePack`. */
export async function sharedPackText(id: string): Promise<string> {
  const sb = await getSupabase();
  if (!sb) throw new Error('The community shelf needs a connection.');
  const { data, error } = await sb.rpc('community_pack_file', { p_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That pack is no longer offered.');
  return JSON.stringify(data);
}

/** Send a pack for review, or with `updateOf` (a live pack of the maker's) a new version of it
 *  (spec D11). Returns the new submission's id. */
export async function submitPack(
  meta: { name: string; description: string; author: string },
  pack: Record<string, unknown>,
  updateOf?: string,
): Promise<string> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Submitting needs a connection.');
  const { data, error } = await sb.rpc('community_pack_submit', {
    p_name: meta.name,
    p_description: meta.description,
    p_author: meta.author,
    p_pack: pack,
    ...(updateOf ? { p_update_of: updateOf } : {}),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function withdrawPack(id: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('community_pack_withdraw', { p_id: id });
  if (error) throw new Error(error.message);
}

/** A moderator's decision: approve (`live`), turn down or take down, the last two with a reason. */
export async function decidePack(id: string, state: 'live' | 'not_accepted' | 'taken_down', reason?: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('community_pack_decide', { p_id: id, p_state: state, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}
