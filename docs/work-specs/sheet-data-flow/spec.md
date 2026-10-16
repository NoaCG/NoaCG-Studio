# Sheet data flow: a Google Sheet drives the graphics, with nothing to wire by hand

Authority: owner, 2026-10-16 (see `work.json`), who answered every decision under "Owner
decisions" the same day. Parent direction: `docs/GOALS.md` outcome 7 (one data model, a connector
design), which this spec pulls forward from "later". Architecture it builds on:
`docs/PRODUCTION_DATA_PLAN.md` and `docs/CLOUD_PLAYOUT.md` §7.

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

An operator pastes the ordinary share link of a Google Sheet into the production. The names in the
Sheet appear as the production's values, every graphic field with the same title connects itself,
and editing a cell changes the graphic within seconds, on air too, without a Take. Connecting needs
no code, no account, no path and no second place to look. Once the production is published, the
Sheet keeps feeding its output with every operator page closed.

## Non-goals

- Writing back to the Sheet. NoaCG reads it; the operator can still override in NoaCG.
- Sheets that are not shared by link (private sheets through Google sign-in). Later, if needed.
- Other providers (Excel Online, Airtable, sports feeds). The reader is one module so a second
  source can be added the same way later.
- Data operating the show. A Sheet never takes, advances or removes a graphic (GOALS outcome 7).
- A formula, formatting or expression language. Formatting stays in the Sheet or the template.
- Removing code that existing graphics carry: a template with a `liveData.ts` block keeps working.
- The audience flow. Its walk findings belong to its own spec.

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
  soon an edit is visible. Phase 1 measures both before the interval is fixed.

## Behaviour

