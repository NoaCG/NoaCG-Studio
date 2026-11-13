// THE SAVED REVISION OF A PRODUCTION (docs/work-specs/live-publishing/designs/G3.md section 1).
//
// The server numbers every stored version of a production record (`rev`, migration 0117): a
// `documents` row of kind `show` for a personal production, a `team_productions` row for a team
// one. A publish names the revision it was built from, so it must know that the record it builds
// from IS that revision. The server's own copy of the record's identity says so, read in two small
// columns and never the body: the client's `updatedAt` inside the stored body (`body_updated_at`,
// 0107) for a personal record, the compare-and-swap token for a team one. When this tab's record
// carries the same identity, its content is the stored revision.
//
// Answers `{ rev }`, or what to wait for: `local` (this tab holds an edit the server has not
// confirmed: its save is on its way and owes a publish), `server` (the server holds a newer save:
// bring the record up first). Null when the revision cannot be known: offline, signed out, a read
// that failed, or an instance without 0117.

import { getSupabase } from './supabase';
import { refreshTeams, teamConfirmedToken, teamEditOwed } from './teamProductions';
import { syncNow } from './syncController';
import type { Show } from '../model/shows';
import type { Confirmed as ConfirmedRevision } from '../control/autoPublish';

export type { ConfirmedRevision };

/** Bring this tab's copy of the record up to the server's newest save: a team production by the
 *  team read (`asked`: a press asked for it), a personal one by a sync. */
export function catchUpRecord(teamId: string | null | undefined, asked = true): Promise<unknown> {
  return teamId ? refreshTeams(asked) : syncNow();
}

/** The record's current saved revision on the server (no body), or null when it cannot be read. */
export async function storedRevision(show: Pick<Show, 'id' | 'teamId'>): Promise<{ rev: number; identity: string | null } | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const read = show.teamId
    ? sb.from('team_productions').select('rev, identity:updated_at').eq('id', show.id).maybeSingle()
    : sb.from('documents').select('rev, identity:body_updated_at').eq('id', show.id).eq('kind', 'show').maybeSingle();
  const { data, error } = await read;
  if (error || !data) return null;
  const row = data as { rev?: unknown; identity?: unknown };
  if (typeof row.rev !== 'number') return null;
  return { rev: row.rev, identity: typeof row.identity === 'string' ? row.identity : null };
}

/** Whether `show`, as this tab holds it, is exactly a stored revision, and which. */
export async function confirmedRevision(show: Show): Promise<ConfirmedRevision> {
  if (show.teamId && teamEditOwed(show.id)) return { wait: 'local' };
  const stored = await storedRevision(show);
  if (!stored) return null;
  const mine = show.teamId ? teamConfirmedToken(show.id) : show.updatedAt;
  if (mine !== null && stored.identity !== null && sameIdentity(mine, stored.identity, !!show.teamId)) return { rev: stored.rev };
  if (show.teamId) return { wait: 'server' };
  // A personal record: the newer client time says which side is ahead (the sync engine's own rule).
  return Date.parse(show.updatedAt) > Date.parse(stored.identity ?? '') ? { wait: 'local' } : { wait: 'server' };
}

/** A team token compares as an instant (the server may spell it differently); a body time as text. */
function sameIdentity(mine: string, stored: string, team: boolean): boolean {
  if (!team) return mine === stored;
  const a = Date.parse(mine);
  const b = Date.parse(stored);
  return Number.isFinite(a) && a === b;
}
