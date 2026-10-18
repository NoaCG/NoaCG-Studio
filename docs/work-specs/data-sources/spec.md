# Data sources: how outside data and audience input reach graphics

Authority: owner briefs, 2026-10-17 (see `work.json`). **Draft.** Reconciled on 2026-10-17 from
two independent whole-plan reviews (`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`,
the decision record with the reconciliation table). The owner has not yet agreed the reconciled
plan; nothing here authorizes implementation or a run.
Research: `docs/research/2026-10-data-sources/README.md` and `second-opinion.md` beside it.
Parent: `docs/work-specs/production-page-refactor/spec.md` (the run order and the run preflight
are in its "Run order" and "Readiness" sections). Children: `docs/work-specs/sheet-data-flow/spec.md`
(Sheets) and `docs/work-specs/audience-flow/spec.md` (messages). This spec owns the shared model,
the format adapters, the continuation phases C0-C7 and track Q, and their verification.

## What the reconciliation changed

The owner's outcomes are fixed (`docs/research/2026-10-data-sources/external-review-prompt.md`,
"Product and owner outcomes"): data binding without paths or bindings; tickers, schedules,
standings and credits first; Sheets optional with starter content or native paste; the data API,
Sheets, feeds and YouTube as parts of one workflow; messages as another kind of content; a chosen
message from anywhere, edited, previewed, put in the rundown, Taken; later arrivals never replace
it; reliability. Against those, the reviews changed:

- **The home of the task is the cue editor**, not a shared content workspace. "Fill from…" and
  "Connect…" on the field; the graphic is the destination by construction. Messages (today's
  Audience view) and Data stay as views; no new workspace or store.
- **Paste lands first (C0)**, before the refactor, as a declared feature change.
- **Only refactor phases 1, 2+7 and a props-only cue editor move run in this window**; the rest
  move to a later window.
- **Protection is destination hygiene**, enforced at both doors: a message destination has no
  binding on its body or name field, and no binding is added to a field that prepared cues use.
  The earlier field-level snapshot flag and `/update` protection are dropped.
- **A Sheet is read by the browser while a page is open, under a lease; a server tick about once
  a minute covers published sources with every page closed.** D1's server-only reading and D3's
  closed-page promise are revised; a decision for the owner.
- **Five small format adapters** replace the six-shape wording; adapters write strings and `""`
  when a valid read is empty, so an emptied list clears on air.
- **YouTube is browser-side**: one-shot video comments plus the existing live chat with its
  first page kept; the key is remembered only on opt-in. Server-side intake and new Twitch work
  are deferred.
- **API Pause is last and smallest** (suppress-and-diff), with "stop the sender" as the fallback.

