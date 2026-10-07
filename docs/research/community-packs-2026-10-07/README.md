# Community packs: what to share, how creators get there, and what comes first (study, 2026-10-07)

Research and design only; nothing here is built by this study. The owner's aim: a creative
community where people share, discover and reuse broadcast graphics, with the Pub Quiz pack as the
model of a complete, useful experience. Sharing is a deliberate opt-in, and people should feel free
to experiment without being asked to publish. The flow sketch is [`flow.md`](flow.md).

Built and proposed are marked throughout. "Built" means it is in `main` today.

## What already exists (two community doors, not one)

| | Era 5.5 gallery (2026-07) | Community packs shelf (2026-10-02) |
|---|---|---|
| Unit | one graphic or one brand look | a `noacg-pack` v1 file: graphics, layers, a prepared rundown |
| Where | the Community button in the editor bar; "Publish to community..." in a Home graphic's menu | Browse's third answer in the template wizard |
| Review | automatic gate only; rows go live at once (`status default 'approved'`) | ruled: automatic checks AND an admin, before anyone sees it |
| What the user gets | an editable copy | a locked production, ready to run (design lock AC-5 not built yet) |
| Licence | none stated | CC BY 4.0, ruled 2026-10-02 |
| Content | unknown (see below) | one NoaCG seed, the Pub Quiz |

Sources: `src/community/communityData.ts`, `supabase/migrations/0004_community_templates.sql`
(line 63), `src/components/CommunityGallery.tsx`, `src/components/home/HomePage.tsx` (PublishSheet),
`src/components/AppShell.tsx`, `src/components/wizard/steps/CommunityPacks.tsx`,
`scripts/build-production-pack.mjs`, `packs/community/pub-quiz/`,
`docs/work-specs/community-packs/spec.md`, `docs/backlog/community-packs-share-review-and-lock.md`.

**Finding.** The Era 5.5 gallery predates the 2026-10-02 ruling and falls short of it on three points:
anything a signed-in user publishes is visible to other users with no human review, the importer
gets an editable copy, and no licence is granted. Two doors also means two vocabularies, two
formats and two review queues. **Not measured:** how many rows the gallery holds in production.
This session was refused a production read; the owner or a session allowed to read production
can run `select kind, status, count(*), count(distinct author_id) from community_templates group
by 1, 2`. The recommendation below holds either way; the count only decides whether existing rows
are worth migrating.

## Recommended MVP

1. **The pack is the one unit people submit.** A single graphic is submitted as a pack of one: the
   graphic, its layer and at least one prepared cue with real sample values. `noacg-pack` v1 holds
   that already, so there is one format, one installer (`installPack`), one set of checks and one
   review queue. The Pub Quiz shows why the pack is the better primary unit: what makes it useful
   at once is the prepared rundown and the cue notes, not the graphic alone. A bare graphic asks
   the installer to invent the show; a pack of one still ships a ready first cue.
2. **One community door.** Close the Era 5.5 gallery to new publishing (or switch its status
   default to `pending`, the switch its own migration documents) before outside sharing opens.
   Keep its moderator role, report path and status words (`STATUS_LABEL`: in review, live, not
   accepted, taken down) for packs; they are built and tested.
3. **Submit, check, review, publish, withdraw, update.** AC-6 to AC-9 of the spec, shipped as one
   slice because the ruling forbids any of it going live without review. Plus two things the spec
   leaves out: the author's own Withdraw (the gallery's `unpublish` is the built precedent) and
   Update as a new version.
4. **Private by default, no nudges while making.** Nothing in the editor, the wizard or a fresh
   production mentions sharing.

## The creator's journey

1. **Make and run freely.** Everything stays private. No badge, prompt, toast or counter.
2. **The door.** On the production page, the Setup menu gets **Submit to Community packs...** next to
   Export (`src/components/home/ProductionSetupMenu.tsx`). Both send the production out as a
   package, so they belong together, and the Setup menu is for doors opened before a show, not
   during one. Not called "Share": that item already means sharing with a team. Shown only to a
   signed-in user, and only for a production they made: a production installed from the shelf is
   locked and cannot be resubmitted as someone else's work.
3. **How creators find it without being nagged.** Three quiet places, none of them in the editor:
   the shelf's last line ("Made a show others could use? Submit it from its production's Setup
   menu"), the help page, and the CLI hint below. No post-show prompt in the MVP.
4. **The submit sheet, one screen.** Name, a one-line description, a category, the preview frame
   (taken from the first cue; the author can pick another cue), the check results, and the licence
   sentence above the button: "Submitting publishes this under CC BY 4.0. Anyone may use it in any
   show, with your name on it. You confirm you have the right to share its fonts and images."
   The button reads **Send for review**.
5. **Status** on the production page and Home: checking, in review, live, not accepted (with the
   reason), withdrawn, taken down (with the reason).
