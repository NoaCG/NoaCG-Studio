// Community shared-templates data layer (Era 5.5). Thin wrappers over the app's Supabase client for
// browsing the approved gallery, importing a copy, an author withdrawing their own row, and the
// report/takedown path. All access is gated by the RLS + SECURITY DEFINER RPCs in
// supabase/migrations/0004_community_templates.sql; this file just calls them.
//
// Publishing is CLOSED (owner, 2026-10-08): the community shares reviewed packs only, so the
// publish functions are gone and migration 0078 refuses a publish or an asset upload in the
// database. Rows already published stay read-only.
//
// Offline-invariant: every function opens with `const sb = await getSupabase(); if (!sb) return …;`,
// so with no backend configured the whole module is inert and the Supabase library stays code-split
// out of the bundle (getSupabase resolves null). Reads are signed-in-only this cut (the RPCs are
// granted to `authenticated`), matching the closed-beta posture.

import { getSupabase } from '../backend/supabase';
import { rehydrateAssets, blobToDataUrl } from '../backend/assets';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'community-assets';

export type CommunityKind = 'graphic' | 'look';
export type CommunityStatus = 'pending' | 'approved' | 'rejected' | 'removed';

/** What a moderation status is CALLED in the UI. `pending`/`approved` are the table's words, and
 *  they mean nothing to the author who published the template ("approved" by whom, and is it up
 *  yet?). Both surfaces that show a status — the author's own list in Home and the moderator
 *  queue — read the sentence from here, so they can never drift into two vocabularies. */
export const STATUS_LABEL: Record<CommunityStatus, string> = {
  pending: 'in review',
  approved: 'live',
  rejected: 'not accepted',
  removed: 'taken down',
};

/** A browse card (from community_list) — never carries author_id or the body. */
export interface CommunityCard {
  id: string;
  slug: string;
  kind: CommunityKind;
  name: string;
  summary: string;
  category: string | null;
  author_name: string;
  created_at: string;
}

/** A full item (from community_get) — the browse card plus the importable body. */
export interface CommunityItem extends CommunityCard {
  body: unknown; // SpxTemplate for a graphic; { name, brand } for a look
}

/** The author's own row, with its moderation status (from the owner RLS path). */
export interface MySubmission {
  id: string;
  slug: string;
  kind: CommunityKind;
  name: string;
  summary: string;
  category: string | null;
  status: CommunityStatus;
  moderation_note: string | null;
  created_at: string;
}

/** A submission as a moderator sees it (any status). Same shape as MySubmission. */
export type ModeratorItem = MySubmission & { author_name: string };

/** A user's abuse report on a published item (moderator-visible only). */
export interface CommunityReport {
  id: string;
  template_id: string;
  reason: string;
  created_at: string;
}

// ── asset transport (public community bucket, read-only) ─────────────────────────────────────────
async function download(sb: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return blobToDataUrl(data);
}

/** The signed-in user's id, to list only their own submissions. */
async function currentUid(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

// ── browse ──────────────────────────────────────────────────────────────────────────────────────
export async function listCommunity(
  kind?: CommunityKind,
  category?: string,
  limit = 60,
  offset = 0,
): Promise<CommunityCard[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data } = await sb.rpc('community_list', {
    p_kind: kind ?? null,
    p_category: category ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  return (data as CommunityCard[] | null) ?? [];
}

/** Fetch one approved item by slug and REHYDRATE its assets (data URLs) so it's ready to import. */
export async function getCommunity(slug: string): Promise<CommunityItem | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.rpc('community_get', { p_slug: slug });
  const row = (data as CommunityItem[] | null)?.[0];
  if (!row) return null;
  const body = await rehydrateAssets(row.body, (key) => download(sb, key));
  return { ...row, body };
}

// ── my submissions ──────────────────────────────────────────────────────────────────────────────
export async function listMySubmissions(): Promise<MySubmission[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const uid = await currentUid(sb);
  if (!uid) return [];
  // Filter to the caller's OWN rows explicitly. A moderator's RLS SELECT policy (migration 0005)
  // exposes every row, so relying on RLS alone would show all submissions to a moderator here.
  const { data } = await sb
    .from('community_templates')
    .select('id, slug, kind, name, summary, category, status, moderation_note, created_at')
    .eq('author_id', uid)
    .order('created_at', { ascending: false });
  return (data as MySubmission[] | null) ?? [];
}

export async function unpublish(id: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'Not signed in.' };
  const { error } = await sb.from('community_templates').delete().eq('id', id);
  return { error: error?.message ?? null };
}

// ── report / moderate ─────────────────────────────────────────────────────────────────────────────
export async function reportTemplate(id: string, reason: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'Not signed in.' };
  const { error } = await sb.from('community_reports').insert({ template_id: id, reason });
  return { error: error?.message ?? null };
}

export async function isModerator(): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return false;
  const { data } = await sb.rpc('is_moderator');
  return data === true;
}

/** Moderator-only: every submission regardless of status (the migration-0005 SELECT policy grants
 *  this; a non-moderator's identical query returns only their own rows). */
export async function listAllForModeration(): Promise<ModeratorItem[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('community_templates')
    .select('id, slug, kind, name, summary, category, author_name, status, moderation_note, created_at')
    .order('created_at', { ascending: false });
  return (data as ModeratorItem[] | null) ?? [];
}

/** Moderator-only: the abuse-report queue (community_reports_read RLS). */
export async function listReports(): Promise<CommunityReport[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('community_reports')
    .select('id, template_id, reason, created_at')
    .order('created_at', { ascending: false });
  return (data as CommunityReport[] | null) ?? [];
}

/** Moderator-only: fetch one submission's full, asset-rehydrated body for preview — ANY status
 *  (unlike getCommunity, which is approved-only). */
export async function getModeratorItem(id: string): Promise<(ModeratorItem & { body: unknown }) | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('community_templates')
    .select('id, slug, kind, name, summary, category, author_name, status, moderation_note, created_at, body')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const row = data as ModeratorItem & { body: unknown };
  const body = await rehydrateAssets(row.body, (key) => download(sb, key));
  return { ...row, body };
}

/** Moderator action (takedown/review). The DB guard trigger stamps reviewed_by/reviewed_at and blocks
 *  a moderator from touching any non-moderation column. */
export async function moderate(
  id: string,
  status: CommunityStatus,
  note?: string,
): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'Not signed in.' };
  const { error } = await sb
    .from('community_templates')
    .update({ status, moderation_note: note ?? null })
    .eq('id', id);
  return { error: error?.message ?? null };
}
