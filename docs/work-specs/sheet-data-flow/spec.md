# Sheet data flow: a Google Sheet drives the graphics, with nothing to wire by hand

Authority: owner, 2026-10-16 (see `work.json`), who answered D1-D4 the same day. Reconciled on
2026-10-17 from two independent reviews (`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`):
D2's order and the reader model are revised below. **The owner agreed the revisions of D1 and
of D3's closed-page promise on 2026-10-18** (synthesis §7 decision 2). Parent direction:
`docs/GOALS.md` outcome 7. Architecture: `docs/PRODUCTION_DATA_PLAN.md`, `docs/CLOUD_PLAYOUT.md` §7.
Shared model, format adapters, phases and verification: `docs/work-specs/data-sources/spec.md`.

Owner agreement, 2026-10-18: synthesis §7 **1 yes; 2 yes; 3 yes; 4 yes to both**
(run order; Sheet reader model; destination hygiene with `/update` allowed; opt-in key storage
and off-air YouTube provenance). The reconciled plan is agreed. Recording and landing this
planning update does not start `/plan-run production-page`; the owner explicitly said not to.

Owner refinement, 2026-10-19: whole-graphic connection with one reviewed mapping, downloadable
starter data for custom native graphics, and optional per-field repair are now included. The
data-sources spec owns the exact matching, identity and format rules. This is a planning update;
the final whole-plan review and separate start instruction remain pending.

## What the reconciliation changed here

The shared changes are listed once in the data-sources spec. For this document: the journey
starts in the existing cue editor with "Fill from… Paste rows" and one graphic-level
"Connect data…" action, lists and custom scalar templates supported
(D2 superseded); one reader per source by a lease, the browser leading while a page is open and a
server tick covering published sources with every page closed (D1 and D3's closed-page promise,
agreed revision, 2026-10-18); a connected list is read-only on the default surface, D4 staying for values.

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
values follow on air without a new Take; a name with spaces is a valid path. A ± press on a bound
field moves the shared value, but its test (`e2e/production-data.spec.ts` 749) is skipped under
`skipOldEditor()` and counts as no coverage; C1 asserts it in a test that runs.

## Goal

An operator selects a graphic, pastes rows or a Sheet tab's ordinary share link, sees
what will appear and saves a reviewed whole-graphic mapping once. Individual field connectors
handle exceptions. Lists follow on air; selected guest or message rows become cues.
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

**Connecting.** One "Connect data…" action in the graphic's existing control-panel header:
choose Google Sheet or reuse a source; download its data template or copy adapter starter rows;
paste a link; select the tab from its `gid`, confirmed when absent. Propose all compatible
field mappings within that source, preferring supplied keys and otherwise unique name matches.
Show matches needing attention, samples, the real graphic and "Used by N cues"; confirm once.
No field is connected merely because data arrived. Per-field connectors appear when editing
connections, with no large repeated buttons in ordinary operation. Done hides controls, not
source health, and does not Pause. A failed read gives a concrete fix; a missing tab is never replaced by another.
Reuse on a second graphic is explicit ("Use existing content"); feeding the inbox from the same
tab is the same source with `inbox` on. Equal titles elsewhere never connect.

**Lists** go through the field's adapter (data-sources "Formats"); the preview shows the exact
lines, and nothing is guessed from a global join.

**Values and downloadable templates.** Existing Name/Value rows remain supported. A custom
native graphic also gets a generated `Field ID,Label,Value` CSV from declared scalar fields and
current/default values, with no catalogue match. The data-sources spec's whole-graphic rules
govern keys, version compatibility, text-preserving import and diagnostics. A filled template
connects in one confirmation; label edits and row order do not change field identity. A missing
mapped row holds its last good value and reports an error; an explicit empty Value clears it.
List fields retain adapter-specific starter rows. This download can be imported into Sheets or
Excel; it does not create a Google document or add an Excel/local-file reader.

**Selected rows.** Guest tables load one chosen row into a cue (today's "Load data row"). Message
tables use the rows adapter with Name, Message and optional Source and Reference, and the audience
spec's selection, identity and staging rules. Refresh changes candidates, never prepared cues.

**While the show runs.** One active reader per source:

- Any page of the production, published or not, reads the tab every 5 seconds while it is open,
  one tab at a time under a browser lease; a second tab shows status and does not read.
- A published source with no live lease is read by the server tick about once a minute (C2).
  Publishing does not move reading to the server while a page is open; closing every page does.

Either reader diffs against its last good snapshot and writes only what changed, through the
production data path: the local tree when unpublished; the operator door the ± press already
uses when published from the browser; `control_data_apply` from the tick. A failed read writes
nothing. A valid list read with no rows writes `""`, which clears the field with an ordinary update
row and shows "empty" on the sources line. For keyed scalar templates a missing mapped row is
an error; only an explicit empty Value clears that scalar.

**Status and Pause on the Playout tab.** One line per source distinguishes last checked from
last changed: "Sheet: News - checked 3 s ago", "paused", "empty", or "can't read it (not shared)
since 20:14" with the fix. After three missed reads of the active reader (15 seconds in the
browser, about three minutes under the tick) the line and the connected fields show the data as
stale; the mark clears on the next good read. Pause and Resume sit on the line. Published, status
and Pause live on the row so a reload shows the true state and the tick honours Pause.

