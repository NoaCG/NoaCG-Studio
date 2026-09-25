// Team productions - the client half of docs/TEAMS_PLAN.md §7 stage 4: list the productions every
// team you are in holds, move one of yours into a team, save edits over compare-and-swap, and let
// the team owner delete one.
//
// WHAT LIVES WHERE. The server row (`team_productions`, migration 0054) is the authority. This tab
// holds a copy in model/teamShows.ts, in memory only, so the ordinary production page can edit it
// through the same mutators a personal production uses; a local edit there is announced to the
// save pump below, which writes it with `team_production_save`. Nothing here ever touches the LWW
// sync engine - a team record is not one of `SYNC_KINDS`, and `loadAllShows` never returns one.
//
// "APPEARS IMMEDIATELY" IS A PROMISE ABOUT A PERSON WHO WAS JUST INVITED. Somebody who joins a
// team from a link, or whose teammate has just moved a production in, must find it on Home without
// searching or reloading. So the list is fetched the moment a session exists, again on every
// return to the tab, straight after this tab joins, leaves or moves anything, and on a short
// timer while the tab is in view. The timer asks only for each row's id and token; a document is
// fetched only when its token moved, so a quiet team costs three small reads per tick.
//
// OFFLINE THIS CANNOT RUN. Every verb begins at `getSupabase()`, null without a backend, and the
// controller is only started by components/teams/TeamSync.tsx behind `useTeamsAvailable()`.

import { getSupabase } from './supabase';
import { listMyTeamMembers, listMyTeams, type Team, type TeamMember } from './teams';
import { deleteShow, type Show } from '../model/shows';
import {
  applyServerTeamShow,
  applyServerTeamShows,
  clearTeamShows,
  loadTeamShows,
  onTeamShowEdit,
  removeTeamShow,
  setTeamShowsStatus,
} from '../model/teamShows';
import { mergeTeamShow } from '../model/teamShowMerge';

/** A row of `team_productions` without its document - what the poll asks for. */
export interface TeamProductionHead {
  id: string;
  teamId: string;
  /** The compare-and-swap token, EXACTLY as the server wrote it. 0054 truncates it to
   *  milliseconds so a Date round trip would be lossless, but it is never re-formatted here
   *  anyway: the string that came back is the string that goes back. */
  updatedAt: string;
  /** Who saved last, or null for a former member (0054: `on delete set null`). */
  updatedBy: string | null;
}

interface HeadRow {
  id: string;
  team_id: string;
  updated_at: string;
  updated_by: string | null;
}

interface DocRow extends HeadRow {
  doc: Show;
}

