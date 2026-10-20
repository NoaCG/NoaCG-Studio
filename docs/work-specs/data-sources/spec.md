# Data sources: how outside data and audience input reach graphics

Authority: owner briefs, 2026-10-17 and agreement, 2026-10-18 (see `work.json`). **Agreed.**
Reconciled on 2026-10-17 from two independent whole-plan reviews (`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`,
the decision record with the reconciliation table). The owner agreed all four decisions on
2026-10-18; starting a run remains a separate instruction.
Research: `docs/research/2026-10-data-sources/README.md` and `second-opinion.md` beside it.
Parent: `docs/work-specs/production-page-refactor/spec.md` (the run order and the run preflight
are in its "Run order" and "Readiness" sections). Children: `docs/work-specs/sheet-data-flow/spec.md`
(Sheets) and `docs/work-specs/audience-flow/spec.md` (messages). This spec owns the shared model,
the format adapters, the continuation phases C0-C7 and track Q, and their verification.

Owner agreement, 2026-10-18: synthesis §7 **1 yes; 2 yes; 3 yes; 4 yes to both**
(run order; Sheet reader model; destination hygiene with `/update` allowed; opt-in key storage
and off-air YouTube provenance). The reconciled plan is agreed. Recording and landing this
planning update does not start `/plan-run production-page`; the owner explicitly said not to.

Owner refinement, 2026-10-19: incorporate the accepted custom-data refinements into this actual
plan. Whole-graphic connections and downloadable starter data are included in C1/C5, alongside
the earlier P1–P6 additions. The parent now includes all 22 steps in one project. This authorizes
planning edits only. The supplied 19 October Pixotope and broader competitor research now
sharpens source/output feedback and acceptance below; the final whole-plan second opinion
has been reconciled. The owner subsequently selected E4/E5/E7 as separate later child phases
of the same production-page programme; see [the extension contract](../production-page-refactor/extensions.md).
C0–C7 and Q below retain their scope and order. No run is opened by this update.

Owner decisions, 2026-10-20 ([receipt](../production-page-refactor/evidence/owner-decisions-2026-10-20.md)):
no owner thumbs-up gates; every phase passes on criteria an agent checks on a cloud worker or in
GitHub Actions. Q is agent-run with the owner's verified Google, Sheet and YouTube access, and each
record gates only the phase that needs it. C1 is split into C1a, C1b and C1c. C0 gains an operator
insert RPC; C2's tick reuses the existing `CRON_SECRET`, ships switched off and is switched on by
the agent within Pro's included usage; C4 names its shared cache. Human trials are trial kits the
owner runs when he can; real-studio outputs are the parent's final phase S.

## What the reconciliation changed

The owner's outcomes are fixed (`docs/research/2026-10-data-sources/external-review-prompt.md`,
"Product and owner outcomes"): data binding without paths or bindings; tickers, schedules,
standings and credits first; Sheets optional with starter content or native paste; the data API,
Sheets, feeds and YouTube as parts of one workflow; messages as another kind of content; a chosen
message from anywhere, edited, previewed, put in the rundown, Taken; later arrivals never replace
it; reliability. Against those, the reviews changed:

- **The home of the task is the existing control panel beneath the monitors.** One graphic-level
  "Connect data…" action opens source setup and reveals optional field connectors. "Fill from…"
  stays with its field; the graphic is the destination by construction. Messages (today's
  Audience view) and Data stay as views; no new workspace or store.
- **Paste lands first (C0)**, before the refactor, as a declared feature change.
- **Refactor phases 1, 2+7 and a props-only cue editor move precede C1**; the remaining refactors
  follow C7 in the same project. Final acceptance covers the completed build (parent phase 14
  in software, then the real studio in parent phase S).
- **Protection is destination hygiene**, enforced at both doors: a message destination has no
  binding on its body or name field, and no binding is added to a field that prepared cues use.
  The earlier field-level snapshot flag and `/update` protection are dropped.
- **A Sheet is read by the browser while a page is open, under a lease; a server tick about once
  a minute covers published sources with every page closed.** D1's server-only reading and D3's
  closed-page promise are revised; agreed by the owner on 2026-10-18.
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

## Non-goals of C0–C7

These are tranche boundaries, not a prohibition on the separately selected E4/E5/E7 and
E1–E3 phases later in the same programme. Their executable child specs own those additions.

- Data operating the show: no source takes, advances, clears or removes a graphic.
- Writing back to a Sheet or a feed; a formula or general mapping language.
- Required native X, SMS or WhatsApp connectors. Manually supplied messages are in scope.
- Private Sheets through Google sign-in or new platform OAuth without a reviewed access design.
- Automatic airing of a message or vote; a new renderer, command log or API wire format.
- A new general data store, a shared content workspace, a docked message tray, grid editors or
  a scoreboard preset in C0–C7.
- Server-side YouTube intake, new persistent Twitch support, JSON address mapping, repairing
  name-keyed bindings on a graphic rename.
- SVG import or custom-action authoring redesign, a general relational mapper, the installable
  election package and per-cue live candidate selection. Preserve existing SVG text, quiz,
  scoreboard and operator-control behavior. Election selection/package and foreign OGraf are
  now owned by E7 and E1–E3 after the baseline. A NoaCG OGraf server, native SDI/NDI outputs
  and Bridge packaging changes remain outside this programme.
