// "Share with a team…" - THE ONE TEAM DOOR (docs/TEAMS_PLAN.md §6, mockup
// `docs/design/teams/teams-share-dialog.html`).
//
// Everything a team is reached from here: make one, move a production into it, read out its join
// code, see who is in it, rotate the code, leave, delete. The FIRST door hangs off a PRODUCTION
// (the thing a team is for) rather than off the account, so a user who never opens it never sees
// the word "team" anywhere - the plan's §6 rule. Once somebody IS in a team, Home shows it: the
// Teams section and the team bands on the productions list open this same dialog on that team
// (`openTeam`), because "where is the team I was invited to" must never need a search.
//
// MOVING is stage 4's verb (backend/teamProductions.ts `moveProductionToTeam`): the production
// goes to `team_productions` and leaves the personal list in the same step, and it appears in the
// team's band on every member's Home. Every control here works end to end against the real RPCs
// from migrations 0053 and 0054.
//
// THE THREE SCREENS mirror the mockup: `pick` (choose a team, or start a new one), `create`
// (name it, and name yourself), `team` (the join code, the member list, leaving). They are one
// dialog rather than three because they are one errand. Opened on a team, or from a production
// that is already in one, it starts on `team` and has no `pick` to go back to - there is nothing
// to share.

import { useCallback, useEffect, useRef, useState } from 'react';
import { routeHash, useRouter } from '../../app/router';
import { useAuthState } from '../auth/useAuthState';
import { useModalGate } from '../spaceKey';
import { copyLink } from '../home/copyLink';
import {
  createTeam,
  deleteTeam,
  joinTeamLink,
  leaveTeam,
  listMyTeamMembers,
  listMyTeams,
  rotateJoinCode,
  suggestedDisplayName,
  type Team,
  type TeamMember,
} from '../../backend/teams';
import { moveProductionToTeam, refreshTeams } from '../../backend/teamProductions';
import { loadShows } from '../../model/shows';
import { useTeamsUi } from './teamsUi';
import { useTeamsAvailable } from './useTeamsAvailable';
import { useEscapeToClose } from './useEscapeToClose';
import TeamChip from './TeamChip';

/** One fetch answers every team's member list, so both the counts on the pick screen and the
 *  list on the team screen are sliced out of it here rather than re-queried per team. */
function ofTeam(members: TeamMember[] | null, teamId: string): TeamMember[] {
  return (members ?? []).filter((m) => m.teamId === teamId);
}

/**
 * `list` holding `team` exactly once. The open-time fetch and a create race: on a slow backend
 * the fetch can answer after the new team's insert and before `createTeam` returns, so the team
 * arrives from both sides. Appending blindly listed it twice (hosted-latency run 36256306109);
 * replacing with the fetch alone could drop it.
 */
function withTeam(list: Team[] | null, team: Team): Team[] {
  return [...(list ?? []).filter((t) => t.id !== team.id), team];
}

type Screen = 'pick' | 'create' | 'team';

export default function ShareWithTeamDialog() {
  const share = useTeamsUi((s) => s.share);
  const available = useTeamsAvailable();
  // Mounted at App level, so it must decide for itself whether it exists at all. Offline and
  // signed-out builds render nothing - no markup, no fetch, no Supabase chunk.
  if (!share || !available) return null;
  return <Dialog />;
}

