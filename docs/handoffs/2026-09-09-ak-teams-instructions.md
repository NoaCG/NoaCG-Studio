# Row AK - how to use Teams, written down

**Branch:** `claude/ak-teams-instructions`, queued. **Gate:** `npm run build` green, plus
`e2e/docs.spec.ts` green (13 cases). **check: run in full** - `review: delegated`,
`simplify: inline`, `verify: inline`, `taste: not applicable`. The chain is written up at the
bottom, and the review earned its place: it found five false claims in copy I had already read
three times.

## The finding that shaped everything else

**The row's goal cannot be reached, and the reason is the product, not the page.** The goal was
"somebody who has never used Teams can follow written instructions from `/docs` and get to a
working shared production". There is no way to get a production into a team. Stage 4 of
`docs/TEAMS_PLAN.md` §7 has not landed, so `ShareWithTeamDialog`'s **Move to team** button is
present and deliberately disabled. Everything else about a team works, against real separate
accounts: create, hand out the link, join, list members, rotate, remove, leave, delete.

So the section could not be written as "here is how you share a production". It is written as
**"Working with other people"**, and it answers the question the reader actually arrives with in
the order the product can answer it:

1. Running one show from three devices needs no accounts at all. The control page, presenter view,
   output URL and audience join page are already capability links behind the production header's
   **Links** button. This is the road that works today, and nothing on `/docs` had ever said so as
   an answer to "how do we do this together".
2. A team is the account-level half: who may edit the rundown, who may republish, whose account the
   show dies with. You can make one now and it is the group, standing ready.
3. An amber **What works today** box says which half does not, in the plainest words I could find.

If that box reads as too much honesty for a public page, the whole section can be pulled in one
commit and the owner-queue item asks him that question directly. My own view: every signed-in user
already sees that disabled button, so the page is only saying out loud what the screen admits.

## The guess-list from the walk, which is the row's other deliverable

His second sentence was read as binding: "it should be so intuitive that you can just use it
without reading anything." So every place the screen made me guess is a defect in the screen. Nine
of them, filed as **`docs/backlog/the-team-dialog-makes-you-guess-nine-times.md`** with the
evidence for each. The three that are not missing sentences but wrong turns:

1. **The join code is the largest thing on the team screen and it is the half that does not work.**
   Nothing in the app takes a typed code; the only route in is the link underneath it, in small
   grey type. Same wall the owner hit on 2026-09-04.
2. **A member who joined a team has no way back to it.** Both doors hang off a production you own
   (`ProductionPage` header, `ProductionsSection` row menu - the only two `useTeamsAvailable()`
   call sites in the tree). A student who joins a class team and owns no production cannot see
   their team, cannot pass the link on, cannot leave.
3. **The code cannot be read out loud.** Eight base64url characters, mixed case, `0`/`O` and
   `l`/`1` all in the alphabet. Tonight's was `V3f3j023`. The dialog's own copy says to read it out;
   the §6 mockup showed `K7M-Q2R`.

The other six are ordinary missing sentences: the pick screen's primary button is the wrong one for
a first-timer, the disabled Move button explains itself below the footer rather than on itself,
"Done" after joining lands on an unchanged Home, two name boxes that are not the same box, no way
to rename yourself except re-joining, and nothing anywhere about whose storage a team costs.

Items 1 and 2 are the same work and should be one row: teams need one door that does not require
owning a production. Item 3 is a change to 0053's minting recipe, so it is a scope edge and returns
to the owner. Do not take the six copy items alone - they are worth little while a member cannot
reach the screen they are on.

## How the walk was done, and why it was cheap

`e2e/configured/teams.spec.ts` already drives the whole team surface against the real backend with
the throwaway test account. Copying the primary checkout's `.env` into this worktree and running
`npm run test:e2e:live:queued -- teams.spec.ts` walked it in 20.6 seconds, three cases green, and
left five screenshots in `test-results/signed-in/`. Those screenshots are what items 1, 3, 4 and 6
were read off. **Prefer this to driving the browser by hand on any surface that already has a live
spec**: it is faster, it handles the credentials without me touching them, and it cleans up after
itself.

## What landed

- **`docs.html`** - a new `#teams` section, "Working with other people", under Run the show, with
  sub-heads `#teams-links`, `#teams-make`, `#teams-join`, `#teams-roles`, `#teams-move` and
  `#teams-storage`. One new left-nav entry, fourteen now. The `#teams-move` sub-head describes what
  a move will do and says in its first line that it is design rather than something to try, which
  is the pattern `src/docs/AGENTS.md` sanctions and the CasparCG note set.
- **`e2e/docs.spec.ts`** - one case, "the teams guide sends people down the route that exists, and
  says which one does not". It pins the door label, that a production is the only door, that the
  link is the route and the code is not, that there is no email invitation, the disabled-move
  admission, the two rules a reader cannot recover from, and the two in-page handoffs. Thirteen
  cases in the file, all green.