- Excel Online and local TXT/CSV/JSON/XLSX source readers: tracked in
  [#1507](https://github.com/NoaCG/NoaCG-Studio/issues/1507). CSV starter downloads are in scope;
  live local-file reading is not. RSS/Atom remains C4.

## The model

Two words on the default surface:

| Word | What it does | Afterwards |
| --- | --- | --- |
| **Fill** | Copies content into this cue once: paste a message, pick a message, load a table row, paste rows into a list field | The cue owns the values; nothing outside changes them |
| **Connect** | Makes the reviewed fields of this graphic follow a Sheet tab/table, a news feed, another system or existing values | Every cue of the graphic follows; the dialog says "Used by N cues" |

Both live in the **cue editor**, keeping the current production-page layout and appearance.
The graphic header has one "Connect data…" action, not a large connection button beside every
input. It opens whole-graphic setup and reveals small field connectors for exceptions or a
deliberate subset. Done hides those editing controls without pausing data. Connected-source
indicators and meaningful stale/error states remain visible. A list or value field offers
"Fill from… Paste rows"; a message body offers "Fill from… Paste a message" and "… Pick a
message". Connected lists are read-only with "Edit in the source, or Disconnect to edit here";
scalar values retain Sheet D4 and the existing API write semantics. The Data view is an overview of the production's values,
lists and tables, their sources and the graphics using them, with Pause; paths, seed, Raw JSON
and per-field binding rows sit behind one Advanced disclosure and keep working. The Messages view
(today's Audience view) holds candidates and message sources. The Playout tab shows one line per
source with status and a working Pause where supported. Unsupported Pause explains the actual
fallback (for API intake, stop the sender); it never presents an ineffective button.
Setup always lists "Messages…" and "Data…"; the switcher keeps
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

## Operator feedback and behavior boundaries

Keep the current panel and compact text/icons alongside color. Selection, preview, staged values,
readiness, pending command and last confirmed output answer different questions; no single green
indicator stands for all of them. A staged cue edit waits for its declared Update/Take path;
Connect follows source updates under the source's policy. Show the intended target of actions.
Label a local simulation separately from actual target output; an accepted HTTP/command-log
write is not proof of rendered pixels. On connection loss, a retained image/status is visibly
last-confirmed/stale, or unknown where no confirmation exists. This uses existing observations;
it does not add a new renderer acknowledgement protocol or promise unavailable telemetry.

Organizational folders, All together batches, exclusive replacement groups and output
layers/channels stay distinct. Inspect batch children and report failures, uncertain results and
known layer collisions; do not collapse partial success to a green group. State the applicable
replacement policy. Composite preview is explicitly unavailable when unsupported; implementing
new composite rendering is not part of this refinement. Unknown vendor groups are not native
folders. No routine confirmation is added to Take, Out or score presses; existing destructive
action safeguards and legality checks remain.

Native machine groups and declared capabilities own behavior. A question/reveal region and an
independent clock do not need every combined state enumerated. Data may animate a changed number
inside the current state, but cannot implicitly Take, advance, reveal, clear or reset it. Profiles
label and arrange declared actions; they never implement their behavior. Clock state/time origin
uses the existing route; a new high-rate transport requires measured need, not a competitor claim.

C6 owns any bounded status/target presentation changes needed here, separately reviewed as product
behavior. Refactor phases only preserve them. C7 and parent phase 14 collect the software
evidence, the laptop helper scratch-output receipts, parent phase S the real-studio outputs, and
the trial kit human findings; unsupported foreign capabilities remain in the OGraf roadmap.

## Whole-graphic matching and starter data

From "Connect data…", choose an existing source or add a Sheet/Another system source. Select
the relevant tab/table or API subtree once, not every cell. Reuse one source reader for its
consumers. A workbook link does not silently subscribe to all its tabs.

Automatically **propose**, never silently apply, mappings for all compatible fields of the
selected graphic. Prefer an explicit mapping or generated field key tied to this graphic
version; otherwise reuse unique normalized title/path matches within the selected source.
Existing `matchTitle`/`suggestPath` and bulk binding behavior are the starting point. Never
guess ambiguous names, cross into another source/graphic, or replace existing bindings without
review. Show matched/unmatched counts, sample values, the rendered result and "Used by N cues".
One confirmation applies the reviewed mapping through the shared binding write path, including
prepared-message refusal. A source's first arrival never creates bindings. Per-field repair
uses this same path. Cancellation applies no mapping.

**Download data template** generates CSV from the custom native graphic's declared editable
fields and current/default content, without requiring a catalogue match. For scalar fields,
use `Field ID,Label,Value`: IDs map to the existing field contract; labels remain readable and
values editable. Parse all rows before applying; duplicate keys, unknown/incompatible fields
and missing required keys are diagnosed, not redirected. An explicitly empty Value is a valid
clear; a missing mapped row is an error and holds its last good value. Existing list formats
retain their adapter-specific starter rows and empty-list behavior. No new template engine,
manifest format or guessing of undeclared SVG controls is required.

The source configuration retains the selected graphic's expected field identities/types so
an incompatible graphic replacement requires review. `fN` identifies a field within that
graphic version; it is not a universal semantic identity. Editing a display label or reordering
keyed rows must not change destinations. A blank scalar file is missing mappings, not a command
to clear every field. CSV quoting, Unicode, leading zeros and literal formula-looking strings
must survive the supported Sheet round trip as text; starter instructions explain text import
where the spreadsheet would otherwise coerce values. A download does not create a Google Sheet
or require Google OAuth. Any additive source configuration follows the existing compatibility rule.

An authored bracket can expose distinct slot fields and use the generated template without
manual cell wiring. A richer `match_id,home_team,away_team,home_score,away_score` table requires
a supplied structured mapping/recipe; building a general bracket-table interpreter is outside
this run. Team names and row positions never imply bracket slots. Package-specific layouts and
the election package are separate work; the generic scalar and existing list routes are tested here.

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

Values (Name, Value rows into named values) stay supported for existing Sheets; generated custom
graphic templates also accept the keyed scalar format above. This scalar mapping is alongside
the five list/table adapters, not an inferred list format. Adapters write strings, never arrays;
a valid list read with no rows writes
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
minutes, slower when the feed asks, in a `feed_cache` table every serverless instance shares
(C4). The browser reader asks that route every 5 minutes while a page is open; the server tick
reads it otherwise. Browsers cannot read most feeds directly, so
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

The same source is reachable through the graphic's "Connect data…" action, with whole-graphic
mapping review and optional field repair. Show the acquisition boundary explicitly in docs and
the runnable example: external source → collector/connector → NoaCG `/patch` → saved fields.
The NoaCG API receives normalized values; it does not scrape sites itself. C5 supplies a prepared
sample sender using synthetic input, generated request/bindings for an unfamiliar custom graphic,
receipt feedback, a later correction, and a failed-read case that sends no replacement. Label
synthetic input honestly; no real election supplier or polling of arbitrary URLs is required.

**YouTube and join.** Browser-side with the operator's own key; candidates only. The audience spec
owns the details and the quota figures.

## Decisions, historical (answered 2026-10-17 and 2026-10-16)

The owner answered DS1-DS20 by accepting the recommendations. Each is kept here as a record;
"Now:" marks what the 2026-10-17 reconciliation supersedes. Reviews may challenge any of them.

- **DS1. The model and its words.** Answer: values, lists and tables, each from one source,
  fields connected by name. Now: graphic-level "Connect data…", automatic mapping suggestions
  with one confirmation, and optional field repair; names never connect anything by themselves.
- **DS2. The first Sheet shape.** Answer: lists first, values in the same phase, tables last; the
  operator picks the shape. Kept.
- **DS3. A row with several cells.** Answer: join with " | ". Now: per adapter (Formats above);
  tickers keep one cell per row or a tab-joined kicker.
- **DS4. RSS and Atom feeds.** Answer: titles, newest 20, 5 minutes, conditional requests,
  publisher backoff. Kept.
- **DS5. Who reads a feed for a local production.** Answer: a public route as a segment of an
  existing catch-all. Kept (the data catch-all; the function budget is nearly full,
  `docs/DEPLOYMENT.md`, and no phase adds a function file).
- **DS6. JSON addresses.** Answer: not in this run. Kept.
- **DS7. The data API on the data view.** Answer: "Another system" card with address, key,
  example and last receipt; a pushed name connects matching fields on first arrival. Now: the
  card stays; no first-push auto-binding, connections are explicit.
- **DS8. Pushing to a local production.** Answer: no; publishing stays the step. Kept.
- **DS9. Two sources writing one name.** Answer: later write wins; warn. Now: sources write
  source-scoped paths, so two sources cannot write one name; sharing is explicit (AC-8).
- **DS10. Where a field connects.** Answer: both the data view and the field. Now: the existing
  cue editor is home, through one graphic-level action and optional field controls; Data is an overview.
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

### AC-3: A graphic connects where it is
The existing cue editor offers one "Connect data…" action. The operator connects the whole
graphic or a subset, sees matched/unmatched fields, sample values, the rendered result
and "Used by N cues" before saving; the saved connection affects only that graphic (sheet AC-2
for the Sheet case). On a published production it persists and moves the output without a new
publish. Layer: production-data journey; configured scenario for the published half
(`e2e/configured/production-data-key.spec.ts` extended). With connection editing closed, manual
fields have no repeated connection buttons; existing source health remains visible. Done does
not pause an active connection. The current production-page appearance is preserved.

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
database conformance cases. A prepared sample sender demonstrates acquisition, normalization,
one confirmed whole-graphic mapping, receipt, update and correction for unfamiliar custom fields.
A failed acquisition sends no replacement; input never triggers Take, Continue, Reset or custom
machine events. The tested Pause behavior or stop-sender fallback is named explicitly.

### AC-8: Content has an honest source and explicit sharing
The Data view and the connected field name the actual source. Sharing a source with a second
graphic is an explicit choice; display renames do not change a source's identity. The data key is
one API source and promises no per-sender attribution or per-sender Pause. Layer: Node contracts;
journey.

### AC-9: Sources and content are discoverable
Setup always offers "Messages…" and "Data…"; the Data view lists the production's values, lists
and tables with their sources and the graphics using them; Playout shows active sources with
status and functional Pause or its explicit fallback; native content is labeled as local content
with no freshness warning. Source details show the active reader, effective cadence, last checked
and last changed. For Sheets, browser reads are about every five seconds and server reads about
once a minute when all pages close; other providers show their own effective cadence. The Sheet
server mode is continuity at slower cadence, not equivalent latency. The
default surface's vocabulary is sheet AC-9's. Layer: journey in `e2e/production-views.spec.ts`
and `e2e/production-data.spec.ts` (owner look: parent §9.1).

### AC-10: Every message intake respects selection and staging
Pasted text, Sheet message rows, join submissions and supported YouTube input enter the same
candidate workflow; no intake can write live values or command-log rows; only an operator stages
a cue; the data API is not a message intake. Layer: structural contracts (the audience backend
interface has no airing method, from C0; a source's inbox consumer has no writer, from C1) and a
cross-source journey.

### AC-11: Failure, empty content, override and ownership have distinct outcomes
For every source kind: a failed or malformed read holds the last good value; a valid empty list
or explicit empty scalar clears its managed field; a missing keyed scalar row holds its last good
value and reports an error; legacy missing paths and empty arrays keep their behaviour; a late read
cannot write after disconnect or handover, including an old owner's response arriving after the
new owner's newer write. A successful unchanged read is not stale merely because values did not
change. Last checked proves a transport read, not the age of an upstream event; provider timestamps
or sequences can support a separate later source-age capability, not a requirement for every Sheet.
Sheet manual scalar changes last until that source cell changes; Pause holds them and Resume
writes only cells changed while paused. Lists stay read-only while connected. API Pause uses
C5's suppress-and-diff/held-update policy or stop-sender fallback, not the Sheet policy. The
Sheet reader's lease, override and staleness rules are sheet AC-5, AC-6 and AC-7.
Layer: Node reader-state tests with a fake clock per source kind; the sheet spec's layers
for the Sheet case.

### AC-12: Connections stay correct when names collide or change
Two graphics with a Name field do not connect to the same person unless selected; one score
connected to two boards updates both; a display rename of a source keeps the connection; a
deleted or replaced target is flagged, never silently redirected. A record saved by today's build
(data, bindings, datasets, an embedded Sheet block, no sources) loads and plays unchanged after
every phase that adds a persisted field. Layer: Node contracts; `scripts/show-fixture-compat.test.mjs`
over a fixture saved by the current build, added in C1 and extended by each later phase; the
production-data journey.

### AC-13: Starter data fits the whole graphic and the selected tab
Generated starter rows carry the field's current content and the adapter's header where the
adapter has one. A tab link previews that tab; a missing `gid` shows the returned tab and asks the
operator to confirm it; one tab used by two graphics or by a graphic and the inbox has one
reader; a renamed tab keeps its identity; a missing tab holds the last good value and asks for
reconnection; malformed rows are diagnosed, not rearranged. Layer: Node fixtures per adapter; the
Sheet journey; one real-Sheet receipt in `evidence/` from C1. Additionally, download a custom
graphic's scalar CSV, import it into Sheets, edit values and connect the whole graphic in one
confirmation without manually mapping each cell. Use unfamiliar labels and a fixed-slot bracket
fixture; reorder rows and edit labels while preserving IDs, and verify only the intended slots
change. Diagnose duplicate/missing keys, incompatible replacements and ambiguous name matches;
cancel leaves bindings unchanged and existing bindings need explicit review before replacement.
Cover CSV escaping, Unicode and text-preserving import. Layer: Node mapping/round-trip tests,
the Sheet journey and the real-Sheet receipt. No rich bracket recipe is needed for this proof.

### AC-14: The newcomer journeys have a trial kit, and reported trials feed repairs
C7 lands a trial kit for unaided newcomers on a fresh production, without documentation: paste
rows onto a ticker, connect a Sheet list and change a line, connect a feed, and (with a prepared
sender) push a score; download and fill a custom graphic's starter data, connect it as a unit and
repair one unmatched field. The message tasks are audience AC-7's and the Sheet task sheet AC-12's.
The comprehension questions: "What happens when you press Take?", "If someone edits the Sheet
now, what changes on air?", "If someone adds a row, what happens to the cue you prepared?",
"Where did this value come from?", "Which target will this button affect?", "What is confirmed
on air, and what is only preview or pending?". Reading guide: four of five participants complete
each task unaided and answer correctly; medians without a time target. Pass: the kit holds these tasks, the questions, the reading guide and where findings go,
and every trial the owner reports is recorded against its build with each finding filed as an
issue. The trial's own result is reported, never required (owner, 2026-10-20, D).
Layer: C7's `evidence/trial-kit.md`; `evidence/trial.md` and the paste pilot's
`evidence/trial-paste.md` as trials are run.

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
are watched updating through the actual CasparCG/NoaCG Bridge route and an ordinary OBS/browser
source. Include the custom-graphic whole-Sheet and API examples of AC-7/13, manual scalar override,
reader handover, unchanged/changed cells, delayed responses and Pause/Resume. Record app revision,
Bridge/CasparCG versions, channels/layers, fonts/assets, Take/Update/Continue/Out where supported,
stacked graphics and restart/reconnect; observe the actual consumer if used in production.
Exercise a quiz reveal while its independent clock continues; a bound value update neither
resets the clock nor advances the quiz. Exercise All together with a failed child and conflicting
layers; child outcomes and replacement policy remain inspectable. Distinguish selection, staged
edits, pending commands and confirmed output; disconnect leaves no apparently fresh live image.
Record simulation versus target capture, and unknown status where confirmation is unavailable.
Expanded vMix/SPX qualification is later; existing regressions remain required. The unaided
tasks of AC-14 come from C7's trial kit and never hold this criterion. Each route is recorded
separately; Twitch's existing behaviour is checked for regression against recorded fixtures; a
blocked YouTube route is recorded as unverified, never as a pass. Layer (owner, 2026-10-20): C7's
software receipts in `evidence/` (local stack, fake Bridge, browser outputs) and parent phase 14's
reconciliation gate their phases; the laptop helper's scratch CasparCG/Bridge and OBS walks inform
repairs and never gate; the real-studio CasparCG/NoaCG Bridge and OBS/browser receipts are the
parent's phase S. An unavailable required route is unverified and blocks a production-ready
claim. C7 is an intermediate rehearsal; parent phase 14 and S record final acceptance after the
remaining refactors, reusing evidence only under the parent's material-input rules.

## Phases

Run order and steps: parent spec, "Run order". Each content phase runs `/check`, its row of the
verification matrix below and `/queue-merge`, and adds its notes to the run's phase notes (parent
"Phases"). Allowed
`src` files are those named; a phase that needs another file records why in its notes.

**C0. Paste and safe staging** (AC-10 structural half, AC-15; audience AC-1/2/3/6/8). A feature
change landed before refactor phase 1; the phase 1 baseline then includes it. Fixes #1313 and
builds the message workflow the audience spec defines: "Fill from… Paste a message" on a
compatible body field, the named and remembered destination in Messages with the four Q&A cards
offered when none fits, one staging function in `src/control/` behind both doors, refusal of a
binding on a field that prepared cues use (inside the one binding write path, so the Advanced
rows and the bulk write cannot bypass it), the durable local inbox, the three optional candidate
fields and their nullable columns, one primary action per message, Setup always listing
"Messages…" and "Data…", the Audience label becoming Messages with routes unchanged. Message
destinations keep excluding vote boards (`pollFieldMap(...) === null`,
`ProductionAudienceWorkspace.tsx` 607 at `331a98a91`): a vote board's Question field is not a
message body.

*Operator insert (2026-10-20).* On a published production, pasted messages go through a new
operator RPC, `audience_operator_add(p_slug, p_items)`, keyed on the control slug and resolved
by the existing `audience_owner_for_control` (0035), so the capability and kill-switch checks are
those of every other operator function. It does not reuse `audience_submit`: that is the viewer
door, gated on the join slug, an open round and the viewer caps, none of which applies to an
operator. Its own bound: at most 100 items per call, each clamped to `AUDIENCE_LIMITS` (author 40,
body 500), with optional `source`, `reference` and `external_id`. It inserts candidates only and
reaches neither the command log nor production values. C3's bulk import reuses it in batches.

*Local persistence.* C0 reverses `src/audience/localAudience.ts`'s documented decision to hold
nothing durable: operator-authored and imported candidates persist per production in browser
storage, because an inbox forgotten on reload is problem 4 above; simulated rows stay in memory,
which keeps that decision's reason (a rehearsal's simulated questions never accumulate). C0
rewrites the file's header to say so.

Files: `src/control/messageStaging.ts` (new), `src/components/home/ProductionAudienceWorkspace.tsx`,
`src/components/home/ProductionPage.tsx` (the cue editor menu, and the Audience-to-Messages
rename lines: the view-switcher label `tab === 'data' ? 'Data' : 'Audience'` and the comments
naming the view, at 4591-4595, 5516 and 5617-5638 of `331a98a91`; the `audience` route key stays),
`src/components/home/ProductionDataPanel.tsx` (the binding refusal),
`src/components/home/ProductionSetupMenu.tsx`, `src/audience/localAudience.ts`,
`src/audience/audienceTypes.ts`, `src/audience/audienceData.ts` (the published provider's submit
path), `src/model/shows.ts` (additive `stagedFrom`, `messageTarget`; the refusal inside
`setFieldBinding` and `setFieldBindings`), one additive migration
(`audience_submissions.external_id`, `source`, `reference`, nullable; `audience_operator_add`),
tests.

**Q. Qualification records, agent-run** (sheet AC-3 measurement half; audience AC-9; AC-5
fixtures; owner, 2026-10-20, E). No product code and no phase of its own. At the run's start the
coordinator launches one Q worker in a cloud session, beside C0, with the owner's access verified
on 2026-10-20 in the cloud environments, the local env file and Vercel:
`GOOGLE_SERVICE_ACCOUNT_JSON` (the service account signs in), `NOACG_TEST_SHEET_IDS` (six
owner-owned Sheets, comma-separated; the service account can read and write each, and each public
CSV export works) and `YOUTUBE_API_KEY`. Each record lands in
`docs/work-specs/data-sources/evidence/` through `/check` and `/queue-merge` (records ready
together land together, normally one PR before C1b) and is an acceptance item of the one phase it
gates:

| Record | What the agent does | Gates |
| --- | --- | --- |
| `sheet-latency.md` | 20 real edits it makes itself to a test Sheet through the Sheets API, each timed until the public CSV export shows it; slowest reported | C1b |
| `sheet-endurance.md` | one hour of 5-second export reads of a test Sheet: refusals, errors, latency spread | C1b |
| `tick-cost-estimate.md` | the server tick's projected monthly cost on Vercel Pro from measured read times and one invocation a minute, against included usage (`docs/VERCEL_PRO_NO_OVERAGE_PLAN.md`) | C2 |
| `youtube.md` | one public video's comments and one public 24/7 live stream's chat with the key alone: what the key authorizes, what the first page holds, pagination, units spent. If no live stream is reachable, the comments half is recorded and the live half retries later without holding C3 | C3 |
| `feeds.md` | five public RSS 2.0/Atom feeds captured as fixtures, with notes on markup and conditional requests | C4 |

The YouTube key is shared: Q spends at most 2,000 of its 10,000 daily units (comments cost 1 unit
a call; live chat at most 10 minutes at the 5-second floor, about 600 units). **D3 without a stop:**
if the measured edit latency misses ten seconds, C1b states the measured figure instead of that
promise and also offers the documented "Publish to the web" CSV; the coordinator records the
judgement and notifies the owner, and the run continues (owner, 2026-10-20, A). Twitch is not a Q
record: it stays a non-blocking owner-list item and C7 tests it against recorded fixtures. The
paste tasks of audience AC-7 become a non-blocking owner pilot: when C0 lands, the coordinator
adds them to the owner list, and `evidence/trial-paste.md` records the pilot if he runs it.

**C1a. Format adapters, Paste rows and starter data** (AC-2 adapter half, AC-4, AC-12 fixture
test, AC-13 starter and scalar half). After refactor 2+7 and 13a. Goal: an operator fills a ticker,
schedule, standings or credits field from pasted cells, and downloads starter data for any custom
native graphic, with no source record. The five adapters and their starter rows; custom scalar
CSV generation, parsing and keyed diagnostics; "Fill from… Paste rows"; the fixture compatibility
test over a fixture saved by today's build. Files: `src/control/contentFormats.ts` (new),
`src/components/home/CueEditor.tsx`, `src/model/productionData.ts` (shared parse helpers only),
`scripts/show-fixture-compat.test.mjs` (new) and its fixture, tests.

**C1b. Sheet source, reader and Connect data** (AC-1, AC-2 Sheet half, AC-3 local half, AC-8,
AC-10 inbox half, AC-11, AC-12 connection half, AC-13 mapping half; sheet AC-1 stub, AC-2, AC-5
browser-lease half, AC-6, AC-7 local half, AC-8). Published persistence, the tick's lease and
closed-page Pause are C2's. Needs Q's two Sheet records on main.
Goal: a graphic connects to a Sheet tab from the cue editor in one reviewed whole-graphic
confirmation, and one browser reader per source follows it under a lease. The graphic-level
"Connect data…" action with Google Sheet tab preview, a whole-graphic mapping proposal applied in
one confirmation through the shared binding write path (prepared-message refusal included),
optional field repair, "Used by N cues" and explicit sharing; `Show.sources`; the browser reader
with link parse, CSV, diff, states, the lease and Pause; the cue editor's connected-field state.
Refuse connecting a detected legacy embedded poller until C6 provides its explicit migration
choice. Files: `src/control/sheetSource.ts` (new), `src/model/productionData.ts` (reuse matching;
one reviewed binding path), `src/control/productionDataSession.ts` (the writer entry),
`src/model/shows.ts` (`sources`), `src/components/home/CueEditor.tsx`,
`src/components/home/ProductionPage.tsx`, tests.

**C1c. Data overview, sources line and real-Sheet receipts** (AC-9, AC-13 real-Sheet half; sheet
AC-1 real Sheet, AC-3 local program, AC-9). Goal: the operator sees every source with its active
reader, cadence, last checked and last changed, Pauses it from Playout, and the real-Sheet route
is proved. The Data view as overview with Advanced; the Playout sources line; one real-Sheet
receipt on a test Sheet; the timed 20-edit run against the local program, the agent editing the
test Sheet itself through the service account; the real custom scalar/fixed-slot receipt. Files:
`src/components/home/ProductionDataWorkspace.tsx`, `src/components/home/ProductionDataPanel.tsx`,
`src/components/home/SourcesLine.tsx` (new), `src/components/home/ProductionPage.tsx` (wiring),
evidence, tests.

**C2. Published ownership and the server tick** (AC-3/11/12; sheet AC-3 published/4/5/6/7).
Depends on C1c; needs Q's `tick-cost-estimate.md` on main. `bindings` and `sources` written to the
row at once on connect, disconnect and Pause; the lease on the published source, one RPC that
browser readers, the tick and later E4's agent all use; the server tick (`/api/data/tick`, a
guarded segment of the data catch-all, from a one-minute Vercel cron) reading published Sheet and
feed sources with no live lease and applying through `control_data_apply` with a source label;
Pause on the row honoured by the tick; the real-Sheet run repeated against the published output
with every page closed, latency reported as measured.

