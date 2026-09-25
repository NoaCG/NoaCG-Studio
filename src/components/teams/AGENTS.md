# src/components/teams - the team surfaces

Loaded alongside `src/components/AGENTS.md` when working in this directory (Claude reads it via
this directory's `CLAUDE.md` import; Codex reads it directly). The design it implements is
`docs/TEAMS_PLAN.md` §6, and the mockups it was built from are in `docs/design/teams/`.

## The gate is one hook, and reading the wrong thing is the trap

Every team surface asks `useTeamsAvailable()` - `backendConfigured && status === 'signed-in'`.
Nothing here may test the auth state itself, for one reason:

**`useAuthState().signedIn` is TRUE offline.** That is deliberate (`components/auth/AGENTS.md`):
a gate can never trap a user in a build that has no login at all. But it means a team surface
that read `signedIn` would render its door in exactly the build that must grow ZERO team UI -
the repo's oldest rule, pinned by `e2e/auth.spec.ts`, which is a stage-3 evidence bar rather
than a nicety (`docs/TEAMS_PLAN.md` §7).

Signed out with a backend renders NOTHING - not a `SignInPrompt`, which is the pattern
everywhere else. §6: "a user who never opens the door never sees the word team anywhere." The
ONE exception is `JoinTeamDialog`: somebody arriving on a teacher's `#/join-team/<code>` has
already been told teams exist, so that surface gates on `backendConfigured` alone and offers the
ACCOUNT leading (`offerSignUp`) - a student clicking that link usually has none yet.

Underneath both, `src/backend/teams.ts` starts every verb at `getSupabase()`, which is null
offline. Two independent reasons the offline build cannot reach a team is the point, not
redundancy.

## What is here

- **`teamsUi.ts`** - which team dialog is open: `openShare` (from a production) or `openTeam`
  (from a team - Home's bands, the Teams section, the production header). A module store because
  the door is reached from SIBLINGS and the dialog mounts ONCE in `App.tsx`. Two mount points would
  put two dialogs on screen.
- **`ShareWithTeamDialog.tsx`** - the one door: three screens (`pick`, `create`, `team`) in one
  dialog because they are one errand. It fetches teams AND every member row it can see on open
  (RLS scopes both), so the pick list's member counts and the team screen's list come from one
  query rather than one per row. **Move to team** is the pick screen's primary. Opened on a team,
  or from a production already in one, it starts on `team` and offers no Back - there is nothing
  to share.
- **`TeamSync.tsx`** - starts and stops `backend/teamProductions.ts` with the session, mounted
  once in App so a cold link to a team production finds its record whatever surface it lands on.
- **`useTeamState.ts`** - every team surface's read of that controller (teams, members, heads,
  save state), through ONE external store so Home, the page and the dialogs render one fetch.
- **`teamLabels.ts`** - "3 members · you own it" and the "edited by" time, printed one way.
- **`JoinTeamDialog.tsx`** - route-driven, mounted by `App.tsx` on `#/join-team/<code>`.
- **`TeamChip.tsx`** - one component so the amber-outlined chip is identical in every place a
  thing belongs to a team: the dialog, Home's team bands and team production cards, the Teams
  section.
- **`useTeamsAvailable.ts`** - the gate above.

## Three things that were defects, so do not undo them

- **A dialog belongs to the surface it was opened from.** `ShareWithTeamDialog` lives in a module
  store and mounts at App level, so nothing else takes it down on a route change: it closed over
  a surface it said nothing about, backdrop and all. It now compares the route's HASH (the store
  writes a fresh object on every sync) and closes when it changes.
- **A new code is a new errand.** The route stays `join-team` from one link to the next, so
  `JoinTeamDialog` is not remounted; without resetting on the code, somebody who joined one team
  and followed a classmate's link to another read the FIRST team's success screen.
- **`.wz-modal` is sized for the WIZARD** (`height: min(960px, 94vh)`). A borrower that sets only
  a width gets a full-height sheet with its content in the top fifth. `.team-dialog` overrides
  `height`, the same way Settings and the save dialog do. And `.destructive` has NO global rule -
  every surface writes its own - so a delete control without one looks like every other button.

## A team is FOUND on Home, and only by somebody in one

Stage 4 (`docs/TEAMS_PLAN.md` §7) exists because an invited student could not
find the team they had joined. So once an account is in a team, Home shows it in two places -
"Shared with my teams" on the productions list (a band per team) and the **Teams** nav section -
and the join's Done lands on a list that already has the band, because the join itself refetches
(`refreshTeams`). `e2e/configured/teams.spec.ts` pins that with a five-second wait, shorter than
the background tick, so a band that only arrives on the tick fails.

Both places, and the "My productions" heading beside them, are drawn only for an account IN a
team - never for one that merely could be. That is §6's rule restated for Home: the offline pins
in `e2e/auth.spec.ts` cover all three test ids.

A team production is edited through the ordinary production page. Its record lives in the
in-memory team store (`model/teamShows.ts`) and every save goes out over compare-and-swap - so a
surface here never writes `team_productions` itself except to MOVE or DELETE one, and never
treats a team record as a personal one (`deleteShow` tombstones personal records only).
