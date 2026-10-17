# Sheet data flow: a Google Sheet drives the graphics, with nothing to wire by hand

Authority: owner, 2026-10-16 (see `work.json`), who answered every decision under "Owner
decisions" the same day. Parent direction: `docs/GOALS.md` outcome 7 (one data model, a connector
design), which this spec pulls forward from "later". Architecture it builds on:
`docs/PRODUCTION_DATA_PLAN.md` and `docs/CLOUD_PLAYOUT.md` §7.

## Current planning revision, 2026-10-17

The owner accepted the additional recommendations for inclusion and requested independent review
of all production-page phases. Current model and schedule: `docs/work-specs/data-sources/spec.md`.
This spec retains its agreed D1/D3/D4 baseline. The revised continuation stays draft until the
whole-plan review is reconciled and agreed; no implementation is authorized by this change.

The Sheet journey starts at a graphic or its content, prioritizes lists, and supplies starter
rows from current content. Select the format, see the rendered preview and save a scoped
connection. One tab holds one reusable set; connect each tab's link once. A CSV cannot discover
all tabs. Reading a link-shared tab needs no NoaCG account or Google OAuth connection; creating
one's own Sheet is still a Google account workflow. Native paste/edit needs neither.

A Sheet can also contain messages for selection. The same shared content workflow imports its
rows as candidates, previews the chosen broadcast version and stages a cue through the safe
message action. It must never treat new message rows as automatic live updates. Source kind and
use behavior are separate; audience AC-1/2/6/8 governs message staging and preservation.

The current behavior and criteria below reconcile the earlier global title-matching proposal.
Matching headers only suggests fields within the selected destination. Explicitly share content
with other graphics. Keep paths and bindings in Advanced, stable content navigation, the existing
production tree, formats and command log. No additional general data store is required.
D2's original values-first order is superseded by lists first, values alongside, then selectable
rows. The six historical phases at the end are a traceability record, not an executable queue.

## Problem

A production can already hold live values and bind graphic fields to them, but a person who is not
a developer cannot get from "my scores are in a Google Sheet" to "the scoreboard shows them". A
walk on 2026-10-16 (local dev server, signed out, fresh browser, a new production with one
scoreboard) found:

1. **The production has no way to connect a Sheet.** Setup › "Add data source…" opens the Data tab,
   which offers typed values, Raw JSON and CSV import, but no Sheet. The only Sheet option is in
   the graphic editor's Control panel (`control/liveData.ts`): it pastes polling code into one
   graphic's JavaScript, needs "Publish to web → CSV", and bypasses production data entirely. The
   two plans that describe it call it superseded and frozen.
2. **Binding starts from an empty, unexplained concept.** The Data tab asks for a "path" such as
   `show.title`. With no values yet, "Bind this graphic by title" answers "Nothing left to bind. No
   empty field has exactly one matching path", and that line stays after a manual bind succeeds.
3. **Too many words for one idea:** production data, seed, Reset to seed, Save as seed, Raw JSON,
   Move numbers, bindings, paths and tables share one screen. The owner said the same on
   2026-09-16 (`PRODUCTION_DATA_PLAN.md` §16).
4. **External data needs a published production and a developer.** The data key only appears
   after publishing, which needs an account, and then needs a program that calls the API. Signing
   in opens a separate cloud workspace, so local work does not come along.
5. **One score has four controls** on the Playout tab: Goal A, Live numbers ±, the cue field's ±,
   and the Data tab's ±. Once the field is bound, the cue field is read-only, but the others are
   not explained.
6. **The menu changes under you.** "Add data source…" leaves the Setup menu once a value exists
   and the Data tab takes its place.

What already works and is kept: a bound field shows its source and is locked in the cue editor;
values follow on air without a new Take; matching a name to a field title ignores case and
separators (`model/productionData.ts` `matchTitle`); a name with spaces is a valid single-segment
path.

## Goal

An operator starts with content or a graphic, pastes a Sheet tab's ordinary share link, sees
what will appear and saves the connection. Lists follow on air; selected guest or message rows
become prepared cue snapshots. Nothing requires paths, code or guessing field names. Published
live connections keep following when operator pages close; new messages remain candidates until
selected and taken. D3's freshness target measures availability, never automatic message airing.

## Non-goals

- Writing back to the Sheet. NoaCG reads it; the operator can still override in NoaCG.
- Sheets that are not shared by link (private sheets through Google sign-in). Later, if needed.
- Other providers (Excel Online, Airtable, sports feeds). The reader is one module so a second
  source can be added the same way later.
