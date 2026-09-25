// TEAM PRODUCTIONS, as this tab holds them (docs/TEAMS_PLAN.md §4, "server-resident, fetched live").
//
// A team production's authority is its `team_productions` row on the server, never this browser.
// So this store is deliberately IN MEMORY: no localStorage key, no durable mirror, no sync-engine
// kind. What that buys is structural rather than remembered:
//   * The LWW sync engine never sees a team record, so it can never upload one as somebody's
//     personal document (backend/storage.ts reads `loadAllShows`, which stays personal-only).
//   * Signing out reloads the page onto the signed-out workspace, which empties this store - on a
//     shared lab computer the next student cannot read the last one's team rundowns off disk.
//
// WHY THE RECORDS LIVE BESIDE THE PERSONAL ONES AT ALL. The production page, the wizard's
// "+ Production" picker and every cue, dataset and layer mutator in model/shows.ts address a
// production by id through one read-mutate-save envelope. Rather than fork forty mutators, shows.ts
// reads THIS store alongside its own (team first for a shared id - see `readEditable` there) and
// routes a write of any record carrying `teamId` back here. A write that lands here is announced to
// the one listener that pushes it to the server (backend/teamProductions.ts), which is how an edit
// made on the ordinary production page becomes a compare-and-swap save.
//
// Records are held as JSON STRINGS on purpose. The mutators edit what they read in place, so a read
// that handed out the stored object would let a mutation change the store before `writeTeamShow`
// compared old against new - and a change that compares equal is never saved.
//
// This module imports only the Show TYPE, so it can be imported by shows.ts without a cycle.

import type { Show } from './shows';

/** What the store knows about its own contents: `off` (no team session - offline, signed out, or
 *  not started), `loading` (the first fetch is out) and `ready` (at least one answer arrived). The
 *  production page reads it so a team production opened cold says "loading" rather than "this
 *  production no longer exists" for the second before the first answer lands. */
export type TeamShowsStatus = 'off' | 'loading' | 'ready';

const records = new Map<string, string>();
let status: TeamShowsStatus = 'off';
const editListeners = new Set<(showId: string) => void>();

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spx-data-changed'));
}

/** Every team production this tab holds, as fresh copies (see the header on why copies). */
export function loadTeamShows(): Show[] {
  return [...records.values()].map((json) => JSON.parse(json) as Show);
}

/** The ids held here - what shows.ts uses to hide a personal record of the same id (the tombstone
 *  a MOVE leaves behind, TEAMS_PLAN §4 "one home per production"). */
export function teamShowIds(): Set<string> {
  return new Set(records.keys());
}

export function teamShowsStatus(): TeamShowsStatus {
  return status;
}

export function setTeamShowsStatus(next: TeamShowsStatus): void {
  if (status === next) return;
  status = next;
  notifyDataChanged();
}

/**
 * A LOCAL edit to a team production, from shows.ts's save envelope. A record that did not change is
 * ignored - the envelope saves every record it read, and only the one the mutator touched should
 * cost a round trip. The data-changed event is the envelope's to send, not this function's.
 */
export function writeTeamShow(show: Show): void {
  if (!show.teamId) return;
  const json = JSON.stringify(show);
  if (records.get(show.id) === json) return;
  records.set(show.id, json);
  for (const listener of editListeners) listener(show.id);
}

/**
 * What the SERVER holds, applied without announcing an edit (it is not one - pushing it back would
 * be a save loop). `keep` names records with a local edit still on its way up: those stay as this
 * tab has them, because the pending save is what reconciles them with the server. A record the
 * server no longer lists (deleted by the team owner, or a team this account left) goes.
 */
export function applyServerTeamShows(list: Show[], keep: ReadonlySet<string> = new Set()): void {
  let changed = status !== 'ready';
  const next = new Map<string, string>();
  for (const show of list) {
    const held = records.get(show.id);
    const json = keep.has(show.id) && held ? held : JSON.stringify(show);
    if (held !== json) changed = true;
    next.set(show.id, json);
  }
  for (const id of records.keys()) if (!next.has(id)) changed = true;
  records.clear();
  for (const [id, json] of next) records.set(id, json);
  status = 'ready';
  if (changed) notifyDataChanged();
}

/** One record from the server - a merge result after a refused save, or a production just moved
 *  in. Same "not an edit" rule as `applyServerTeamShows`. */
export function applyServerTeamShow(show: Show): void {
  const json = JSON.stringify(show);
  if (records.get(show.id) === json) return;
  records.set(show.id, json);
  notifyDataChanged();
}

export function removeTeamShow(showId: string): void {
  if (records.delete(showId)) notifyDataChanged();
}

/** Back to `off` and empty - the session ended or the team surfaces stood down. */
export function clearTeamShows(): void {
  const had = records.size > 0 || status !== 'off';
  records.clear();
  status = 'off';
  if (had) notifyDataChanged();
}

/** Subscribe to LOCAL edits (the one subscriber is the save pump in backend/teamProductions.ts). */
export function onTeamShowEdit(listener: (showId: string) => void): () => void {
  editListeners.add(listener);
  return () => editListeners.delete(listener);
}
