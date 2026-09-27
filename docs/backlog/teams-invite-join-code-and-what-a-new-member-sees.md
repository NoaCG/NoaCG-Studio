---
v: 2
source: owner
kind: ask
raised: 2026-09-04
state: advanced
asked: "right now we cannot send an invitation to an email. That would be nice. We can just use the link. There is also the join code, but I don't know how to use that. I opened up the link with my phone, created an account, and now I got in. The surprising part was that I could see all the productions and all the graphics from my main account, so it doesn't seem to be working as intended."
note: c5606a33 settled the leak question (no evidence of a cross-account read). The join code got its door on 2026-09-27 (Home's "Join a team" card, claude/f-teams-without-guessing). Email invitations do not exist yet, and the graphic counts on a brand-new account are still unexplained.
---
# Teams: no email invitation yet

**Filed:** 2026-09-04. **Source:** owner, walking `2026-09-02-teams-share-dialog` on production
(`776aa8cf`) by inviting himself on a phone and creating a second account. **Reduced** 2026-09-27:
of the three findings, the join code's door has landed and the leak question is settled, so this
file now holds what remains.

## Why

`ShareWithTeamDialog.tsx` has no email field and no send path. Sharing is a link, or the join code
behind it, which a member now types into Home's **Join a team** card. That was a reasonable place
to stop while the project had no working mail. It changed on 2026-09-04: custom SMTP through Resend
is live, authenticated with DKIM, SPF and DMARC, with a limit of 60 new users an hour. A teacher
inviting a class of thirty by pasting a link into thirty places is the workflow an email invitation
removes.

## What it would take

A form on the team screen (addresses, one per line), a send path that mails the existing join link,
and an invite record so the owner can see who was asked and who has joined. The join itself does
not change: the link in the email is the same `#/join-team/<code>` link.

## Also still open: the counts a brand-new account showed

The owner's second account showed 44 graphics and 3 imported where a fresh account should start
with none. The one discriminator we could test came back clean (a graphic in a production the
second account cannot see did not appear), so this is not treated as a leak. It is still not
explained: either the shared production genuinely carries those graphics, or `community_templates`
(0004, public by design) is being counted as the user's own. Whoever takes it should make the
numbers add up rather than accept that they look plausible. The library now says which production
each graphic belongs to (`3e603d57`), which makes the count checkable.

## Evidence

- Owner walk, 2026-09-04, verbatim in the receipt above; the full exchange that narrowed the counts
  is in this file's history before 2026-09-27.
- `src/components/teams/ShareWithTeamDialog.tsx`, `src/components/teams/JoinTeamCard.tsx`.
- `supabase/migrations/0001_documents.sql`, `0004`, `0054_team_productions.sql`.
- The SMTP work: `docs/acceptance/owner-queue/2026-09-01-smtp-oauth-provisioning.md`.
