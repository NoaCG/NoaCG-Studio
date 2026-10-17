# Data sources: how outside data and audience input reach graphics

Authority: owner brief, 2026-10-17 (see `work.json`). Decisions DS1-DS20 are answered: the owner
accepted every recommendation the same day. **Still a draft**: before the phases are planned, a
second opinion reviews this plan and the research questions R1-R5 below, and the owner agrees the
result. Nothing here is built until then. Research and sources:
`docs/research/2026-10-data-sources/README.md`. Parent direction: `docs/GOALS.md` outcomes 5 and 7.
Child specs: `docs/work-specs/sheet-data-flow/spec.md` (agreed, D1-D4) and
`docs/work-specs/audience-flow/spec.md` (draft, A1-A5); each keeps its own criteria, and this spec
owns the model they share and the criteria that cross them.

## Second opinion, 2026-10-17: proposed revision

Read `docs/research/2026-10-data-sources/second-opinion.md` for the code findings, concrete Sheet
layouts, primary sources and user journeys. The current request asks for research and a plan for
the production refactor, with easier data binding and Audience in the same run. No implementation
is authorized by this document change.

The original model and DS answers below record the accepted starting direction. P1-P5 are proposed
amendments, not new owner answers. Where they differ, they identify what must change in the model
and existing criteria before implementation. The phase list is a candidate continuation only.

- **P1. Start with the graphic and keep a small native editor?** Recommend yes. A list field
  offers typing/paste, existing content, a Sheet or a feed, with a rendered preview. Data remains
  a stable overview tab beside Playout and Audience; paths and bindings stay in Advanced. This
  refines DS1, DS10 and DS14. It does not add a spreadsheet engine or another scoring console.
- **P2. Scope automatic connections to the selected destination?** Recommend yes. Generated
  headers map within the chosen graphic/format; existing content is shared explicitly. A first
  API push never connects unrelated fields just because their titles match. Persist stable
  source/output and graphic/field identities; labels are display text. New source-managed keys
  are isolated, while old paths and the API wire format remain compatible. This revises DS7,
  DS9 and sheet AC-2. D4 still governs manual edits and the next changed source value.
- **P3. Use generated starter rows and a few explicit list formats?** Recommend yes. Copy rows
  or download CSV from the selected graphic's current content. One tab per reusable content set;
  paste each tab's link once. Schedule columns, standings rows plus column headers, and credit
  headings/section breaks have small format adapters. This revises DS3. No anonymous all-tab
  discovery, universal workbook, Google OAuth, expression language or arbitrary JSON mapping.
- **P4. Share source management, but use separate polling, push and chat runners?** Recommend
  yes. Status, ownership and Pause are shared; only data adapters receive a production writer,
  and audience adapters receive only the inbox writer. A4's closed-page chat behavior needs a
  measured subscription runner, provider access and cost before implementation. No silent new
  platform sign-in. The existing production data key represents one API source, not one per sender.
- **P5. Use the revised phases 15-26 below?** Recommend yes. Prototype Data and Audience together
  first, implement data then audience after the refactor, and finish with the combined rehearsal.
  Keep phases 1-14 intact, D1/D3/D4 intact, and every source outside graphic template code.

Proposed default: **Choose what the graphic shows. Edit it here or connect a source.** A saved
connection compiles source content to ordinary fields; a picked table row or approved audience
message is copied into a cue. A graphic-wide live connection affects all cues of that graphic;
the preview names that scope. An already on-air graphic may change when the connection is applied.

Before accepting these amendments, resolve P1-P5 as a group or record exceptions. Do not reopen
DS1-DS20 and A1-A5 wholesale. This research does not promote any ledger to agreed.

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

One model that a non-technical operator can say back: **the production holds values and lists;
each comes from one source; a graphic's field connects to one by name; changes follow on air
without a Take; data never operates the show; nothing a viewer sends airs without an operator.**
Every source kind fits it, and the fastest path from "I have this data" to "it is on air" is a
paste and a Take.

