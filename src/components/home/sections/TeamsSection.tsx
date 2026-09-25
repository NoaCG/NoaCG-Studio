import type { Show } from '../../../model/shows';
import { useAuthState } from '../../auth/useAuthState';
import TeamChip from '../../teams/TeamChip';
import { useTeamState } from '../../teams/useTeamState';
import { useTeamsUi } from '../../teams/teamsUi';
import { IconUsers } from '../../icons';
import { teamMeta } from '../../teams/teamLabels';

/**
 * THE TEAMS SECTION - `#/home/teams`, the one place that answers "which teams am I in".
 *
 * Before this, a team could only be reached through a production's Share door, so somebody who
 * had just joined a team from a link had no way back to it at all: they own no production of the
 * team's, and a brand-new account owns none of its own either, so there was no card whose menu
 * opened anything. Now every team is a card here, with who is in it, what it holds and the door to
 * its join code.
 *
 * HomePage lists this section in the nav only while the account is in a team (docs/TEAMS_PLAN.md
 * §6: somebody who never opened the team door never sees the word "team"), and the whole page is
 * behind `useTeamsAvailable()` there - offline it is not a route that can be reached.
 */
export default function TeamsSection({
  productions,
  onOpen,
}: {
  productions: Show[];
  onOpen: (show: Show) => void;
}) {
  const { teams, members, loaded, loadError } = useTeamState();
  const { user } = useAuthState();
  const openTeam = useTeamsUi((s) => s.openTeam);

  return (
    <div data-testid="teams-section">
      <h2><IconUsers size={18} /> Teams</h2>
      <p className="hint">
        The teams you are in. A team holds PRODUCTIONS, never libraries: everyone in it can edit,
        publish and operate what it holds, each from their own account. What a team holds is also
        on your productions list, under the team’s name.
      </p>
      {!loaded && <p className="hint">Loading your teams…</p>}
      {loadError && (
        <p className="status-bad" data-testid="teams-section-error">
          Your teams could not be refreshed ({loadError}). What is shown may be out of date.
        </p>
      )}
      {loaded && teams.length === 0 && !loadError && (
        <p className="hint" data-testid="teams-section-empty">
          You are not in a team any more. To join one, open the join link a teammate sends you.
        </p>
      )}
      <div className="team-cards">
        {teams.map((team) => {
          const held = productions.filter((p) => p.teamId === team.id);
          // Owner first, then everybody else in the order they joined - the server's order.
          const people = members
            .filter((m) => m.teamId === team.id)
            .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
            .map((m) => (m.userId === user?.id ? 'you' : m.role === 'owner' ? `${m.displayName} (owner)` : m.displayName));
          return (
            <div className="team-card" key={team.id} data-testid={`team-card-${team.id}`}>
              <div className="team-card-head">
                <TeamChip name={team.name} />
                <span className="team-band-meta">{teamMeta(team, members, user?.id)}</span>
              </div>
              <span className="team-card-label">In this team</span>
              <p className="team-card-members" data-testid="team-card-members">{people.join(' · ') || 'Nobody yet'}</p>
              <span className="team-card-label">Productions</span>
              <div className="team-card-prods">
                {held.map((show) => (
                  <button
                    key={show.id}
                    className="link-inline"
                    onClick={() => onOpen(show)}
                    title={`Open "${show.name}"`}
                    data-testid="team-card-production"
                  >
                    {show.name}
                  </button>
                ))}
                {held.length === 0 && (
                  <p className="hint" style={{ margin: 0 }}>
                    Nothing shared yet. Open one of your productions, choose Share and move it here.
                  </p>
                )}
              </div>
              <div className="team-card-actions">
                <button onClick={() => openTeam(team.id)} data-testid="team-card-open">
                  Members &amp; join code
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