- Data operating the show. A Sheet never takes, advances or removes a graphic (GOALS outcome 7).
- A formula, formatting or expression language. Formatting stays in the Sheet or the template.
- Removing code that existing graphics carry: a template with a `liveData.ts` block keeps working.
- Join/chat provider integration lives in the message spec; Sheet message intake is shared scope.

## Measured (2026-10-16, Google's public sample sheet, from this machine)

- `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<tab>` answers a browser
  request from another origin: the first response allows it, redirects, and the target answers
  `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store`. About 1.2 s end to end.
  It needs only "Anyone with the link can view", not "Publish to web", and returns the cells as
  shown.
- `/gviz/tq?tqx=out:csv` is also readable cross-origin and faster (about 0.3 s), but guesses a
  type per column and blanks cells of the minority type, which breaks a column of mixed names and
  numbers. Not used.
- Not yet measured: how often Google lets one browser read the same sheet before refusing, and how
  soon an edit is visible. Phase 15 measures both before the interval is fixed.

## Behaviour

**Connecting.** From a graphic or shared content view, paste a Sheet link, confirm the selected
tab and format, preview the result, and save. Supply starter rows or CSV for ticker, schedule,
standings, credits, guest rows and messages. A failed read gives a concrete fix; a missing tab is
not silently replaced by another tab. Source/configuration details stay private to operators.

**Values.** One name and value per row; optional header. Existing nested paths remain available
in Advanced. Most everyday scores use NoaCG's controls or the API rather than requiring Sheets.

**Lists.** One item per row, converted using the chosen graphic format. A schedule uses Time and
Programme; standings need both row values and column headers; credits preserve section breaks.
The format is previewed, not guessed by globally joining all cells with pipes.

**Selected rows.** Guest tables load one chosen row into a cue. Message tables use Name/Message
and optional Source/Reference, with the same operator selection, editable broadcast text and
safe staging as pasted or YouTube messages. Refresh changes candidates, never prepared cues.

**Connecting fields.** Generated headers suggest mappings only inside the selected graphic.
The operator sees which fields and cues will be affected before saving. Equal titles elsewhere
never create connections. Stable identities survive renames; incompatible/deleted targets need
attention. Shared content can be connected explicitly to other graphics. Unicode labels remain
intact. A message field with a competing live binding needs a compatible unbound destination,
without disconnecting another cue's source. Existing explicit bindings stay compatible.

**While the show runs.** Each connected source has exactly one active reader (D1):

- **Unpublished:** the browser holding the production reads it while a page of that production is
  open, one tab at a time (a browser lock; a second tab shows the status and does not read).
- **Published:** the server reads it, and no browser does. The output keeps following the Sheet
  when every operator page is closed or reloading. Publishing hands the source to the server and
  unpublishing hands it back; at no moment do both read.

For live connections, either reader writes only values changed since its last good read, via the
production data path: the local tree when unpublished, the same server-side patch that
`PATCH /api/data/patch` uses when published. A failed read writes nothing, so the last good values
stay on air and no field is blanked.

**Status and Pause on the Playout tab.** One line per source distinguishes last checked from
last changed, with its state: "Sheet: paused", or "Sheet: can't read it (not shared) since 20:14"
with the fix. When no read has succeeded for three intervals (15 s), the line warns that values
on air may be old and gives the last successful check time. Each connected field carries the
same mark until a read succeeds. Pause and Resume sit on that line. Published, status and Pause
live on the server, so a reload shows the true state and Pause holds with the page closed.

**The operator wins (D4).** A connected value is one shared production value, whatever button
moves it. Live numbers ±, a Goal or other graphic action that adjusts it, and typing it on the
data surface all change that shared value, and every graphic connected to it follows. NoaCG never
writes back to the Sheet. A manual value holds until that cell changes in the Sheet, because a
reader writes only cells that changed since its last good read. Pause stops writes from the
source and keeps the override; on Resume only cells that changed while paused are written.
Disconnect makes the field the cue's own again.

## Data sources, apart from the graphics

A source is production state, never graphic code: a record on the production (`kind`, the sheet's
id and tab, shape, interval, paused) plus, once published, a server copy with its read state
(last good read, failing since, the error). Graphics receive ordinary field values through live
bindings or selected cue snapshots, so a template is unchanged and exports exactly as today.

Shared source management tracks identity, status, ownership and Pause. Sheets use a common
parse/diff core with thin browser and server runners. A live connection receives a production-data
writer; message intake receives only a candidate writer. Fetching one tab can serve both uses
without granting message candidates a live writer. Other source kinds may use push or
subscriptions rather than inheriting the same polling loop.