**The operator wins (D4), for values.** A connected value is one shared production value: ±, a
Goal action and a typed value on the data surface change it, every graphic connected to it
follows, nothing is written to the Sheet, and the manual value holds until that cell changes.
Pause keeps the override; Resume writes only cells that changed while paused. For lists the
connected field is read-only on the default surface: "Connected to Sheet: News. Edit in the
Sheet, or Disconnect to edit here." Disconnect returns the field to the cue with its last value.

## Data sources, apart from the graphics

A source is production state, never graphic code: a `Show.sources` entry as the data-sources
spec defines it (`id`, `kind`, `config` with the sheet id and tab, `paused`, `label`, `inbox`)
and, once published, the row's copy with its read state (last good read, failing since, the
error, the lease). The fields it feeds are the binding entries under its path prefix. Graphics
receive ordinary field values through bindings or cue snapshots; a template is unchanged and
exports exactly as today.

**Sheet safety.** The reader stores the sheet id and tab and builds the export URL itself. A link
grants reading, so the source record is readable only by the production's operators, never by the
output page or the audience page. The output page never reads a Sheet and never writes.

**One vocabulary on the default surface:** Fill, Connect, Sheet, feed, Another system, paused,
checked, changed, empty. Seed, Raw JSON, paths, Move numbers and per-field binding rows sit behind
one Advanced disclosure and keep working.

**The old graphic-level Sheet panel** is no longer offered for new graphics (C6); its place says
that Sheets connect on the production. A graphic that already carries the block keeps running it.
Before connecting that legacy graphic through the new flow, require an explicit migration choice
and verify only one writer controls the affected fields. Do not remove old code silently or
claim production Pause controls an embedded poller. C6 targets the current
`src/components/editorFoundation/LiveDataControls.tsx`, not the removed `ControlPanel.tsx`.

## Historical owner decisions (answered 2026-10-16)

- **D1. Who reads the sheet.** Answer: the server for published productions, the browser for
  local ones, one active reader per source, status and Pause on Playout, last good values kept.
  **Agreed revision (2026-10-18, synthesis §7 decision 2):** the browser leads while any page is
  open, published or not; the server tick covers published sources with no live lease. One reader
  per source, status, Pause and last-good hold are unchanged.
- **D2. Sheet shapes.** Answer: values first, lists later, the operator picks. Superseded by
  DS2: lists first, values alongside, selected rows after; the operator still picks.
- **D3. How fresh.** Answer: an edit on screen within 10 seconds, read every 5 seconds, verified
  with real edits before anything promises it, server cost measured, a miss stops the plan.
  **Kept while a page is open.** Agreed revision (2026-10-18, synthesis §7 decision 2): with every page
  closed the figure is the tick's, about a minute, reported as measured. The stop rule stays.
- **D4. One number, several buttons.** Answer: the ± and Goal buttons change the shared value;
  no write back; the manual value holds until the cell changes; Pause keeps it. Kept for values.

## Sequencing

Not a run of its own. In the data-sources schedule: Q measures the export; C1 builds paste rows,
starter rows, local connections, the browser reader and the local timed run; C2 the published
lease, tick, Pause and cost; C3 the message Sheet; C6 retires the graphic-level panel for new
graphics; C7 technically rehearses and prepares the trial; parent phase 14 runs the full trial
and final acceptance after all refactors. The readers and their rules live in `src/control/` and
are Node-tested; page changes wire them.

## Acceptance criteria

### AC-1: A shared Sheet connects from its ordinary link
A production accepts a share link ("Anyone with the link can view") through the graphic-level action and
previews the selected tab on the graphic within 10 seconds, with no "Publish to web", sign-in,
OAuth or code. Lists lead; values and selected rows stay available. Layer: Node link and CSV
tests; a journey in `e2e/production-data.spec.ts` against a stub sheet; one real-Sheet receipt
from C1.

### AC-2: Previewed connections only affect the selected destination
The preview shows the chosen graphic's fields, matched/unmatched counts, samples and "Used by N cues";
one confirmation persists the reviewed mapping, without one operation per field;
equal titles elsewhere and new graphics never connect by themselves; reuse is explicit; the cue
editor names the source. Existing bindings need explicit review before replacement, ambiguous
matches require repair, cancellation writes no mapping, and prepared-message destinations refuse
live binding through both bulk and individual doors. Layer: Node contracts; the connection journey.

