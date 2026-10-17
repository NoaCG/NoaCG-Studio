# Sheet data flow: a Google Sheet drives the graphics, with nothing to wire by hand

Authority: owner, 2026-10-16 (see `work.json`), who answered D1-D4 the same day. Reconciled on
2026-10-17 from two independent reviews (`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`):
D2's order and the reader model are revised below, and **the revision of D1 and of D3's
closed-page promise is a decision for the owner**, not yet agreed. Parent direction:
`docs/GOALS.md` outcome 7. Architecture: `docs/PRODUCTION_DATA_PLAN.md`, `docs/CLOUD_PLAYOUT.md` §7.
Shared model, phases and verification: `docs/work-specs/data-sources/spec.md`.

## What the reconciliation changed

- The journey starts at the cue field ("Fill from… Paste rows" and "Connect… Google Sheet"),
  lists first, starter rows from the field's current content.
- Five small format adapters (data-sources "Formats") replace the join-all-cells rule and the
  six-shape wording; they write strings, and `""` when a valid read is empty.
- One reader per source by a lease: the browser reads every 5 seconds while any page of the
  production is open, published or not; a server tick about once a minute reads published sources
  with no live lease. Closed-page latency is reported as measured, never promised as 10 seconds.
- A connected list is read-only on the default surface (edit in the Sheet, or Disconnect). D4
  stays for values.
- A message Sheet uses the rows adapter and the audience spec's identity rules.

## Problem

A production can already hold live values and bind graphic fields to them, but a person who is
not a developer cannot get from "my list is in a Google Sheet" to "the ticker shows it". A walk
on 2026-10-16 (local dev server, signed out, a new production with one scoreboard) found:

1. **The production has no way to connect a Sheet.** The only Sheet option is the graphic
   editor's Control panel (`control/liveData.ts`): it pastes polling code into one graphic's
   JavaScript, needs "Publish to web", and bypasses production data. The plans call it frozen.
2. **Binding starts from an empty, unexplained concept.** The Data tab asks for a "path".
3. **Too many words for one idea:** production data, seed, Raw JSON, Move numbers, bindings,
   paths and tables share one screen.
4. **External data needs a published production and a developer.**
5. **One score has four controls** on the Playout tab.
6. **The menu changes under you.** "Add data source…" leaves Setup once a value exists.

What already works and is kept: a bound field shows its source and is locked in the cue editor;
values follow on air without a new Take; a name with spaces is a valid path; a ± press on a bound
field moves the shared value (`e2e/production-data.spec.ts` 749).

## Goal

An operator starts at a graphic's field, pastes rows or a Sheet tab's ordinary share link, sees
what will appear and saves. Lists follow on air; selected guest or message rows become cues.
Nothing requires paths, code or guessing field names. A published connection keeps following
when operator pages close, at the server tick's cadence.

## Non-goals

- Writing back to the Sheet. Private sheets through Google sign-in. Other providers (the reader
  is one module so a second kind can follow). Data operating the show. A formula or expression
  language. Removing code that existing graphics carry. A fetch proxy for Sheets (the export URL
  answers the browser directly; the proxy is the fallback if Google changes that).

## Measured (2026-10-16, Google's public sample sheet, from this machine)

- `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<tab>` answers a browser
  request from another origin: the first response allows it, redirects, and the target answers
  `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store`. About 1.2 s end to end.
  It needs only "Anyone with the link can view", not "Publish to web", and returns the cells as
  shown.
- `/gviz/tq?tqx=out:csv` is also readable cross-origin and faster (about 0.3 s), but guesses a
  type per column and blanks cells of the minority type. Not used.
- Not yet measured: how often Google lets one browser read the same sheet before refusing, and how
  soon an edit is visible. Track Q measures both before C1 fixes the interval.

## Behaviour

**Paste rows.** On a ticker, schedule, standings or credits field, "Fill from… Paste rows" takes
cells pasted from any spreadsheet or lines from a document, converts them through the field's
adapter, shows the result on the graphic with malformed rows flagged, and saves into the cue. No
account, no source record.