const toHead = (row: HeadRow): TeamProductionHead => ({
  id: row.id,
  teamId: row.team_id,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

/** The document as the SERVER stores it: the Show record without `teamId`, whose authority is
 *  the row's own column. */
export function teamDoc(show: Show): Show {
  const { teamId: _column, ...doc } = show;
  return doc;
}

/** The record as this tab holds it: the stored document, keyed by the row's id, stamped with the
 *  row's team. The id is taken from the row rather than trusted from inside the document. */
function teamRecord(doc: Show, row: HeadRow): Show {
  return {
    ...doc,
    id: row.id,
    version: 2,
    graphics: Array.isArray(doc?.graphics) ? doc.graphics : [],
    updatedAt: doc?.updatedAt || row.updated_at,
    teamId: row.team_id,
  };
}

// ── The verbs ───────────────────────────────────────────────────────────────────────────────────

/** Every team production this account can see - RLS (`team_productions_member_select`) is the
 *  filter, so a team you are not in contributes nothing rather than erroring. */
export async function listTeamProductionHeads(): Promise<{ heads: TeamProductionHead[]; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { heads: [], error: null };
  const { data, error } = await sb
    .from('team_productions')
    .select('id, team_id, updated_at, updated_by')
    .order('created_at', { ascending: true });
  if (error) return { heads: [], error: error.message };
  return { heads: ((data ?? []) as HeadRow[]).map(toHead), error: null };
}

async function fetchTeamProductionDocs(ids: string[]): Promise<{ rows: DocRow[]; error: string | null }> {
  const sb = await getSupabase();
  if (!sb || ids.length === 0) return { rows: [], error: null };
  const { data, error } = await sb
    .from('team_productions')
    .select('id, team_id, updated_at, updated_by, doc')
    .in('id', ids);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as DocRow[], error: null };
}

type SaveAnswer =
  | { saved: true; updatedAt: string; updatedBy: string | null }
  | { saved: false; updatedAt: string; updatedBy: string | null; doc: Show };

async function saveTeamProduction(
  id: string,
  expected: string,
  doc: Show,
): Promise<{ answer: SaveAnswer | null; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { answer: null, error: 'No backend configured.' };
  const { data, error } = await sb.rpc('team_production_save', { p_id: id, p_expected: expected, p_doc: doc });
  if (error) return { answer: null, error: error.message };
  const a = data as { saved?: boolean; updated_at?: string; updated_by?: string | null; doc?: Show } | null;
  if (!a || typeof a.updated_at !== 'string') return { answer: null, error: 'The save was not answered.' };
  return {
    answer: a.saved
      ? { saved: true, updatedAt: a.updated_at, updatedBy: a.updated_by ?? null }
      : { saved: false, updatedAt: a.updated_at, updatedBy: a.updated_by ?? null, doc: a.doc as Show },
    error: null,
  };
}

// ── The controller ──────────────────────────────────────────────────────────────────────────────

/** What the team surfaces render from: the teams, their members, each production's head, and the
 *  per-production save state. */
export interface TeamState {
  /** False until the first answer - the Home band says "Loading" rather than "nothing shared". */
  loaded: boolean;
  /** A READ that failed. Kept apart from an empty list for the reason teams.ts gives: "you are in
   *  no team" said to somebody whose teams could not be fetched is a wrong answer. */
  loadError: string | null;
  teams: Team[];
  members: TeamMember[];
  heads: Record<string, TeamProductionHead>;
  /** A production with a local edit on its way up, or one whose last save failed. */
  saving: Record<string, 'pending' | 'failed'>;
  /** One line per production that a teammate's save changed under this operator. */
  notes: Record<string, string>;
}

const EMPTY: TeamState = { loaded: false, loadError: null, teams: [], members: [], heads: {}, saving: {}, notes: {} };

let state: TeamState = EMPTY;
const listeners = new Set<() => void>();

function setState(patch: Partial<TeamState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function getTeamState(): TeamState {
  return state;
}

export function subscribeTeamState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A tick while the tab is in view. Short, because the promise is "immediately"; cheap, because a
 *  tick reads heads only (see the header). */
const POLL_MS = 15_000;
/** A burst of edits (typing a cue's text) becomes one save. */
const SAVE_DEBOUNCE_MS = 600;
/** Refused saves re-merge and retry this many times before reporting instead of looping. */
const MAX_SAVE_ATTEMPTS = 4;

/** What the server last said about each production: its token and document - the BASE a local
 *  edit started from, which the merge needs. */
const server = new Map<string, { token: string; doc: Show; updatedBy: string | null; teamId: string }>();
const dirty = new Set<string>();
const inflight = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let running: { userId: string; stop: () => void } | null = null;
let refreshing: Promise<void> | null = null;
let refreshAgain = false;

/** The display name for a user id in a team, "you" for this account, or "a former member". */
export function teamMemberName(teamId: string, userId: string | null): string {
  if (userId && running && userId === running.userId) return 'you';
  const member = state.members.find((m) => m.teamId === teamId && m.userId === userId);
  return member?.displayName ?? 'a former member';
}

/**
 * Start the controller for this account. Idempotent for the same account; a different account
 * stops the old one first so nothing of theirs is shown or saved under the new session.
 */
export function startTeamSync(userId: string): void {
  if (running?.userId === userId) return;
  stopTeamSync();
  setTeamShowsStatus('loading');
  const unsubscribeEdits = onTeamShowEdit(scheduleSave);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshTeams();
  };
  const tick = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshTeams();
  }, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  running = {
    userId,
    stop: () => {
      unsubscribeEdits();
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    },
  };
  void refreshTeams();
}

export function stopTeamSync(): void {
  if (!running) return;
  running.stop();
  running = null;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  server.clear();
  dirty.clear();
  inflight.clear();
  clearTeamShows();
  state = EMPTY;
  for (const listener of listeners) listener();
}

/**
 * Ask the server again: teams, members and every production's head, then the documents whose
 * token moved. Calls that arrive while one is out coalesce into ONE follow-up, so a join followed
 * by a focus event is two reads, not a queue of them.
 */
