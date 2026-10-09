# Community packs, slice 4: making a pack from Home, and sharing from the CLI and plugins

Research for Slices item 4 of [`spec.md`](spec.md). It answers the owner's two asks of 2026-10-08
(a pack made from Home; sharing from the CLI and the plugins only when the user asks) and places
the observed-request refusal (D5) and a Report link. The build is tracked on issue #797, which
says what has landed. Since migration 0082 submit is open to every signed-in maker, so where this
note says "moderators only until slice 3", the door now admits every signed-in account.

Read for this note, on `main` at 99b55d8a1: `src/community/packs.ts`, `packSources.ts`,
`packChecks.ts`; `src/components/wizard/steps/CommunityPacks.tsx` and `SubmitPackSheet.tsx`;
`src/components/home/sections/GraphicsSection.tsx`, `src/components/home/FolderItem.tsx` and
`RowMenu.tsx`; `supabase/migrations/0079_community_packs.sql`, `0020_self_scoped_predicates.sql`,
`0022_entitlement_absolutes.sql`; `cli/src/commands/pack.ts`, `save.ts`,
`cli/src/mcp.ts`, `cli/src/bridgeClient.ts`; `api/_lib/me/packages.ts`,
`src/entitlements/permissions.ts`; `cli/plugin/skills/noacg-graphic/SKILL.md` and
`references/package.md`; `src/validation/runtimeBench.ts`, `src/control/ografHost.ts`.
Not checked: how many accounts use Home folders today (no database token in this session), so
the folder-first recommendation rests on the product's model, not a usage count.

## What already exists

- **The source model is built.** `packSources()` lists the maker's Home folders and personal
  productions with only their own graphics: a graphic stamped `fromPack` and a teammate's
  graphic are left out (D7). `SubmitPackSheet` takes no source from outside; it builds its own
  list and opens on the first one.
- **The sheet is portable.** It renders through `WizardConfirm`, a portal with its own backdrop,
  and its checks (`checkPackMeta`, `checkPackGraphics`, `checkPackSize`) and builder
  (`buildCommunityPack`) are pure modules in `src/community/`. Nothing in it needs the wizard.
- **Home's grouping is the folder.** A folder is a name on its graphics (`setGraphicsFolder`),
  reached from the folder band, the in-folder breadcrumb head, the bulk bar's Folder menu and
  drag-and-drop. A folder's ⋯ (`folderMenu` in `GraphicsSection`) holds Rename and Remove
  folder, and the same list is used on the folder card and in the breadcrumb head. The bulk bar
  holds + Production, Folder, Delete and Clear. Home has no right-click menu; the production
  rundown's folder row opens its own ⋯ on right-click (`FolderRow.tsx`), which is the precedent.
- **The agent side sends packs already.** `noacg pack <dirs> --name N --save` validates every
  graphic in the bridge (static gate and runtime bench) and posts a `noacg-pack` to
  `POST /api/me/packages`, where it waits on Home for Install. The agent key carries one scope,
  `graphics:create`. The skill has an "opt-in tools, OFF unless the user asks" section, the
  pattern a share instruction fits.
- **The server keeps one submit gate.** `community_pack_submit` reads `auth.uid()`, admits
  moderators only (D12), refuses suspended accounts, cues, more than 50 graphics, more than
  10 waiting packs, and writes `author` and `license` itself. An agent key is not a session, so
  that function cannot be called with one as it stands. It does not consult the
  `community.publish` entitlement, the per-account switch an admin turns off for abuse
  (`src/entitlements/contract.ts`); the closed gallery's publish path did.
- **The bench can observe requests.** `benchTemplateRuntime` loads each graphic in a hidden
  `srcdoc` iframe and plays it through update, play, Continue and stop. `ografHost.ts` already
  puts a Content-Security-Policy meta first in a hosted graphic's head
  (`ografNetworkPolicy`). The two together are the harness D5 said was missing.

## (a) Making a pack from Home

### Recommendation: the folder is the pack you build; submit it from its ⋯ or from a selection

How a maker builds a pack on Home is how they already group graphics: they file them in a folder
(bulk Folder, drag onto a folder, or a new folder from a selection) and keep refining it. No new
"pack" object, no draft state and no new section. When the set is ready, the maker submits it.

Two entry points, neither with a visible word about sharing on Home (D16), and neither using
the word "Share", which stays the team door's (D8):

1. **A folder's ⋯ gains "Submit to Community packs…"** after Rename and Remove folder. Because
   `folderMenu` is one list, the item appears on the folder card and in the open folder's
   breadcrumb head alike. A right-click on a folder card opens that same ⋯ menu (the rundown's
   precedent), which is the owner's "right-click" with no second menu to maintain.
