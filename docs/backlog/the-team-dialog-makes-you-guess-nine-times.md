---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: >-
  Walking the team surfaces to write their /docs guide produced nine places where the screen did
  not carry its own explanation. Three of them are things the guide cannot fix by explaining
  better, because the screen sends the reader the wrong way rather than saying nothing.
serves: NOW
size: standard
touches: src/components/teams/, src/components/home/sections/ProductionsSection.tsx
covered-by: e2e/configured/teams.spec.ts, e2e/auth.spec.ts
needs-owner: none
---
# The team dialog makes you guess nine times, and three of those are wrong turns

**Filed:** 2026-09-09. **Source:** the walk behind `docs/backlog/teams-needs-written-instructions.md`,
run as `e2e/configured/teams.spec.ts` against the real backend on branch
`claude/ak-teams-instructions`.

## Why

The owner's ask for written instructions came with its own standard, and it binds:

> Of course, it should be so intuitive that you can just use it without reading anything.

So the guide is the fallback and this list is the real deliverable. `teams-needs-written-instructions`
names the round trip to copy: the SVG import walk filed its three hesitations, a later row answered
all three on the SCREEN, and that row deleted the file in the same commit as the last fix. These
nine are the same shape. A guide that has to explain any of them twice is entrenching the defect.

They are listed worst first. The first three are not gaps in the copy; they send a reader
somewhere that does not work.

### 1. The join code is the loudest thing on the screen and it is the half that does not work

The team screen prints the code in the largest type on it, in an amber-bordered box, with the link
underneath in a small grey read-only field. Nothing in the app accepts a typed code:
`JoinTeamDialog` is reachable only from `#/join-team/<code>`, so the only redemption path is the
link. A reader who does what the screen emphasises, and reads the code out to a room, gets nobody
in.

This is the wall the owner hit himself on 2026-09-04, recorded in
`teams-invite-join-code-and-what-a-new-member-sees` finding 2: "There is also the join code, but I
don't know how to use that." That file's answer is a door for the code or dropping it; this walk
adds that the emphasis is backwards even before that is decided.

### 2. A member who joined a team has no way back to it

Both doors into the share dialog hang off a production you own: `ProductionPage`'s header and
`ProductionsSection`'s row menu. There is no team entry in the topbar, on Home or in Settings, by
design (`docs/TEAMS_PLAN.md` §6: a user who never opens the door never sees the word team).

The consequence was not designed. A student who follows a teacher's link, joins, and owns no
production of their own cannot reach their team at all. They cannot see who else is in it, cannot
find the link to pass on, and cannot leave. The workaround is to create a throwaway production in
order to open a dialog about something else.

### 3. The join code cannot be read out loud

Migration 0053 mints it as 8 base64url characters, so it is mixed case with `0`, `O`, `l`, `1`, `-`
and `_` all in the alphabet. Tonight's run produced `V3f3j023`. The dialog's own copy says "read it
out, or paste the link in the class chat", and the §6 mockup showed `K7M-Q2R` - an unambiguous
alphabet, grouped. Either the alphabet should match what the copy promises, or the copy should stop
promising it.

### The other six, which are ordinary missing sentences

4. **The primary button is the wrong one for a first-timer.** With no teams, the pick screen's
   amber footer button is "Join code & members" (disabled) and the only useful control,
   "＋ New team…", is a quiet text button in the middle of the body.
5. **"Move to team" is the button the reader came for and it is off.** The reason is a hint below
   the footer rather than on the control. Stage 4 deletes both, which is the plan, but until it
   lands this is the first thing a reader looks at.
6. **After joining, "Done" lands on Home with nothing changed.** The success line says productions
   "will appear on Home", future tense, and Home carries no sign the person is in a team.
7. **Two name boxes on the create screen, and they are not the same box.** Same trap as the
   wizard's Finish step, which now says so on screen. This one does not.
8. **There is no way to change your display name** except joining again through the same link with
   a different one. Nothing says so, and the member list has no rename control.
9. **Nothing anywhere says whose storage a team costs.** §8 ruling 4 decided it (the team owner),
   and enforcement is not live, so this is a sentence rather than a mechanism.

## What it would take

Items 4 to 9 are copy and one button swap: an afternoon. Item 3 is a change to the minting recipe
in a new migration plus rotation of any code already handed out, so it is a scope edge and returns
to the owner. Items 1 and 2 are the real work and they are the same work: teams need one door that
does not hang off owning a production. The cheapest shape that closes both is a "Join or open a
team" entry that a signed-in user can reach without a production, which is also the door the code
has been missing since 2026-09-04.

Do not fix these one at a time across separate rows. The copy items are worth almost nothing
without item 2, because a member cannot get back to the screen the copy is on.

## Evidence

- `e2e/configured/teams.spec.ts`, run 2026-09-09 against the real backend, three cases green in
  20.6s. Its five screenshots under `test-results/signed-in/` are what items 1, 3, 4 and 6 were
  read off.
- `src/components/teams/ShareWithTeamDialog.tsx` (the pick, create and team screens),
  `JoinTeamDialog.tsx`, `src/backend/teams.ts`.
- `src/components/home/ProductionPage.tsx` and `src/components/home/sections/ProductionsSection.tsx`
  are the only two `useTeamsAvailable()` call sites in the tree, which is item 2.
- `supabase/migrations/0053_teams_and_membership.sql`, the minting recipe behind item 3.
- `docs/backlog/teams-invite-join-code-and-what-a-new-member-sees.md`, the owner's own walk.
- `docs/TEAMS_PLAN.md` §6 and §8.