*The tick's secret, switch and cost (owner, 2026-10-20, H).* The tick reuses the `CRON_SECRET`
already set in Vercel Production; nobody creates or rotates it. Vercel sends that same Bearer
secret to every cron in the project, and the tick checks it exactly as `api/render/cleanup.ts`
does (`Authorization: Bearer <CRON_SECRET>`, else 401). `vercel.json` gains the cron
(`/api/data/tick`, `* * * * *`) and a `functions` entry for `api/data/[...path].ts` with
`maxDuration` 30: well inside the one-minute interval, so two ticks never overlap and a stuck read
is cut off; each read keeps its 10-second timeout and the tick starts no new read after 20
seconds. The tick ships behind a runtime switch, off: a setting beside the existing system
settings (`api/_lib/systemSettings.ts`) that reads as off on any error, the opposite of that
module's fail-open default, because its purpose is cost control, like a switched-off model route.
C2's gate runs where an agent can reach it (owner decision A): on the local stack, a configured
scenario turns the switch on in the local database and drives the tick handler with
`Authorization: Bearer <the stack's test CRON_SECRET>` (a wrong or missing Bearer gets 401), and
the cloud worker runs the closed-browser real-Sheet run against that local stack with the owner's
test Sheets; C2 passes on those. Production follow-ups are the coordinator's, never C2's gate, and
need its production access (parent §9.2): confirm from the Vercel runtime logs that the first
scheduled call was accepted (not 401), without reading the secret's value; turn the production
switch on; measure an hour's real cost from Vercel usage or observability while C3 builds; and
leave the switch on only if this month's usage so far plus the measured hourly cost for the rest of the
month stays within Pro's included usage (`docs/VERCEL_PRO_NO_OVERAGE_PLAN.md`); otherwise it
turns it off, records why and notifies the owner. Closed-page continuity is accepted as
"works while the switch is on, and says so when it is off" (sheet AC-4), so a cost decision never
undoes an accepted criterion; parent phase 14 and S record the switch's state and the month's
projection at the time. *Budget watch:* while the switch
is on, the coordinator checks Vercel usage daily (its morning summary); if the month's projection
would exceed included usage, it turns the tick off and notifies the owner. With the tick off,
published sources follow while a page is open and closed-page continuity is reported as
unavailable, never faked. Files: `src/control/hostedControl.ts`, `src/control/sheetSource.ts`,
`api/data/[...path].ts`, `api/_lib/dataTick.ts` (new, a helper, not a function),
`api/_lib/systemSettings.ts` (the switch), one additive migration (`control_shows.sources`, read
state, the lease RPC, and the switch's setting if the settings table needs a column),
`vercel.json`, tests.

**C3. Sheet messages and YouTube** (AC-10/15; sheet AC-11; audience AC-4/8/9). Depends on C1c;
scheduled after C2 to preserve one sequential project owner. Needs Q's `youtube.md` (at least its
comments half) on main. A message Sheet is a `sheet` source with `inbox: true` through the rows
adapter and the audience spec's identity rules; imported rows and comments reach the inbox through
C0's `audience_operator_add`, at most 100 per call; "Fill from… Pick a message" in the cue editor;
the two YouTube modes as `Show.sources` entries, as the audience spec defines them, with the quota
line and the estimated remaining live-chat runtime; the unique index per show on `external_id`.
Files: `src/audience/sheetMessages.ts` (new), `src/audience/youtubeComments.ts` (new),
`src/audience/youtubeChat.ts`, `src/audience/chatIntake.ts`,
`src/components/home/ProductionAudienceWorkspace.tsx`, `src/components/home/CueEditor.tsx`, one
additive migration, tests.