2. **The bulk bar gains an icon-only ⋯ holding "Submit to Community packs…",** for "some
   graphics": any selection, including one made across folders during a search. It is drawn only
   for accounts the door admits, so for everyone else the bulk bar is exactly as today. This is
   the one new control on screen, and its only item is the share verb; that is a real tension
   with D16, so it is owner question 3. Without it, a selection becomes a pack through the bulk
   bar's existing Folder › New folder, then the folder's ⋯.

Both open the existing sheet with the source already chosen. The production page and Playout
gain nothing, and the shelf's own Submit a pack stays as it is.

**Who sees it.** The same gate as the shelf's door: a configured backend, a signed-in account
(`backendConfigured && auth.signedIn`, never `signedIn` alone, which is true offline) and, until
the D12 switch, `useIsModerator()`. When slice 3 opens submit to every maker, the Home door
follows with the same one-line change. Absent, never disabled. A folder whose graphics are all
stamped `fromPack` gets no item: there is nothing of the maker's to submit.

**States of the sheet when opened from Home.**

| State | What the maker sees |
| --- | --- |
| Opened from a folder | No "Graphics from" select (one source); the folder's own graphics, all ticked; Name pre-filled with the folder name. |
| Opened from a selection | The selected own graphics, all ticked; Name pre-filled with the folder name when every one is in the same folder, else empty. |
| Some graphics left out | One muted line under the list: "2 installed from Community packs are left out." Never silent, since the maker chose them. |
| Shown as | Pre-filled only with the name this account used on its last pack (D15); the sheet reads `listMyPacks()` itself instead of taking it as a prop. |
| Checking | As on the shelf: findings name the graphic and the reason; Send for review stays off while anything refuses. |
| Sent | The sheet closes; Home's existing note line says "✓ Sent "<name>" for review. Its status is in Your packs on the Community packs shelf." |
| Refused by the server | The sheet stays open with the server's sentence (D12, ten waiting, size), nothing stored. |

**Reuse and changes.**

- `src/community/packSources.ts`: export `ownLibrarySource(name, docs: GraphicDoc[]) ->
  { source, leftOut }` over the existing `own` predicate, used by the folder branch of
  `packSources()` and by the Home door for a folder or a selection. The production branch keeps
  `ownPooled`, which filters a show's pooled copies rather than library records. `PackSource.kind`
  gains `'selection'`.
- `SubmitPackSheet.tsx` moves to `src/components/community/` (two surfaces now use it) and takes
  an optional `source` prop; with it, the select is not drawn. It fetches `lastAuthor` itself.
- `src/components/home/sections/GraphicsSection.tsx`: one item in `folderMenu`, one `RowMenu` in
  the bulk bar, the gate, and the sheet mounted once.
- `src/components/home/RowMenu.tsx` keeps its open state private today, so it gains optional
  controlled `open` and `onOpenChange` props (as `ProductionPicker` has); `FolderItem.tsx` then
  opens it from `onContextMenu`. Every other `RowMenu` stays uncontrolled and unchanged.
- No migration, no server change, no new route, no new persisted field.

**Cost.** One row, about a day: roughly 200 lines of product code, a unit test for
`ownLibrarySource`, and additions to `e2e/configured/community-pack-review.spec.ts` plus an
offline absence check.
It does not depend on slices 2 or 3 and can land before them, visible to moderators only.

**Rejected.**

- *A Packs section or a draft pack on Home.* A new persisted object with sync, a migration and a
  second way to group graphics, when a folder already is a named set. It also puts sharing in
  Home's navigation, which D16 forbids.
- *A visible Submit button on folder cards or in the bulk bar.* A control on screen beside every
  folder and every selection is a standing suggestion to share (D16).
- *An item on each graphic's own ⋯.* A pack of one is reachable by selecting one graphic; a
  third door on every row adds a share verb to the most-used menu on Home for no new case.
- *Send the maker to the wizard's shelf with the source pre-chosen.* Same sheet, but the maker
  leaves the place they organised the set in, and the wizard needs a deep-link route it does not
  have.
- *Right-click as the only door.* Phones and touch screens have no right-click; the ⋯ is the
  visible door and the right-click a shortcut to it.
- *From the production page or Playout.* Ruled out by the owner: that is the rundown, not the
  pack.

### Acceptance scenario (a)