**The server reader.** Phase 15 qualifies the seconds-scale scheduler and records active/idle
cost, invocation duration and database load on the actual hosting plan. Phase 18 implements the
qualified choice and remeasures published behavior. A database scheduler can dispatch bounded
reads but cannot itself host an open chat connection. Earlier Hobby-function and daily-cron
assumptions are historical, not current limits. Do not claim zero idle cost without measuring it.

**Sheet safety.** The Sheet reader stores the sheet id and tab and builds the Google export URL
itself. A Sheet link grants reading the Sheet, so the source record is readable only by the
production's operators, never by the output or the audience page.

**One vocabulary on the default surface:** values, names, connected, Sheet, tables. Seed, Raw
JSON, paths, Move numbers and per-field binding rows move behind one "Advanced" disclosure and keep
working there. A stable content entry stays available whether or not content exists.

**The old graphic-level Sheet panel** is no longer offered for new graphics; its place says that
Sheets connect on the production. A graphic that already carries the block keeps running it.

## Historical owner decisions (answered 2026-10-16)

- **D1. Who reads the sheet (decided, owner 2026-10-16).** The server for published productions,
  so a connected Sheet keeps updating the output when the operator closes or reloads the playout
  page; the browser for local, unpublished productions. Changes go through the existing production
  data path, with one active reader per source. Connection status and Pause are on the Playout
  tab, and a failed read keeps the last good values. The connector stays separate from the
  graphics so other data sources use the same approach. The browser reader departs from
  `PRODUCTION_DATA_PLAN.md` §2.8 and §10 item 5 ("no in-app pollers"), whose reason was
  `liveData.ts` living inside template code, outside the log and invisible; this reader is
  visible, pausable, writes through the one data path, and only runs where no server can.
- **D2. Sheet shapes (decided, owner 2026-10-16).** Values sheets first, list sheets later (phase
  5), and the operator picks the shape when connecting; it is never detected silently.
- **D3. How fresh (decided, owner 2026-10-16).** Target: a Sheet edit is on screen within 10
  seconds, each source read every 5 seconds. It is verified with real Sheet edits before anything
  promises it (phase 1 locally, phase 3 published), and the server cost is measured. If the
  measurements miss it, the plan stops and asks rather than promising less in the UI. Data that
  is stale shows as stale, and a failed read keeps the last good values. A scoreboard needing
  faster updates uses the ± controls.
- **D4. One number, several buttons (decided, owner 2026-10-16, in this plan).** The ± and Goal
  buttons change the shared production value, updating every graphic connected to it. No write
  back to Google Sheets. The manual value holds until that cell changes in the Sheet; pausing the
  source keeps the override in place. Derived: the press already moves the shared value on a
  bound field (`model/productionData.ts`, the press boundary; `e2e/hosted-control.spec.ts` on the
  hosted page). This plan proves it for every press on the in-app Playout tab, fills any gap it
  finds, and makes the shared value visible on the buttons.


## Sequencing

Not a run of its own (owner, 2026-10-16). The original six-phase breakdown below is retained as
the agreed baseline, not a second executable schedule. Data-sources P5 proposes the current
phases 15-26 of `/plan-run production-page`, after the cleanup's fourteen phases: data in 15-22,
audience in 23-25, then the combined rehearsal. The cleanup moves the cue editor and press verbs,
so it stays first. The readers and their rules live in `src/control/` and are Node-tested; page
changes wire that behavior. No continuation starts until the data-sources readiness gate passes.
Message preparation uses the shared contracts in 16 and Sheet rows in 21, with safe staging in 23.

## Acceptance criteria

### AC-1: A shared Sheet connects from its ordinary link
A production accepts a Google Sheets share link ("Anyone with the link can view") and previews
its selected tab and content within 10 seconds, with no "Publish to web", NoaCG sign-in, Google
OAuth or code. Lists lead the journey; value and selected-row formats stay available. Creating
a Sheet is separate from reading one. Layer: Node link/CSV/format tests; a journey in
`e2e/production-data.spec.ts` against a stub sheet; one scenario run against a real Sheet.

### AC-2: Previewed connections only affect selected destinations
The selected tab and format preview the chosen graphic's fields. Saving persists that mapping;
equal titles in other graphics and newly added graphics never connect by themselves. Reuse on a
second graphic is explicit. Unicode labels, renames and stable identities behave as specified in
data AC-12. The cue editor names the source. Layer: Node contracts and connection journey.

### AC-3: A cell edit reaches the output without a Take
With a live-connected graphic on air, editing its cell changes the output within 10 seconds (D3),
measured over at least 20 real edits of a real Sheet with the slowest reported, not the average;
nothing is taken, advanced or removed by the sheet. Unpublished it changes the local program;
published it changes the published output exactly once. Layer: Node test with a fake clock and fetch
for the change diff; configured suite for the published path; the timed real-Sheet run in
`evidence/`.

