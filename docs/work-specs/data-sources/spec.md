# Data sources: how outside data and audience input reach graphics

Authority: owner briefs, 2026-10-17 (see `work.json`). The owner accepted DS1-DS20, then
accepted the additional recommendations for inclusion in the plan and requested independent
reviews of the whole run. **Still a draft pending that review and agreement on the resulting
plan.** No implementation or run is authorized by this documentation change.
Research: `docs/research/2026-10-data-sources/README.md` and `second-opinion.md` beside it.
Parent: `docs/work-specs/production-page-refactor/spec.md`, phases 1-26.
Children: `docs/work-specs/sheet-data-flow/spec.md` and `docs/work-specs/audience-flow/spec.md`.
This spec owns the shared model and the continuation schedule; children own their focused criteria.

## Current owner direction and planning decisions, 2026-10-17

The latest owner direction takes precedence over the historical DS and A answers:

- Audience messages are another kind of content. Do not require separate Data and Audience
  systems or two workspaces to complete one task. A shared content workspace with a Messages
  view is the current candidate; the prototype and independent reviews may find a better design.
- The main message journey is from anywhere to a graphic: copy a chosen X post, SMS, WhatsApp
  message or other text, or put it in a Google Sheet. A manual step is a valid first-class route.
  Native integrations with those services are not required to deliver it.
- YouTube input matters now. Qualify live chat and ordinary video comments separately; the
  existing reader handles live chat only. Manual copying covers either while direct support is
  qualified. Twitch remains an optional extension, not a completion gate for this run.
- Review the whole plan, all phases. Outcomes take priority over preserving the proposed UI,
  architecture or phase order. Record accepted review changes before starting the run.

P1-P5 are accepted for planning as refined here, not approved for implementation:

- **P1. Start at the graphic or the content.** Paste, type, select existing content or connect a
  source, see the rendered result, then save. One shared workflow; stable navigation; Advanced
  holds paths and bindings. No extra spreadsheet engine or scoring console.
- **P2. Scope every connection.** Map generated headers within the chosen destination; explicitly
  share content with another graphic. Persist stable identities. Equal titles never authorize
  a global connection, and an API's first push never chooses new targets.
- **P3. Supply starter content.** Generate rows or CSV from the selected graphic and its current
  content. One Sheet tab per reusable content set, each linked once. Small format adapters cover
  lists and message rows. No all-tab discovery from CSV, OAuth or arbitrary mapping language.
- **P4. Separate arrival from use.** Clipboard, Sheet, API or YouTube says where content came
  from, not whether it may follow on air. Live connections and selected-message snapshots share
  the workflow but have distinct write capabilities. Polling, push and subscriptions need
  different lifecycles, not different product concepts. One API key is one source, not a sender.
- **P5. Integrate the continuation into the production run.** Keep 15-26 as the reviewable
  candidate below. Prototype the full message journey alongside lists and API setup in 15;
  implement shared contracts in 16, message preparation in 21, safe staging in 23, and YouTube
  in 25. Phases 1-14 remain the current baseline; reviewers may challenge any phase or dependency.

Use `docs/research/2026-10-data-sources/external-review-prompt.md` for independent reviews.
The latest requirements above are fixed outcomes; the proposed solution is open to replacement.

## Problem

Nobody can say today, in one sentence, how data from outside NoaCG reaches a graphic; even the
owner could not. What exists (research README, "What NoaCG has today"):

1. **Four ways in, four vocabularies.** Production data (a tree of paths, bindings per field,
   seed, Raw JSON), tables (rows loaded one at a time into a cue), the audience inbox (messages
   sent to the rundown as new cues), and the frozen Sheet block inside one graphic's script.
2. **The data API is invisible.** It works only on a published production, its key sits behind
   "Data key" on the Data tab, a binding made after publishing moves nothing until the next
   publish, and the public guide leads with the graphic-addressed `/update` rather than `/patch`.
3. **No list source.** A ticker, a schedule, standings and credits each take one field of lines,
   but the only way to fill one from outside is the data API or typing. A Sheet's rows cannot
   reach one, and an RSS feed has no way in at all.