As a moderator account with a configured backend: on Home, Graphics, a folder "Quiz night" holds
three graphics made by this account and one installed from the shelf. The folder's ⋯, opened by
click and by right-click, offers Submit to Community packs. The sheet lists the three own
graphics ticked, says one installed from Community packs is left out, and pre-fills the name
"Quiz night". With a description and a Shown as name, Send for review closes the sheet, Home
says it was sent, and the shelf's Your packs shows "Quiz night" In review with three graphics.
Selecting two graphics from different folders during a search and choosing the bulk bar's ⋯ gives
the same sheet with those two. As a non-moderator, signed out, and offline, neither the folder's
⋯ item nor the bulk bar's ⋯ exists. The production page's Setup menu is unchanged.

## (b) Sharing from the CLI and the plugins

### Recommendation: `--share` on `noacg pack`, one server door, one opt-in skill reference

**The command.** `noacg pack` gains `--share`, which sends the pack for review to Community
packs from the same build it already makes. It needs `--save`: the owner's ask is sharing as
the user imports to their own account, and requiring it reuses the key lookup, normalisation and
validation that today run only under `--save`. "Make it, put it on my Home and share it" is one
call:

```
noacg pack ./opener ./strap ./scorebug --name "Pub Quiz Night" \
  --description "Questions, answers and scores for a pub quiz" \
  --save --share --license cc-by-4.0 --shown-as "Quizmaster K"
```

- `--license cc-by-4.0` is required with `--share` and refused with any other value, so the
  grant is written in the command a person can read. `--shown-as` (D15) and `--description` are
  required too; the CLI never fills them from the account. All three, and `--share` without
  `--save`, are refused before the browser starts, as `--save` without a key is today. `--share`
  needs the same parsing guard `--save` has, which gives back a package path the flag parser
  handed to it.
- A single graphic is shared as a pack of one (`noacg pack ./strap --name … --save --share …`).
  `noacg save` gains no flag: one share verb, on the one unit the shelf takes.
- `--rundown` stays for the Home copy and `--out`. The shared copy is built without cues (the
  server refuses them) and the result says so in one line.
- The save's validation is unchanged. The community checks (below) run as a second pass over the
  templates the save already validated, after the save has been sent. A finding there refuses
  the share and names the graphic, while the Home copy has already landed: the user asked for
  both, and only one was refused.
- Success prints: "Sent "<name>" for review under CC BY 4.0, shown as "<name>". It is In review
  under Your packs on the Community packs shelf; you can withdraw it there." `--json` carries
  `share: { id, state: "in_review" }` or `share: { reason, error }`.

**The MCP tool.** The tool has one flat schema whose argument lines every session loads
(`inputShape` in `cli/src/mcp.ts`), so each new argument is a standing line in every agent's
context. The `pack` verb therefore reads ONE more argument, `share: { license, shownAs,
description }`, described only as "pack: see the skill's references/share.md". The tool's own
description, the verb list and the `docs` topics are unchanged, and the share reference is a
skill file rather than a `docs` topic, because the topic list is printed in the schema too. One
argument name is the whole footprint an agent sees without a request.

