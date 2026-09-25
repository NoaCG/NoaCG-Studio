// The team surfaces' test ids, in ONE place.
//
// WHY THIS FILE EXISTS. The stage-3 evidence bar (docs/TEAMS_PLAN.md §7) is an OFFLINE build
// asserted to grow zero team UI, and an absence assertion is only worth the selector it names: a
// `toHaveCount(0)` on a test id nothing ever renders passes forever and proves nothing. So the
// offline spec (e2e/auth.spec.ts) and the signed-in spec (e2e/configured/teams.spec.ts) import
// the SAME constants - the configured run asserts each one is VISIBLE, which is what makes the
// offline run's zero mean something. A typo breaks the positive test loudly instead of turning
// the negative test green.
//
// Note `TEAM` prefixes on the two generic ones: `row-menu` is shared with the graphics library,
// so a team assertion on it must always be scoped to a production card, never to the page.

export const TEAM = {
  /** The door itself: the production page header button AND the card menu's item. */
  door: 'share-with-team',
  dialog: 'share-with-team-dialog',
  joinDialog: 'join-team-dialog',
  chip: 'team-chip',
  /** The production card's overflow menu, which exists ONLY when the door is in it. */
  cardMenu: 'row-menu',
  newTeam: 'new-team',
  newTeamName: 'new-team-name',
  newTeamDisplayName: 'new-team-display-name',
  createTeam: 'create-team',
  joinCode: 'team-join-code',
  joinLink: 'team-join-link',
  copyLink: 'copy-team-link',
  rotate: 'rotate-team-code',
  members: 'team-members',
  deleteTeam: 'delete-team',
  leaveTeam: 'leave-team',
  joinCodeField: 'join-team-code',
  joinDisplayName: 'join-team-display-name',
  join: 'join-team',
  joinDone: 'join-team-done',
  // Stage 4 - where a team and what it holds are FOUND. Each is drawn only for somebody in a team,
  // so the offline spec pins all of them absent and the configured walk pins them visible.
  /** "My productions", the band heading that appears once there is a team band beside it. */
  myProductionsHead: 'my-productions-head',
  /** "Shared with my teams" - every team's band on the productions list. */
  teamProductions: 'team-productions',
  /** The Teams entry in Home's nav, and the section it opens. */
  navTeams: 'home-nav-teams',
  teamsSection: 'teams-section',
  /** A team production's header: its team chip and save state. */
  productionTeam: 'production-team',
  moveToTeam: 'move-to-team',
  moved: 'team-moved',
} as const;

/** A join link with a code shaped like a real one (8 URL-safe characters, migration 0053) but
 *  belonging to no team. Offline it must open no dialog; signed in it must be refused by name. */
export const FAKE_JOIN_ROUTE = '/app#/join-team/K7MQ2R4a';