**C4. Feeds** (AC-5/6/11). Needs Q's `feeds.md` on main. The guarded feed route as a public
segment of the data catch-all; `feedSource` on the browser reader and the server tick; "Connect…
News feed" on ticker fields. *One cached read per address across serverless instances
(2026-10-20):* the shared store is a new `feed_cache` table in the existing Supabase database, one
row per normalized address (keyed by its hash) holding the parsed headlines, `ETag` and
`Last-Modified`, `fetched_at`, `next_allowed_at` (the 5-minute floor or the feed's own caching
headers, whichever is later) and a `claimed_until` lease. Through the existing service-role
client, the route serves a fresh row without fetching; on a stale row one instance takes the claim
with a conditional update and fetches with a conditional request while the others serve the stale
row with its age; a failed fetch keeps the last good row. Files: `api/_lib/feedFetch.ts` (new),
`api/data/[...path].ts`, `src/control/feedSource.ts` (new), `src/components/home/CueEditor.tsx`,
one additive migration (`feed_cache`), tests; one real feed receipt.

**C5. "Another system" card and Pause** (AC-3/7/8). The card with the generated
example, prepared sample sender and receipt; "Another system" in the same whole-graphic connection
flow and optional field controls; Pause by suppress-and-diff for `/patch` and a held
per-graphic map for `/update`, or the documented fallback; `DATA_API.md` and `/docs` lead with
`/patch`. Files: `src/components/home/ProductionDataWorkspace.tsx` (the card),
`src/components/home/CueEditor.tsx`, `api/data/[...path].ts`, one migration (`data_paused`,
`dispatched`, held updates), `docs/DATA_API.md`, a documented sample sender under `scripts/`, tests.