4. **The Sheet plan leads with the wrong case.** `sheet-data-flow` starts with values and uses
   scores as its examples. The owner, 2026-10-17: a sheet's main value is long texts and lists,
   with automation through the data API and RSS; typing a score in a sheet stays possible but is
   never the promoted path, because NoaCG's own controls already do that.
5. **The audience is a separate system** whose Send to rundown once put a viewer message into a
   scoreboard ([#1313](https://github.com/NoaCG/NoaCG-Studio/issues/1313)).

## Goal

**Choose content, see it in a graphic, put it in the show.** Operators can paste or type content,
reuse a Sheet, or connect another source without learning paths or bindings. A live connection
can follow changing data. A chosen message or table row becomes a cue snapshot, and the operator
Takes it. The source alone never decides which behavior applies.

## Non-goals

- Data operating the show: no source takes, advances, clears or removes a graphic.
- Writing back to a Sheet or a feed; a formula or general mapping language.
- Required native X, SMS or WhatsApp connectors. Manually supplied messages are in scope.
- Private Sheets through Google sign-in or new platform OAuth without a reviewed access design.
- Automatic airing of a message or vote; a new renderer, command log or API wire format.
- Rebuilding all storage into a new general data platform merely to unify the workflow.

## The model

There are two independent choices, usually expressed by the task rather than technical controls:

| Choice | Examples |
| --- | --- |
| Where it comes from | Paste/type, Sheet, feed, another system, YouTube, join page |
| How a graphic uses it | Follow a live value/list, or copy a selected row/message into a cue |

A ticker's live list, a guest row and a viewer message can all come from a Sheet. Choosing a
message workflow makes its rows candidates: new rows, edits, reordering or deletion never write
into prepared or on-air message cues. Provider identity does not grant a live writer. Conversely,
a manually written list can be shared as live content without pretending it is a chat source.
The common screen can offer relevant views without forcing operators to learn two data systems.

**Content.** Reuse production values, list values, `ShowDataset`, existing audience records and
cue fields where they fit. Messages need an original, an editable broadcast version and source
metadata; they do not require every list to become an audience submission. One logical item may
have multiple prepared cue snapshots. Avoid mirrored editable copies in Data and Audience.

**Sources.** Native content needs no network reader. Sheets use local browser ownership before
publishing and server ownership afterwards. Feeds use a guarded cached server fetcher, including
for local productions. The current data API pushes live values on published productions.
YouTube/join intake writes message candidates. Importing message rows from Sheets uses the same
selection and staging rules; it cannot inherit a live-data writer just because Sheets support one.
A generic message-push endpoint is not implied by `/patch`: assess it separately if needed later.

Share source identity, status, Pause and access control. Give polling, push and subscription
adapters their own lifecycle; a database scheduler is not a persistent streaming connection.
Only a live-data connection receives a production-data writer. Message intake receives a
candidate writer, and only an operator action stages the cue. No intake receives air verbs.

**Connecting live content.** Start in the cue field or shared content view. Select a destination,
preview the mapping and rendered result, and save an explicit connection. Generated headers can
suggest fields within that selection; labels are not identities. Sharing with a second graphic
requires an explicit choice. Use small adapters for ticker, schedule, standings and credits;
standings headers and rows update together and credit section breaks survive.

A live connection belongs to a graphic, so all its cues use it. The preview names those effects,
including that applying a connection to a graphic already on air may update it immediately.
Published changes persist and reach the server without a hidden republish step. Existing paths,
manual controls, bindings and exports keep their compatibility behavior.

**Selecting a message.** Paste body and optional name, or choose a candidate from Sheet/YouTube/
join input. See the original, edit the broadcast version, choose a compatible graphic, preview,
and Put in rundown. This also approves that version; Take is a separate normal playout action.
A source refresh cannot rewrite the cue. Live-bound message/author fields are incompatible unless
snapshot isolation is actually guaranteed: offer an unbound target or a separate card without
changing another cue's bindings. A later connection also cannot claim fields used by a prepared
or on-air message snapshot; refuse it with a safe alternative. Never guess that a scoreboard is
a message destination.

**A starter Sheet for messages.** Visible columns: `Name`, `Message`, optional `Source` and
`Reference`. Example: `Sam | Can you explain this play? | WhatsApp |` (pipes here separate cells).
Only selected broadcast fields appear in the graphic. Source/reference are optional provenance,
not a promise of a platform connection; phone numbers and handles never become automatic credits.
Stable IDs may be generated or supported behind the simple surface. Phase 16 must define how
imports without IDs treat edits, duplicates and reordered rows, rather than using row position.
A selected revision stays frozen even if the source changes or disappears.

**The data API.** Keep `/patch` as the production-data door with a generated example based on
selected destinations, an address, the key behind Reveal and last-receipt status. It cannot play
or clear a graphic. `/update` remains the advanced graphic-addressed door. Both obey server Pause,
including correctly merged held patches, null deletions and their documented application order.
Do not advertise either as an inbox until a candidate-only contract exists.

**Votes and joining.** The production join link/QR is an optional intake route, requiring
publishing. Local paste and Sheet message preparation do not. Presenter Now/Next stays separate
from program playout. Vote totals are staged onto a vote-board cue; following tally changes
requires the existing explicit live-update switch.

## Preserved

- Data changes values and never operates the show; the operator wins over a feed (GOALS outcome
  7), and a later write wins, whoever wrote it.
- One playout ingress: live field updates and operator commands become ordinary rows in the log
  (`CLOUD_PLAYOUT.md` §7); the renderer applies rows in order and learns nothing new.
- The audience backend has no method that reaches the command log or production values.
- Sheet D1, D3 and D4 as agreed (DS15 keeps D3). D2's order becomes lists first (DS2), written
  into the sheet spec when this spec is agreed.
- Templates and exports are unchanged; a template's existing `liveData.ts` block keeps running.

## Decisions (answered 2026-10-17)

The owner, 2026-10-17: "For me it's too difficult now to answer those questions before I actually
can try it out so let's go with your recommendations. Record those as answers." Each answer below
was the recommendation. This section is a historical decision record. The current model,
criteria and P1-P5 above supersede DS1/3/7/9/11/14 where they specify global matching, universal
row joining, provider-based destinations or separate navigation. DS16's continuation is below.
New reviews can challenge any earlier decision; record the reconciliation before implementation.

- **DS1. The model and its words.** Agree the model above: values, lists and tables, each from
  one source, fields connected by name, "source" and "connected" as the only other words on the
  default surface. Answer: agree.
- **DS2. The first Sheet shape (revisits sheet D2).** D2 says values first. Answer: lists
  first (each row one line), values in the same phase, tables last; the operator still picks the
  shape (D2's rule stays); the sheet spec's examples and its newcomer run (AC-12) move from a
  scoreboard to a ticker.
- **DS3. A row with several cells.** Answer: its cells join with " | ", the separator
  schedules, standings, fixtures and credits split on; empty cells at the row's end drop. A ticker
  reads " | " as plain text (the bilingual ticker as its language split) and a tab or ": " as a
  kicker, so a ticker's sheet keeps one cell per row, with "SPORT: United win" for a kicker.
  Alternative: join with a tab, which tickers read as a kicker but the other list graphics do not
  split on.
- **DS4. RSS and Atom feeds.** Answer: accept a pasted feed address as a list source:
  each item's title is one line, newest first, the newest 20, markup and entities turned into
  plain text, read every 5 minutes with conditional requests, and slower when the feed asks
  (its `ttl`, `Cache-Control` or `Retry-After`).
- **DS5. Who reads a feed for a local production.** Most feeds do not allow a browser on another
  site to read them, so a local production cannot read one by itself. Options: a NoaCG route the
  browser asks to fetch the feed (a new public server path: public addresses only, size and time
  caps, a limit per client and per address, one cached read per feed address), or feeds only once
  published. Either way the server fetches an address a person pasted, which reverses the sheet
  spec's rule that it never does (sheet "Safety"). Answer: the route, as a segment of an
  existing catch-all, so a feed works before anyone signs in.
- **DS6. JSON addresses.** Answer: not in this run. Later, only for JSON whose shape NoaCG
  can read without a selector (an object of names to values or lists), behind the same guards;
  anything else reaches NoaCG through the data API with a small connector or an automation tool.
- **DS7. The data API on the data view.** Answer: show it as the source "Another system"
  with the address, the key behind Reveal, an example built from this production's names, and
  "updated N s ago" from the last push; a pushed name connects matching fields when it first
  arrives; the guide and `DATA_API.md` lead with `/patch` and names, and `/update` moves to a
  low-level section.
- **DS8. Pushing to a local production.** Answer: no; publishing stays the step, said
  plainly on the card with Publish one press away (as audience A5 for phones).
- **DS9. Two sources writing one name.** Answer: the later write wins (today's rule and
  D4); each value shows which source wrote it last; the data view warns when two sources write
  the same name.
- **DS10. Where a field connects.** Answer: both doors, the data view and the field's own
  "Connect" in the cue editor, which also takes a pasted Sheet or feed link; the newcomer
  journeys use the field.
- **DS11. Is the audience just another data source?** Options: (A) keep two separate systems,
  sharing only the source core (today plus A4); (B) merge: viewer input becomes production values;
  (C) one intake, two destinations: every source on one sources line with status and Pause, data
  sources write values and lists, audience sources write only the inbox, and an operator action
  moves a message into a cue. Answer: C. B breaks the rule that nothing a viewer sends
  airs without an operator.
- **DS12. How a picked message reaches air.** Answer: as a cue the operator takes (today,
  A2 and A3), not a "show now" value that changes an on-air graphic without a Take.
- **DS13. Votes.** Answer: tallies stay staged by the operator onto a vote board cue, with
  the existing "Update the percentages on air while voting" switch; tallies are not production
  values.
- **DS14. Where sources show.** Answer: one line per source on the Playout tab, data and
  audience alike, with status and Pause (the sheet spec's status line, for every kind). Where the
  Data and Audience views live stays with the sheet spec (one stable Setup item) and audience A1.
- **DS15. How fresh each kind is (revisits sheet D3 in part).** Answer: keep D3 for
  Sheets (read every 5 s, on screen within 10 s); feeds every 5 minutes (DS4); a push is as fast
  as its sender. A Sheet's own import formulas refresh far more slowly than 5 s (research README),
  so reading faster speeds up typed edits only.
- **DS16. The run order.** Answer: the phases below replace production-page phases 15-20
  (they carry all six Sheet phases, re-ordered), audience follows, and the run waits before phase
  15 until this spec is agreed.
- **DS17. A connection on a published production.** Today the server resolves the bindings pinned
  at the last publish, so a field connected afterwards moves nothing on air until the production
  is published again. Answer: connecting or disconnecting a field on a published
  production reaches the server at once, as a value edit does; publishing is never the hidden
  second step.
- **DS18. An emptied list.** Today an empty list writes nothing, so the old lines stay on air.
  Answer: a read that succeeds and finds no rows clears the field and the sources line
  says "empty"; a read that fails keeps the last good list, as now.
- **DS19. A manual change to a list.** A list is one value, so under D4 an operator's edit holds
  only until any row of the source changes, not just the edited line. Answer: accept it
  and say so where the list is edited; to keep a fix, edit the Sheet or press Pause.
- **DS20. Pause on pushed data.** Today nothing in NoaCG can stop a sender: "freeze" means the
  sender stops writing. Answer: Pause on "Another system" stops the data key's writes from moving
  anything on air, and the server's answer says the production paused it, while the operator's
  own presses still work. What arrives while paused is held, newest value per name, and Resume
  applies only what changed while paused, as a paused Sheet does (D4). Corrected 2026-10-17 after
  review: the answer first said pushes made while paused were dropped and the sender's next write
  would catch up, but a sender that sends only what changed (as `/patch` invites) would then
  leave a value stale after Resume.

## Owner input, second round (2026-10-17)

After reading the first draft, the owner said:

- The lists are the ones that matter: tickers, schedules, standings and credits.
- Sheets are hard to build from scratch, even simple ones. Every graphic would need its own
  template sheet, or one template could hold every graphic type, perhaps as tabs. How that looks
  is open.
- How a cell connects to its graphic must be clear, and as automatic as possible.
- Opening the data page must need no reading: a page where you add values and they reach the
  graphic. That page need not be NoaCG's if Google Sheets already does it better; the point is
  that today's Data tab is so confusing that nobody knows how to use it.
- Before the phases are planned, research further and get a second opinion from another agent.

**Research questions for the second opinion:**

- **R1. The starter sheet.** How NoaCG hands over a sheet that already fits the production: one
  tab per graphic, per list, or per graphic type; a copy of a published template, a file to
  import, or rows to paste into a new sheet; and how the production's own field titles and
  current values get into it.
- **R2. Connected by construction.** If NoaCG writes the sheet, its tab and header names can be
  the field names, so nothing needs mapping. How a cell is named so it reaches exactly the right
  field, and what happens when two graphics share a value (one score on two scoreboards) or share
  a field title ("Name").
- **R3. A data page with nothing to read.** What someone sees on opening it, whether NoaCG needs
  such a page at all when the Sheet is the editor, and what stays in NoaCG (typing in the cue, ±).
- **R4. Lists in practice.** The fewest steps from a starter sheet to a ticker, a schedule,
  standings and credits on air, and what each tab looks like for each catalog type.
- **R5. The answers.** Any of DS1-DS20 the review would answer differently, with its reason.

## Risks the research found

- **Feed rights.** A news site's terms may allow headlines only, with a link, or forbid paid or
  advertising use. NoaCG does not judge them; the person pasting the feed does.
- **Colons in headlines.** A ticker reads ": " as the end of a kicker, so "Weather: storm warning"
  airs as the kicker "Weather" and the text "storm warning". Often right for news; never altered
  by the reader.
- **The Sheet export address is not a documented Google API.** It answered cross-origin on
  2026-10-16; phase 15 measures it again, and a change by Google stops Sheets until fixed.
- **Import formulas refresh slowly and maybe not while the sheet is closed.** Google documents
  hourly refresh "while the document is open" (research README); data a sheet pulls in by
  formula can be an hour old or older on air.
- **Chat platforms.** Anonymous Twitch reading is undocumented; YouTube's daily quota is per
  Google project. Current YouTube code reads live chat, not video comments. Qualify the promised
  scope and costs; Twitch persistence is deferred. Manual message intake needs none of these.

## Acceptance criteria

Child criteria stay in their own specs and are named as "sheet AC-n" and "audience AC-n".
These current criteria replace conflicting historical decision wording above.

### AC-1: Arrival and graphic use are independent
Sources produce content through polling, push, subscription or native editing. Live connections
receive a production-data writer; candidate intake receives only a candidate writer. The same
Sheet reader can supply live lists or selectable messages without giving message intake a live
writer. Formats and stable identities are shared where appropriate. Valid empty live content
clears its managed field; a failed read writes nothing. Layer: Node contract fixtures covering
both uses of one source kind and proving their capability boundary.

### AC-2: A list fills a field that takes lines
A Sheet list of 12 rows reaches a ticker's items field as 12 lines in sheet order; a two-column
schedule tab reaches a schedule's field as "time | show" lines; an update while the ticker runs
continues the scroll rather than restarting it. Layer: Node test on rows to lines; a journey in
`e2e/production-data.spec.ts` against a stub sheet; the ticker's update behaviour unchanged.

### AC-3: A field connects where it is
In the cue editor, a field offers compatible content or a new Sheet/feed source. The operator
selects a format, sees the rendered result and affected targets, and saves a scoped connection
without visiting a separate setup page. On a published production it persists and moves the
output without a new publish. No unrelated equal-title field connects. Layer: production-data
journey and configured suite for the published half.

### AC-4: A pasted feed becomes a list
An RSS 2.0 or Atom address lists its newest headlines within 10 s of pasting; markup, entities and
CDATA come out as plain text; an item repeated with the same id or link appears once; a feed that
fails keeps the last good list and says why, with the time it started. Layer: Node test with feed
fixtures; journey against a stub feed; one scenario on a real public feed in `evidence/`.

### AC-5: Feed reading is safe and polite
The server fetches only http and https addresses that resolve to public IP addresses and connects
to the very address it checked, never looking the name up again, so a name that answers
differently the second time (DNS rebinding) cannot reach a private address. It checks every
redirect the same way, stops at a size and a time cap, returns parsed headlines only, sends
conditional requests, serves one cached read per feed address to every reader, and refuses a
client or an address over its limit. Every server read of a feed, the published tick's included,
goes through this fetcher. Layer: Node test with a fake resolver and fetch, including a name that
resolves public then private; configured suite for the route.

### AC-6: The other-system door is visible
A published production shows the address, the key behind Reveal, and an example generated from
selected destinations. A push shows last receipt within 5 s and only updates saved connections,
including with all pages closed. Pause holds writes from every data-key route and its response
says so; Resume applies held changes correctly. Local setup explains publishing. Layer: journey
and configured tests for first push, pause, partial merges, deletes and legacy `/update`.

### AC-7: Content has an honest source and explicit sharing
The content view and connected field identify the actual source. Sharing or replacing a source
is explicit, and display renames do not change its identity. The current data key represents one
API source; it cannot promise per-sender attribution or Pause. Layer: Node contracts; journey.

### AC-8: Sources and content are discoverable together
One stable content entry and contextual field actions expose the same records. A Messages view
may specialize selection and preparation without another setup flow or duplicate content store.
Playout shows active sources with status and Pause where applicable; native content is labeled
as local content, with no fake connection or freshness warning. Layer: prototype and journey.

### AC-9: Every message intake respects selection and staging
Pasted text, Sheet message rows, join submissions and supported YouTube input enter the same
candidate workflow. No intake can write live values or command-log rows. Only an operator can
stage a compatible cue and Take it. A Sheet candidate refresh cannot bypass this rule. The live
data API is not a message-intake endpoint. Layer: structural contracts and cross-source journey.

### AC-10: A newcomer does each journey unaided
On a fresh production, without documentation: a Sheet list onto a ticker, an RSS feed onto a
ticker, and a push from a test sender onto a scoreboard, each on air in under five minutes.
Layer: scenario runs recorded in `evidence/`.

### AC-11: A person starts from real content without reading a binding guide
From a ticker field, a newcomer pastes three rows, sees the rendered result and takes it without
opening Advanced or creating a Sheet. Content is discoverable through stable navigation.
The shared view names each content set, its source and the graphics using it. Layer: disposable
prototype task run before implementation; journey in `e2e/production-data.spec.ts` afterwards.

### AC-12: Connections remain correct when names collide or change
Two graphics with a Name field do not connect to the same person unless explicitly selected.
One score intentionally connected to two boards updates both. A source or graphic display rename
preserves a saved connection; a deleted/replaced target or incompatible field contract is flagged
and never silently redirected. Existing explicit paths still work, including Unicode labels.
Connecting names affected graphics/cues, and published success follows durable persistence.
Layer: Node contract tests; existing production-data journey; configured published scenarios.

### AC-13: Starter rows fit the actual graphic and selected tab
Generated starter rows carry current values and headers for ticker, schedule, standings, credits,
lower third and scoreboard. A tab link previews the selected tab; a missing gid does not pretend
to discover other tabs. One tab reused by two graphics has one reader. A renamed tab keeps its
identity; a missing tab holds last good values and asks for reconnection. Standings rows and
headers update together; credit section breaks survive. Unsupported delimiters, formula errors
and malformed rows are diagnosed rather than silently rearranged. Layer: Node fixtures for all
six shapes; Sheet import journey and real-Sheet scenario receipt.

### AC-14: Failure, empty content and overrides have distinct outcomes
A failed or malformed read holds the last good value; valid empty source content clears its
managed target; legacy missing paths and empty arrays keep their compatibility behavior.
Unchanged polls retain manual edits. A changed list replaces the whole list. Pause/Resume uses
the last applied snapshot; held partial API patches retain all changes and null deletions.
Late reads cannot write after disconnect or publish handover. Source status distinguishes last
checked from last changed and does not mark an event-driven push stale solely from silence.
No data-key write route bypasses Pause. Interleaved `/patch` and legacy `/update` writes resume
with a documented order that preserves the latest held write to each affected field.
Layer: shared Node and database conformance cases, controlled races, configured output scenarios.

### AC-15: Prepared messages are independent of source changes
A copied message is previewed, staged and taken with exactly the approved text. Source edits,
deletions, reorderings, new arrivals, reconnects and a second cue on the same graphic cannot
change it. Repeated import/stage retries do not silently create duplicates; intentional reuse is
possible. Local operator-authored/imported content and staged cues survive reload. Layer:
audience AC-1/2/6/8, Node contracts, local and configured journeys.

### AC-16: The main message routes are proven before completion
An unfamiliar operator can take pasted text and a selected Sheet message to air without a
platform account, a binding guide or a required join-page setup. YouTube's supported direct scope
is named and proved separately. Twitch remains available as an extension point and its existing
behavior is checked for regression; new persistent Twitch intake is not a required milestone.
Layer: audience AC-4/7/8/9 and phase 26 receipts, with limits stated separately.

## Phases (draft; production-page phases 15 onward once agreed)

This is the candidate continuation included at the owner's request. No run has started. The
current order keeps the refactor first, then shared content, then message staging and YouTube.
The independent whole-plan review may shorten or reorder it; numbering is not a requirement.

Each phase runs `/check`, relevant parent verification and `/queue-merge`, and records notes
below. The parent §6 matrix only defines checks for 1-14. Phase 15 must supply a concrete 15-26
matrix from these criteria: named files, Node/browser/configured/provider tasks, limits and
independent assessment. An unwritten later matrix is not permission to skip verification.

15. **Prove the whole interaction and external constraints** (AC-10/11/16 prototype; sheet D3;
    audience AC-5 findings/7 prototype). Prototype native lists and manual message paste first,
    then Sheet lists/messages, API setup and YouTube selection in one content workflow. Include
    no compatible graphic, two messages on one graphic, and a Sheet refresh after staging.
    Compare this with a simpler field-led design; record newcomer time, errors and assistance.
    Measure 20 real Sheet edits and an hour of five-second reads; check five feeds and published
    scheduler cost. Qualify YouTube live chat separately from ordinary comments, authentication,
    runtime lifetime, quota and closed-page behavior. Twitch research is optional. Missing access
    is unverified; D3 misses stop under its rule. A provider blocker holds dependent work only.
    Record the concrete continuation verification matrix. No durable product behavior yet.
16. **Content, message and connection contracts** (AC-1/9/12/13/14/15; sheet AC-8; audience AC-8).
    Reuse existing stores. Define scoped identity, adapters, runner lifecycles, message revisions,
    original/broadcast text, local persistence, cue snapshots and protection from later live binds.
    Specify no-ID Sheet import, duplicate/reorder/edit/delete behavior and idempotent staging.
    Protect snapshot fields from later bindings and direct data-key writes. Pin empty/hold, late
    responses, legacy compatibility and source handover. No general mapping engine or new inbox
    API implied by the data key. Prove candidate paths cannot obtain a live writer.
17. **Native lists and local Sheets** (AC-2/3/11/12/13; sheet AC-1/2/3 local/5/6/7/9).
    Build field-led preview, starter rows/CSV, selected-tab connections and the small editor.
    Keep content navigation stable and one local reader. Prove schedule, standings and credits,
    explicit sharing, Pause and manual changes. Retain the contracts needed for message rows.
18. **Published ownership** (AC-3/12/14; sheet AC-3/4/5/6/7 published). Persist sources and
    connections with operator access controls. Prove ordered bindings without republish, one
    writer through handover, closed-page updates and manual presses. Measure server cost and D3.
    Source configuration, credentials and unselected message metadata stay out of output pages.
19. **Direct feeds** (AC-3/4/5/14). Add guarded cached RSS/Atom reads on local and published paths.
    Prove empty, failed, duplicate and undated feeds, backoff and the running-ticker journey.
20. **Custom API setup and Pause** (AC-6/7/12/14). Generate selected-destination examples; show
    receipt status. Enforce Pause for `/patch` and `/update`, with ordered held changes, null
    deletions and working operator controls. Prove no unsolicited bindings with all pages closed.
    Update `DATA_API.md` and `/docs`. No platform connector is required for pasted messages.
21. **Selected rows and message preparation** (AC-7/8/9/15; sheet AC-11; audience AC-8).
    Reuse Sheet tables for selected guests and messages. Add a short paste/type message route,
    starter message rows, original/broadcast preview and persistent local content. Refreshes
    reconcile candidates by the phase 16 rules, never prepared snapshots. Keep preparation usable
    without publishing. New message-to-cue actions depend on the compatible staging proof in 23;
    do not route them through the unsafe legacy fallback in the interim.
22. **Data journeys and compatibility** (AC-10/11; sheet AC-7/9/10/12). Keep existing embedded
    Sheet blocks working while retiring their new-graphic setup. Check exports, publish changes,
    shared score controls and newcomer list/feed/API tasks. A new screen alone is not completion.
23. **Safe message staging from every route** (AC-9/15/16; audience AC-1/2/6/8).
    Reproduce #1313, remove unrelated target fallbacks, offer a compatible card and remember the
    target. Wire paste, Sheet and existing inbox candidates to one reliable Put in rundown
    action. Preserve original text, anonymity and exact broadcast snapshots through Take. Prove
    retries/double presses, two cues on one graphic and live binds attempted before/after staging.
    Include direct/held `/update` writes to protected message fields. Nothing airs or changes
    another cue merely because a message is imported or staged.
24. **Shared message workflow and optional joining** (AC-8/16; audience AC-3/5/7).
    Finish the prototype's shared navigation and clear actions. Walk manual/Sheet journeys and
    the optional published phone join, presenter and vote flows. Explain Publish where needed;
    do not require audience enabling or joining to paste content. Preserve vote staging/live
    toggle and fix blocking journey defects.
25. **Qualified YouTube intake** (AC-9/15/16; audience AC-4/9).
    Implement the direct scope and access method qualified in 15. Persistent live chat requires
    one owner, reconnect deduplication, Pause, secure server credentials and closed-page proof.
    Ordinary comments need their own contract and provider receipt if promised. Keep manual
    copying as an independent route; it does not count as direct integration acceptance. Retain
    Twitch compatibility and extension interfaces; no new persistent Twitch work is required.
26. **Combined production rehearsal** (AC-10/15/16; sheet AC-12; audience AC-1 through AC-9).
    In one production run Sheet ticker/schedule/standings/credits, shared API scores, guest rows,
    pasted messages representing X/SMS/WhatsApp, Sheet messages, qualified YouTube and staged
    votes. Check PROGRAM after source edit/delete, duplicate arrival, Pause, disconnect, reload
    and operator-page closure. Repeat the unaided manual and Sheet message tasks. Record each
    route separately; optional Twitch deferral does not fail the run, and blocked required
    YouTube scope does not silently become a pass. Device rehearsal remains separately recorded.

JSON URL mapping, mandatory platform connectors and Google account creation/discovery remain
outside this run. The existing runner divides phases into bounded work items; no new scheduler
or execution ledger is introduced.

## Readiness

Before the next production-page run: collect the independent full-plan reviews, compare their
reasoning and reconcile accepted changes across the parent and children. Record the owner's
agreement on the resulting plan; this session only incorporates the requested planning changes.
Use the external review prompt without sharing other agents' conclusions on their first pass.

Before phase 15: phase 14 checked PASS on `main`; this spec and audience authority agreed;
all affected specs consistent with current digests and clean `work-spec.mjs status`. P1-P5 are
already included for planning; do not ask the owner to repeat those answers. Record remaining
review decisions and phase 15's measured constraints before dependent implementation. Phase 26
is integration acceptance, not evidence that research has already proved working behavior.

## Phase notes