## Non-goals

- Data operating the show: no source takes, advances, clears or removes a graphic.
- Writing back to a Sheet or a feed.
- Private Sheets through Google sign-in, platform sign-in for chat, or provider accounts held by
  NoaCG.
- A formula, mapping or expression language. Formatting stays in the template.
- Automatic airing of any viewer message or vote.
- Changing the command log, the output renderer or the data API's wire format.

## The model

**Three shapes of data**, named on the default surface with these words only:

| Shape | What it is | Reaches a graphic as | Example |
| --- | --- | --- | --- |
| Value | one text or number, with a name | one field, live | "Headline", "Home score" |
| List | many lines, with a name | one field that takes lines, live | "Headlines", "Credits" |
| Table | rows to pick from | one row copied into a cue, on purpose | guests for a name strap |

A list is what tickers, schedules, standings, fixtures and end credits already read: one field,
one item per line, and where an item has parts, the parts separated by " | " (catalog survey in
the research README). Underneath, a value is a production-data leaf, a list is an array of
strings (joined with new lines at the field, `formatValue` in `src/model/productionData.ts`), and
a table is today's `ShowDataset`. Nothing new reaches the renderer.

**Sources.** Every value, list and table comes from one source, and the operator can always see
which:

- **Typed in NoaCG:** scores, names, one-off fixes. Any shape. Nobody reads it: it is the
  production's own.
- **Google Sheet:** long texts, lists, schedules, credits, and data a sheet pulls in by formula or
  script. List, value or table. The browser reads it for a local production, the server for a
  published one (sheet D1).
- **RSS or Atom feed:** news tickers. A list. The server reads it, for local productions too
  (DS5).
- **Another system (the data API):** fast data from scoring, timing or results systems, and
  automation tools. Values and lists. The other system pushes; published productions only (DS8).
- **JSON address:** systems that only publish JSON. Later, if at all (DS6).
- **Audience (join page, Twitch, YouTube):** viewer messages and votes. They go to the inbox,
  never to a value (DS11).

A source writes names, never graphics. The shared source core of `sheet-data-flow` has two
halves. The reader half is shared by every kind: it schedules reads, keeps the last good read,
diffs against it, and reports one status with Pause; a kind supplies only "fetch and parse". The
writer half is given per destination: a data source gets the production data path (the local tree,
or the server's data patch) and writes only what changed; an audience source gets only the inbox's
submit door, and no writer that reaches values or the command log exists in its reach.

**Connecting.** A field connects to a value or a list by name:

- **By itself:** an empty field whose title matches exactly one name connects when the source is
  added, when the graphic is (sheet AC-2), or when a name first arrives from a source, such as a
  push carrying a name the production has not seen; on a published production the server makes
  that connection, so it holds with every page closed. "Ticker items", "Headlines" and "Credits"
  are field titles in the catalog today, so a list named that way connects with no step at all.
- **From the field (DS10):** the cue editor's field offers "Connect", listing values for a
  single-line field and lists for a field that takes lines, plus "Paste a Sheet or feed link".
  Pasting there creates the source, names the list after the field and connects it.
- **From the data view:** the same records, source first.

**In the rundown.** A connection belongs to the graphic, not to a cue, and takes effect at once, on
a published production too (DS17; today the server waits for the next publish). Every cue of that
graphic shows the connected value in its preview, Take airs it, and later changes reach air without
a new Take (published: the server's own log rows; local: the page's dispatch). A connected field is
not a cue value, so a prepared cue never re-airs a stale figure (`PRODUCTION_DATA_PLAN.md` §2.7).
The operator overrides by changing the shared value (sheet D4) or by disconnecting the field.
Tables and audience messages differ on purpose: the operator picks a row or a message, it is copied
into a cue, and nothing follows afterwards.

**The data API's role.** It is the door for anything outside NoaCG that can send an HTTP request:
a scoring or timing system, a results service, an automation tool's HTTP step, a script behind a
Sheet. It writes the same names the other sources write (`PATCH /api/data/patch`, a name with
spaces is one valid name), so a pushed "Home score" or "Headlines" connects to fields exactly like
a Sheet's. On the data view it is one more source, "Another system", with its address, its key and
a ready example built from this production's own names (DS7). It stays data only: it cannot play,
take or clear anything. `POST /api/data/update` stays as the low-level door that addresses one
graphic by name.

**Where the audience fits (DS11, answer C).** Viewers are a source of candidates, not of
values. A viewer sends a message from the production's join page (a link or QR code, published
productions only) or in the chat of a Twitch channel or YouTube stream the operator connected.
Every message lands in the Audience inbox; the operator approves, edits the broadcast text and puts
it in the rundown as a cue on a graphic made for messages (audience A2, A3); Take airs it. Audience
sources sit on the same sources line as data sources, with status and Pause, and run on the core's
reader half (audience A4), but their writer is the inbox's submit door alone. Votes are counted in
the Audience tab and staged onto a vote board cue by the operator (interactive plan D5).

