// The join door: `/app#/join-team/<code>` (docs/TEAMS_PLAN.md §6, mockup screen 3).
//
// A teacher reads the code out or pastes this link in the class chat; a student opens it in their
// OWN account and answers one question - the name their teammates will see. There is no email
// invitation and cannot be one until SMTP is provisioned (§5), which is exactly why the code is
// the capability: it works on the day, in a room, with nothing provisioned.
//
// THE ONE PLACE A TEAM SURFACE PROMPTS FOR SIGN-IN. Everywhere else, teams render nothing at all
// to a signed-out visitor (§6: a user who never opens the door never sees the word "team"). Here
// the visitor arrived ON a team link and has already been told teams exist, so the honest answer
// is the account, offered leading - a student clicking their teacher's link usually has no
// account yet, and "Sign in" alone reads as a wall to them.
//
// OFFLINE THIS DOES NOT EXIST. `backendConfigured` is false, so the component returns null and
// App renders Home instead: the route degrades to a surface that always exists, the way every
// other unresolvable route in router.ts does.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '../../app/router';
import { useAuthState } from '../auth/useAuthState';
import { useModalGate } from '../spaceKey';
import SignInPrompt from '../auth/SignInPrompt';
import { joinTeamByCode, suggestedDisplayName, type Team } from '../../backend/teams';
import { refreshTeams } from '../../backend/teamProductions';
import TeamChip from './TeamChip';
import { useEscapeToClose } from './useEscapeToClose';

export default function JoinTeamDialog({ code }: { code: string }) {
  const { backendConfigured, status, user } = useAuthState();
  if (!backendConfigured) return null;
  return <Dialog code={code} status={status} email={user?.email} />;
}

function Dialog({
  code,
  status,
  email,
}: {
  code: string;
  status: 'loading' | 'signed-out' | 'signed-in';
  email: string | undefined;
}) {
  const navigate = useRouter((s) => s.navigate);
  useModalGate(true);

  const [joinCode, setJoinCode] = useState(code);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Team | null>(null);

  // The prefill waits for the session: the email is not known while auth is still loading, and a
  // field that fills itself a second after the reader started typing is worse than an empty one.
  useEffect(() => {
    if (status !== 'signed-in') return;
    setDisplayName((current) => (current ? current : suggestedDisplayName(email)));
  }, [status, email]);

  // A NEW CODE IS A NEW ERRAND. The route stays `join-team` from one link to the next, so this
  // component is not remounted when a second link is opened - without this reset, somebody who
  // joined one team and then followed a classmate's link to another would be looking at the
  // first team's "you are in" screen, with the second team unjoined and nothing saying so.
  useEffect(() => {
    setJoinCode(code);
    setJoined(null);
    setError(null);
  }, [code]);

  // Stable, so the Escape listener subscribes once instead of on every keystroke in the fields.
  const leave = useCallback(
    () => navigate({ view: 'home', section: 'productions' }),
    [navigate],
  );
  useEscapeToClose(leave);

  const join = async () => {
    setBusy(true);
    setError(null);
    const { team, error: err } = await joinTeamByCode(joinCode, displayName);
    setBusy(false);
    if (!team) {
      setError(err);
      return;
    }
    setJoined(team);
    // Fetch the team's productions NOW, not on the next tick: Done lands on the productions list,
    // and the team's band has to be there when it does (the "joined, and nothing happened" bug).
    void refreshTeams();
  };

  return (
    <div className="gallery-backdrop">
      <div
        className="wz-modal team-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Join team"
        data-testid="join-team-dialog"
      >
        <div className="wz-header">
          <h2>{joined ? 'You are in the team' : 'Join team'}</h2>
          <button className="gallery-close" onClick={leave} title="Close">✕</button>
        </div>

        <div className="team-dialog-body">
          {status === 'loading' && <p className="hint">Checking your account…</p>}

          {status === 'signed-out' && (
            <SignInPrompt
              feature="Join this team"
              reason="Joining a team needs your own account - that is the point of a team: nobody shares a login."
              offerSignUp
            />
          )}

          {status === 'signed-in' && !joined && (
            <>
              <label className="team-field">
                <span>Join code</span>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="e.g. K7MQ2R4a"
                  data-testid="join-team-code"
                />
              </label>
              <label className="team-field">
                <span>Your name, as teammates see it</span>
                <input
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void join(); }}
                  placeholder="e.g. Ben Karlsson"
                  data-testid="join-team-display-name"
                />
              </label>
              <p className="hint">
                {email ? <>You are signed in as <strong>{email}</strong>. </> : null}
                Joining shares nothing from your own library - only productions the team holds.
              </p>
            </>
          )}

          {/* WHAT THIS MAY PROMISE IS WHAT HOME DELIVERS. The team's productions are listed in
              its own band on the productions list (ProductionsSection's TeamBands) and the team
              in the Teams section, both fetched by the join itself - so the sentence can name
              the place, which is what a student reading it needs. */}
          {joined && (
            <p className="hint" data-testid="join-team-done">
              You joined <TeamChip name={joined.name} />. Your teammates can see your name in the
              team. Everything the team shares is on your Home, under <strong>Shared with my
              teams</strong>, and the team itself is under <strong>Teams</strong>.
            </p>
          )}

          {error && <p className="status-bad" data-testid="join-team-error">{error}</p>}
        </div>

        <div className="dlg-foot team-dialog-foot">
          {joined ? (
            <>
              <div className="spacer" />
              <button className="primary" onClick={leave} data-testid="join-team-done-close">Done</button>
            </>
          ) : (
            <>
              <button onClick={leave}>Cancel</button>
              <div className="spacer" />
              <button
                className="primary"
                disabled={status !== 'signed-in' || busy || !joinCode.trim() || !displayName.trim()}
                onClick={() => void join()}
                data-testid="join-team"
              >
                {busy ? 'Joining…' : 'Join team'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
