# Community packs: finished packages the community makes, NoaCG reviews, and anyone installs

## Problem and authority

There are not enough good templates. Every good graphic made with NoaCG, by a person or by an
agent, should become something other people can use, and the collection should grow with the
community rather than only with what NoaCG ships.

**Owner ruling, 2026-10-02** (the authority for this record):

- The template workflow has THREE categories: **Templates**, **Kits**, **Community packs**.
- A community pack is a FINISHED package. People install it and use it immediately. They cannot
  modify it.
- The community makes and shares them. Sharing sends a pack for REVIEW before anyone else sees
  it: automatic checks first (validate, bench, no outside network calls), then a NoaCG admin's
  approval.
- NoaCG seeds the shelf first.
- **Licence, ruled 2026-10-02:** a shared community pack is licensed CC BY 4.0. Anyone may use it
  in any show, commercial ones included, and the maker's name shows on the shelf card and in the
  pack. Sharing is the maker's grant of that licence, so the Share step says so before it sends
  anything.

**Owner direction, 2026-10-08:** community packs live in the template wizard
(`src/components/wizard/steps/CommunityPacks.tsx`). The submit door belongs in the wizard or Home,
never in Playout: the 2026-10-07 study's proposal (the production page's Setup menu) is withdrawn.
Behaviour choices this record makes on the owner's behalf are listed, with recommendations, in
[`questions.md`](questions.md); a decision below that depends on one names it.

This supersedes the 2026-09-24 decision in `docs/GRAPHICS_PACKS.md` that the studio lists no
shipped packs. NoaCG's own starting points still reach users as Templates and Kits; finished
packages, NoaCG's seeds included, reach them as Community packs. Research behind this record:
`docs/research/community-packs-2026-10-07/`.

GOALS: outcome 1 (create - own designs, templates and brands) and outcome 2 (agent-made graphics
reach users: a package an agent made can be shared, reviewed and installed by anyone).

## The workflow

```
 MAKE      wizard / editor / agent -> a production -> run the show        (private, nothing nudges)
 SUBMIT    wizard > Browse > Community packs > "Submit a pack"            (Q1)
           pick one of your productions -> one sheet: name, one-line description, "by <you>",
           check results, the CC BY 4.0 sentence -> [Send for review]
 CHECK     in the maker's browser before sending; again in the admin's browser at review
           fail -> the sheet names the graphic and the reason; nothing is sent
 REVIEW    the shelf, for a NoaCG admin: "Waiting for review" -> Install to try,     (Q3)
           Approve, or Not accepted with a reason the maker reads
 LIVE      a card on the shelf beside the NoaCG seeds: preview, name, "by <maker>", CC BY 4.0
           maker:  Withdraw (off the shelf at once)  |  Submit an update (new version, CHECK, REVIEW)
           admin:  Take down with a reason           |  installs already made never change
```

1. **Make freely.** Productions stay private. No badge, prompt, toast or counter in the editor,
   the wizard's other paths, Home or Playout ever mentions sharing.
2. **Submit from the shelf.** The Community packs shelf is where packs are got AND given: a quiet
   **Submit a pack** button sits on the shelf's lede row. It opens a picker of the maker's own
   productions, then one sheet. The button reads **Send for review**.
3. **Automatic checks** run on the sheet before anything is sent, and again when an admin opens the
   submission. A failure names the graphic and the reason and keeps the button off.
4. **Admin review** happens on the same shelf: an admin sees what is waiting, installs it to try
   it in a real production, and approves it or turns it down with a reason.
5. **Live, update, withdraw.** An approved pack is a card beside the Pub Quiz. The maker's own
   submissions show under **Your packs** on the shelf with their status, and from there the maker
   withdraws a pack or submits an update; an admin takes a live pack down from its card.

## Owner requirements

- Three categories in the template workflow, Community packs the third.
- Install and use at once; no modification.
- Nothing shared is visible to others before the automatic checks AND an admin approve it.
- NoaCG seeds the shelf.
- Shared packs are CC BY 4.0 and carry the maker's name.
- The submit door is in the template wizard or Home, not in Playout (2026-10-08).