## Preserved

- Data changes values and never operates the show; the operator wins over a feed (GOALS outcome
  7), and a later write wins, whoever wrote it.
- One ingress: every outside write becomes ordinary rows in the one command log
  (`CLOUD_PLAYOUT.md` §7); the renderer applies rows in order and learns nothing new.
- The audience backend has no method that reaches the command log or production values.
- Sheet D1, D3 and D4 as agreed (DS15 keeps D3). D2's order becomes lists first (DS2), written
  into the sheet spec when this spec is agreed.
- Templates and exports are unchanged; a template's existing `liveData.ts` block keeps running.

## Decisions (answered 2026-10-17)

The owner, 2026-10-17: "For me it's too difficult now to answer those questions before I actually
can try it out so let's go with your recommendations. Record those as answers." Each answer below
was the recommendation. A change the second opinion proposes goes back to the owner.

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
  Google project. Both matter to audience A4, not to the data sources here.

## Acceptance criteria

Child criteria stay in their own specs and are named in the phases as "sheet AC-n" and
"audience AC-n". These are the criteria that cross them. They follow the answers; a change the
second opinion proposes and the owner accepts rewrites the criterion that names its decision.

P1-P5 propose these specific substitutions for the original criteria below: AC-1 uses separate
runner lifecycles and explicit format adapters; AC-3 saves a previewed, scoped connection; AC-6
connects only destinations already selected during API setup; AC-7 reports actual source identity
and requires explicit sharing/replacement. Existing global title matching is not an acceptance
requirement of the proposed phases. AC-11 through AC-15 define the additional proposed outcomes.

### AC-1: A source writes names, never graphics
Each source kind (Sheet, feed, pushed, a test kind) produces named values, lists or table rows
through the one source core; none addresses a graphic, a cue or an air verb. A list that reads
empty clears its field, and a failed read writes nothing (DS18). Layer: Node test over the core's
contract, run for every kind.

### AC-2: A list fills a field that takes lines
A Sheet list of 12 rows reaches a ticker's items field as 12 lines in sheet order; a two-column
schedule tab reaches a schedule's field as "time | show" lines; an update while the ticker runs
continues the scroll rather than restarting it. Layer: Node test on rows to lines; a journey in
`e2e/production-data.spec.ts` against a stub sheet; the ticker's update behaviour unchanged.

