---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: advanced
note: >-
  Eight of the nine are answered on the screen (branch claude/f-teams-without-guessing, 2026-09-27):
  Home's "Join a team" card is the code's door, a member gets back through the team band or the
  Teams section, and the dialog carries its own explanations. What is left is item 3, the code's
  alphabet, which is a migration and a rotation of codes already handed out - the owner's call.
found: >-
  Walking the team surfaces to write their /docs guide produced nine places where the screen did
  not carry its own explanation. Eight are answered on the screen; the one left is that the join
  code's alphabet cannot be read out loud.
serves: NOW
size: small
touches: supabase/migrations/, src/components/teams/
covered-by: e2e/configured/teams.spec.ts
needs-owner: none
---
# The join code cannot be read out loud (the last of the team dialog's nine guesses)

**Filed:** 2026-09-09. **Source:** the walk behind `docs/backlog/teams-needs-written-instructions.md`,
run as `e2e/configured/teams.spec.ts` against the real backend. **Reduced** 2026-09-27, when the
other eight were answered on the screen.

## Why

The owner's standard for teams is that they are usable without reading anything. Migration 0053
mints the join code as 8 base64url characters: mixed case, with `0`, `O`, `l`, `1`, `-` and `_` all
in the alphabet (one run produced `V3f3j023`). The §6 mockup showed `K7M-Q2R`, an unambiguous
alphabet, grouped, meant to be read out across a classroom.

The screen no longer promises that. Since 2026-09-27 the team screen leads with the LINK, shows the
code second and smaller for typing into Home's **Join a team** card, and says "capitals count"; the
join dialog and the card both accept a pasted link as well as a code. So nothing on screen sends a
reader the wrong way any more. What is lost is the classroom case the mockup drew: a teacher saying
the code out loud to a room.

## What it would take

A decision first, because it is the owner's call and not a technical one:

- **Keep the link-first design** and close this file. Codes stay as they are.
- **Mint a speakable code**: a new migration changing the minting recipe to an unambiguous alphabet
  (for example Crockford base32, upper case, grouped `K7M-Q2R`), the join RPC normalising case and
  dashes on the way in, and a rotation of every code already handed out, which breaks every link
  already pasted in a class chat. Then the team screen can show the code large again and say "read
  it out".

## Evidence

- `supabase/migrations/0053_teams_and_membership.sql`, the minting recipe.
- `src/components/teams/ShareWithTeamDialog.tsx`, the team screen's invite block and its comment.
- `docs/TEAMS_PLAN.md` §6, the mockup's `K7M-Q2R`.