**Connecting.** On the same field, "Connect… Google Sheet": "Copy starter rows" (the field's
current content with the adapter's header) and "Download CSV"; a link box; the tab from the
link's `gid`, confirmed when absent; the parsed lines on the real graphic; "Used by N cues"; Save.
A failed read gives a concrete fix; a missing tab is never replaced by another. Reuse on a second
graphic is explicit ("Use existing content"). Equal titles elsewhere never connect.

**Lists.** One row is one line, through the adapter: tickers one cell (a kicker by the ticker's
own colon rule, or a second cell joined with a tab); schedules Time and Programme; standings a
header row into the headers field and body rows into the rows field, in one update; credits Role
and Name with `#` headings, `Role:` groups and blank-row section breaks. The preview shows the
exact lines; nothing is guessed from a global join.

**Values.** Name and Value rows into named values, for a scoreboard from a Sheet. Supported, not
promoted; scores use NoaCG's controls or the data API.

**Selected rows.** Guest tables load one chosen row into a cue (today's "Load data row"). Message
tables use the rows adapter with Name, Message and optional Source and Reference, and the audience
spec's selection, identity and staging rules. Refresh changes candidates, never prepared cues.

**While the show runs.** One active reader per source:

- Any page of the production, published or not, reads the tab every 5 seconds while it is open,
  one tab at a time under a browser lease; a second tab shows status and does not read.
- A published source with no live lease is read by the server tick about once a minute (C3).
  Publishing does not move reading to the server while a page is open; closing every page does.

Either reader diffs against its last good snapshot and writes only what changed, through the
production data path: the local tree when unpublished; the operator door the ± press already
uses when published from the browser; `control_data_apply` from the tick. A failed read writes
nothing. A valid read with no rows writes `""`, which clears the field with an ordinary update
row and shows "empty" on the sources line.

**Status and Pause on the Playout tab.** One line per source distinguishes last checked from
last changed: "Sheet: News - checked 3 s ago", "paused", "empty", or "can't read it (not shared)
since 20:14" with the fix. After three missed intervals the line and the connected fields show
the data as stale; the mark clears on the next good read. Pause and Resume sit on the line.
Published, status and Pause live on the row so a reload shows the true state and the tick
honours Pause.

**The operator wins (D4), for values.** A connected value is one shared production value: ±, a
Goal action and a typed value on the data surface change it, every graphic connected to it
follows, nothing is written to the Sheet, and the manual value holds until that cell changes.
Pause keeps the override; Resume writes only cells that changed while paused. For lists the
connected field is read-only on the default surface: "Connected to Sheet: News. Edit in the
Sheet, or Disconnect to edit here." Disconnect returns the field to the cue with its last value.

## Data sources, apart from the graphics

A source is production state, never graphic code: a `Show.sources` entry (kind, the sheet id and
tab, adapter, interval, paused, label, the fields it writes) and, once published, the row's copy
with its read state (last good read, failing since, the error, the lease). Graphics receive
ordinary field values through bindings or cue snapshots; a template is unchanged and exports
exactly as today.

**Sheet safety.** The reader stores the sheet id and tab and builds the export URL itself. A link
grants reading, so the source record is readable only by the production's operators, never by the
output page or the audience page. The output page never reads a Sheet and never writes.

**One vocabulary on the default surface:** Fill, Connect, Sheet, feed, Another system, paused,
checked, changed, empty. Seed, Raw JSON, paths, Move numbers and per-field binding rows sit behind
one Advanced disclosure and keep working.

**The old graphic-level Sheet panel** is no longer offered for new graphics (C6); its place says
that Sheets connect on the production. A graphic that already carries the block keeps running it.

## Historical owner decisions (answered 2026-10-16)

- **D1. Who reads the sheet.** Answer: the server for published productions, the browser for
  local ones, one active reader per source, status and Pause on Playout, last good values kept.
  **Proposed revision (2026-10-17, for the owner):** the browser leads while any page is open,
  published or not; the server tick covers published sources with no live lease. One reader per
  source, status, Pause and last-good hold are unchanged. Reason: no seconds-scale scheduler
  exists, Google's limits are unmeasured, and the teaching case has the page open.
- **D2. Sheet shapes.** Answer: values first, lists later, the operator picks. Superseded by
  DS2: lists first, values alongside, selected rows after; the operator still picks.
- **D3. How fresh.** Answer: an edit on screen within 10 seconds, read every 5 seconds, verified
  with real edits before anything promises it, server cost measured, a miss stops the plan.
  **Kept while a page is open.** Proposed revision: with every page closed the figure is the
  tick's, about a minute, reported as measured. The stop rule stays.
- **D4. One number, several buttons.** Answer: the ± and Goal buttons change the shared value;
  no write back; the manual value holds until the cell changes; Pause keeps it. Kept for values.

## Sequencing

Not a run of its own. In the data-sources schedule: Q measures; C1 builds paste rows, adapters,
starter rows, local connections and the browser reader; C2 the message Sheet; C3 the published
lease, tick and cost; C6 retires the graphic-level panel for new graphics; C7 rehearses. The
readers and their rules live in `src/control/` and are Node-tested; page changes wire them.

## Acceptance criteria

### AC-1: A shared Sheet connects from its ordinary link
A production accepts a share link ("Anyone with the link can view") on a list or value field and
previews the selected tab on the graphic within 10 seconds, with no "Publish to web", sign-in,
OAuth or code. Lists lead; values and selected rows stay available. Layer: Node link and CSV
tests; a journey in `e2e/production-data.spec.ts` against a stub sheet; one real-Sheet receipt.

### AC-2: Previewed connections only affect the selected destination
The preview shows the chosen graphic's fields and "Used by N cues"; saving persists that mapping;
equal titles elsewhere and new graphics never connect by themselves; reuse is explicit; the cue
editor names the source. Layer: Node contracts; the connection journey.

### AC-3: A cell edit reaches the output without a Take
With a connected graphic on air and a page open, a cell edit changes the output within 10
seconds, measured over at least 20 real edits with the slowest reported; nothing is taken,
advanced or removed. Unpublished it changes the local program; published it changes the published
output exactly once. Layer: Node diff test with a fake clock; configured scenario; the timed
real-Sheet run in `evidence/`.

### AC-4: Published, the output keeps following with no page open
With every operator page closed, an edited cell reaches the published output at the tick's
cadence, measured and recorded, and a reloaded page shows the row's true status and Pause.
Layer: configured scenario with the tick driven directly; the closed-browser real-Sheet run.

### AC-5: One active reader per source
A second tab reads nothing; a source with a live lease is skipped by the tick; an expired lease
is read once; a value changed once is written once; a late read after Disconnect writes nothing.
Layer: Node lease tests with a fake clock; configured handover scenario.

### AC-6: Failure, emptiness and staleness are visible and safe
An unshared, deleted or unreachable sheet shows the line with a plain fix and the time it
started; values on air stay. After 15 seconds the line and fields show stale; the mark clears on
the next good read; reading resumes by itself. A valid empty tab clears the field and says
"empty". Layer: Node reader-state tests; journey; the `""` conformance case.

### AC-7: The operator wins with one shared value
±, a Goal action and a typed value change the shared value; every connected graphic follows;
nothing is written to the Sheet; the change holds until the cell changes; Pause keeps it,
published also with the page closed; Resume writes only what changed while paused; Disconnect
returns a field to the cue. A connected list field is read-only and says where to edit. Layer:
Node test; journey; configured published Pause.

### AC-8: Sources are separate from graphics and use is explicit
A source changes no template or export. Browser and server readers share the parse, adapter and
diff core. The same tab can provide live content and message candidates through distinct writers
without fetching twice; no message import can use the live writer. Layer: Node contracts.

### AC-9: One vocabulary
The default surface shows no "path", "seed", "Raw JSON" or "binding"; they sit behind Advanced
and still work. Layer: journey; owner look.

### AC-10: One way to connect a Sheet
New graphics are not offered the graphic-level panel; existing graphics with the block still
update; `/docs` describes the production-level flow. Layer: journey; Node test on an existing
block's template output.

### AC-11: Tables stay fresh and selected rows stay put
A Sheet table refreshes its candidate rows at the reader's cadence; loading a guest row or
preparing a message copies that revision into a cue; later row changes, reorders and deletes
cannot rewrite it; identity and persistence follow audience AC-8. Layer: Node contracts; the
two-cue refresh journey.

### AC-12: A newcomer does it unaided
A newcomer pastes rows onto a ticker, then connects a Sheet list and puts a changed line on air,
without documentation; the message-Sheet task of audience AC-7 runs in the same trial. Pass:
four of five complete unaided and answer the comprehension questions; medians reported, no time
target. Layer: Q's trial; repeated in C7.

## Historical six-phase breakdown (not executable)

The original split, kept as a traceability record: 1 the shared core and the measurement; 2 local
productions; 3 published productions with the server copy and cost; 4 one vocabulary and one
shared value; 5 list sheets as live tables; 6 retiring the graphic-level panel and the newcomer
run. Its values-first order, global title matching and server-only published reading are
superseded above.

## Phase notes