### AC-4: Published, the output keeps following with no operator page open
With a published production on air, every operator page closed, an edited cell still reaches the
published output within the D3 target, and a reloaded page shows the server's true status and pause.
Layer: configured suite with the tick driven directly; scenario run on a real Sheet with the browser
closed.

### AC-5: One active reader per source
At no time do two readers write one source: a second tab of an unpublished production reads nothing,
publishing moves reading to the server and unpublishing moves it back, and a value changed once in
the Sheet is written once. Layer: Node test on the handover rules; configured suite for publish and
unpublish.

### AC-6: Failure and staleness are visible and safe
An unshared, deleted or unreachable sheet shows the status line with a plain fix and the time it
started; live values on air stay as they were. With no good read for 15 seconds the line and
connected fields show the data as stale, and the mark clears on the next good read. Reading resumes
on its own once the sheet answers. Layer: Node test on the reader's states; journey for the message.

### AC-7: The operator wins with one shared value
Live numbers ±, a Goal action and a typed value on a connected field change the shared production
value, and every graphic connected to it shows the change; nothing is written to the Sheet. The
change holds until that cell changes in the Sheet. Pause stops all writes from the source and keeps
the override, published also with the page closed; Resume writes only cells that changed while
paused. Disconnect returns the field to the cue. Layer: Node test; journey; configured suite for the
published pause.

### AC-8: Sources are separate from graphics and use is explicit
A source changes no template or export. Browser and server Sheet runners share the parse/diff
core; management supports other lifecycles without assuming all sources poll. The same tab can
provide live content and message candidates through distinct writers, without duplicate fetching.
No message import can use the live writer. Layer: Node contracts and handover cases.

### AC-9: One vocabulary
The default data surface shows no "path", "seed", "Raw JSON" or "binding"; those tools sit behind
one Advanced disclosure and still work. Layer: journey; owner look in the pull request.

### AC-10: One way to connect a Sheet
New graphics are not offered the graphic-level Sheet panel; existing graphics with the block still
update. `/docs` describes the production-level flow. Layer: journey; Node test on an existing
block's template output.

### AC-11: Tables stay fresh and selected rows stay put
A Sheet table updates candidate rows within D3; loading a guest row or staging a message copies
the selected revision into a cue. Later row changes, reorders and deletes cannot rewrite that
cue. Message import follows audience AC-8's identity, persistence and original/broadcast rules;
message staging follows audience AC-1/2/6. Layer: Node contracts and two-cue refresh journey.

### AC-12: A newcomer does it unaided
A newcomer connects a Sheet list to a ticker and puts a changed item on air in under five minutes
without documentation. Also run audience AC-7's Sheet-message task through the shared workflow.
Record time, errors, assistance and starting account state; automation alone is not usability
proof. Layer: phase 15 prototype and phase 26 recorded trials.

## Historical six-phase breakdown (not executable)

Use the current phases 15-26 in data-sources. This records the original implementation split;
its global matching and values-first details are superseded by the current criteria above.

1. **The shared core** (AC-1 reading half, AC-6 states, AC-8): the source contract, the Google
   Sheets kind (link to sheet id and tab, export CSV to values), the diff against the last good
   read, the reader states (reading, paused, stale, failing since), and a test-only second kind.
   Node tests. With a real Sheet, measures edit-to-read time over at least 20 edits and whether
   Google keeps answering one reader every 5 seconds for an hour; records both in `evidence/` and
   Phase notes. A miss on D3 stops the plan for the owner. No UI.
2. **Local productions** (AC-1, AC-2, AC-3 unpublished, AC-5 tabs, AC-7 unpublished): connect, the
   browser reader under a lock, the status line with Pause, auto-connect by title, the cue editor's
   source and "Connect to…".
3. **Published productions** (AC-3 published, AC-4, AC-5 handover, AC-6, AC-7 published): the
   server copy of a source and its read state (migration with row security), the scheduled tick
   that runs only while a published source is active, writes through the existing data patch, and
   the publish and unpublish handover. First measures the server cost of one active source for
   an hour (invocations, run time, database load) against the hosting plan's allowances and
   records it in `evidence/`; then repeats the timed real-Sheet run against the published output.
4. **One vocabulary and one shared value** (AC-7 presses, AC-9): the default surface's words,
   the stable Setup item, and every press on a connected field proven to move the shared value,
   with the buttons showing which value they move.
5. **List sheets as live tables** (AC-11), on both readers.
6. **Retire the graphic-level panel and update `/docs`** (AC-10), then the newcomer run (AC-12).

## Phase notes