## Derived decisions

- **D1: the shelf is the third answer to Browse's first question.** The wizard already asks
  "One graphic" or "A whole kit" with the `.wz-buildmode` control at the top of Browse; Community
  packs is its third option. Not a fifth Entry card: Entry's height is a fixed budget and its
  contract keeps kits off it, and the three categories are one question, so they share one
  control. Revert: drop the third option.
- **D2: a community pack IS a `noacg-pack` file.** No new format. Install is the existing
  `installPack`, and a submission is the existing `buildPack(show)` of the maker's production plus
  the sheet's name and description, so a pack from the shelf, from a file and from an agent's
  `noacg pack --save` are one writer, one parser and one installer. The file gains two additive
  fields, `author` and `license` (`CC-BY-4.0`), which travel with it wherever it goes.
- **D3: the seeded shelf is static and built, the shared shelf is data.** Seeds live as file
  sources in `packs/community/<slug>/`, assembled by `scripts/build-production-pack.mjs` into
  `public/packs/community/` with an `index.json`. Approved submissions are rows the same shelf
  lists after the seeds, newest approval first, for every visitor, signed in or not (Q5). A
  build without a backend shows the seeds only.
- **D4: "cannot modify" means the design, not the data.** The operator still types into the
  fields and runs the cues. What is closed is the design (markup, style, motion, code). The
  production page's edit door for a pack's graphics is AC-5, which lives in `src/control` and is a
  Playout row's, not this record's builder's.
- **D5: the network rule is a refusal, not a warning.** A community pack makes no request
  outside its own package: no remote fonts, images, scripts, `fetch`, XHR, WebSocket or beacon, and
  none of the opt-in live blocks pointing at the maker's backend. `publishGate` already refuses
  these on a static find. Refusing a request the bench OBSERVES at runtime needs a browser harness
  the bench does not have today; until it exists the admin's try-out is the runtime check.
- **D6: a takedown or a withdrawal removes from the shelf, never from a user's library.** (Q6.)
  An installed pack is the user's production; the shelf stops offering it and the maker sees why.
  A withdrawal is the maker's and takes effect at once, with no review.