**The skill.** The opt-in section of `SKILL.md` gains a third entry, "Share to Community packs
(`references/share.md`)": ON only when the user asks in this conversation to share, publish or
submit the pack for others. Never offered, mentioned, suggested or asked about otherwise, not
even when a package is finished. The reference holds the command, the licence sentence and the
refusals. When the user asks without giving a Shown as name or without having seen the licence,
the agent states both in one message ("It will be shown as X, under CC BY 4.0: anyone may use it
in any show, with that name. You confirm you have the right to share its fonts and images.") and
runs on the user's yes. That one exchange happens only inside a sharing request the user started,
so the normal make, save and import loop gains no question. No new slash command: a
`/noacg:share` would list sharing in every Claude Code command menu. The text is written in
`cli/skill/noacg-graphic/`, the source, and `cli/scripts/build-skill.mjs` regenerates the
plugin copy (`check:skill` fails on drift).

**The server path.** AC-12 asks for the same server path, checks and permission:

- Migration: the body of `community_pack_submit` moves into
  `community_pack_submit_for(p_uid uuid, p_name, p_description, p_author, p_pack)`, granted to
  `service_role` only. Its checks must name `p_uid` explicitly, because `is_moderator()` and
  `is_suspended()` read `auth.uid()`, which is null under the service role: the moderator check
  as `exists (select 1 from public.moderators where user_id = p_uid)`, and the account checks
  through the service-only `feature_denied_for(p_uid, 'community.publish')` (0022), which
  answers suspension as well as the per-account switch. No callable predicate taking a user id is added back; 0020 removed one
  on purpose. The session RPC becomes a wrapper passing `auth.uid()`. One function holds every
  refusal, so the D12 switch in slice 3 changes one place for both doors, and the shelf's door
  gains the `community.publish` check it lacks today.
- `POST /api/me/community-packs` (`api/_lib/me/communityPacks.ts`, on the existing
  `api/me/[...path].ts` catch-all, so no new serverless function), in the package door's order:
  `resolvePrincipal`, `permits(principal, 'graphics:create')`, the agent save rate limits,
  `readJson` at 4 MB, the pack shape (no cues), then the store's
  `submitCommunityPack(userId, …)` calling the function above. The answer is
  `201 { id, state: "in_review" }`; a function refusal comes back as `409` with its sentence.
  CLI-shared packs are capped at the door's own 4 MB (`MAX_SAVE_BODY_BYTES`, kept under the
  platform's request limit), below the sheet's 8 MB; the refusal says so.
- **Permission: no new scope.** Sharing rides `graphics:create`, as the package door does.
  Recorded as an owner question below, with the reasons.

**The checks.** The CLI runs the studio's own code in its bridge, so the bridge gains
`communityCheck(candidate)`, returning `checkPackMeta` and `checkPackGraphics` findings plus the
runtime bench with the network refusal (next section). It is a separate call from `validate`,
so the save's gate is untouched and a share finding never refuses the Home copy. That makes
the CLI a third browser running the one pure check (D9); the admin's re-check on the stored pack
stays the backstop. The bridge is served by the studio, so the studio change deploys before the
CLI release that calls it, and the CLI reports an older bridge plainly instead of failing late.

**Cost.** One row, two to three days: the migration with its self-check, the door and its test
(mirroring `packages.test.ts`), the store method, the bridge's `communityCheck`, the CLI flags
and their parsing guard, the MCP argument, tests, the skill reference and its regenerated plugin copy, `docs/AGENT_SAVE.md` (a §8 for the
door) and the CLI changelog, then a CLI release. Order: after the unlanded agent-toolkit
distribution work on `codex/agent-toolkit-distribution` lands, because it edits the same
`cli/` files. Until slice 3, the server admits moderators only, so the door is usable by NoaCG
and refuses everyone else with the server's sentence.

**Rejected.**

- *Share by marking the Home package "to submit", finished in the studio.* No new server door,
  but the user asked to share as they import and would still have to find a sheet in the
  studio; the agent could not report it as done.
- *A separate `noacg share <dirs>` verb.* A second verb rebuilds what `pack` builds and appears
  in `noacg --help`, where every user reads it. A flag on `pack` is visible only to someone
  looking for it.
- *`--share` on `noacg save`.* Two share flags for one shelf whose unit is the pack.
- *A new agent key scope, `community:submit`.* See the owner question.
- *The study's "this package is complete" hint after `--save`.* Dropped by D16.
- *CLI withdraw and status (`noacg packs`).* Withdraw is at once in Your packs; a CLI copy adds
  surface for a step the user takes rarely.

### Acceptance scenario (b)

`noacg pack ./a ./b --name X --save` and the MCP `pack` without `share` send nothing to the
community: no `community_packs` row appears and the output never mentions the community. With
`--share` but without `--save`, `--license cc-by-4.0`, `--shown-as` or `--description`, the CLI refuses
before starting a browser and nothing is sent. As a moderator's key,
`noacg pack ./a ./b --name X --description D --save --share --license cc-by-4.0 --shown-as K`
puts X on Home → Productions with its rundown and puts X, without cues, under the account's
Your packs as In review, shown as K, with the admin's Waiting for review listing it. A graphic
that fetches a URL at runtime refuses the share and names the URL, while the `--save` still lands.
A non-moderator's key gets the server's "open to NoaCG only for now" sentence before slice 3.
In a conversation where the user never asked to share, the agent never mentions sharing.

## The observed-request refusal (D5)

**As built (2026-10-09):** a separate network bench, `src/validation/networkBench.ts`, rather than
an option on `benchTemplateRuntime`. That bench reaches into a same-origin frame to measure
layout, and on the admin's review row the code is a stranger's beside the admin's session; the
network bench needs no measurement, so it drives the graphic over the preview's postMessage
channel in a sandboxed frame. The policy, the listener and the phases are as below.

**Where it goes:** into `benchTemplateRuntime` as an option, `refuseNetwork: true`. The bench
puts a Content-Security-Policy meta first in the composed document's head (`default-src 'none'`,
inline and eval scripts and styles allowed, `img-src`, `font-src` and `media-src` limited to
`data:` and `blob:`, `connect-src 'none'`, `worker-src 'none'`, the shape of
`ografNetworkPolicy` with no package base). Right after the meta it injects an inline listener
for `securitypolicyviolation` that posts each event to the parent, the way the
`spx-error-capture` script reports errors. A listener the parent attached after `onload` would
miss a request made while the template's script first runs. The bench collects the events while
it plays every phase and turns each blocked URL into an error,
`runtime-network-request`, naming the URL and what asked for it. Blocking first means nothing
leaves the machine while it is observed.