**C6. Compatibility, truthful operation and docs** (sheet AC-10; AC-9/16). New graphics are no longer offered the
graphic-level Sheet panel; existing blocks keep running; exports unchanged; `/docs` and
`docs/PRODUCTION_DATA_PLAN.md` carry the supersession. Connecting a legacy graphic via the new
flow requires an explicit migration choice so two pollers cannot silently write the same field.
Production Pause must not claim to stop an embedded poller. Reuse existing command/status and
folder-child results for the operator-feedback contract above; add only missing presentation of
target, pending/confirmed/unknown state, stale monitor and partial group results. Record which
observations the output route supplies. Product changes and their focused regression checks are
separate from refactor extractions; no new confirmation protocol or composite renderer is implied.
Files: `src/components/home/CueEditor.tsx`, `src/components/home/PlayoutMonitors.tsx`,
`src/components/home/CueRundown.tsx`, `src/components/home/FolderEditor.tsx`,
`src/components/home/ProductionPage.tsx` (presentation wiring only),
`src/components/editorFoundation/LiveDataControls.tsx`
(reconcile its current location before editing; the former `ControlPanel.tsx` has been removed),
docs, tests.

**C7. Combined technical rehearsal and the content trial kit** (AC-16 software half; AC-14 kit;
audience AC-5/9). The rehearsal production of AC-16 on the local stack with the fake Bridge and
browser outputs; the join, presenter and vote walks (audience AC-5); the Twitch regression check
against recorded fixtures (responses of the existing `src/audience/twitchChat.ts` reader captured
once and replayed; a live Twitch check is an owner-list item); YouTube against Q's recorded
responses plus at most one 10-minute live smoke (about 600 units of the shared key); the content
trial kit (`evidence/trial-kit.md`: the unaided tasks of AC-14, sheet AC-12 and audience AC-7, the
comprehension questions, the reading guide and where findings go). Blocking defects are fixed and
retested, others filed with scope. C7 PASS requires these software results and the kit landed.
The laptop helper then runs the scratch CasparCG/Bridge and OBS/browser-source walks on C7's merge
SHA (non-gating); the real-studio receipts are parent phase S. Files: fixes only; evidence.