Each child spec lists only the revisions to its own decisions and points here.

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
4. **The audience is a separate system** whose Send to rundown put a viewer message into a
   scoreboard ([#1313](https://github.com/NoaCG/NoaCG-Studio/issues/1313)), and whose inbox is
   forgotten on reload.
5. **Nothing can be pasted.** The one route every operator already has, copy and paste, exists
   for no kind of content.

## Goal

**Choose content, see it in a graphic, put it in the show.** From the cue editor an operator
pastes a message or rows, picks a message or a table row, or connects a Sheet, a feed or another
system, sees the rendered result, and saves. A live connection follows changing data. A chosen
message or table row becomes a cue the operator Takes. The source alone never decides which
behaviour applies, and nothing a viewer sends airs by itself.

## Non-goals

- Data operating the show: no source takes, advances, clears or removes a graphic.
- Writing back to a Sheet or a feed; a formula or general mapping language.
- Required native X, SMS or WhatsApp connectors. Manually supplied messages are in scope.
- Private Sheets through Google sign-in or new platform OAuth without a reviewed access design.
- Automatic airing of a message or vote; a new renderer, command log or API wire format.
- A new general data store, a shared content workspace, a docked message tray, grid editors or
  a scoreboard preset in this run.
- Server-side YouTube intake, new persistent Twitch support, JSON address mapping, repairing
  name-keyed bindings on a graphic rename.

## The model

Two words on the default surface:

| Word | What it does | Afterwards |
| --- | --- | --- |
| **Fill** | Copies content into this cue once: paste a message, pick a message, load a table row, paste rows into a list field | The cue owns the values; nothing outside changes them |
| **Connect** | Makes this graphic's field follow a Sheet tab, a news feed, another system or an existing value | Every cue of the graphic follows; the dialog says "Used by N cues" |

Both live in the **cue editor**, where the field is. A list or value field offers "Fill from…
Paste rows" and "Connect…"; a message body field offers "Fill from… Paste a message" and
"… Pick a message". A connected field is read-only with its source named and "Edit in the
source, or Disconnect to edit here". The Data view is an overview of the production's values,
lists and tables, their sources and the graphics using them, with Pause; paths, seed, Raw JSON
and per-field binding rows sit behind one Advanced disclosure and keep working. The Messages view
(today's Audience view) holds candidates and message sources. The Playout tab shows one line per
source with status and Pause. Setup always lists "Messages…" and "Data…"; the switcher keeps
today's rule (views in use, and the view you stand on).

**Where content arrives and how a graphic uses it stay independent.** A Sheet tab can feed a
live ticker, supply message candidates, or both; a pasted list and a pasted message are both
Fill. Fields follow live content through bindings. The inbox, whatever fills it, has no writer:
an operator action creates the cue. The data API is not a message intake.

**Content.** Lists and values live in the production tree under source-scoped paths
(`sheet.<id>.lines`, `feed.<id>.lines`, `sheet.<id>.rows` and `.headers`) as strings; fields
follow them through `Show.bindings`, unchanged as the one resolution contract on the page, at
publish and in `control_data_apply`. Tables stay `ShowDataset`. Message candidates stay
`AudienceSubmission` records with optional `externalId`, `source` and `reference`. A prepared
message is an ordinary cue whose `values` it owns, with an optional `stagedFrom` receipt. The
remembered message destination is `Show.messageTarget`, a pool graphic id.

**Sources.** `Show.sources[]` is additive and optional: `{ id, kind, config, paused, label,
inbox }`. Kinds in this run: `sheet`, `feed`, `youtube-chat`, `youtube-comments`; the join page
keeps its own controls. A source has one reader. Its live consumers are the binding entries whose
path starts with its prefix, from which "Used by N cues" and the Data overview derive; `inbox:
true` makes its rows message candidates as well, or instead. A published production carries the
same list in `control_shows.sources` with the server's read state. No `Show.version` bump: every
field is additive optional (`root/version-every-persisted-format-ship-breaking`).

**The three protective sentences.** A message destination has no live binding on its body or
name field, and a binding is never added to a field that prepared cues use; both doors refuse
with the offer of a separate card, and the binding write is one path, so the Advanced rows cannot
bypass it. A destination is named on the action, chosen explicitly the first time and remembered,
never guessed. A candidate's identity is its content, never its row position. Everything in the
audience spec follows from these and from "a prepared cue is plain values".

## Preserved

- Data changes values and never operates the show; the operator wins over a feed (GOALS outcome
  7), and a later write wins, whoever wrote it (`DATA_API.md`).
- One playout ingress: live field updates and operator commands become ordinary rows in the log
  (`CLOUD_PLAYOUT.md` §7); the renderer applies rows in order and learns nothing new. The output
  page never writes.
- The audience backend has no method that reaches the command log or production values.
- `Show.bindings`, existing explicit paths, manual controls, the `/patch` and `/update` doors and
  their documented semantics, templates and exports. A template's existing `liveData.ts` block
  keeps running.
- Today's view switcher rule and own-tab views (`PLAYOUT_DASHBOARD.md` §2).
- Sheet D4 (the operator wins with one shared value) as agreed.

## Formats

Five small adapters, beside data resolution, each turning rows into the text its graphic already
parses. Each also serves "Fill from… Paste rows" (cells or lines pasted from anywhere). Starter
rows are generated from the field's current content. One header rule for all adapters: a first
row equal to the adapter's starter header is skipped; any other first row is content; the
standings header row is content by definition (it names the columns); starter rows for the lines
adapter carry no header.

| Adapter | Graphics | Row rule | Writes | Parser it serves |
| --- | --- | --- | --- | --- |
| lines | tickers | one cell per row; "SPORT: United win" is a kicker by the ticker's own rule; a second cell, if present, joins with a tab (the ticker's unambiguous kicker separator); `\|` is plain text | `.lines` | `src/templates/tickers/shared.ts` 107-157 |
| schedule | schedule boards | Time and Programme cells joined with " \| "; a row missing either is flagged in the preview and dropped on air, as the parser does | `.lines` | `src/templates/infographics/dataRuntimes.ts` 41-56 |
| standings | standings boards | header row: cells after the first become the headers field; body rows join with " \| "; both fields change in one patch; a row with more cells than headers is flagged | `.headers` and `.rows` | `src/templates/competition/results/shared.ts` 153-213 |
| credits | end credits | "Role \| Name"; a first cell starting with `#` is a heading with trailing empty cells trimmed; a role with an empty name becomes "Role:"; an interior blank row is a section break and is kept; trailing blank rows trimmed | `.lines` | `src/templates/endCredits/shared.ts` 203-243 |
| rows | guest tables, message Sheets | one row is one table row or one candidate; never joined | a `ShowDataset` or candidates | `src/control/cueData.ts`; audience spec |

Values (Name, Value rows into named values) stay available behind "Connect… Google Sheet" for a
scoreboard, not promoted. Adapters write strings, never arrays; a valid read with no rows writes
`""`, which clears the field on air with an ordinary update row; a failed or malformed read
writes nothing. The ticker's colon convention is the template's and is shown in the preview, not
altered by any reader. Node fixtures: a credits heading with a trailing empty cell, a role-only
row, an interior blank row, a standings header row with five stat columns and a body row with
six cells, a ticker row containing `|`, a ticker tab with and without a header row, a schedule
programme containing `|`, an empty tab.

## Sources and readers

**Google Sheet.** The sheet spec owns the reader ("While the show runs", "Status and Pause"):
the browser reads every 5 seconds while any page of the production is open, under one lease per
source; a server tick about once a minute reads published sources with no live lease (C2); a
failed read keeps the last good value; a valid empty read writes `""`.

**News feed.** A public segment of the existing data catch-all fetches RSS 2.0 and Atom with the
guards of AC-6, parses titles to plain text, newest 20, and caches one read per address for 5
minutes, slower when the feed asks. The browser reader asks that route every 5 minutes while a
page is open; the server tick reads it otherwise. Browsers cannot read most feeds directly, so
this works before anyone signs in.

**Another system.** `/patch` stays the door, with a generated example from the selected
destinations, the address, the key behind Reveal and "Received N s ago" on the "Another system"
card of the Data view. `/update` remains the advanced graphic-addressed door with today's
semantics. Connecting or disconnecting a field on a published production writes the `bindings`
column at once (C2). Pause for pushed data is C5's smallest design: while paused,
`control_data_apply` still merges into the tree and skips the resolve-diff-append; the row stores
what was last dispatched; Resume diffs and appends one row per graphic; held `/update` writes are
a per-graphic last-write map applied after. If C5 finds that disproportionate, the card states
today's doctrine ("to freeze, stop the sender") and Pause ships for Sheets and feeds only.

**YouTube and join.** Browser-side with the operator's own key; candidates only. The audience spec
owns the details and the quota figures.

## Decisions, historical (answered 2026-10-17 and 2026-10-16)

The owner answered DS1-DS20 by accepting the recommendations. Each is kept here as a record;
"Now:" marks what the 2026-10-17 reconciliation supersedes. Reviews may challenge any of them.

- **DS1. The model and its words.** Answer: values, lists and tables, each from one source,
  fields connected by name. Now: "Fill" and "Connect" on the cue field; names never connect
  anything by themselves.
- **DS2. The first Sheet shape.** Answer: lists first, values in the same phase, tables last; the
  operator picks the shape. Kept.
- **DS3. A row with several cells.** Answer: join with " | ". Now: per adapter (Formats above);
  tickers keep one cell per row or a tab-joined kicker.
- **DS4. RSS and Atom feeds.** Answer: titles, newest 20, 5 minutes, conditional requests,
  publisher backoff. Kept.
- **DS5. Who reads a feed for a local production.** Answer: a public route as a segment of an
  existing catch-all. Kept (the data catch-all; the function budget is full at its cap of 13 at
  this branch's base and is not raised; no phase adds a function file).
- **DS6. JSON addresses.** Answer: not in this run. Kept.
- **DS7. The data API on the data view.** Answer: "Another system" card with address, key,
  example and last receipt; a pushed name connects matching fields on first arrival. Now: the
  card stays; no first-push auto-binding, connections are explicit.
- **DS8. Pushing to a local production.** Answer: no; publishing stays the step. Kept.
- **DS9. Two sources writing one name.** Answer: later write wins; warn. Now: sources write
  source-scoped paths, so two sources cannot write one name; sharing is explicit (AC-8).
- **DS10. Where a field connects.** Answer: both the data view and the field. Now: the field is
  the home; the Data view is an overview.
- **DS11. Is the audience another data source?** Answer: C, one intake, two destinations. Kept:
  the inbox has no writer.
- **DS12. How a picked message reaches air.** Answer: as a cue the operator takes. Kept.
- **DS13. Votes.** Answer: staged by the operator, with the existing live switch. Kept.
- **DS14. Where sources show.** Answer: one line per source on Playout. Kept. Now: Setup always
  lists Messages and Data; the switcher rule is unchanged.
- **DS15. How fresh each kind is.** Answer: Sheets 5 s read, 10 s on screen; feeds 5 minutes;
  a push as fast as its sender. Now: the Sheet figure holds while a page is open; with every page
  closed, about a minute, reported as measured.
- **DS16. The run order.** Answer: phases 15-26 after the refactor. Now: the run order in the
  parent spec; C0 first.
- **DS17. A connection on a published production.** Answer: reaches the server at once. Kept;
  the mechanism is a write of the row's `bindings` and `sources` columns, no new RPC.
- **DS18. An emptied list.** Answer: a successful empty read clears. Kept; adapters write `""`.
- **DS19. A manual change to a list.** Answer: holds until any row changes. Now: a connected list
  is read-only on the default surface; edit in the source or Disconnect. Values keep D4.
- **DS20. Pause on pushed data.** Answer: held, newest per name, with the null-deletion
  correction. Now: C5's suppress-and-diff, or the fallback doctrine.

The owner's second-round questions (the starter sheet, connecting by construction, a data page
with nothing to read, lists in practice) were answered by the second opinion's "Starter sheets",
"Connection rules", "The data page" and "The shortest complete journeys" sections.

## Risks

- **Feed rights.** A news site's terms may allow headlines only. NoaCG does not judge them; the
  person pasting the feed does.
- **Colons in headlines.** A ticker reads "Weather: storm warning" as kicker and story. Shown in
  the preview; never altered by the reader.
- **The Sheet export address is not a documented Google API.** It answered cross-origin on
  2026-10-16; Q measures edit latency and an hour of 5-second reads; a change by Google stops
  Sheets until fixed. "Publish to the web" CSV is the documented fallback the dialog accepts.
- **Import formulas refresh slowly.** Data a sheet pulls in by formula can be an hour old on air.
- **YouTube quota** is spent by the operator's own key; the audience spec gives the figures and
  the UI shows the spend.
- **A deliberate graphic-addressed `/update` to a message card changes it on air.** Documented
  semantics; the card is not a message intake and the integrator addressed it by name.
- **A deleted or renamed graphic** breaks a name-keyed binding today; unchanged in this run.

## Acceptance criteria

Child criteria are named "sheet AC-n" and "audience AC-n" and are inherited by id, not restated.

### AC-1: Arrival and graphic use are independent
Fields follow live content only through bindings; the inbox has no writer. One source with one
reader can feed bindings, the inbox, or both (sheet AC-8). Adapters write strings; a valid empty
read writes `""` and clears the field on air; a failed read writes nothing. Layer: Node contract
fixtures for a source with both consumers and the writer boundary; a database conformance case
for the `""` update row.

### AC-2: A list fills a field that takes lines
Twelve Sheet rows reach a ticker's items field as twelve lines in sheet order; a two-column tab
reaches a schedule as "time | show" lines; a standings tab fills headers and rows in one update;
a credits tab keeps headings, "Role:" groups and section breaks; an update while the ticker runs
continues the scroll. Layer: Node fixtures per adapter; a journey in `e2e/production-data.spec.ts`
against a stub sheet; the ticker's update behaviour pinned by its existing tests.

### AC-3: A field connects where it is
In the cue editor a list or value field offers "Connect…"; the operator sees the rendered result
and "Used by N cues" before saving; the saved connection affects only that graphic (sheet AC-2
for the Sheet case). On a published production it persists and moves the output without a new
publish. Layer: production-data journey; configured scenario for the published half
(`e2e/configured/production-data-key.spec.ts` extended).

### AC-4: Pasted rows fill a list without a Sheet
"Fill from… Paste rows" on a ticker, schedule, standings or credits field accepts cells pasted
from a spreadsheet or lines from a document, shows the result on the graphic with malformed rows
flagged, and saves into the cue. No account, no source record. Layer: Node adapter tests; a
journey in `e2e/production-data.spec.ts`.

### AC-5: A pasted feed becomes a list
An RSS 2.0 or Atom address shows its newest headlines within 10 s of pasting; markup, entities
and CDATA come out as plain text; an item repeated by id or link appears once; a failed fetch
keeps the last good list and says since when. Layer: Node fixtures captured from five public
feeds in Q; a journey against a stub feed; one real public feed in `evidence/`.

### AC-6: Feed reading is safe and polite
The route fetches only http and https addresses that resolve to public IP addresses and connects
to the address it checked; it checks every redirect the same way, stops at a size and a time cap,
returns parsed headlines only, sends conditional requests, serves one cached read per address to
every reader, and refuses a client or an address over its limit. Every server read of a feed goes
through it. Layer: Node test with a fake resolver and fetch, including a name that resolves
public then private; a configured scenario for the route.

### AC-7: The "Another system" card is visible
A published production shows the address, the key behind Reveal and an example generated from
the selected destinations. A push shows last receipt within 5 s and only moves saved connections.
Local setup explains publishing with Publish one press away. When C5 ships Pause, it holds
`/patch` and `/update` writes, its response says so, operator presses still air, and Resume
appends exactly the final values once. Layer: journey; configured scenarios for first push; C5's
database conformance cases.

### AC-8: Content has an honest source and explicit sharing
The Data view and the connected field name the actual source. Sharing a source with a second
graphic is an explicit choice; display renames do not change a source's identity. The data key is
one API source and promises no per-sender attribution or per-sender Pause. Layer: Node contracts;
journey.

### AC-9: Sources and content are discoverable
Setup always offers "Messages…" and "Data…"; the Data view lists the production's values, lists
and tables with their sources and the graphics using them; Playout shows active sources with
status and Pause; native content is labeled as local content with no freshness warning. The
default surface's vocabulary is sheet AC-9's. Layer: journey in `e2e/production-views.spec.ts`
and `e2e/production-data.spec.ts`; owner look in the pull request.

### AC-10: Every message intake respects selection and staging
Pasted text, Sheet message rows, join submissions and supported YouTube input enter the same
candidate workflow; no intake can write live values or command-log rows; only an operator stages
a cue; the data API is not a message intake. Layer: structural contracts (the audience backend
interface has no airing method, from C0; a source's inbox consumer has no writer, from C1) and a
cross-source journey.

### AC-11: Failure, empty content, override and ownership have distinct outcomes
For every source kind: a failed or malformed read holds the last good value; a valid empty read
clears its managed field; legacy missing paths and empty arrays keep their behaviour; a late read
cannot write after disconnect or handover. Pause stops a source's writes and Resume uses the last
applied snapshot. The Sheet reader's lease, override and staleness rules are sheet AC-5, AC-6 and
AC-7. Layer: Node reader-state tests with a fake clock per source kind; the sheet spec's layers
for the Sheet case.

### AC-12: Connections stay correct when names collide or change
Two graphics with a Name field do not connect to the same person unless selected; one score
connected to two boards updates both; a display rename of a source keeps the connection; a
deleted or replaced target is flagged, never silently redirected. A record saved by today's build
(data, bindings, datasets, an embedded Sheet block, no sources) loads and plays unchanged after
every phase that adds a persisted field. Layer: Node contracts; `scripts/show-fixture-compat.test.mjs`
over a fixture saved by the current build, added in C1 and extended by each later phase; the
production-data journey.

### AC-13: Starter rows fit the graphic and the selected tab
Generated starter rows carry the field's current content and the adapter's header where the
adapter has one. A tab link previews that tab; a missing `gid` shows the returned tab and asks the
operator to confirm it; one tab used by two graphics or by a graphic and the inbox has one
reader; a renamed tab keeps its identity; a missing tab holds the last good value and asks for
reconnection; malformed rows are diagnosed, not rearranged. Layer: Node fixtures per adapter; the
Sheet journey; one real-Sheet receipt in `evidence/` from C1.

### AC-14: A newcomer does each journey unaided
On a fresh production, without documentation, a student pastes rows onto a ticker, connects a
Sheet list and changes a line, connects a feed, and (with a prepared sender) pushes a score; the
message tasks are audience AC-7 and the Sheet task is sheet AC-12. Pass: four of five participants
complete each task unaided and answer the comprehension questions ("What happens when you press
Take?", "If someone edits the Sheet now, what changes on air?", "If someone adds a row, what
happens to the cue you prepared?") correctly; medians are reported without a time target. Layer:
one trial in C7 on the real build; the paste tasks also run early in Q on C0's build.

### AC-15: Prepared messages are independent of source changes
Audience AC-1, AC-2, AC-6 and AC-8: a prepared message airs exactly as approved; source edits,
deletions, reorderings, new arrivals, reconnects, a later binding attempt and a second cue on the
same graphic cannot change it; retries make no duplicate; prepared cues and used candidates
survive reload. Layer: as the audience spec names.

### AC-16: The main routes are proven before completion
In one rehearsal production: pasted rows, a Sheet ticker, schedule, standings and credits, a feed,
a pushed score, a guest row, pasted messages, Sheet messages, YouTube comments and live chat, and
a staged vote. PROGRAM is checked after source edit and delete, duplicate arrival, Pause,
disconnect, reload and operator-page closure. A ticker, a schedule, a standings board and credits
are watched updating on a real player (an OBS browser source at least). The unaided tasks of
AC-14 run. Each route is recorded separately; Twitch's existing behaviour is checked for
regression; a blocked YouTube route is recorded as unverified, never as a pass. Layer: C7's
receipts in `evidence/`.

## Phases

Run order and steps: parent spec, "Run order". Each content phase runs `/check`, its row of the
verification matrix below and `/queue-merge`, and adds its notes under `## Phase notes`. Allowed
`src` files are those named; a phase that needs another file records why in its notes.

**C0. Paste and safe staging** (AC-10 structural half, AC-15; audience AC-1/2/3/6/8). A feature
change landed before refactor phase 1; the phase 1 baseline then includes it. Fixes #1313 and
builds the message workflow the audience spec defines: "Fill from… Paste a message" on a
compatible body field, the named and remembered destination in Messages with the four Q&A cards
offered when none fits, one staging function in `src/control/` behind both doors, refusal of a
binding on a field that prepared cues use (the same function behind the Advanced binding rows),
the durable local inbox, the three optional candidate fields and their nullable columns, one
primary action per message, Setup always listing "Messages…" and "Data…", the Audience label
becoming Messages with routes unchanged. Files: `src/control/messageStaging.ts` (new),
`src/components/home/ProductionAudienceWorkspace.tsx`, `src/components/home/ProductionPage.tsx`
(the cue editor menu only), `src/components/home/ProductionDataPanel.tsx` (the binding refusal),
`src/components/home/ProductionSetupMenu.tsx`, `src/audience/localAudience.ts`,
`src/audience/audienceTypes.ts`, `src/audience/audienceData.ts` (the published provider's submit
path), `src/model/shows.ts` (additive `stagedFrom`, `messageTarget`), one additive migration
(`audience_submissions.external_id`, `source`, `reference`, nullable), tests.

**Q. Qualification and early trial** (sheet AC-3 measurement half; audience AC-7 paste tasks,
AC-9; AC-5 fixtures). No product code. In a session with network access and the owner's keys:
20 real Sheet edits timed to the export; an hour of 5-second export reads; five public feeds
captured as fixtures for C4 with notes on markup and conditional requests; one YouTube video and
one live stream with the operator's key, recording whether a key alone authorizes and what the
first page holds; an estimate of the server tick's cost on the hosting plan. The paste tasks of
audience AC-7 with three to five students on C0's build, with the comprehension questions.
Records in `evidence/` (`sheet-latency.md`, `sheet-endurance.md`, `feeds.md`, `youtube.md`,
`trial-paste.md`, `tick-cost-estimate.md`). Recorded before C1 starts; a Sheet miss stops the plan
at C1 and asks (D3).

**C1. Native lists and local Sheets** (AC-1/2/3/4/8/9/10/11/12/13; sheet AC-1/2/3 local/5/6/7/8/9).
After refactor 2+7 and 13a. The five adapters and starter rows; "Fill from… Paste rows";
"Connect… Google Sheet" with tab preview, "Used by N cues" and explicit sharing; `Show.sources`;
the browser reader with lease, states, Pause and the Playout sources line; the Data view as
overview with Advanced; the cue editor's connected-field state; the fixture compatibility test;
one real-Sheet receipt and the timed 20-edit run against the local program. Files:
`src/control/contentFormats.ts` (new), `src/control/sheetSource.ts` (new),
`src/control/productionDataSession.ts` (the writer entry), `src/model/shows.ts` (`sources`),
`src/components/home/CueEditor.tsx`, `src/components/home/ProductionPage.tsx`,
`src/components/home/ProductionDataWorkspace.tsx`, `src/components/home/ProductionDataPanel.tsx`,
`src/components/home/SourcesLine.tsx` (new), tests.

**C2. Published ownership** (AC-3/11/12; sheet AC-3 published/4/5/6/7). Depends on C1 only.
`bindings` and `sources` written to the row at once on connect, disconnect and Pause; the lease on
the published source; the server tick (`/api/data/tick`, a guarded segment of the data catch-all,
from a one-minute Vercel cron) reading published Sheet and feed sources with no live lease and
applying through `control_data_apply` with a source label; Pause on the row honoured by the tick;
cost measured for an hour and recorded; the real-Sheet run repeated against the published output
with the browser closed, latency reported as measured. Files: `src/control/hostedControl.ts`,
`src/control/sheetSource.ts`, `api/data/[...path].ts`, `api/_lib/dataTick.ts` (new, a helper, not
a function), one additive migration (`control_shows.sources`, read state), `vercel.json`, tests.

**C3. Sheet messages and YouTube** (AC-10/15; sheet AC-11; audience AC-4/8/9). Depends on C1
only; may run in a parallel session to C2. A message Sheet is a `sheet` source with `inbox: true`
through the rows adapter and the audience spec's identity rules; "Fill from… Pick a message" in
the cue editor; the two YouTube modes as `Show.sources` entries, as the audience spec defines
them; the unique index per show on `external_id`. Files: `src/audience/sheetMessages.ts` (new),
`src/audience/youtubeComments.ts` (new), `src/audience/youtubeChat.ts`, `src/audience/chatIntake.ts`,
`src/components/home/ProductionAudienceWorkspace.tsx`, `src/components/home/CueEditor.tsx`, one
additive migration, tests.

**C4. Feeds** (AC-5/6/11). The guarded feed route as a public segment of the data catch-all;
`feedSource` on the browser reader and the server tick; "Connect… News feed" on ticker fields.
Files: `api/_lib/feedFetch.ts` (new), `api/data/[...path].ts`, `src/control/feedSource.ts` (new),
`src/components/home/CueEditor.tsx`, tests; one real feed receipt.

**C5. "Another system" card and Pause** (AC-7/8). The card with the generated example and
receipt; "Connect… Another system" on a field; Pause by suppress-and-diff for `/patch` and a held
per-graphic map for `/update`, or the documented fallback; `DATA_API.md` and `/docs` lead with
`/patch`. Files: `src/components/home/ProductionDataWorkspace.tsx` (the card),
`src/components/home/CueEditor.tsx`, `api/data/[...path].ts`, one migration (`data_paused`,
`dispatched`, held updates), `docs/DATA_API.md`, tests.

**C6. Compatibility and docs** (sheet AC-10). New graphics are no longer offered the
graphic-level Sheet panel; existing blocks keep running; exports unchanged; `/docs` and
`docs/PRODUCTION_DATA_PLAN.md` carry the supersession. Files: `src/components/ControlPanel.tsx`,
docs, tests.

**C7. Combined rehearsal and trial** (AC-14/16; sheet AC-12; audience AC-5/7/9). The rehearsal
production of AC-16 on the local stack; the output-player check recorded by the owner; the one
full trial of AC-14; the join, presenter and vote walks (audience AC-5); the Twitch regression
check; blocking defects fixed and retested, others filed with scope. Files: fixes only; evidence.

Refactor steps between C0 and C1 (phases 1, 2+7, 13a) follow the parent spec's own matrix.

## Verification

Local targeted specs run through the browser queue; Node tests with `node --test`; configured
dispatch on the candidate ref as the parent §6 describes; every phase also runs `/check`,
`npm run depcruise`, `node scripts/gates.mjs run --changed origin/main` and the parent's scope
fence. A = assessment by a fresh read-only `wave-row` session with the `/so` brief.

| Phase | Node (`scripts/*.test.mjs`) | Offline journeys (`e2e/`) | Configured (`e2e/configured/`) | Database and provider | Assessment |
| --- | --- | --- | --- | --- | --- |
| C0 | `message-staging` (destinations: a scoreboard-only pool offers the cards; a bound body or name field is refused; a field with prepared cues refuses a binding; values by title; dedupe; Source and Reference never mapped); the backend interface has no airing method | `production-audience` (#1313 steps with the restore-the-fallback mutation; paste, prepare, Take asserting PROGRAM text; two cues on one card; a binding attempted on the card's Question field before and after preparing is refused with the card offer; reload keeps pasted rows, simulated rows gone; double press makes one cue; a retry after a failed save marks nothing used and makes no duplicate); `production-views` (Setup items) | `audience-live` (a pasted candidate on a published production reaches the inbox and the cue; the binding refusal on a published production) | migration self-check for the three nullable columns | A |
| Q | none | none | none | `evidence/sheet-latency.md`, `sheet-endurance.md`, `feeds.md`, `youtube.md`, `trial-paste.md`, `tick-cost-estimate.md` | owner reads the trial |
| C1 | `content-formats` (the fixtures of Formats), `sheet-source` (link parse, CSV, diff, states, lease with a fake clock, `""` on empty, the inbox consumer has no writer), `production-data-session` extended (the writer), `show-fixture-compat` (today's fixture loads and plays unchanged) | `production-data` (paste rows per adapter; connect a stub sheet; preview and "Used by"; status line; Pause; Disconnect; empty tab clears; equal title elsewhere untouched; a ± press on a connected value moves the shared value, asserted in a test that runs, since the existing one at line 749 is skipped under `skipOldEditor()`); `production-views` (Data overview, Advanced) | `production-data-key` (a connected list on a published production, browser reader through the operator door) | `production-data-migration` and `merge-patch-conformance` carry the `""`-over-a-list-path case; one real-Sheet receipt (AC-13, sheet AC-1); the timed 20-edit run against the local program (sheet AC-3) | A |
| C2 | `sheet-source` lease and handover rules | `production-data` (reload keeps sources) | `production-data-key` extended (bind after publish moves the output without republish; tick skips a leased source and reads an expired one; a value changed once written once; Pause written to the row holds the tick and shows after reload) | migration self-check; the tick's cost record; the closed-browser real-Sheet run in `evidence/` (sheet AC-4) | A |
| C3 | `sheet-messages` (hash identity: reorder, delete and add, identical rows, occurrence; a used candidate survives its row), `youtube-comments` and `youtube-chat` with recorded responses (first page kept, floor, errors); `show-fixture-compat` extended | `production-audience` (Sheet rows as candidates; a vanished row leaves an unused candidate and keeps a used one; Source and Reference hidden); `production-chat-intake` (comments mode, remembered source, key prompt on reload) | `audience-live` (imported candidate on a published production, dedupe by `external_id`) | migration self-check; provider receipts from Q | A |
| C4 | `feed-fetch` (fake resolver and fetch: public then private name, redirects, caps, conditional requests, cache), `feed-source`; `show-fixture-compat` extended | `production-data` (connect a stub feed; failed fetch keeps the list) | `feed-route` (new, small; `expected-run.json` raised) | one real feed receipt | A |
| C5 | `data-pause` contracts; `show-fixture-compat` extended | `production-data` (the card, the example, receipt) | `production-data-key` extended (push, Pause, push with a null, `/update` while paused, Resume emits the final values once) | conformance cases in the migration's self-check | A |
| C6 | a Node test that an existing graphic's `liveData` block still emits in its template output | `production-data` (no panel for new graphics; existing block still updates) | none | none | A |
| C7 | none | the full offline suite on CI | the whole configured suite | `evidence/rehearsal.md` per route; the owner's player check; `evidence/trial.md` | A+ |

Revalidation, evidence-only commits and mappings follow the parent §6. A configured spec added
raises `e2e/configured/expected-run.json` in the same pull request.

## Readiness

Before the run: the parent's run preflight, and the owner's agreement to the reconciled plan (the
four decisions in the synthesis §7) or his recorded changes. C0 needs no refactor phase before it.

Before C1: refactor phases 1, 2+7 and 13a checked PASS on `main`; Q recorded with the Sheet
measurement inside D3 or the plan stopped and asked; this spec and the audience spec agreed;
digests current and `work-spec.mjs status` clean.

Before C2: the tick's cost estimate from Q reviewed; the hosting plan's cron confirmed.

## Phase notes