- **`docs/acceptance/owner-queue/2026-09-09-how-to-work-with-a-team.md`** - the route in under a
  minute, and the one question that is genuinely his.
- **`docs/backlog/the-team-dialog-makes-you-guess-nine-times.md`** - the nine.
- **`docs/backlog/teams-needs-written-instructions.md` deleted.** Landed is not a state
  (`docs/backlog/README.md`): the ask is served and the file goes in the commit that serves it. Its
  by-product deliverable, the guess-list, is the new backlog file, which is the round trip that
  file itself asked for.

## What is left, and for whom

- **Stage 4 of TEAMS_PLAN**, which is what makes the section's honesty box deletable. When it
  lands, the same commit deletes the box, the `#teams-move` future tense, and the
  `'Moving a production into a team does not'` assertion in `e2e/docs.spec.ts`. The test comment
  says so.
- **The nine screen defects**, in the backlog file, worst first.
- **Nothing needs the owner to unblock work.** The one question in the owner-queue item is taste:
  whether a half-built feature belongs on the public page at all.

## Pointers

- `docs/TEAMS_PLAN.md` §6 (the UX and the one-door rule), §7 (what stage 3 landed and what stage 4
  owes), §8 (the five rulings that bind, including team bytes on the owner's quota).
- `src/backend/teams.ts` is the readable statement of who may do what; the header comment explains
  why some verbs are table writes and some are RPCs.
- `src/docs/AGENTS.md` is the voice contract and the "everything here has been run" rule.
- `docs/backlog/teams-invite-join-code-and-what-a-new-member-sees.md` is the owner's own walk, and
  its finding 3 (a new account showing 44 graphics) is still unexplained. This row did not touch it.

## The check chain

**Scope.** Branch `claude/ak-teams-instructions`, merge base `d6df5218` against `origin/main`
after a fetch, tip `20fac12a` at review time. Five files: `docs.html`, `e2e/docs.spec.ts`, the new
owner-queue item, the new backlog file, and the deleted `teams-needs-written-instructions.md`, plus
this handoff untracked.

**`review: delegated`, and it SCOPE-CHECKED CLEAN.** The row's prompt warned that a delegated
review here routinely scopes itself against a stale local `main`; this one did not. It named this
branch, this commit and exactly the five files above, so it was believed and used rather than
discarded. Eight findings, all eight verified against the code and all eight real. Five were false
claims in the guide, which is the failure mode `src/docs/AGENTS.md` warns about by name:

1. **"Nowhere in the app is there a field for typing a bare code" was flatly untrue.**
   `JoinTeamDialog` renders an editable code field, and the route accepts any non-empty code, so
   anybody who has ever held a join link to any team can paste in a code they overheard. My
   sentence told a teacher that reading a code out is harmless. The page now says the opposite in
   both directions, and the second direction is pinned.
2. **The honesty box claimed remove and leave "work now, against real separate accounts".** The
   live walk runs on ONE account: it never removed anybody and never left. The box is now headed
   "What has been verified" and separates what was run from what is expected.
3. **The roles table promised a member three things they cannot reach.** Every Yes goes through a
   dialog that needs a production you own, so a student who joined a class team and made nothing
   has none of them. A lead paragraph now carries that condition, and it is pinned.
4. **"A signed-out visitor sees no mention of a team anywhere" is contradicted by the join link**,
   which shows a team-branded sign-in prompt on purpose.
5. **"Join again through the same link" stops working after a rotation**, which the same paragraph
   had just explained.

The other three were a nav count wrong by one in two files, a dangling pointer in an OPEN
owner-queue item to the backlog file this branch deletes, and this handoff's own header pointing at
a section that did not exist. All fixed.

**`simplify: inline`.** The skill returned fan-out instructions, which per `.agent-workflows/check.md`
phase 3 means it did not run, so the four angles were covered here. Reuse: the new e2e case follows
the `#first-graphic` case's handoff-loop shape rather than inventing one, and the section hands off
to `#dashboard` and `#audience` rather than re-explaining them. Simplification: one assertion
dropped, `'The link is the route'`, because it is generic enough to survive a rewrite that lost the
point while the sentence beside it is not. Efficiency: not applicable to a documentation diff.
Altitude: the whole section is prose compensating for screen defects, which is the row's own
finding rather than a fixable-here problem; the deepest available fix is item 2 of the new backlog
file and it is named there.

**`verify: inline`.** `npm run build` green, `e2e/docs.spec.ts` green at 13 cases, and the section
was rendered in a browser against this worktree's own dev server and read on screen, which is where
the roles table's column proportions were fixed. `taste: not applicable` - nothing here can move
what a graphic looks like.