### AC-3: A field connects where it is
In the cue editor, a field that takes lines offers the production's lists and "Paste a Sheet or
feed link"; a single-line field offers values. Pasting a link there creates the source, names the
list after the field and connects it, with no visit to the Data tab. On a published production
the connection moves the output at once, with no new publish (DS17). Layer: journey in
`e2e/production-data.spec.ts`; configured suite for the published half.

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
A published production's data view shows the address, the key behind Reveal and a ready example
built from this production's own names; a push shows "Another system: updated N s ago" within
5 s; the first push of a new name connects the empty fields titled with it, with every page
closed; while the source is paused a push moves nothing and its answer says it was held, and
Resume brings the held change to air (DS20);
an unpublished production says publishing is the step. Layer: journey for the unpublished card;
configured suite for a published push, a first push into a fresh production, and a paused push.

### AC-7: Each value says where it came from
The data view and a connected field name the source of each value's last write; two sources
writing one name show a warning on that name. Layer: Node test; journey.

### AC-8: Every source in one place
The Playout tab shows one line per source, data and audience alike, each with its status and
Pause; a stale or failing source is marked there and on its connected fields. Layer: journey.

### AC-9: Viewer input never becomes a value
No audience path (join page, chat reader) can write a production value or a command-log row: an
audience source is handed the inbox's submit door and no other writer. A message reaches air only
as a cue the operator takes. Layer: Node test on the audience interface
and the source core (structural); the existing journey in `e2e/production-audience.spec.ts`.

### AC-10: A newcomer does each journey unaided
On a fresh production, without documentation: a Sheet list onto a ticker, an RSS feed onto a
ticker, and a push from a test sender onto a scoreboard, each on air in under five minutes.
Layer: scenario runs recorded in `evidence/`.

### AC-11: A person starts from real content without reading a binding guide
From a ticker field, a newcomer pastes three rows, sees the rendered result and takes it without
opening Advanced or creating a Sheet. Data and Audience remain in the same navigation positions.
The Data view names each content set, its source and the graphics using it. Layer: disposable
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

### AC-15: Audience input cannot cross into the live-data writer
Polling, push and subscription adapters share management without sharing write capabilities.
An audience message cannot bind to a live field, mutate an approved cue or trigger a playout
command. A compatible message graphic is required. Persisted chat ownership, reconnect identity,
Pause and closed-page delivery are demonstrated before A4 is called complete. Layer: structural
Node contracts; audience and chat journeys; configured published run with operator pages closed.

## Phases (draft; production-page phases 15 onward once agreed)

This is P5's proposed replacement, based on R1-R5 and the second opinion. It is not a started run.
Scope is sequential: refactor first, then data, then audience. Both pages are designed in phase 15.

Each phase runs `/check` and the production-page spec's §6 matrix, lands with `/queue-merge`, and
adds its notes under this spec's `## Phase notes`. Numbers are the production-page run's.

15. **Prove the interaction and external constraints** (AC-10/11 prototype; sheet D3; audience
    AC-5 findings/7 prototype). Prototype native list editing, Sheet connection, API sample setup
    and an audience message through a compatible graphic. A newcomer completes the tasks without a
    binding lesson. Measure 20 real Sheet edits and one hour of five-second polling, report the
    slowest edit and throttling; check five public feeds' conditional requests. Qualify the
    published scheduler cost and chat provider/listener options. Missing access is unverified,
    not pass; a D3 miss stops under its existing rule. A chat blocker holds its dependent phase,
    not independent data work. No durable product behavior changes yet.
16. **Content and connection contracts** (AC-1/12/13/14 structural; sheet AC-8). Reuse the tree,
    datasets and bindings. Add scoped identity, the small format registry, separate runner
    interfaces and typed destinations. Pin legacy compatibility, clear/hold, pause baselines,
    late responses and handover with Node conformance fixtures. No general mapping language.
17. **Native lists and local Sheets** (AC-2/3 local/11/12/13; sheet AC-1/2 revised/3 local/5 tabs/
    6/7 local/9). Build the field-led preview, starter-row copy and CSV fallback, selected-tab
    connection, small native editor, stable Data tab and local owner lock. Prove schedule,
    standings and credit formats, shared content, Pause and manual changes end to end.
