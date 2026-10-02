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

This supersedes the 2026-09-24 decision in `docs/GRAPHICS_PACKS.md` that the studio lists no
shipped packs. NoaCG's own starting points still reach users as Templates and Kits; finished
packages, NoaCG's seeds included, reach them as Community packs.

GOALS: outcome 1 (create - own designs, templates and brands) and outcome 2 (agent-made graphics
reach users: a package an agent made can be shared, reviewed and installed by anyone).

## Owner requirements

- Three categories in the template workflow, Community packs the third.
- Install and use at once; no modification.
- Nothing shared is visible to others before the automatic checks AND an admin approve it.
- NoaCG seeds the shelf.

## Derived decisions

- **D1: the shelf is the third answer to Browse's first question.** The wizard already asks
  "One graphic" or "A whole kit" with the `.wz-buildmode` control at the top of Browse; Community
  packs is its third option. Not a fifth Entry card: Entry's height is a fixed budget and its
  contract keeps kits off it, and the three categories are one question, so they share one
  control. Revert: drop the third option.
- **D2: a community pack IS a `noacg-pack` v1 file.** No new format. Install is the existing
  `installPack` (export gate per graphic, one production, layers, rundown), so a pack from the
  shelf, from a file and from an agent's `noacg pack --save` are one parser and one installer.
  Sharing will send the same file.
- **D3: the seeded shelf is static and built, the shared shelf will be data.** Seeds live as file
  sources in `packs/community/<slug>/` and are assembled by `scripts/build-production-pack.mjs`
  (the pack build's refusals: definition, SPX entry points, ES5, inline-hidden holders, fonts/
  url() rule, the fN contract) into `public/packs/community/`, with an `index.json` the wizard
  reads and a preview image per pack. `npm run build` re-assembles them, so a seed cannot go
  stale. When sharing lands, approved packs are rows the same shelf lists beside the seeds.
- **D4: "cannot modify" means the design, not the data.** The operator still types into the
  fields and runs the cues; that is using a graphic. What is closed is the design (markup, style,
  motion, code). This slice opens no editing route: Install lands on the production page, never
  the editor. The production page's own edit door for a pack's graphics is AC-5, which lives in
  `src/control` and is the next slice's.
- **D5: the network rule is a refusal, not a warning.** A community pack makes no request
  outside its own package: no remote fonts, images, scripts, `fetch`, XHR, WebSocket or beacon.
  The automatic checks refuse on a static find AND on any request the bench observes.
- **D6: a takedown removes from the shelf, never from a user's library.** An installed pack is
  the user's production on their machine; the shelf stops offering it and the author sees why.

## Preserved behaviour

Home → Productions → Import a package and the "Waiting to install" row work as before. The pack
format, `parsePack`, `validatePack` and `installPack` keep their behaviour. One graphic and a
whole kit keep their Browse surfaces unchanged. Fight Night and Uutishuone stay fixtures, not
shelf entries.

## Non-goals

No ratings, comments, search ranking or author profiles. No payment or paid packs. No forking a
community pack into an editable template. No shelf entry that installs a single graphic into an
existing production (a pack installs as its own production). No sharing from an anonymous
session.

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

### AC-6: A signed-in user shares a pack for review

From a production the user made, Share sends it as a `noacg-pack` file for review, with a name,
a description and a preview frame. Until approved nobody else sees it, and the author sees its
state (checking, waiting for review, published, refused with the reason, taken down). An agent
can share the same way (`noacg pack --share`). Scenario: share a production, see it waiting,
sign in as another user, find it absent from the shelf.

### AC-7: The automatic checks refuse before an admin sees anything

Every graphic of a shared pack runs the export gate and the runtime bench, and the pack is
scanned for outside requests (D5). A failure refuses the share with the graphic and the reason,
and it never reaches the review queue. Scenario: a pack whose CSS loads a Google font is refused
naming that graphic and URL.

### AC-8: A NoaCG admin approves or rejects

An admin sees each pack that passed the checks with its preview, its check results and a live
play of every graphic, and approves it or rejects it with a reason the author reads. Approval
publishes it on the shelf for everyone; nothing else does. Only an admin account can approve.
Scenario: approve a waiting pack and find it on another user's shelf; a non-admin's approve
request is refused by the server.

### AC-9: An admin takes a published pack down

Takedown removes a pack from the shelf at once, records the reason the author sees, and leaves
installs already made untouched (D6). Scenario: take a pack down, find it gone from the shelf,
and find a production installed from it before still playing.
