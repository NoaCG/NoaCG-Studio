# Sheet data flow: a Google Sheet drives the graphics, with nothing to wire by hand

Authority: owner, 2026-10-16 (see `work.json`). Draft for owner review: the decisions under
"Owner decisions" are open, each with a recommendation, and nothing is built until they are
answered. Parent direction: `docs/GOALS.md` outcome 7 (one data model, a connector design), which
this spec pulls forward from "later". Architecture it builds on: `docs/PRODUCTION_DATA_PLAN.md`
and `docs/CLOUD_PLAYOUT.md` §7.

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
and editing a cell changes the graphic within seconds, on air too, without a Take. Nothing about
it needs code, an account, a path, or a second place to look.

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

**Connecting.** The production's data surface leads with one action, "Connect a Google Sheet".
The operator pastes the link they would send a colleague. NoaCG reads it at once and shows what it
found, or says exactly what to change ("This sheet is not shared. In Google Sheets: Share, General
access, Anyone with the link, Viewer.").

**A values sheet** (recommended first shape, see D2): column A is a name, column B its value, one
row per value, a header row optional. `Home score | 3`. Each row becomes a production value with
that name. A name containing dots nests as today (`match.home.score`) for people who want that.

**A list sheet** (phase 4): a header row and one row per entry. It becomes a production table that
stays in sync with the Sheet, used exactly as tables are used today (load a row into a cue's
preview, then Take).

**Connecting fields.** When a sheet is connected, and whenever a graphic is added, every empty
field whose title matches exactly one value name connects itself (today's "Bind all by title",
done for the operator). The cue editor shows a connected field as its value with the source, for
example "3, from Sheet: Home score", and one control to change or disconnect it. Every field also
offers "Connect to…" with the list of names, so connecting never needs the Data tab.

**While the show runs.** The production reads the sheet on a short interval while its playout page
is open (D1). Only values that changed since the last read are written, through the same path a
typed value takes today: the local tree when unpublished, `PATCH /api/data/patch` when published,
never both. A status line on the Playout tab says what the source is doing: "Sheet: updated 4 s
ago", "Sheet: paused", or "Sheet: can't read it (not shared) since 20:14" with the fix. A failed
read keeps the last good values on air and never blanks a field.

**The operator wins.** Pause stops reading. Typing a value or pressing ± on a connected value
changes it until the Sheet's cell changes again, because only changed cells are written; this is
the existing rule that later writes win. Disconnect makes the field the cue's own again.

**One vocabulary on the default surface:** values, names, connected, Sheet, tables. Seed, Raw
JSON, paths, Move numbers and per-field binding rows move behind one "Advanced" disclosure and keep
working there. Setup keeps one stable item for the data view whether or not a value exists.

**The old graphic-level Sheet panel** is no longer offered for new graphics; its place says that
Sheets connect on the production. A graphic that already carries the block keeps running it.

## Owner decisions (open; recommendation first)

- **D1. Who reads the sheet.** Recommendation: the production's open playout page, in the browser,
  through one module in `src/control/` that writes through the existing data path. It works
  unpublished and without an account, costs no server time, and only runs while someone operates.
  This departs from `PRODUCTION_DATA_PLAN.md` §2.8 and §10 item 5 ("no in-app pollers"), whose
  reason was `liveData.ts` living inside template code, outside the log and invisible; this reader
  is visible, pausable and writes through the one log. Alternative: a server-side reader for
  published productions (the CLOUD_PLAYOUT §7 "experiment A"), which keeps feeding with every page
  closed but needs an account, a server job reading every few seconds per production (Vercel cron
  here is daily; `pg_cron` with `pg_net` is unproven at that rate), and does not work unpublished. Possible later: the server reader as a second runner of
  the same module.
- **D2. Sheet shapes.** Recommendation: values sheets first, list sheets as phase 4, the operator
  choosing the shape when connecting (two choices with a picture), never detected silently.
- **D3. How fresh.** Recommendation: a change in the Sheet is on screen within 10 seconds, read
  every 5 seconds unless phase 1's measurement forces slower. A scoreboard needing faster updates
  uses the ± controls.
- **D4. The four score controls.** Recommendation: once a field is connected, its Live numbers ±
  and Goal buttons change the connected value rather than the cue field (`PRODUCTION_DATA_PLAN.md`
  §2.9, still open), so there is one number with several buttons. Can be split out if it widens
  this plan too much.

## Sequencing

`ProductionPage.tsx` is the one file both this work and the production-page refactor would change.
The reader and its rules live in `src/control/` and are Node-tested; the page change is wiring
only. Build after the refactor's data phase (production-page phase 7, `productionDataSession.ts`)
has landed, or, if this runs first, the refactor plan is updated to account for it before its run.

## Acceptance criteria

### AC-1: A shared Sheet connects from its ordinary link
A production with no data accepts a Google Sheets share link ("Anyone with the link can view") and
lists the sheet's names and values within 10 seconds, with no "Publish to web" step, no account,
and no code. Layer: Node test for link parsing and CSV-to-values; a journey in
`e2e/production-data.spec.ts` against a stub sheet; one scenario run against a real Sheet.

### AC-2: Fields connect themselves
After connecting, each empty field whose title matches exactly one name is connected, in every
graphic in the production and in any graphic added later; a field matching two names stays
unconnected and the reason is shown. The cue editor shows each connected field's value and source
name. Layer: Node test on the matching; the journey above.

### AC-3: A cell edit reaches the output without a Take
With a connected graphic on air, editing its cell changes the output within the D3 target; nothing
is taken, advanced or removed by the sheet. Unpublished it changes the local program; published it
changes the published output once, not twice. Layer: Node test with a fake clock and fetch for
the change diff; configured suite for the published path; scenario run on a real Sheet.

### AC-4: Failure is visible and safe
An unshared, deleted or unreachable sheet shows the status line with a plain fix and the time it
started; the values on air stay as they were. Recovery resumes on its own. Layer: Node test on the
reader's states; journey for the message.

### AC-5: The operator wins
Pause stops all writes from the sheet. A typed or ± change to a connected value holds until that
cell changes in the Sheet. Disconnect returns the field to the cue. Layer: Node test; journey.

### AC-6: One vocabulary
The default data surface shows no "path", "seed", "Raw JSON" or "binding"; those tools sit behind
one Advanced disclosure and still work. Layer: journey; owner look in the pull request.

### AC-7: One way to connect a Sheet
New graphics are not offered the graphic-level Sheet panel; existing graphics with the block still
update. `/docs` describes the production-level flow. Layer: journey; Node test on an existing
block's template output.

### AC-8: A list sheet stays in sync as a table
A list sheet connected as a table updates its rows within the D3 target; loading a row into
preview works as today. Layer: Node test; journey.

### AC-9: A newcomer does it unaided
Someone who has not used the Data tab connects a Sheet to a scoreboard and puts a changed score on
air in under five minutes without reading documentation. Layer: scenario run, recorded in
`evidence/`.

## Phases

1. **The reader** (AC-1 reading half, AC-4): `src/control/sheetSource.ts`: link to export URL,
   CSV to values, change diff, states (reading, paused, failing since). Node tests. Measures
   Google's refusal rate and edit visibility; records the interval in Phase notes. No UI.
2. **Values sheets on the production** (AC-1, AC-2, AC-3, AC-5): connect, status line, pause,
   auto-connect by title, the cue editor's source and "Connect to…". Local and published paths.
3. **One vocabulary** (AC-6), plus the stable Setup item, and D4 if the owner keeps it here.
4. **List sheets as live tables** (AC-8).
5. **Retire the graphic-level panel and update `/docs`** (AC-7), then the newcomer run (AC-9).

## Phase notes