- **D7: the unit is a production the maker owns.** (Q2.) The picker lists the productions in the
  signed-in account's own library: not team productions (another member's work), and not a
  production installed from the shelf, which carries a provenance stamp from Install (the stamp
  AC-5's lock also reads). A production of one graphic is a valid pack; it still needs a cue.
- **D8: the door lives on the shelf, and so does the maker's status.** (Q1.) "Submit a pack" on
  the lede row, "Your packs" above the cards only when the maker has submissions. Home gains no
  community UI and the word "Share" stays the team door's. The button is absent, not disabled,
  when the build has no backend or the visitor is signed out or anonymous.
- **D9: checks run in two browsers, and the server keeps the gate.** The maker's browser runs
  them for feedback; the admin's browser runs them again on the submission actually stored, so a
  forged submission meets the same checks before a human. The server enforces everything that is
  a permission: who may submit, that only an admin approves or takes down, that only the maker
  withdraws, and that only `live` rows are readable by others. No server-side browser job.
- **D10: states.** `in_review`, `live`, `not_accepted`, `withdrawn`, `taken_down`, and `replaced`
  (a live version an approved update superseded). The maker reads them as In review, Live, Not
  accepted (with the reason), Withdrawn, Taken down (with the reason). A refusal by the automatic
  checks never becomes a state: nothing was sent.
- **D11: an update is a new version of the same pack.** (Q4.) It goes through the checks and the
  review like a first submission; the live version stays on the shelf until the update is
  approved, then becomes `replaced`. Installed copies never change by themselves.
- **D12: NoaCG first, then everyone.** Until AC-5's lock has landed, the server accepts
  submissions only from moderator accounts and the door shows only to them. NoaCG then seeds the
  shelf through the real path. When AC-5 lands, one migration opens submit to every signed-in
  account and the door follows. Revert: the same switch.
- **D13: the admin is the existing moderator role.** `public.moderators` and `is_moderator()`
  (migration 0004) decide who is an admin, server-side; the client's `useIsModerator` only
  decides what to draw.
- **D14: no notification channel in this version.** (Q7.) The maker reads decisions in Your packs.
- **D15: the maker name is the account's display name**, shown on the sheet before sending and
  stored with the submission. (Q8.)

## Preserved behaviour

Home > Productions > Import a package, the "Waiting to install" row and Export work as before. The
pack format, `parsePack`, `validatePack`, `buildPack` and `installPack` keep their behaviour; the
format change is additive. One graphic and a whole kit keep their Browse surfaces unchanged. The
seeded shelf, its search and Install work offline and signed out exactly as today. Fight Night and
Uutishuone stay fixtures, not shelf entries. The July gallery (`CommunityGallery.tsx`) is being
closed to publishing separately and is not revived or extended here.

## Non-goals

No ratings, comments, install counts, trending, search ranking or author profiles. No payment or
paid packs. No forking a community pack into an editable template. No shelf entry that installs a
single graphic into an existing production (a pack installs as its own production). No sharing
from an anonymous or signed-out session. No submit door in Playout, the editor or Home. No email
or push notification. No categories or Featured until the shelf holds about twelve packs.
No automatic update of installed copies.

### AC-1: The wizard offers three choices, Community packs the third

On Browse, the control at the top reads One graphic, A whole kit, Community packs. Choosing
Community packs replaces the step body with the shelf; choosing either other option brings its
surface back as it was left. The footer offers no Next, no Skip to finish and no brand chooser
while the shelf shows, because the card's Install is the action and a brand cannot reach a pack
that cannot be modified. Scenario: `e2e/community-packs.spec.ts` picks Community packs and sees
the shelf.

### AC-2: The shelf lists every published pack with a preview

Each pack is a card: a preview image of its graphic on air, its name, a one-line description,
how many graphics it holds and who made it, and one Install button. The search box above the
branch filters the cards by name and description. The shelf reads well at desktop and phone
width. Scenario: the shelf at 1366x768 and 375x812, screenshots in `evidence/`.

### AC-3: Install lands a ready production with no editing step

Install fetches the pack, runs `parsePack` and `installPack`, closes the wizard and opens the new
production's page with its rundown. A refusal is shown on the card in words and nothing is
installed. Scenario: install the pub quiz, take its cue, reveal the answer with Continue, take
it out; the graphic answers each.

### AC-4: NoaCG seeds the shelf, and every seed passes the pack build's refusals

The first seed is the pub quiz from the 2026-10-02 design-quality walk, converted through the
CLI's own package reader (`noacg pack`) after `noacg validate` passed it with the bench. It is
assembled by the pack build and installs and plays (AC-3). Scenario: `npm run build` emits
`public/packs/community/pub-quiz.noacgpack.json` and `index.json`; a source with an arrow
function in its JS makes the build refuse.

### AC-5: An installed community pack's design cannot be edited

The production page offers no edit door for a graphic that came from a community pack, while its
fields and cues work as for any graphic. The graphic carries where it came from (pack id and
version), so the lock survives export and reload. Scenario: install a pack, find no Edit on its
graphics, change a cue value and take it.

### AC-6: A signed-in maker submits one of their productions from the shelf

On the Community packs shelf, Submit a pack lists the maker's own productions (D7) and opens one
sheet: name, one-line description, the maker's name, the check results and the sentence
"Submitting publishes this under CC BY 4.0. Anyone may use it in any show, with your name on it.
You confirm you have the right to share its fonts and images." Send for review stores the pack
and it appears under Your packs as In review. Until approved nobody else sees it. Scenario:
submit a production, see it In review, open the shelf as another account and as a signed-out
visitor, find it absent; a direct insert or a submit by a non-permitted account is refused by
the server (D12).

### AC-7: The automatic checks refuse before anyone reviews

Every graphic runs `publishGate` (contract, bench, outside references, D5); the pack must have a
description, at least one cue per graphic, and no placeholder ("lorem ipsum") cue values. A
failure keeps Send for review off and names the graphic and the reason. The admin's view runs the
same checks on the stored pack (D9). Scenario: a production whose graphic's CSS loads a Google
font is refused on the sheet, naming that graphic and the URL, and nothing is stored.

### AC-8: A NoaCG admin approves or turns down, on the shelf

An admin sees Waiting for review on the shelf: each submission's name, maker, description and
check results, Install to try (the ordinary Install, into the admin's own library, which is the
live play of every graphic), Approve, and Not accepted with a required reason the maker reads.
Approval puts the card on the shelf for everyone, after the seeds; nothing else does. Scenario:
approve a waiting pack and find it on another account's shelf and a signed-out visitor's; a
non-admin's approve request is refused by the server.

### AC-9: An admin takes a live pack down

Take down on a live card, with a required reason, removes the card from the shelf at once and
shows the maker Taken down with the reason; installs already made stay (D6). Scenario: take a
pack down, find it gone from another account's shelf, and find a production installed from it
before still playing.

### AC-10: The maker withdraws a pack at once

Withdraw on a Your packs row takes an In review or Live pack off the review queue or the shelf at
once, with no review, and leaves installs untouched. Scenario: withdraw a live pack, find it gone
from another account's shelf, and find an install of it still playing.

### AC-11: The maker submits an update as a new version

Submit an update on a Live row opens the same sheet for the same or another of the maker's
productions. The update goes through AC-7 and AC-8; the live version stays on the shelf until
the update is approved and is then replaced. Installed copies never change (D11). Scenario:
update a live pack, see the old card still offered, approve the update, see the new card in its
place, and find an install of the old version unchanged.

### AC-12: An agent submits the same way

`noacg pack ... --share --license cc-by-4.0` submits a package for review through the same server
path, the same checks and the same permission (D12). Without `--license cc-by-4.0` it refuses.
Scenario: a CLI submission appears under the account's Your packs as In review.

## Slices

1. **The review loop, NoaCG first** (the first slice; below). AC-6, AC-7, AC-8, AC-9, AC-10 for
   moderator accounts.
2. **The design lock** (AC-5), a Playout row in `src/control` that reads the provenance stamp
   slice 1 writes on Install. Also shows "From <pack> by <maker>, CC BY 4.0" on the production.
3. **Open to every maker, and updates.** The D12 switch, then AC-11.
4. **The agent door and runtime refusal.** AC-12, the observed-request refusal (D5), and a Report
   link on live cards into the admin's view.

## The first slice: the review loop, NoaCG first

**Goal.** A NoaCG admin can submit one of their productions from the shelf, see the checks, review
it on the shelf, approve it, and every visitor then finds it beside the Pub Quiz and installs it;
the admin can withdraw or take it down. This proves the whole loop on real infrastructure while
nothing from an outside maker can go live before the design lock exists, and it seeds the shelf
through the path makers will use.

**Builds.**

- Migration `0079`: the `community_packs` table (pack lineage and version, maker id and name,
  name, description, counts, the stored pack, the state of D10, reason, decided by and when),
  row-level security so others read only `live` rows, and functions for submit (moderators only
  for now, D12), withdraw (the maker), and decide and take down (`is_moderator()`). The pack file
  lives in storage; the row keeps its path and the first cue's preview data.
- `src/community/`: a small data module for the shelf (list live, list mine, list waiting,
  submit, withdraw, decide) and the checks of AC-7 as one pure function the sheet and the admin
  view share.
- `CommunityPacks.tsx` and a submit sheet beside it: the Submit a pack door, the production
  picker, the sheet, Your packs with Withdraw, Waiting for review with Install to try, Approve and
  Not accepted, live cards after the seeds, and Take down on live cards for admins.
- Install writes the provenance stamp (pack id, version, maker) on the production it creates,
  for seeds and live packs alike; the picker leaves stamped productions out.

**Not in it.** AC-5's lock and attribution line (Playout), the door for non-moderators, Update,
the CLI's `--share`, runtime request observation, Report, categories, Featured.

**Gate.** `npm run build`; unit tests for the checks function and the data module's refusals; the
migration's permissions exercised against a local database (non-moderator submit, non-admin
approve, reading another maker's in-review row, all refused); a browser walk of the loop at
1366x768 and 375x812 with screenshots in `evidence/`.
