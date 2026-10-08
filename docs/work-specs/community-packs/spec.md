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
  pack. Sharing is the maker's grant of that licence, so the submit step says so before it sends
  anything.

**Owner answers, 2026-10-08** (to [`questions.md`](questions.md)):

- **Where packs are submitted:** the Community packs shelf in the template wizard, with Submit a
  pack and Your packs there. Never from Playout: "packs must NOT be exported from Playout, because
  that is the rundown, not the pack." The 2026-10-07 study's Setup-menu door is withdrawn.
- **What a pack is:** "a set of the maker's own graphics", picked from a Home folder, a
  production's graphics, or later the CLI. No rundown or cues are required. Installing creates a
  new production with those graphics; the shelf may add a starter cue per graphic. Team graphics
  and anything installed from the shelf are excluded.
- **The name on the card:** free text the maker picks per pack. "Users must not have to show their
  real name or email." A pre-filled value is allowed only if it is neither.
- **Agreed as recommended:** admin review on the same shelf; updates never change installed copies;
  approved packs are visible to everyone, signed in or not; the maker withdraws at once and
  installs stay; the decision reaches the maker only as a status in Your packs, with no email.
- **For research, not the first slice:** (a) from Home, select a folder of graphics (right-click or
  select) and add it as a pack: how users build their graphic packs needs research. (b) Users of
  the CLI and the Codex and Claude plugins may add a pack to the community as they import it to
  their own account, ONLY if the user asks for it: never ask, suggest or add a question that makes
  the normal workflow harder.

This supersedes the 2026-09-24 decision in `docs/GRAPHICS_PACKS.md` that the studio lists no
shipped packs. NoaCG's own starting points still reach users as Templates and Kits; finished
packages, NoaCG's seeds included, reach them as Community packs. Research behind this record:
`docs/research/community-packs-2026-10-07/` (its pack-is-a-production and Setup-menu proposals are
superseded by the answers above).

GOALS: outcome 1 (create - own designs, templates and brands) and outcome 2 (agent-made graphics
reach users: a package an agent made can be shared, reviewed and installed by anyone).

## The workflow

```
 MAKE      wizard / editor / agent -> graphics in the library -> folders, productions
           (private; nothing anywhere prompts sharing)
 SUBMIT    wizard > Browse > Community packs > "Submit a pack"
           pick a folder or a production of yours -> its graphics, ticked -> one sheet:
           name, one-line description, the name shown as maker, check results,
           the CC BY 4.0 sentence -> [Send for review]
 CHECK     in the maker's browser before sending; again in the admin's browser at review
           fail -> the sheet names the graphic and the reason; nothing is sent
 REVIEW    the shelf, for a NoaCG admin: "Waiting for review" -> Install to try,
           Approve, or Not accepted with a reason the maker reads
 LIVE      a card on the shelf after the NoaCG seeds: preview, name, "by <maker>", CC BY 4.0
           Install -> a new production with those graphics, one starter cue each
           maker:  Withdraw (off the shelf at once)  |  Submit an update (new version, CHECK, REVIEW)
           admin:  Take down with a reason           |  installs already made never change
```

## Owner requirements

- Three categories in the template workflow, Community packs the third.
- Install and use at once; no modification.
- Nothing shared is visible to others before the automatic checks AND an admin approve it.
- NoaCG seeds the shelf.
- Shared packs are CC BY 4.0 and carry the maker's chosen name, never a required real name or
  email.
- A pack is a set of the maker's own graphics; no rundown is required.
- The submit door is on the shelf in the template wizard; nothing in Playout exports a pack.
- Sharing from the CLI or a plugin happens only when the user asks for it.

## Derived decisions

- **D1: the shelf is the third answer to Browse's first question.** The `.wz-buildmode` control at
  the top of Browse reads One graphic, A whole kit, Community packs. Not a fifth Entry card:
  Entry's height is a fixed budget.
- **D2: a community pack IS a `noacg-pack` file.** No new format. A submission is the existing
  `packGraphicEntry` of each chosen graphic plus the sheet's name and description; install is the
  existing `installPack`, which gives every graphic without cues one seeded starter cue. The file
  gains two additive fields, `author` and `license` (`CC-BY-4.0`), which the server writes from
  the submission so they always match what the card shows.
- **D3: the seeded shelf is static and built, the shared shelf is data.** Seeds live in
  `packs/community/<slug>/`, assembled by `scripts/build-production-pack.mjs` into
  `public/packs/community/`. Approved submissions are rows the same shelf lists after the seeds,
  newest approval first, for every visitor, signed in or not. Their card preview is a live, settled
  render of the pack's first graphic. A build without a backend shows the seeds only.
- **D4: "cannot modify" means the design, not the data.** The operator still types into the
  fields and runs the cues. The production page's edit door for a pack's graphics is AC-5, a
  Playout row's work.
- **D5: the network rule is a refusal, not a warning.** No request outside the package: no remote
  fonts, images, scripts, `fetch`, XHR, WebSocket or beacon, and none of the opt-in live blocks.
  `publishGate` refuses these on a static find. Refusing a request observed at runtime needs a
  browser harness the bench does not have; until then the admin's try-out is the runtime check.