**Connecting.** The production's data surface leads with one action, "Connect a Google Sheet". The
operator pastes the link they would send a colleague and picks what the sheet is: values (one name
and value per row) or, from phase 5, a list (one row per entry). NoaCG reads it at once and shows
what it found, or says exactly what to change ("This sheet is not shared. In Google Sheets: Share,
General access, Anyone with the link, Viewer.").

**A values sheet** (the first shape, D2): column A is a name, column B its value, one
row per value, a header row optional. `Home score | 3`. Each row becomes a production value with
that name. A name containing dots nests as today (`match.home.score`) for people who want that.

**A list sheet** (phase 5): a header row and one row per entry. It becomes a production table that
stays in sync with the Sheet, used exactly as tables are used today (load a row into a cue's
preview, then Take).

**Connecting fields.** When a sheet is connected, and whenever a graphic is added, every empty
field whose title matches exactly one value name connects itself (today's "Bind all by title",
done for the operator). The cue editor shows a connected field as its value with the source, for
example "3, from Sheet: Home score", and one control to change or disconnect it. Every field also
offers "Connect to…" with the list of names, so connecting never needs the Data tab. Matching keeps
letters of every language: today's rule (`normalize` in `model/productionData.ts`) drops everything
outside a-z and 0-9, so "Määrä" collides with "Mr" and a title written in Cyrillic never matches.

**While the show runs.** Each connected source has exactly one active reader (D1):

- **Unpublished:** the browser holding the production reads it while a page of that production is
  open, one tab at a time (a browser lock; a second tab shows the status and does not read).
- **Published:** the server reads it, and no browser does. The output keeps following the Sheet
  when every operator page is closed or reloading. Publishing hands the source to the server and
  unpublishing hands it back; at no moment do both read.

Either reader writes only the values that changed since its last good read, through the existing
production data path: the local tree when unpublished, the same server-side patch that
`PATCH /api/data/patch` uses when published. A failed read writes nothing, so the last good values
stay on air and no field is blanked.

**Status and Pause on the Playout tab.** One line per source says what it is doing: "Sheet: updated
4 s ago", "Sheet: paused", or "Sheet: can't read it (not shared) since 20:14" with the fix. When no
read has succeeded for three intervals (15 s), the line turns to a warning, "Sheet: last updated
40 s ago, values on air may be old", and each connected field in the cue editor carries the same
mark, until a read succeeds. Pause
and Resume sit on that line. Published, the status and the pause live on the server, so a reload
shows the true state and a pause holds with the page closed.

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
(last good read, failing since, the error). Graphics only ever see production values through their
existing bindings, so a template is unchanged and exports exactly as today.

One shared core in `src/control/` turns a source's latest read into a production-data patch: parse,
diff against the last good read, and the reader's states. It runs in Node, so the browser reader
and the server reader are two thin runners of the same code. A source kind supplies only "fetch and
parse to values or rows"; a second kind (another spreadsheet service, a JSON URL, a venue bridge)
adds that one function and nothing else. Phase 1 proves this with a second, test-only kind.

**The server reader** (derived, revisit in phase 3 on evidence): a scheduled tick reads every due,
unpaused source of every published production and writes through the database's existing data
patch. The tick runs only while at least one published source is active, so a quiet week costs
nothing. Candidates: Supabase `pg_cron` at seconds scale calling a route under the existing
`api/data/[...path].ts` catch-all (no new function against the Hobby cap of twelve), or the
database fetching directly with `pg_net`. Vercel cron is daily on this plan and cannot be the
clock. Phase 3 measures the run cost per active source per hour before it is switched on.

**Safety.** The server never fetches a URL the user typed: it stores the sheet id and tab and
builds the Google export URL itself. A sheet link grants reading the sheet, so the source record is
readable only by the production's operators, never by the output or the audience page.

**One vocabulary on the default surface:** values, names, connected, Sheet, tables. Seed, Raw
JSON, paths, Move numbers and per-field binding rows move behind one "Advanced" disclosure and keep
working there. Setup keeps one stable item for the data view whether or not a value exists.

**The old graphic-level Sheet panel** is no longer offered for new graphics; its place says that
Sheets connect on the production. A graphic that already carries the block keeps running it.

## Owner decisions (all answered 2026-10-16)

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

`ProductionPage.tsx` is the one file both this work and the production-page refactor would change.
The reader and its rules live in `src/control/` and are Node-tested; the page change is wiring
only. Build after the refactor's data phase (production-page phase 7, `productionDataSession.ts`)
has landed, or, if this runs first, the refactor plan is updated to account for it before its run.

## Acceptance criteria

### AC-1: A shared Sheet connects from its ordinary link
A production with no data accepts a Google Sheets share link ("Anyone with the link can view") and
lists the sheet's names and values within 10 seconds, with no "Publish to web" step, no account, and
no code. Layer: Node test for link parsing and CSV-to-values; a journey in
`e2e/production-data.spec.ts` against a stub sheet; one scenario run against a real Sheet.

### AC-2: Fields connect themselves
After connecting, each empty field whose title matches exactly one name is connected, in every
graphic in the production and in any graphic added later; a field matching two names stays
unconnected and the reason is shown. The cue editor shows each connected field's value and source
name. Titles and names with letters outside a-z ("Määrä", Cyrillic) match like any other. Layer:
Node test on the matching; the journey above.

### AC-3: A cell edit reaches the output without a Take
With a connected graphic on air, editing its cell changes the output within 10 seconds (D3),
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
started; the values on air stay as they were. With no good read for 15 seconds the line and the
connected fields show the data as stale, and the mark clears on the next good read. Reading resumes
on its own once the sheet answers. Layer: Node test on the reader's states; journey for the message.

### AC-7: The operator wins with one shared value
Live numbers ±, a Goal action and a typed value on a connected field change the shared production
value, and every graphic connected to it shows the change; nothing is written to the Sheet. The
change holds until that cell changes in the Sheet. Pause stops all writes from the source and keeps
the override, published also with the page closed; Resume writes only cells that changed while
paused. Disconnect returns the field to the cue. Layer: Node test; journey; configured suite for the
published pause.

### AC-8: Sources are separate from graphics
A connected source changes no graphic's template or export. The browser and server readers run one
shared core, and a second, test-only source kind runs through it by adding only its fetch and parse.
Layer: Node tests.

### AC-9: One vocabulary
The default data surface shows no "path", "seed", "Raw JSON" or "binding"; those tools sit behind
one Advanced disclosure and still work. Layer: journey; owner look in the pull request.

### AC-10: One way to connect a Sheet
New graphics are not offered the graphic-level Sheet panel; existing graphics with the block still
update. `/docs` describes the production-level flow. Layer: journey; Node test on an existing
block's template output.

### AC-11: A list sheet stays in sync as a table
A list sheet connected as a table updates its rows within the D3 target; loading a row into preview
works as today. Layer: Node test; journey.

### AC-12: A newcomer does it unaided
Someone who has not used the Data tab connects a Sheet to a scoreboard and puts a changed score on
air in under five minutes without reading documentation. Layer: scenario run, recorded in
`evidence/`.

## Phases

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