Refactor steps between C0 and C1 (phases 1, 2+7, 13a) follow the parent spec's own matrix.

## Verification

Local targeted specs run through the browser queue; Node tests with `node --test`; configured
dispatch on the candidate ref as the parent §6 describes; every phase also runs `/check`,
`npm run depcruise`, `node scripts/gates.mjs run --changed origin/main` and the parent's scope
fence. A = assessment by a fresh read-only `wave-row` session with the `/so` brief. Every
criterion below is checked on a cloud worker or in GitHub Actions (owner, 2026-10-20, A); laptop
and owner items are listed separately and never hold a phase. Configured specs use stub Sheets,
feeds and provider responses that the test serves itself: `configured-suite.yml` carries no
Google or YouTube keys, and the real-provider runs are receipts made on the cloud worker.

| Phase | Node (`scripts/*.test.mjs`) | Offline journeys (`e2e/`) | Configured (`e2e/configured/`) | Database and provider | Assessment |
| --- | --- | --- | --- | --- | --- |
| C0 | `message-staging` (destinations: a scoreboard-only pool offers the cards; a vote board is never a destination; a bound body or name field is refused; a field with prepared cues refuses a binding through `setFieldBinding` and `setFieldBindings`; values by title; dedupe; Source and Reference never mapped); the backend interface has no airing method | `production-audience` (#1313 steps with the restore-the-fallback mutation; paste, prepare, Take asserting PROGRAM text; two cues on one card; a binding attempted on the card's Question field before and after preparing is refused with the card offer; reload keeps pasted rows, simulated rows gone; double press makes one cue; a retry after a failed save marks nothing used and makes no duplicate); `production-views` (Setup items, the Messages label) | `audience-live` (a pasted candidate on a published production reaches the inbox through `audience_operator_add` and the cue; a batch over 100 is refused; the binding refusal on a published production) | migration self-check for the three nullable columns and the operator RPC (control-slug capability, no command-log path) | A |
| Q | none | none | none | the five records in Q, each on main before the phase it gates | checked by that phase's checker |
| C1a | `content-formats` (the fixtures of Formats; scalar CSV generation, parsing and diagnostics), `show-fixture-compat` (today's fixture loads and plays unchanged) | `production-data` (paste rows per adapter; starter download per adapter and for a custom graphic) | none | `merge-patch-conformance` carries the `""`-over-a-list-path case | A |
| C1b | `sheet-source` (link parse, CSV, diff, states, lease with a fake clock, `""` on empty, the inbox consumer has no writer), `production-data-session` extended (the writer), mapping proposal and confirmation contracts | `production-data` (connect a stub sheet; whole-graphic preview, matches and "Used by"; repair and cancel; Pause; Disconnect; empty tab clears; twelve rows reach a ticker and a running scroll continues; equal title elsewhere untouched; one score on two boards updates both; a source's display rename keeps the connection; a deleted target is flagged; a ± press on a connected value moves the shared value, alongside the existing running test at line 741) | `production-data-key` (a connected list on a published production, browser reader through the operator door) | `production-data-migration` carries the `""` case | A |
| C1c | none new | `production-data` (status line, checked versus changed); `production-views` (Data overview, Advanced) | none | one real-Sheet receipt (AC-13, sheet AC-1); the timed 20-edit run against the local program, edits made by the agent (sheet AC-3); the custom scalar/fixed-slot receipt | A |
| C2 | `sheet-source` lease and handover rules; the tick's secret check (401 without the exact Bearer) and its fail-closed switch | `production-data` (reload keeps sources) | `production-data-key` extended (bind after publish moves the output without republish; tick skips a leased source and reads an expired one; a value changed once written once; Pause written to the row holds the tick and shows after reload) | migration self-check; the closed-browser real-Sheet run against the local stack (sheet AC-4); production follow-ups (first scheduled call in the Vercel logs, switch, cost hour) are the coordinator's, not this gate | A |
| C3 | `sheet-messages` (hash identity: reorder, delete and add, identical rows, occurrence; a used candidate survives its row), `youtube-comments` and `youtube-chat` with recorded responses (first page kept, floor, errors, the remaining-runtime estimate); `show-fixture-compat` extended | `production-audience` (Sheet rows as candidates; a vanished row leaves an unused candidate and keeps a used one; Source and Reference hidden); `production-chat-intake` (comments mode, remembered source, key prompt on reload, quota line) | `audience-live` (imported candidates through `audience_operator_add`, dedupe by `external_id`) | migration self-check; Q's provider receipts | A |
| C4 | `feed-fetch` (fake resolver and fetch: public then private name, redirects, caps, conditional requests, the `feed_cache` row and its claim), `feed-source`; `show-fixture-compat` extended | `production-data` (connect a stub feed; failed fetch keeps the list) | `feed-route` (new, small; `expected-run.json` raised; two concurrent readers make one upstream fetch) | migration self-check; one real feed receipt | A |
| C5 | `data-pause` contracts; `show-fixture-compat` extended | `production-data` (the card, the example, receipt) | `production-data-key` extended (push, Pause, push with a null, `/update` while paused, Resume emits the final values once) | conformance cases in the migration's self-check | A |
| C6 | a Node test that an existing graphic's `liveData` block still emits in its template output | `production-data` (no panel for new graphics; existing block still updates) | none | none | A |
| C7 | Twitch reader against recorded fixtures | the full offline suite on CI | the whole configured suite | `evidence/rehearsal.md` per route in software; `evidence/trial-kit.md`; at most one 10-minute YouTube live smoke | A+ |

Revalidation, evidence-only commits and mappings follow the parent §6. A configured spec added
raises `e2e/configured/expected-run.json` in the same pull request.

The existing matrix rows also require the following refinement coverage; these are part of
their named checks, not a second suite to rerun on unchanged inputs:

| Phase | Additional cases and receipt |
| --- | --- |
| C1a-C1c | Scalar template generation and Sheet round trip (C1a, C1c); scoped bulk suggestions; duplicate/missing IDs, ambiguous labels and incompatible types; row reorder and label edit; existing binding review, cancel and prepared-message refusal; header action/Done behavior (C1b); real custom scalar/fixed-slot fixture receipt (C1c) (AC-3/13) |
| C2 | Shared scalar override survives unchanged-cell handover and Pause/Resume; changed cell wins; delayed/missing data cannot replace a newer value; published bulk mapping persists without republish (AC-3/11, sheet AC-5/7) |
| C5 | Prepared collector/sender, unfamiliar fields, confirmed bulk mapping, receipt and correction; failed acquisition sends nothing; explicit API freeze policy; no lifecycle events (AC-7) |
| C6 | Both retained legacy poller and explicit migration; no competing writers or misleading Pause. Extend existing production-control, monitor and folder journeys for staged/live distinction, target labels, pending/confirmed/unknown status, stale image after disconnect and child failure/collision visibility (AC-9/16); reuse existing Node status/folder contracts, adding a case only where behavior changes |
| C7 | Custom Sheet/API examples; independent quiz/clock and group-failure scenarios, in software; the content trial kit. Scratch CasparCG/Bridge and OBS/browser receipts come from the laptop helper on C7's merge SHA (non-gating) |
| Parent 14 and S | 14: reconcile all content evidence against the completed build in software and rerun affected walks under parent §6. S: the real-studio CasparCG/Bridge and OBS/browser receipts of AC-16. Trials run from the kit are reported as run, never awaited |

## Readiness

The owner agreed the reconciled plan and all four synthesis §7 decisions on 2026-10-18, then
authorized incorporating the 19 October refinements and completed competitor findings. The
Argon review has been reconciled and the selected extensions now have separate executable
child specs under the parent. On 2026-10-20 the owner removed every owner gate but the parent's
final owner block, made Q agent-run and split C1. No extension changes the C0–C7 acceptance below.
Before a run: the parent's run preflight and a separate owner start instruction. C0 needs no
refactor phase before it. This update does not start the run.

Before C1a: refactor phases 1, 2+7 and 13a checked PASS on `main`; this spec and the audience
spec agreed; digests current and `work-spec.mjs status` structurally valid (open runtime
criteria are expected). Q's records gate the phases its table names.

The hosting plan's cron is settled: the account is on Vercel Pro, which runs one-minute cron
schedules, and `CRON_SECRET` is already set in Production (owner, 2026-10-20). Confirming the
first scheduled call in the production logs is the coordinator's C2 follow-up, never C2's gate.

## External-API connection slice: selected extension, outside C0–C7

The former later proposal is now selected by the owner for the same programme after baseline
close-out. [E4](../playout-external-connectors/spec.md) owns trusted JSON acquisition, credential
references, bounded reads, fencing and Pause. [E5](../playout-api-mapping/spec.md) owns sample-first
bounded mapping in Connect data. [E7](../playout-election-package/spec.md) owns stable cue-specific
candidate selection and the installable election package. Their exact order is in the parent's
[extension contract](../production-page-refactor/extensions.md). C5 remains the existing API
and prepared sender, not a generic scraper; the baseline no-JSON-mapping boundary is preserved.

Those children supersede the earlier proposal's unresolved provider/transform/identity questions:
the first required source is an authenticated JSON election replay server we build (E4.1), using the
existing production-data route; source JSON stays typed before the destination adapter. No secret
travels in a downloaded template or ordinary show export. Actual official-feed access remains a
separate qualification, never inferred from the replay provider. Private Sheets/OAuth, local
Excel/files (#1507), licensed sports providers and high-rate transport still need their own scope
and access decision. RSS/Atom remains C4. No implementation or run starts from this specification.

## Phase notes