function Dialog() {
  const share = useTeamsUi((s) => s.share)!;
  const close = useTeamsUi((s) => s.closeShare);
  const { user } = useAuthState();
  useModalGate(true);

  // The production this was opened from, read once: a production already in a team has nothing to
  // share, so the dialog opens on its team instead, and so does a request made about a team alone.
  const [production] = useState(() => (share.showId ? loadShows().find((s) => s.id === share.showId) ?? null : null));
  const startTeam = share.teamId ?? production?.teamId ?? null;
  /** Whether there is a production here to move - the pick screen exists only then. */
  const canMove = Boolean(production && !production.teamId);
  const [screen, setScreen] = useState<Screen>(startTeam ? 'team' : 'pick');
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(startTeam);
  /** The outcome of a move, shown on the team screen it lands on. */
  const [moved, setMoved] = useState<{ name: string; warning: string | null } | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A READ that failed, kept apart from `error` (which belongs to something the reader just
   *  pressed). It is what stops the empty state from claiming "you are not in a team yet" to
   *  somebody whose teams simply could not be fetched. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [newTeamName, setNewTeamName] = useState('');
  const [displayName, setDisplayName] = useState(() => suggestedDisplayName(user?.email));

  const selected = teams?.find((t) => t.id === selectedId) ?? null;
  const iAmOwner = Boolean(selected && user && selected.ownerId === user.id);
  const selectedMembers = selected ? ofTeam(members, selected.id) : [];

  useEscapeToClose(close);

  // A DIALOG BELONGS TO THE SURFACE IT WAS OPENED FROM. This one lives in a module store and
  // mounts at App level, so nothing else would take it down when the route changes: pressing
  // Back, or following a join link, left it floating over a surface it says nothing about, with
  // its full-screen backdrop swallowing every click underneath. Comparing the route's HASH
  // rather than the object because the store writes a fresh object on every sync.
  const here = routeHash(useRouter((s) => s.route));
  const openedOn = useRef(here);
  useEffect(() => {
    if (here !== openedOn.current) close();
  }, [here, close]);

  // Both lists are fetched every time the dialog opens: a teammate may have renamed the team,
  // rotated its code or joined since this tab last looked, and a stale code is the one thing
  // this screen must never show.
  const refreshMembers = useCallback(() => {
    void listMyTeamMembers().then(({ members: rows, error: err }) => {
      setMembers(rows);
      setLoadError((was) => err ?? was);
    });
  }, []);

  useEffect(() => {
    let stale = false;
    void listMyTeams().then(({ teams: list, error: err }) => {
      if (stale) return;
      // Keep a team created while this fetch was in flight (see `withTeam`).
      setTeams((created) => (created ?? []).reduce(withTeam, list));
      setLoadError(err);
      // Land on the team you are in when there is exactly one - the class case, where picking
      // from a list of one is a step that asks nothing.
      if (list.length === 1) setSelectedId((was) => was ?? list[0].id);
    });
    refreshMembers();
    return () => { stale = true; };
  }, [refreshMembers]);

  // And again on the way into the team screen. The open-time fetch cannot know about a team
  // created since (its membership row is written by `team_join` a moment after the insert), nor
  // about a classmate who joined while this dialog sat open on somebody's second monitor - and
  // the member list is the one thing on that screen a reader is there to check.
  useEffect(() => {
    if (screen === 'team') refreshMembers();
  }, [screen, selectedId, refreshMembers]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const { team, error: err } = await createTeam(newTeamName, displayName);
    setBusy(false);
    if (!team) {
      setError(err);
      return;
    }
    setTeams((list) => withTeam(list, team));
    setSelectedId(team.id);
    void refreshTeams();
    // A team that exists but whose creator's membership row failed to write is still a team, and
    // the code screen is where it can be repaired - so this reports the problem and continues,
    // rather than pretending nothing was made.
    setError(err);
    setScreen('team');
  };

  const rotate = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const { code, error: err } = await rotateJoinCode(selected.id);
    setBusy(false);
    if (!code) {
      setError(err ?? 'The join code could not be rotated.');
      return;
    }
    setTeams((list) => (list ?? []).map((t) => (t.id === selected.id ? { ...t, joinCode: code } : t)));
    setCopied(false);
  };

  const leave = async () => {
    if (!selected || !user) return;
    setBusy(true);
    setError(null);
    const { error: err } = await leaveTeam(selected.id, user.id);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setTeams((list) => (list ?? []).filter((t) => t.id !== selected.id));
    setSelectedId(null);
    void refreshTeams();
    // Opened on the team, there is no pick screen to fall back to: the errand is over.
    if (canMove) setScreen('pick');
    else close();
  };

  const remove = async (member: TeamMember) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const { error: err } = await leaveTeam(selected.id, member.userId);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    refreshMembers();
    void refreshTeams();
  };

  const destroy = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const { error: err } = await deleteTeam(selected.id);
    setBusy(false);
    setConfirmDelete(false);
    if (err) {
      setError(err);
      return;
    }
    setTeams((list) => (list ?? []).filter((t) => t.id !== selected.id));
    setSelectedId(null);
    void refreshTeams();
    if (canMove) setScreen('pick');
    else close();
  };

  /** Move the production into the selected team, then show that team - the place it now lives. */
  const move = async () => {
    if (!selected || !production) return;
    setBusy(true);
    setError(null);
    // Re-read at the moment of the move: the page behind this dialog may have saved an edit since
    // it opened, and the team must receive the production as it is now.
    const current = loadShows().find((s) => s.id === production.id) ?? production;
    const { error: err, warning } = await moveProductionToTeam(current, selected.id);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMoved({ name: current.name, warning });
    setScreen('team');
  };

  const copy = () => {
    if (!selected) return;
    void copyLink(joinTeamLink(selected.joinCode)).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const title =
    screen === 'create' ? 'New team'
    : screen === 'team' && selected ? `Team “${selected.name}”`
    : screen === 'team' ? 'Team'
    : `Share “${share.showName ?? production?.name ?? 'this production'}” with a team`;

  return (
    <div className="gallery-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div
        className="wz-modal team-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="share-with-team-dialog"
      >
        <div className="wz-header">
          <h2>{title}</h2>
          <button className="gallery-close" onClick={close} title="Close">✕</button>
        </div>

        <div className="team-dialog-body">
          {screen === 'pick' && (
            <PickScreen
              teams={teams}
              members={members}
              loadError={loadError}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNew={() => { setError(null); setScreen('create'); }}
            />
          )}

          {screen === 'create' && (
            <>
              <label className="team-field">
                <span>Team name</span>
                <input
                  autoFocus
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Northvale TV-26"
                  data-testid="new-team-name"
                />
              </label>
              <label className="team-field">
                <span>Your name, as teammates see it</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Ben Karlsson"
                  data-testid="new-team-display-name"
                />
              </label>
              <p className="hint">
                Teammates see this name and nothing else - email addresses are never shown. You
                get a join code to read out or paste in the class chat.
              </p>
            </>
          )}

          {screen === 'team' && !selected && (
            <p className={loadError ? 'status-bad' : 'hint'}>
              {teams === null ? 'Loading the team…' : loadError ? 'The team could not be loaded.' : 'You are no longer in this team.'}
            </p>
          )}

          {screen === 'team' && selected && (
            <>
              {moved && (
                <p className="status-ok" data-testid="team-moved">
                  “{moved.name}” is now in <TeamChip name={selected.name} />. Everyone in the team finds
                  it on their Home, under the team’s name, and can edit, publish and operate it.
                </p>
              )}
              {moved?.warning && <p className="status-bad">{moved.warning}</p>}
              <div className="team-codewrap">
                <span className="team-codelabel">Join code</span>
                <div className="team-code mono" data-testid="team-join-code">{selected.joinCode}</div>
                <div className="team-linkrow">
                  <input readOnly value={joinTeamLink(selected.joinCode)} data-testid="team-join-link" />
                  <button onClick={copy} data-testid="copy-team-link">
                    {copied ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
              <p className="hint">
                Anyone in the team can pass the code on. {iAmOwner
                  ? 'Rotating it makes a new one and retires this one for joining - everyone already in the team stays.'
                  : 'Only the team owner can rotate it.'}
              </p>

              <span className="team-codelabel">In this team</span>
              <div className="team-members" data-testid="team-members">
                {members === null && <p className="hint">Loading members…</p>}
                {selectedMembers.map((m) => (
                  <div className="team-member" key={m.userId}>
                    <span className="team-member-name">{m.displayName}</span>
                    <span className={`team-member-role${m.role === 'owner' ? ' owner' : ''}`}>
                      {m.userId === user?.id ? 'You' : m.role === 'owner' ? 'Owner' : 'Member'}
                    </span>
                    {iAmOwner && m.userId !== user?.id && (
                      <button
                        className="team-member-remove"
                        disabled={busy}
                        onClick={() => void remove(m)}
                        title={`Remove ${m.displayName} from the team`}
                        data-testid="remove-team-member"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {/* Same rule as the pick screen's empty state: an owner told "Nobody has joined
                    yet" about a team with three people in it concludes their code is broken. */}
                {members !== null && selectedMembers.length === 0 && (
                  <p className={loadError ? 'status-bad' : 'hint'}>
                    {loadError
                      ? 'The member list could not be loaded.'
                      : 'Nobody has joined yet.'}
                  </p>
                )}
              </div>
            </>
          )}

          {error && <p className="status-bad" data-testid="team-error">{error}</p>}
        </div>

        <div className="dlg-foot team-dialog-foot">
          {screen === 'pick' && (
            <>
              <button onClick={close}>Cancel</button>
              <div className="spacer" />
              <button
                disabled={!selected || busy}
                onClick={() => { setError(null); setScreen('team'); }}
                data-testid="open-team-details"
              >
                Join code &amp; members
              </button>
              {/* The primary: what the reader opened a production's Share door to do. */}
              <button
                className="primary"
                disabled={!selected || busy || !canMove}
                onClick={() => void move()}
                title={selected ? `Move this production into “${selected.name}”` : 'Pick a team first'}
                data-testid="move-to-team"
              >
                {busy ? 'Moving…' : 'Move to team'}
              </button>
            </>
          )}
          {screen === 'create' && (
            <>
              <button onClick={() => { setError(null); setScreen('pick'); }}>Back</button>
              <div className="spacer" />
              <button
                className="primary"
                disabled={busy || !newTeamName.trim() || !displayName.trim()}
                onClick={() => void create()}
                data-testid="create-team"
              >
                {busy ? 'Creating…' : 'Create team'}
              </button>
            </>
          )}
          {screen === 'team' && selected && (
            <>
              {/* Back only where there is somewhere to go back TO: opened on a team, or after a
                  move, the pick screen would offer to share something that has nothing to share. */}
              {canMove && !moved && (
                <button onClick={() => { setError(null); setConfirmDelete(false); setScreen('pick'); }}>Back</button>
              )}
              {/* The destructive control sits with Back, on the LEFT, and the spacer holds the
                  width of the dialog between it and the primary. Parked next to Done it was one
                  slipped click from deleting a team - and Done is the button a reader presses
                  without looking, because it is the one that means "nothing happened". */}
              {iAmOwner ? (
                <button
                  className="destructive"
                  disabled={busy}
                  onClick={() => (confirmDelete ? void destroy() : setConfirmDelete(true))}
                  title="Delete the team. Its members lose it; productions it holds go with it."
                  data-testid="delete-team"
                >
                  {confirmDelete ? 'Delete team?' : 'Delete team'}
                </button>
              ) : (
                <button
                  className="destructive"
                  disabled={busy}
                  onClick={() => void leave()}
                  data-testid="leave-team"
                >
                  Leave team
                </button>
              )}
              <div className="spacer" />
              {iAmOwner && (
                <button disabled={busy} onClick={() => void rotate()} data-testid="rotate-team-code">
                  Rotate code
                </button>
              )}
              <button className="primary" onClick={close}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PickScreen({
  teams,
  members,
  loadError,
  selectedId,
  onSelect,
  onNew,
}: {
  teams: Team[] | null;
  members: TeamMember[] | null;
  loadError: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <>
      {teams === null && <p className="hint">Loading your teams…</p>}
      {/* "You are not in a team yet" is a CLAIM, and it must not be made on the strength of a
          fetch that failed: its next move is to make a team and hand out its code, so telling it
          to somebody who is already in one splits a class in two. */}
      {teams?.length === 0 && loadError && (
        <p className="status-bad" data-testid="teams-load-error">
          Your teams could not be loaded. Check your connection and open this again - nothing has
          changed.
        </p>
      )}
      {teams?.length === 0 && !loadError && (
        <p className="hint" data-testid="no-teams">
          You are not in a team yet. Make one, and the join code it gives you is the whole
          invitation - read it out, or paste the link in the class chat.
        </p>
      )}
      {teams !== null && teams.length > 0 && (
        <div className="team-pick" role="radiogroup" aria-label="Your teams">
          {teams.map((t) => {
            const count = ofTeam(members, t.id).length;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={selectedId === t.id}
                className={`team-pickrow${selectedId === t.id ? ' sel' : ''}`}
                onClick={() => onSelect(t.id)}
                data-testid="team-pickrow"
              >
                <span className="team-radio" />
                <TeamChip name={t.name} />
                {/* Blank until the count is known rather than "0 members", which is a wrong
                    answer where an absent one would have been an honest one. */}
                <span className="team-pickmeta">
                  {members === null ? '' : `${count} member${count === 1 ? '' : 's'}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button className="team-new" onClick={onNew} data-testid="new-team">＋ New team…</button>
      <p className="hint">
        A team owns productions, never libraries: joining shares nothing from anybody’s saved
        graphics. Every member can edit a team production’s rundown, republish its graphics and
        operate it.
      </p>
      {/* What the move DOES, said before the press rather than discovered after it: the
          production leaves your own list, and deleting it becomes the team owner's call. */}
      <p className="hint" data-testid="move-explainer">
        Moving takes the production out of your own list and into the team’s, where every member
        sees it on their Home straight away. Its published links stay the same. Only the team
        owner can delete it.
      </p>
    </>
  );
}