18. **Published data ownership** (AC-3 published/12/14; sheet AC-3 published/4/5 handover/6/7
    published). Persist sources and connections with operator access controls. Prove ordered
    binding changes without republish, one writer through handover, closed-page updates and
    manual presses. Record server cost and repeat D3's real edit measurement. Keep source
    credentials and configuration out of outputs and viewer pages.
19. **Direct feeds** (AC-3 feeds/4/5/14). Add the guarded cached fetcher and RSS/Atom parser on
    local and published paths, using the ownership infrastructure from phase 18. Prove empty,
    failed, duplicate and undated feeds, backoff and the running-ticker journey.
20. **Custom API setup and pause** (AC-6 revised/7/12/14). Generate a sample from explicitly
    selected destinations, show last receipt, and enforce server Pause for every data-key write
    route, including legacy `/update`. Define held state for `/patch` and legacy field writes;
    operator controls still work. Prove partial patches, deletes, Resume and no unsolicited
    bindings with all pages closed. Update `DATA_API.md` and `/docs` to lead with `/patch`.
21. **Selected rows and source management** (sheet AC-11; AC-7/8/12/13). Sync Sheet tables and
    load selected guests/teams into preview as snapshots. Reuse source status and explicit
    sharing/replacement, distinguish last checked/changed, and retain the copied cue on refresh.
22. **Finish data journeys and compatibility** (AC-10/11; sheet AC-7 presses/9/10/12 revised).
    Retire the new-graphic Sheet panel while keeping old embedded blocks working. Run the
    newcomer journeys, validate exports, publish transitions and the shared score controls.
    No data phase is complete merely because its new screen exists.
23. **Safe audience destinations** (AC-9/15; audience AC-1/6). Reproduce #1313, remove unrelated
    graphic fallbacks, offer a compatible question card and remember the chosen destination.
    Retain broadcast edits and original text. Prove the exact reviewed message reaches Take,
    including two cues sharing a graphic and a target with live data bindings. Putting a message
    in rundown must not air it or alter another cue.
24. **Audience inbox and joining** (audience AC-2/3/5/7, A5). Keep Audience stable and simplify
    message actions, make failed saves and retries safe, and walk phone join, presenter and votes.
    Make the publish/join step clear. Votes keep their deliberate staging and explicit live-update
    toggle; blocking journey defects must be fixed, not merely filed.
25. **Persistent chat sources** (AC-8 audience/15; audience AC-4). Implement only the provider
    access and subscription runner qualified in phase 15. Prove reconnect deduplication, Pause,
    reload and closed-page arrival with a single owner and no data-writer capability. If provider
    authorization or hosting remains unresolved, record the blocker; do not claim A4 complete.
26. **Combined production rehearsal** (AC-10/15; sheet AC-12; audience AC-1 through AC-7). In one
    production run a Sheet ticker, schedule, standings and credits; shared API scoreboards;
    guest rows; an approved audience message and staged votes. Exercise source failure, Pause,
    reconnect, reload and operator-page closure. Repeat the unaided audience journey. Record
    timing, the owner look and remaining provider/device limits before calling the continuation
    complete.

JSON URL mapping and Google account creation/discovery remain outside this run. Each phase is
split into bounded work items by the existing plan runner, not by a new scheduler or ledger.

## Readiness

Before phase 15: phase 14 checked PASS on `main`; the second opinion reviewed and its accepted
changes folded in; the owner has agreed this spec (`work.json` authority `agreed`), with DS1-DS20
answered; `sheet-data-flow` and `audience-flow` updated to the
answers in the same change, with their digests current; `node scripts/work-spec.mjs status`
reports no problems for all three. For the proposed revision, P1-P5 must be answered and the
affected original criteria reconciled in all three specs before agreement. Phase 15 qualifies
external constraints before any dependent implementation; phase 26 is integration acceptance,
not a claim that research has already demonstrated working product behavior.

## Phase notes