### AC-3: A cell edit reaches the output without a Take
With a connected graphic on air and a page open, a cell edit changes the output within 10
seconds, measured over at least 20 real edits with the slowest reported; nothing is taken,
advanced or removed. Unpublished it changes the local program; published it changes the published
output exactly once. Layer: Q times 20 edits to the export; C1 runs the timed real-Sheet run
against the local program; C2 repeats it against the published output; a Node diff test with a
fake clock; the configured scenario.

### AC-4: Published, the output keeps following with no page open
With every operator page closed, an edited cell reaches the published output at the tick's
cadence, measured and recorded, and a reloaded page shows the row's true status and Pause.
Source details identify the active browser reader (about five seconds) or server reader (about
one minute). Closed-controller operation is continuity at slower cadence, not the open-page
ten-second promise. Handover updates this display without inventing a successful read.
Layer: configured scenario with the tick driven directly; the closed-browser real-Sheet run (C2).

### AC-5: One active reader per source
A second tab reads nothing; a source with a live lease is skipped by the tick; an expired lease
is read once; a value changed once is written once; a late read after Disconnect writes nothing.
An unchanged source cell after reader handover does not erase a shared manual override; a
changed cell does. Layer: Node lease tests with a fake clock; configured handover scenario.
Hold an old owner's request, transfer the lease, apply a newer value from the new owner, then
release the old response: it writes nothing and cannot replace the new owner's status/snapshot.

### AC-6: Failure, emptiness and staleness are visible and safe
An unshared, deleted or unreachable sheet shows the line with a plain fix and the time it
started; values on air stay. After three missed reads of the active reader (15 seconds in the
browser, about three minutes under the server tick) the line and fields show stale; the mark
clears on the next good read, including an unchanged valid response; reading resumes by itself.
Last checked and last changed are separate: unchanged content alone never makes a source stale.
A successful fetch does not prove the age of upstream events; provider event timestamps/sequences
are a separate later capability, not required for these Sheet reads. A valid empty list tab clears its field
and says "empty"; a missing keyed scalar row holds its value and reports an error. Layer: Node reader-state tests; journey; the `""` conformance case.

### AC-7: The operator wins with one shared value
±, a Goal action and a typed value change the shared value; every connected graphic follows;
nothing is written to the Sheet; the change holds until the cell changes; Pause keeps it,
published also with the page closed; Resume writes only what changed while paused; Disconnect
returns a field to the cue. A connected list field is read-only and says where to edit. Layer:
Node test; journey; the published Pause in the configured scenario (C2).

### AC-8: Sources are separate from graphics and use is explicit
A source changes no template or export. Browser and server readers share the parse, adapter and
diff core. One tab is one source with one reader whether it feeds bindings, the inbox, or both;
the inbox consumer has no writer. Layer: Node contracts.

### AC-9: One vocabulary
The default data surface shows no "path", "seed", "Raw JSON" or "binding"; they sit behind
Advanced and still work. Layer: journey; owner look.

### AC-10: One way to connect a Sheet
New graphics are not offered the graphic-level panel; existing graphics with the block still
update; `/docs` describes the production-level flow. Layer: journey; Node test on an existing
block's template output (C6). An explicit migration avoids competing old/new writers; production
Pause never claims to pause an unmigrated embedded reader. Cover the migrated and retained paths.

### AC-11: Tables stay fresh and selected rows stay put
A Sheet table refreshes its candidate rows at the reader's cadence; loading a guest row or
preparing a message copies that revision into a cue; later row changes, reorders and deletes
cannot rewrite it; identity and persistence follow audience AC-8. Layer: Node contracts; the
two-cue refresh journey (C3).

### AC-12: A newcomer does it unaided
A newcomer pastes rows onto a ticker, then connects a Sheet list and puts a changed line on air,
without documentation; also download a custom graphic's template, fill it and connect all its
fields once, then repair one unmatched field. The message-Sheet task of audience AC-7 runs in the same trial. Pass:
four of five complete unaided and answer the comprehension questions; medians reported, no time
target. Layer: final trial at parent phase 14 (`evidence/trial.md`), with its setup prepared in C7.

## Historical six-phase breakdown (not executable)

The original split, kept as a traceability record: 1 the shared core and the measurement; 2 local
productions; 3 published productions with the server copy and cost; 4 one vocabulary and one
shared value; 5 list sheets as live tables; 6 retiring the graphic-level panel and the newcomer
run. Its values-first order, global title matching and server-only published reading are
superseded above.

## Phase notes