- **D6: a takedown or a withdrawal removes from the shelf, never from a user's library.** A
  withdrawal is the maker's and takes effect at once with no review.
- **D7: the maker's own graphics only.** The picker offers the maker's Home folders and personal
  productions, listing the graphics in each. Team productions are not offered. A graphic installed
  from the shelf carries a provenance stamp (`fromPack` on the library record: pack id, version,
  maker; a shared pack's id is its lineage, the same for every version), written by Install for
  seeds and shared packs alike, and the picker leaves it out. That stamp is also what AC-5's lock
  reads. Graphics installed before the stamp existed are not
  detectable; the admin's review is the backstop.
- **D8: the door and the maker's status live on the shelf.** Submit a pack sits on the shelf's
  lede row; Your packs shows above the cards only when the maker has submissions. Home gains no
  community UI in this slice and the word "Share" stays the team door's. The button is absent, not
  disabled, without a backend or a signed-in account.
- **D9: checks run in two browsers, and the server keeps the gate.** The maker's browser runs them
  for feedback; the admin's browser runs them again on the stored pack, so a forged submission meets
  the same checks before a human. The server enforces every permission: who may submit, that only
  an admin decides, that only the maker withdraws, that others read only `live` rows. Submit also
  refuses an account whose `community.publish` is off (suspension, the instance-wide switch or an
  admin's per-account switch), as the gallery's publish did. All access goes through
  `security definer` functions; the table itself grants nothing to clients.
- **D10: states.** `in_review`, `live`, `not_accepted`, `withdrawn`, `taken_down`, and `replaced`
  (a live version an approved update superseded). The maker reads In review, Live, Not accepted
  (with the reason), Withdrawn, Taken down (with the reason). A refusal by the automatic checks is
  not a state: nothing was sent.
- **D11: an update is a new version of the same pack.** It is checked and reviewed like a first
  submission; the live version stays until the update is approved, then becomes `replaced`.
  Only the maker of a pack that is live now may update it, and one update waits at a time. A
  withdrawal or a takedown of the live version takes its waiting update with it. Installed copies
  never change by themselves.
- **D12: NoaCG first, then everyone.** Until AC-5's lock has landed, the server accepts
  submissions only from moderator accounts and the door shows only to them, so NoaCG seeds the
  shelf through the real path while no outside pack can go live unlocked. When AC-5 lands, one
  migration opens submit to every signed-in account and the door follows.
- **D13: the admin is the existing moderator role** (`public.moderators`, `is_moderator()`,
  migration 0004), decided server-side; the client's `useIsModerator` only decides what to draw.
- **D14: no notification channel.** The maker reads decisions in Your packs.
- **D15: the maker's name is free text, per pack.** The sheet asks "Shown as" and requires it. It
  pre-fills only with the name the same account chose on its previous pack, never from the
  account's profile or email. The server stores exactly what was typed.
- **D16: no suggestion to share anywhere.** Not in the editor, Home, Playout, the CLI or the
  agent skill. The 2026-10-07 study's "this package is complete" CLI hint is dropped.

## Preserved behaviour

Home > Productions > Import a package, the "Waiting to install" row and Export work as before. The
pack format, `parsePack`, `validatePack`, `buildPack` and `installPack` keep their behaviour; the
format change is additive. One graphic and a whole kit keep their Browse surfaces unchanged. The
seeded shelf, its search and Install work offline and signed out exactly as today. Fight Night and
Uutishuone stay fixtures, not shelf entries. The July gallery (`CommunityGallery.tsx`) is closed to
publishing separately and is not revived or extended here.

## Non-goals

No ratings, comments, install counts, trending, search ranking or author profiles. No payment or
paid packs. No forking a community pack into an editable template. No shelf entry that installs a
single graphic into an existing production. No sharing from an anonymous or signed-out session.
No submit door in Playout or the editor. No email or push notification. No categories or Featured
until the shelf holds about twelve packs. No automatic update of installed copies. No prompt,
hint or question that suggests sharing.

### AC-1: The wizard offers three choices, Community packs the third

On Browse, the control at the top reads One graphic, A whole kit, Community packs. Choosing
Community packs replaces the step body with the shelf; choosing either other option brings its
surface back as it was left. The footer offers no Next, no Skip to finish and no brand chooser
while the shelf shows, because the card's Install is the action and a brand cannot reach a pack
that cannot be modified. Scenario: `e2e/community-packs.spec.ts` picks Community packs and sees
the shelf.

### AC-2: The shelf lists every published pack with a preview

Each pack is a card: a preview of its graphic on air, its name, a one-line description, how many
graphics it holds and who made it, and one Install button. The search box above the branch filters
the cards by name, description and maker. The shelf reads well at desktop and phone width.
Scenario: the shelf at 1366x768 and 375x812, screenshots in `evidence/`.

### AC-3: Install lands a ready production with no editing step

Install fetches the pack, runs `parsePack` and `installPack`, closes the wizard and opens the new
production's page with its rundown: the pack's cues when it carries them, otherwise one starter
cue per graphic. A refusal is shown on the card in words and nothing is installed. Scenario:
install the pub quiz, take its cue, reveal the answer with Continue, take it out; the graphic
answers each.

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

### AC-6: A signed-in maker submits a set of their own graphics from the shelf

On the Community packs shelf, Submit a pack lists the maker's Home folders and personal
productions (D7). Choosing one lists its graphics, all ticked; the maker may untick some. One sheet
then asks for the pack's name, a one-line description and the name shown as maker (D15), shows
the check results and the sentence "Submitting publishes this under CC BY 4.0. Anyone may use it
in any show, with the name you chose. You confirm you have the right to share its fonts and
images." Send for review stores the pack and it appears under Your packs as In review. Until
approved nobody else sees it. Scenario: submit a folder's graphics, see it In review, open the
shelf as another account and as a signed-out visitor, find it absent; a submit from an account
D12 does not yet admit, and any direct table write, is refused by the server.

### AC-7: The automatic checks refuse before anyone reviews

Every chosen graphic runs `publishGate` (contract, bench, outside references, D5). The pack needs
a name, a description, a maker name, at least one graphic, distinct graphic names, no placeholder
("lorem ipsum") text in a graphic, and a size within the server's limit. A failure keeps Send for
review off and names the graphic and the reason. The admin's view runs the same checks on the
stored pack (D9). Scenario: a graphic whose CSS loads a Google font is refused on the sheet,
naming that graphic and the URL, and nothing is stored.

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

Submit an update on a Live row opens the same picker and sheet. The update goes through AC-7 and
AC-8; the live version stays on the shelf until the update is approved and is then replaced.
Installed copies never change (D11). Scenario: update a live pack, see the old card still
offered, approve the update, see the new card in its place, and find an install of the old
version unchanged.

### AC-12: An agent submits only when the user asks

The CLI and the plugins can submit a package for review through the same server path, checks and
permission (D12), and do so only on an explicit request from the user in that conversation; the
normal save and import flow gains no question, hint or default that suggests sharing (D16).
Scenario: a save without the request sends nothing to the community; a requested submission
appears under the account's Your packs as In review.

## Slices

1. **The review loop, NoaCG first** (below): AC-6, AC-7, AC-8, AC-9, AC-10 for moderator
   accounts, and the `fromPack` stamp on Install.
2. **The design lock** (AC-5), a Playout row in `src/control` that reads the `fromPack` stamp, and
   the attribution line "From <pack> by <maker>, CC BY 4.0" on the production.
3. **Updates, then open to every maker.** AC-11 and the `community.publish` check on submit
   (migration 0080), for moderator accounts while D12 holds. The D12 switch waits for slice 2:
   the owner kept that order on 2026-10-08.
4. **Research, then the agent door.** (a) How users build graphic packs from Home, including
   selecting a folder or graphics there and adding them as a pack, never from Playout. (b) What
   share-on-import looks like for the CLI and the plugins under AC-12's only-when-asked rule; the
   study's `noacg pack --share --license cc-by-4.0` is the starting sketch. Then AC-12, the
   observed-request refusal (D5), and a Report link on live cards. The research and its
   recommended designs: [`slice-4-research.md`](slice-4-research.md).

Backlog: [issue #798](https://github.com/NoaCG/NoaCG-Studio/issues/798) (accounts cannot pick a username today).

## The first slice: the review loop, NoaCG first

**Goal.** A NoaCG admin can submit a set of their graphics from the shelf, see the checks, review
the submission on the shelf, approve it, and every visitor then finds it beside the Pub Quiz and
installs it as a production; the admin can withdraw or take it down. This proves the whole loop
on real infrastructure while nothing from an outside maker can go live before the design lock,
and it seeds the shelf through the path makers will use.

**Builds.**

- Migration `0079`: the `community_packs` table and its `security definer` functions (shelf list,
  pack file, mine, waiting, submit, withdraw, decide), with submit admitting moderators only (D12).
- `src/community/`: the shelf's data module and the AC-7 checks as one pure function the sheet and
  the admin view share, plus the pack builder over chosen graphics.
- `CommunityPacks.tsx` and a submit sheet beside it: the door, the picker, the sheet, Your packs
  with Withdraw, Waiting for review with Install to try, Approve and Not accepted, live cards
  after the seeds, and Take down on live cards for admins.
- Install writes the `fromPack` stamp on every library graphic it creates.

**Not in it.** AC-5's lock and attribution line (Playout), the door for non-moderators, Update,
Home's folder door, the CLI and plugin door, runtime request observation, Report, categories,
Featured.

**Gate.** `npm run build`; unit tests for the checks and the pack builder; the migration's
functions called against a local database (non-moderator submit, non-admin decide, reading
another maker's in-review pack, all refused; the happy path end to end); a browser walk of the
loop at 1366x768 and 375x812 with evidence in `evidence/`.
