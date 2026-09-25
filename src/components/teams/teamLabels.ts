// The few words every team surface prints the same way: the "3 members · you own it" line under a
// team's name, and the time in "edited by Anna, 12:03". One copy, so Home's bands, the Teams
// section and the production page cannot drift into three phrasings of one fact.

import type { Team, TeamMember } from '../../backend/teams';

/** "12:03" today, "Mon 22 Sep" before - the "edited by Anna, 12:03" line (TEAMS_PLAN §6). */
export function editedWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toDateString() === new Date().toDateString()
    ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "3 members · you own it" - the line under a team's name, wherever a team is listed. */
export function teamMeta(team: Team, members: TeamMember[], userId: string | undefined): string {
  const count = members.filter((m) => m.teamId === team.id).length;
  const who = team.ownerId === userId ? 'you own it' : 'you are a member';
  return `${count} member${count === 1 ? '' : 's'} · ${who}`;
}