export function refreshTeams(): Promise<void> {
  if (!running) return Promise.resolve();
  if (refreshing) {
    refreshAgain = true;
    return refreshing;
  }
  refreshing = (async () => {
    try {
      do {
        refreshAgain = false;
        await refreshOnce();
      } while (refreshAgain && running);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function refreshOnce(): Promise<void> {
  const owner = running;
  const [teamsAnswer, membersAnswer, headsAnswer] = await Promise.all([
    listMyTeams(),
    listMyTeamMembers(),
    listTeamProductionHeads(),
  ]);
  if (running !== owner || !owner) return; // Signed out or switched account meanwhile.
  const loadError = teamsAnswer.error ?? membersAnswer.error ?? headsAnswer.error;
  if (loadError) {
    // Keep what is on screen: a failed tick must not empty Home. Say so, once it matters.
    setState({ loadError, loaded: state.loaded });
    if (!state.loaded) setTeamShowsStatus('ready');
    return;
  }
  const heads = headsAnswer.heads;
  // A record with an edit on its way up keeps its BASE as well as its local copy. Its save carries
  // the old token and is refused if a teammate saved meanwhile, and that refusal is what merges the
  // two correctly. Adopting their document as the base here instead would make the old token look
  // current to this tab's merge while the server holds the new one - and a merge against the wrong
  // base is how a teammate's cue quietly disappears.
  const keep = new Set([...dirty, ...inflight]);
  const stale = heads.filter((h) => !keep.has(h.id) && server.get(h.id)?.token !== h.updatedAt).map((h) => h.id);
  const docs = await fetchTeamProductionDocs(stale);
  if (running !== owner) return;
  if (docs.error) {
    setState({ loadError: docs.error });
    return;
  }
  for (const row of docs.rows) {
    server.set(row.id, {
      token: row.updated_at,
      doc: teamDoc(teamRecord(row.doc, row)),
      updatedBy: row.updated_by,
      teamId: row.team_id,
    });
  }
  const listed = new Set(heads.map((h) => h.id));
  for (const id of [...server.keys()]) if (!listed.has(id)) server.delete(id);

  // A record with an edit on its way up stays as this tab has it; its save reconciles it.
  const records: Show[] = [];
  for (const head of heads) {
    const known = server.get(head.id);
    if (known) records.push({ ...known.doc, teamId: known.teamId });
  }
  applyServerTeamShows(records, keep);
  setState({
    loaded: true,
    loadError: null,
    teams: teamsAnswer.teams,
    members: membersAnswer.members,
    heads: Object.fromEntries(heads.map((h) => [h.id, h])),
  });
  // A save that failed on a dropped connection is retried on the next good read.
  for (const id of dirty) if (!timers.has(id) && !inflight.has(id)) scheduleSave(id);
}

function setSaving(id: string, value: 'pending' | 'failed' | null): void {
  const saving = { ...state.saving };
  if (value) saving[id] = value;
  else delete saving[id];
  setState({ saving });
}

function scheduleSave(id: string): void {
  dirty.add(id);
  setSaving(id, 'pending');
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void pushSave(id);
    }, SAVE_DEBOUNCE_MS),
  );
}

/**
 * Save one production. A refusal carries the teammate's document: merge this tab's edit onto it
 * (model/teamShowMerge.ts), show the result, and try again with the new token. Anything the merge
 * could not keep is said out loud in `notes`, naming whose save stood.
 */
async function pushSave(id: string): Promise<void> {
  if (inflight.has(id)) return; // The in-flight save re-schedules itself when it sees `dirty`.
  const known = server.get(id);
  let sent = loadTeamShows().find((s) => s.id === id);
  if (!known || !sent) {
    dirty.delete(id);
    setSaving(id, null);
    return;
  }
  inflight.add(id);
  dirty.delete(id);
  let base = known.doc;
  let token = known.token;
  let doc = teamDoc(sent);
  let failure: string | null = null;
  try {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const { answer, error } = await saveTeamProduction(id, token, doc);
      if (!answer) {
        failure = error ?? 'The save failed.';
        dirty.add(id);
        break;
      }
      if (answer.saved) {
        server.set(id, { token: answer.updatedAt, doc, updatedBy: answer.updatedBy, teamId: known.teamId });
        setState({
          heads: { ...state.heads, [id]: { id, teamId: known.teamId, updatedAt: answer.updatedAt, updatedBy: answer.updatedBy } },
        });
        break;
      }
      // Refused: a teammate saved first. Their document is the new base.
      const theirs = teamDoc(teamRecord(answer.doc, { id, team_id: known.teamId, updated_at: answer.updatedAt, updated_by: answer.updatedBy }));
      server.set(id, { token: answer.updatedAt, doc: theirs, updatedBy: answer.updatedBy, teamId: known.teamId });
      const merged = mergeTeamShow(base, doc, theirs, new Date().toISOString());
      // The operator may have typed on while the save was out; that edit is merged on top rather
      // than overwritten by the result.
      const now = loadTeamShows().find((s) => s.id === id);
      let next = merged.doc;
      if (now && JSON.stringify(teamDoc(now)) !== JSON.stringify(teamDoc(sent))) {
        next = mergeTeamShow(teamDoc(sent), teamDoc(now), merged.doc, new Date().toISOString()).doc;
      }
      if (merged.lost.length > 0) {
        const who = teamMemberName(known.teamId, answer.updatedBy);
        const at = new Date(answer.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        setState({
          notes: {
            ...state.notes,
            [id]: `${who === 'you' ? 'Your other window' : who} saved a newer version at ${at}. Your change to ${merged.lost.join(' and ')} was replaced by theirs.`,
          },
        });
      }
      applyServerTeamShow({ ...next, teamId: known.teamId });
      sent = { ...next, teamId: known.teamId };
      base = theirs;
      token = answer.updatedAt;
      doc = teamDoc(next);
      if (attempt === MAX_SAVE_ATTEMPTS - 1) {
        failure = 'Teammates keep saving this production - your edit is on screen but not saved yet.';
        dirty.add(id);
      }
    }
  } finally {
    inflight.delete(id);
  }
  setSaving(id, failure ? 'failed' : dirty.has(id) ? 'pending' : null);
  if (failure) setState({ notes: { ...state.notes, [id]: failure } });
  else if (dirty.has(id)) scheduleSave(id);
}

/** Forget the "a teammate saved over you" line once it has been read. */
export function dismissTeamNote(id: string): void {
  if (!state.notes[id]) return;
  const notes = { ...state.notes };
  delete notes[id];
  setState({ notes });
}

/**
 * MOVE a personal production into a team (TEAMS_PLAN §4): copy it to `team_productions`, stamp the
 * published row with the team if there is one, then tombstone the personal record - ONE HOME PER
 * PRODUCTION, because two authorities for one rundown is the split-brain the design exists to
 * avoid. The id does not change, so the production page that asked stays on the same production,
 * and a published production keeps its four links: publishing is keyed by this id.
 *
 * The order is the safe one. The team row is written first, so a failure there changes nothing.
 * Stamping the published row can only be undone by the TEAM owner (0054's guard trigger), so it
 * comes second, and a failure there is reported rather than rolled back: republishing from the
 * team production stamps the row itself (control/hostedControl.ts sends `team_id`).
 */
export async function moveProductionToTeam(show: Show, teamId: string): Promise<{ error: string | null; warning: string | null }> {
  const sb = await getSupabase();
  if (!sb || !running) return { error: 'Teams need a signed-in account.', warning: null };
  if (show.teamId) return { error: 'This production is already in a team.', warning: null };
  const doc = teamDoc(show);
  const { data, error } = await sb
    .from('team_productions')
    .insert({ id: show.id, team_id: teamId, doc, updated_by: running.userId })
    .select('id, team_id, updated_at, updated_by')
    .single();
  if (error || !data) {
    const taken = error?.code === '23505';
    return { error: taken ? 'A production with this id is already in a team.' : error?.message ?? 'The production could not be moved.', warning: null };
  }
  const row = data as HeadRow;
  server.set(row.id, { token: row.updated_at, doc, updatedBy: row.updated_by, teamId: row.team_id });
  // The team record goes in BEFORE the tombstone, so there is no moment in which this production
  // is in neither list.
  applyServerTeamShow({ ...doc, teamId: row.team_id });
  deleteShow(show.id);
  setState({ heads: { ...state.heads, [row.id]: toHead(row) } });

  let warning: string | null = null;
  if (show.hostedSlug) {
    const { error: stampError } = await sb.from('control_shows').update({ team_id: teamId }).eq('id', show.id);
    if (stampError) {
      warning = 'The production is in the team, but its published links are still yours alone. Publish it again from here and your teammates can operate and republish it.';
    }
  }
  void refreshTeams();
  return { error: null, warning };
}

/**
 * Delete a team production - the TEAM OWNER's call on both planes (0054 ruling 3). The published
 * row goes first, because a rundown deleted while its output URL stayed live is exactly the
 * orphan 0061 had to sweep up for personal productions.
 */
export async function deleteTeamProduction(show: Show): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  if (show.hostedSlug) {
    const { error } = await sb.from('control_shows').delete().eq('id', show.id);
    if (error) return { error: error.message };
  }
  const { data, error } = await sb.from('team_productions').delete().eq('id', show.id).select('id');
  if (error) return { error: error.message };
  if (!Array.isArray(data) || data.length === 0) return { error: 'Only the team owner can delete a team production.' };
  server.delete(show.id);
  removeTeamShow(show.id);
  void refreshTeams();
  return { error: null };
}
