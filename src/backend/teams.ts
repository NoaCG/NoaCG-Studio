// Teams - the client half of `docs/TEAMS_PLAN.md` §7 stage 3: create a team, hand out its join
// code, join one, leave one, see who is in it.
//
// WHAT A TEAM IS FOR. Three students with separate accounts prepare and operate the SAME
// production without sharing credentials (TEAMS_PLAN §1). A team owns PRODUCTIONS - never
// libraries. Nothing in this module reads or writes anybody's graphics, assets or settings; the
// verbs here are membership and nothing else.
//
// THE OFFLINE POSTURE IS STRUCTURAL, NOT REMEMBERED. Every function begins at `getSupabase()`,
// which returns null whenever `isBackendConfigured()` is false (backend/config.ts is the ONE
// feature-detection point). So an offline build cannot reach a team verb even if a component
// forgot to gate itself: the call resolves to the empty/refused answer and no Supabase library is
// ever fetched. The UI gate on top of that is `useAuthState()` - see components/teams/.
//
// WHY THE VERBS LOOK ASYMMETRIC (some are table writes, some are RPCs). This mirrors migration
// 0053 exactly, and the asymmetry is the security design rather than an accident:
//   * Creating and renaming a team are ordinary INSERT/UPDATE - the policies say "the row is
//     yours", which a policy can express.
//   * JOINING is an RPC (`team_join`), because "holding the code authorizes this" is not a
//     statement about a column of the row being inserted, and a policy that could read the code
//     would have to admit reading every team's code. `team_members` therefore grants
//     `authenticated` no INSERT and no UPDATE at all.
//   * ROTATING is an RPC (`team_rotate_code`) for the same reason in reverse: it is owner-only,
//     and the refusal is deliberately shaped like a miss so it never confirms a team exists.
//   * LEAVING and REMOVING are one DELETE, because they are one statement to the database - the
//     policy decides which of the two you are doing.
// Reading 0053 before changing anything here is cheaper than rediscovering this.
//
// ERRORS ARE MESSAGES, NEVER THROWS. Every verb answers `{ ..., error: string | null }` the way
// backend/auth.ts does, so a dialog renders a refusal instead of unmounting the app. The database
// is the authority on every one of these refusals; the messages below are the readable half.

import { getSupabase } from './supabase';

/** `teams.name` is `check (length(btrim(name)) between 1 and 80)` in migration 0053. Checked
 *  here too, because the database's refusal arrives as raw PostgREST text - "new row for
 *  relation teams violates check constraint …" is not a sentence to put in front of a teacher
 *  who pasted a long class name. The database stays the authority; this is the readable half. */
const MAX_TEAM_NAME = 80;

function teamNameProblem(name: string): string | null {
  if (!name) return 'Give the team a name.';
  if (name.length > MAX_TEAM_NAME) return `A team name is at most ${MAX_TEAM_NAME} characters.`;
  return null;
}

/**
 * A first guess at the name teammates should see, from the part of an address before the @.
 *
 * It is a PREFILL, never a submission: both dialogs show the field and let it be edited, so
 * nobody's email local-part reaches a teammate's screen without them having looked at it. It
 * lives here rather than in either dialog because both of them need exactly this - and a second
 * copy is how the two would drift into suggesting different names for the same person.
 */
export function suggestedDisplayName(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  return local.replace(/[._-]+/g, ' ').trim();
}

/** A team as its members see it. The join code is part of the row every member can read - see
 *  0053's "WHO CAN SEE THE JOIN CODE": any member may invite, and only the owner may rotate. */