**Who turns it on:** the submit sheet on Send (shelf and Home), graphic by graphic with progress
on the button ("Checking 2 of 5…"), since a bench per tick on every change would be slow; the
admin's review row, on the stored pack; and the bridge's `communityCheck` under `--share`. Saving,
exporting, publishing and playing out are unchanged, because the opt-in live blocks are legitimate
outside the shelf.

**Cost:** half a row, about half a day, with a fixture graphic that fetches a URL after Continue
and one that loads an image from a CDN in `play()`. Best landed before the slice 3 switch opens
submit to outside makers.

**Rejected:** a server-side headless browser (a browser on serverless, against the function
budget, to repeat what the maker's and admin's browsers already run); keeping the static screen
only (a regex is evaded by building a URL at runtime); turning the option on for every bench run
(it would refuse live blocks where they are allowed).

## The Report link

**As built (2026-10-09):** as below, plus one report per account while it waits, Reported
counting accounts, and a Dismiss beside Take down for a pack the admin keeps (migration 0083).

**Where it goes:** a quiet "Report" text button on every live shared card, after Install, for
signed-in accounts; absent on seeds, on the maker's own packs and signed out. It opens the
shelf's existing `ReasonAsk` with a required reason. `ReasonAsk` is written for the maker
("Reason the maker reads", 300 characters), so it gains a `placeholder` prop and the report
reads "What is wrong with it"; the reporter must not think the maker reads their words. A table
`community_pack_reports` with a `security definer` function
`community_pack_report(p_id, p_reason)` (signed-in only, reason 1 to 300 characters to match the
field, ten a minute per account, the 0004 shape) stores it. The admin's Waiting for
review gains "Reported" rows: the live pack, how many reports, the latest reasons, and the
existing Take down beside them. The reporter sees "Reported. Thank you." on the card and nothing
after; there is no notification channel (D14).

**Cost:** half a row: the migration with its self-check, about 60 lines on the shelf, and one
configured e2e step. Best landed with or before the slice 3 switch.

**Rejected:** reusing 0004's `community_reports` (its key points at the closed gallery's
`community_templates`); routing reports through the beta feedback door (it lands in a different
inbox, unattached to the pack, and renders nothing offline); anonymous reports (an open spam
path, and an account is one sign-in away).

## Order

1. The observed-request refusal, the Report link and the `community.publish` check in
   `community_pack_submit`, before or with the slice 3 switch, so the gate is whole before
   outside makers arrive. The last is a few lines in the switch's own migration if (b) has not
   landed by then.
2. (a) the Home door: independent, can land any time, moderators only until slice 3.
3. (b) the agent door (AC-12): after the agent-toolkit distribution work lands in `cli/`.

## Questions for the owner (answered 2026-10-08: yes to all three, recorded on #797)

1. **May the agent key that saves graphics also submit packs for review?** Recommended: yes, no
   new scope. The share happens only on the user's explicit request, a human reviews every pack,
   and the maker withdraws at once. A separate scope would put a sharing line on every CLI
   login's consent page, a suggestion to every user who never shares (D16), and would make every
   existing key log in again before its first share. **Answer: yes.** Sharing uses the agent
   key's existing `graphics:create` scope.
2. **Should the agent confirm the name and the licence before it shares?** Recommended: once,
   only when the request did not already give the name and accept the licence; one message and
   the user's yes. The sheet shows the licence sentence before Send for the same reason: the
   grant is the maker's. **Answer: yes.** The agent confirms the shown name and the licence with
   the user once before sharing.
3. **May a selection on Home carry an icon-only ⋯ whose one item is Submit to Community packs?**
   Recommended: yes. It is what "select some graphics and add them as a pack" needs, it shows
   only to accounts the door admits, and it reads as an overflow, not a prompt. The stricter
   reading of D16 drops it: a selection then becomes a pack through Folder › New folder and the
   folder's ⋯, one extra step and no new control on Home. **Answer: yes.** The bulk bar gets an
   icon-only ⋯ whose only item is "Submit to Community packs…", next to the folder's ⋯ menu.