6. **Update.** "Submit an update" sends a new version through the same checks and review. The shelf
   keeps the live version until the update is approved. Installed copies never change by
   themselves: an update that arrives mid-show could change what is on air. A user who wants the
   new version installs it as a new production.
7. **Withdraw.** "Withdraw from Community packs" takes it off the shelf at once, with no review.
   Installs already made stay (spec D6). Withdraw is the author's; take-down is the admin's.

**The Agent Toolkit and CLI.** Built: `noacg pack --save` and `--out` (`cli/src/commands/pack.ts`),
and the `noacg-graphic` skill's package section. Proposed:

- `noacg pack ... --share` submits for review with the same checks. It refuses without
  `--license cc-by-4.0`, so an agent cannot submit without stating the licence, and the skill says
  never to submit unless the user asked for it in this conversation.
- When `--save` sends a pack that passes the completeness checks below, the CLI prints one line:
  "This package is complete. To offer it to others, submit it from its production's Setup menu."
  The skill relays that line once, as information, never as a question, and never for a single
  graphic saved for the user's own work. This is the "suggest when complete" signal without a nag.

## Automatic checks before an admin sees anything

| Check | Built | Proposed |
|---|---|---|
| Contract and runtime, per graphic | `publishGate` (validateTemplate + templateBench) and `productionGate`; the CLI runs them before it sends | run them again server-side on submit |
| Self-contained, no outside requests | `publishGate` makes external references and missing assets errors (static) | the bench refuses any request it observes (spec D5, AC-7) |
| Pack build rules: ES5, fonts and url(), the fN contract | `scripts/build-production-pack.mjs`, seeds only | the same refusals for submitted packs |
| Preview | seeds must carry a preview image or the build refuses | capture the frame from the bench at the first cue's hold |
| Function | the e2e scenario for the seed (install, Take, Continue, Out) | the same dry run of every cue, as a check |
| Completeness | none for packs | blocking: description, a category, at least one cue per graphic, labelled fields, no placeholder or lorem text |
| Content quality | legibility and design-rule warnings in the Era 5.5 publish sheet | shown to the author and the admin; taste stays with the admin |
| Licensing | CC BY 4.0 ruled | licence sentence on submit; bundled fonts must carry a licence that allows redistribution |
| Moderation | `moderators`, `is_moderator()`, reports, `ModerationQueue` (Era 5.5) | reuse them for packs: admin approve, reject with reason, take down; a Report link on each shelf card |

## Discovery

- **Built:** the wizard shelf, its search over name, description and author, the maker's name and
  a preview on each card, and a private install event (`trackEvent('activation', 'community-pack')`).
- **MVP:** a fixed category list in the pack manifest (quiz, sport, news, talk, event, stream,
  school), shown as filters only once the shelf has about 12 packs. **Featured** is the admin's pin:
  the admin already reviews every pack, so curation is the honest ranking at this size.
  Attribution travels with the pack: on the card, in the pack, and in the installed production
  ("From Pub Quiz by NoaCG, CC BY 4.0").
- **Not yet, because they need activity we do not have:** ratings, comments, public install counts,
  trending, author profiles. With one pack on the shelf, empty stars and zero counts make the shelf
  look abandoned. Count installs privately and revisit when there are dozens of packs and hundreds
  of installs.

## Creative competitions (a later milestone)

Monthly, not weekly. A good pack is hours of work, and a weekly theme with a handful of makers gets
zero to two entries, which reads as failure. Start when there is evidence of makers: about ten
outside authors with a live pack in the last 60 days. Before that, the same idea works as a closed
brief inside a group that already exists, such as a student production course (student productions
are the main proving ground in `docs/GOALS.md`), with the winners reviewed onto the shelf. Format
when it comes: one theme a month, an admin or owner pick, the winner featured for the month.
Promoting a pack outside the shelf needs the owner's ruling on featuring, which the backlog item
records as open.

## Future priorities, in order

1. **Close the review gap in the Era 5.5 gallery.** Switch its status default to `pending` or hide
   its publish door. Small, and today it contradicts the ruling.
2. **AC-5, the design lock and the provenance stamp.** Client-only, and already the backlog's
   suggested first row. It must exist before any outside pack can be installed.
3. **Seed the shelf to about eight NoaCG packs** (Fight Night and Uutishuone as they are, plus
   catalog work rebuilt as packs with real rundowns). The shelf has to look alive before anyone is
   asked to contribute, and the static build already handles seeds without a server.
4. **Submit for review as one slice:** AC-6 to AC-9, Withdraw, Update, the pack-of-one rule, and
   folding the Era 5.5 publish door into it.
5. **The CLI's `--share` and its completeness hint**, then categories and Featured once the shelf
   passes about 12 packs. Competitions after the maker threshold above.

## Open for the owner (taste, not engineering)

- CC BY 4.0 allows anyone to adapt a pack; the design lock is a product choice, not a rights one.
  Whether a later "remix into an editable template" is welcome is a direction call.
- Whether to keep or migrate the Era 5.5 gallery's live rows depends on the count above.