export interface Team {
  id: string;
  name: string;
  /** The join capability: 8 URL-safe characters, mintable again by the owner. */
  joinCode: string;
  ownerId: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  /** Chosen by the member at join. Teammate emails are never shown, here or anywhere. */
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

interface TeamRow {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  created_at: string;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  display_name: string;
  role: string;
  joined_at: string;
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

function toMember(row: MemberRow): TeamMember {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    displayName: row.display_name,
    // The label is only ever a label: `teams.owner_id` is the authority (0053, "ROLES"), so a
    // row whose label somehow disagreed still reads as a plain member here.
    role: row.role === 'owner' ? 'owner' : 'member',
    joinedAt: row.joined_at,
  };
}

/** The one place the join link is built, so the dialog and the route can never disagree about
 *  its shape. Hash routing (`docs/SAVED_CONTENT_MODEL.md` §3) means the code rides the fragment
 *  and is therefore never sent to the server as part of the request line. */
export function joinTeamLink(code: string): string {
  // Encoded exactly as `app/router.ts routeHash` writes it, so a pasted link and a link this
  // built are the same string. A minted code is URL-safe already; a hand-typed one might not be.
  const hash = `#/join-team/${encodeURIComponent(code)}`;
  if (typeof window === 'undefined') return hash;
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/**
 * The join code in whatever was typed or pasted - the inverse of `joinTeamLink`. People paste the
 * whole LINK as often as the code, often out of a sentence, so a `#/join-team/<code>` anywhere in
 * the text wins and stops at the first character a minted code cannot hold (0053 mints base64url:
 * letters, digits, `-`, `_`), so a full stop or a bracket after the link is not part of it.
 * Otherwise the text with every space taken out. Case is kept: the server compares it exactly.
 */
export function joinCodeFrom(text: string): string {
  const fromLink = /#\/join-team\/([A-Za-z0-9_-]+)/.exec(text);
  return fromLink ? fromLink[1] : text.replace(/\s+/g, '');
}

/**
 * Every team the signed-in account can see: the ones it owns and the ones it has joined. RLS is
 * the filter (0053 `teams_select_own`), so there is no user predicate to write here - and no way
 * for this query to answer with somebody else's team.
 *
 * "NO TEAMS" AND "COULD NOT ASK" ARE DIFFERENT ANSWERS, which is why this returns the error
 * rather than an empty list. Swallowing a failed fetch would put "You are not in a team yet" in
 * front of somebody who IS in one - and that screen's next move is to make a team and hand out
 * its code, so a dropped 5xx would split a class across two teams with nothing on screen having
 * been wrong out loud. Offline and signed out never reach the query at all (`getSupabase()`
 * returns null, and the UI is gated), so an error here is always a real one.
 */
export async function listMyTeams(): Promise<{ teams: Team[]; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { teams: [], error: null };
  const { data, error } = await sb
    .from('teams')
    .select('id, name, join_code, owner_id, created_at')
    .order('created_at', { ascending: true });
  if (error) return { teams: [], error: error.message };
  if (!Array.isArray(data)) return { teams: [], error: 'Your teams could not be loaded.' };
  return { teams: (data as TeamRow[]).map(toTeam), error: null };
}

/**
 * Every member row the signed-in account can see - which is exactly the members of the teams it
 * is in (`team_members_select_team`). ONE query answers both questions the share dialog asks:
 * how many people are in each team, and who is in the one you opened. Asking per team would be a
 * round trip per row of a list, to draw a number.
 *
 * There is no `teamId` argument for the same reason `listMyTeams` has no user predicate: RLS is
 * the filter, so a team you are not in contributes nothing here rather than erroring - the same
 * "a miss and a refusal look alike" discipline the capability RPCs use. A FAILED FETCH is
 * reported, for the reason `listMyTeams` gives: an owner told "Nobody has joined yet" about a
 * team that has three members in it concludes their join code does not work.
 */
export async function listMyTeamMembers(): Promise<{ members: TeamMember[]; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { members: [], error: null };
  const { data, error } = await sb
    .from('team_members')
    .select('team_id, user_id, display_name, role, joined_at')
    .order('joined_at', { ascending: true });
  if (error) return { members: [], error: error.message };
  if (!Array.isArray(data)) return { members: [], error: 'The member list could not be loaded.' };
  return { members: (data as MemberRow[]).map(toMember), error: null };
}

/**
 * Create a team and put its creator in it.
 *
 * TWO STATEMENTS, DELIBERATELY. The INSERT mints the row (`owner_id` and `join_code` both come
 * from their column defaults, so the client chooses neither); `team_join` then writes the
 * creator's membership row, because `team_members` has no INSERT path for `authenticated` and
 * the function is what decides the `owner` label from `teams.owner_id`. Doing it any other way
 * would mean granting a write that 0053 withholds on purpose.
 *
 * If the second statement fails, the team still exists and the caller still gets it: the owner
 * can read their own team through the owner branch of the select policy, so the state is
 * visible and re-joining with the same code repairs it. Reporting the team plus the error beats
 * reporting nothing and leaving an invisible row behind.
 */
export async function createTeam(
  name: string,
  displayName: string,
): Promise<{ team: Team | null; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { team: null, error: 'No backend configured.' };
  const teamName = name.trim();
  const member = displayName.trim();
  const problem = teamNameProblem(teamName);
  if (problem) return { team: null, error: problem };
  if (!member) return { team: null, error: 'Enter the name your teammates will see.' };

  const { data, error } = await sb
    .from('teams')
    .insert({ name: teamName })
    .select('id, name, join_code, owner_id, created_at')
    .single();
  if (error || !data) return { team: null, error: error?.message ?? 'Could not create the team.' };
  const team = toTeam(data as TeamRow);

  const { error: joinError } = await sb.rpc('team_join', {
    p_code: team.joinCode,
    p_display_name: member,
  });
  return { team, error: joinError?.message ?? null };
}

/**
 * Join by code. The code IS the authorization (0053), so this is the whole invitation mechanism -
 * no email is sent, and none can be until SMTP is provisioned (TEAMS_PLAN §5).
 *
 * Re-joining a team you are already in updates your display name, which is how a member renames
 * themselves without an UPDATE policy that would also let them rewrite their own role.
 */
export async function joinTeamByCode(
  code: string,
  displayName: string,
): Promise<{ team: Team | null; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { team: null, error: 'No backend configured.' };
  const joinCode = joinCodeFrom(code);
  const member = displayName.trim();
  if (!joinCode) return { team: null, error: 'Enter the join code.' };
  if (!member) return { team: null, error: 'Enter the name your teammates will see.' };

  const { data, error } = await sb.rpc('team_join', {
    p_code: joinCode,
    p_display_name: member,
  });
  if (error) {
    // The function raises `no_data_found` for a code nothing matches. Saying so plainly is the
    // point: "nothing happened" and "that code is wrong" are different answers to a student
    // staring at a class chat, and the function distinguishes them so this can too.
    const unknown = error.code === 'P0002' || /unknown join code/i.test(error.message ?? '');
    return { team: null, error: unknown ? 'No team has that join code.' : error.message };
  }
  const row = Array.isArray(data) ? (data[0] as TeamRow | undefined) : (data as TeamRow | null);
  if (!row) return { team: null, error: 'No team has that join code.' };
  return { team: toTeam(row), error: null };
}

/** Rename a team. Owner-only - `teams_owner_update` refuses everyone else, and its `with check`
 *  repeats the predicate so ownership cannot be handed away by an UPDATE. */
export async function renameTeam(teamId: string, name: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const teamName = name.trim();
  const problem = teamNameProblem(teamName);
  if (problem) return { error: problem };
  const { error } = await sb.from('teams').update({ name: teamName }).eq('id', teamId);
  return { error: error?.message ?? null };
}

/**
 * Mint a new join code. Owner-only, and it takes the old code out of circulation for everybody
 * at once - which is exactly what answers a leaked code. Members are unaffected: rotation gates
 * JOINING, and their rows are already written.
 */
export async function rotateJoinCode(
  teamId: string,
): Promise<{ code: string | null; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { code: null, error: 'No backend configured.' };
  const { data, error } = await sb.rpc('team_rotate_code', { p_team: teamId });
  if (error) return { code: null, error: error.message };
  return { code: typeof data === 'string' ? data : null, error: null };
}

/**
 * Leave a team, or (as its owner) remove somebody from it. ONE statement, because that is what
 * it is to the database: `team_members_leave_or_remove` decides which of the two you are doing,
 * and refuses the case both branches exclude - the team owner leaving their own team, which
 * would leave a team whose owner is not in it. An owner who wants out deletes the team.
 *
 * A DELETE that matches no row is not an error to Postgres, so the caller is told plainly rather
 * than being left to assume it worked.
 */
export async function leaveTeam(
  teamId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { data, error } = await sb
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('team_id');
  if (error) return { error: error.message };
  if (!Array.isArray(data) || data.length === 0) {
    return { error: 'That membership could not be removed. A team owner leaves by deleting the team.' };
  }
  return { error: null };
}

/** Delete a team. Owner-only; membership rows cascade with it, and so will its productions
 *  (TEAMS_PLAN §6, "productions stay with the team" read honestly). */
export async function deleteTeam(teamId: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { data, error } = await sb.from('teams').delete().eq('id', teamId).select('id');
  if (error) return { error: error.message };
  if (!Array.isArray(data) || data.length === 0) {
    return { error: 'Only the team owner can delete a team.' };
  }
  return { error: null };
}
