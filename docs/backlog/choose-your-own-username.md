---
v: 2
source: owner
kind: ask
raised: 2026-10-08
state: unstarted
asked: "Paraphrase, owner 2026-10-08, answering the community packs questions: users must not have to show their real name or email; let users choose their own username (accounts cannot today)."
serves: NOW
size: standard
touches: src/backend/auth.ts, src/components/home/, supabase/migrations/
needs-owner: none
---
# Let a user choose their own username

**Filed:** 2026-10-08. **Source:** owner answer to the community packs questions
(`docs/work-specs/community-packs/questions.md`, question 8)

## Why

Anything a user makes public (a community pack's maker name, a team's member list) should show a
name the user chose, never their real name or email unless they want that. Accounts cannot pick a
username today: surfaces fall back to the OAuth full name or the email's local part
(`authorName` in `src/community/communityData.ts`, `display_name` in `src/backend/teams.ts`).
Community packs work around it with a free-text "Shown as" per pack (spec D15); a username would
give that field an honest default and make the person recognisable across packs.

## What it would take

A `username` on the account (unique, case-insensitive, a short allowed alphabet, changeable), set
from the account menu and asked for nowhere else; the surfaces that show a person read it first.
Decide whether a team's member list and a pack's maker name default to it, and what an existing
public name does when the username changes (a pack keeps the name it was approved under).

## Evidence

Owner, 2026-10-08. The community packs spec records the per-pack name as D15.
