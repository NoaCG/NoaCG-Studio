// What is left of the Era 5.5 community gallery's data layer: an author's own published rows, so
// Home can list them and the author can withdraw one. The gallery closed to publishing on
// 2026-10-08 (owner: the community shares reviewed packs only, migration 0078), and its browse,
// import and moderation UI went with the old code editor, so nothing else here was reachable.
// Community packs live in packs.ts.
//
// Offline-invariant: every function opens with `const sb = await getSupabase(); if (!sb) return …;`,
// so with no backend configured the whole module is inert and the Supabase library stays code-split
// out of the bundle (getSupabase resolves null).

import { getSupabase } from '../backend/supabase';

export type CommunityKind = 'graphic' | 'look';
export type CommunityStatus = 'pending' | 'approved' | 'rejected' | 'removed';

/** What a moderation status is CALLED in the UI. `pending`/`approved` are the table's words, and
 *  they mean nothing to the author who published the template ("approved" by whom, and is it up
 *  yet?). */
export const STATUS_LABEL: Record<CommunityStatus, string> = {
  pending: 'in review',
  approved: 'live',
  rejected: 'not accepted',
  removed: 'taken down',
};

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

export async function listMySubmissions(): Promise<MySubmission[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data: who } = await sb.auth.getUser();
  const uid = who.user?.id;
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
