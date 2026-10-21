# Production-page run: phase notes

Newest first. Each phase's pull request adds what the next phase must allow for: the previous
verified `main` sha, the previous merge sha, the revert command, decisions taken, traps found,
and the check's findings (parent spec, "Phases"). This is an evidence file, so adding to it never
changes a spec's digest.

## Row 9, data-sources C2: published ownership and the server tick

- **Previous verified `main` sha:** `63edc790b8bf0dccee0b82c93fc776baaae39c5e` (row 8, C1c,
  #1585). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0097 is additive and stays applied:
  a reverted build no longer writes `control_shows.sources` or calls the lease functions (the
  column keeps its last value and nothing reads it), and its browser readers go back to the
  localStorage lease. Turn the tick off first if it is on
  (delete the `data_tick_until` system setting): a reverted `vercel.json` drops the cron anyway.
- **Q record used.** `docs/work-specs/data-sources/evidence/tick-cost-estimate.md`: its ceiling
  ($55.53 to $79.78 a month if every tick burned 30 s of CPU) is above the $20 credit, so the
  safety rests on four guards, each in code and each tested: the 10-second read timeout
  (`SHEET_TIMEOUT_MS`, `data-tick` "cut at 10 s"), no read started after 20 seconds
  (`NO_NEW_READ_MS`, "no read starts after 20 seconds"), `maxDuration` 30 for
  `api/data/[...path].ts` in `vercel.json`, and the switch's expiry, at most 48 hours ahead
  (`dataTickOnAt`, `data_tick_on()`; the record bounds a runaway 48-hour window at about $5). Its
  advice is also taken: reads run four at a time, and a tab over 1 MB is not read.
- **Decisions.**
  - The row carries `sources` (0097) beside `bindings`. Publish writes both; Connect, Disconnect
    and Pause write both again at once (`writePublishedSources`, from one effect in
    `ProductionPage.tsx` that skips the value the publish wrote), so a field connected after
    publishing moves the output with no new publish. A direct column write through the owner's
    row policy, as DS17 says: no RPC.
  - The published lease is on the row: `control_source_reads` holds the owner, claim, expiry,
    snapshot, content fingerprint and status of each published source. `control_source_lease` is
    the one lease function the browser readers (on the control slug), the tick (service role) and
    later E4 call; ttl 0 lets go. The write is `control_source_commit` (browser, through
    `control_data_patch_by_slug` with all its guards) or `control_source_tick_commit` (service
    role only, `control_data_apply` labelled `'sheet'`), both through `control_source_settle`,
    which checks the claim and writes under one row lock. That closes C1b's low note: an old
    owner's write in flight across a handover is refused by the database, not by a browser check.
    The write takes changed paths as text by path; a path the row does not bind yet is left out
    and keeps its earlier snapshot, so it is written once bound. That replaced C1b's
    "not a bound path" strip-and-retry in `productionDataSession.applySourcePatch`, whose published
    branch is gone (`holdServerTree` takes the server's answer instead).
  - `control_data_apply` accepts the label `'sheet'` (0071's body, one word wider): the tick's rows
    ride the ordinary 50-per-5-s cap, never the API's ingest budget.
  - The reader (`sheetSource.ts`) now talks to a `SheetLeaseDoor`: this browser's storage while
    unpublished (C1b's rules, unchanged and still tested), the row once published
    (`publishedLeaseDoor` in `hostedControl.ts`). The status rules (`missedStatus`, `readStatus`)
    and `changedTexts` are exported so the tick (`api/_lib/dataTick.ts`) uses the same core:
    read, adapters, diff against the shared snapshot, staleness after three misses. Only the
    panel's ftype to field-kind map is restated in the tick (the converter lives in a client
    module), with a comment naming `kindForField`.
  - `sheetSource.ts` and `contentFormats.ts` import each other by `.js`, because the function's
    emit keeps the specifier; the three Node tests that load them register a small `.js` to `.ts`
    resolve hook (the `output-reload` precedent). Their type imports moved off `model/packets` to
    `model/types` so the function's typecheck does not pull in browser storage code.
  - The tick (`/api/data/tick`, GET): 401 before anything else without the exact
    `Bearer <CRON_SECRET>` (as `api/render/cleanup.ts`), then the switch, read uncached and off on
    any error; on, it takes up to 50 due sources (published, Sheet, unpaused, no live lease, least
    recently read first), reads each under its own 30-second lease, writes what changed, keeps the
    status, lets the lease go, and records the run (start, wall-clock duration, each source's
    outcome) through `control_data_tick_record`, which keeps seven days.
  - The switch is the `data_tick_until` system setting, `{ "until": "<ISO>" }`; nothing writes it
    in this PR, so it ships off. `data_tick_on()` restates the rule in SQL for the sources line.
  - The sources line says `read by the server` when the tick holds the lease, and
    `closed-page reading off` while published with the switch off; the source details say about
    once a minute by the server, or that closed-page reading is off.
  - A page going away (`pagehide`) lets its leases go: the reload journey found a reloaded page
    showing "read in another tab" for up to 15 s, its own previous page's lease.
  - The advisor baseline gains the six findings the migration adds by design (deny-all on the two
    tables, the two slug functions callable by the client roles, like every `control_*` slug
    function). If the hosted advisor words one differently, post-land reports it once and the
    baseline is re-recorded.
  - Not done: a field bound after publishing to a path that already holds its value (explicit
    sharing through "Use existing content…") shows it at the next Take or Update, or when the cell
    next changes; the server writes update rows on a data change, not on a binding change. Every
    new connection's own source paths are written at once.
- **Extra files.** `src/components/home/ProductionPage.tsx` (the published door, the at-once write,
  `pagehide`), `src/components/home/SourcesLine.tsx` (the server reader and the switch-off words,
  sheet AC-4), `src/control/productionDataSession.ts` (the writer entry: `holdServerTree`, the
  published branch removed), `src/control/contentFormats.ts` (two import specifiers),
  `scripts/content-formats.test.mjs` and `scripts/show-fixture-compat.test.mjs` (the resolve hook),
  `scripts/production-data-session.test.mjs`, `supabase/advisor-baseline.json`.
- **Traps.**
  - A `Request` trims a header's trailing whitespace, so `Bearer <secret> ` reaches the handler as
    the exact Bearer; that is the platform, not the check.
  - The configured tick is driven in the Playwright process with the stack's test secret: the dev
    server carries no `CRON_SECRET`, and only this process can answer the tick's own Sheet fetch.
  - The receipt drivers ran from the scratchpad with their own Playwright config: a broader queue
    job refuses an untracked spec in the tree and a second admission on the same source state.

## Row 8, data-sources C1c: Data overview, sources line, real-Sheet receipts

- **Previous verified `main` sha:** `ebbdc78` (row 7, C1b, #1578). This branch starts from
  `b9a32b8` (#1582, two hosted-latency fixes on top of it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration and no persisted format change:
  the overview, the Advanced disclosure and the sources line are presentation only, and the reader
  change only stops one duplicate report. A reverted build shows C1b's line in the cue editor again.
- **Receipts** (`docs/work-specs/data-sources/evidence/`), made in this cloud session against the
  owner's test Sheets 3 to 5 through the service account, the app's offline dev server and
  Playwright Chromium through the session's egress proxy; no Sheet ID is recorded:
  - `sheet-real-receipt.md` (data AC-13 real-Sheet half, sheet AC-1): a non-first tab previews on
    the ticker 871 ms after Read; starter rows round-trip; a renamed tab keeps reading; a link with
    no tab asks; a deleted tab says so with the fix, goes stale, and the values on air hold.
  - `sheet-timed-local.md` (sheet AC-3 local program): 20 of 20 API edits on the local PROGRAM
    within 10 s, median 3.2 s, slowest 5.25 s; no new entrance, nothing taken, advanced or removed.
  - `sheet-custom-slots.md` (AC-13 custom scalar part): a nine-slot custom bracket's own data
    template, imported as text, reordered and relabelled, connects every slot by Field ID in one
    confirmation; text is kept exactly (`007`, `=1+1`, quotes, Unicode, an emoji); one cell changes
    one slot; duplicated and missing keys are diagnosed and held.
  The receipt drivers were scratch Playwright specs run through the job queue and are not
  committed: the evidence files carry the method. The receipts' tabs were deleted afterwards.
- **Decisions.**
  - The Data view opens on an overview (`DataOverview` in `ProductionDataPanel.tsx`): one block per
    source (Sheet name, checked and changed, who reads it and how often, the graphics following it,
    Pause) with its values by the Sheet's own names, then "Local content" with no freshness words,
    since nothing reads it. Scalars are typed into there (the same deferred box and one write as
    Advanced, so D4's typed value is on the default surface); a list shows its line count and is
    edited in the Sheet or under Advanced. Each table says which graphics load it.
  - Everything that speaks of paths, the seed, Raw JSON or bindings sits behind one closed
    `<details>` "Advanced" (`data-advanced`, toggle `data-advanced-toggle`), unchanged inside. The
    data key stays in the header: it is the API source's credential, not a path tool. The Tables
    copy no longer says "bind".
  - `SourcesLine.tsx` owns the line's words (`statusWords`: checked N s ago · changed N s ago,
    paused, empty, the failure since a time; `readerWords`: this page or another tab, about every
    5 s) and Pause (`toggleSourcePause`, which reads at once on Resume). It renders one line per
    source of the production at the top of the Playout control area, whichever cue is selected,
    and nothing without sources (so the playout baselines, which have none, do not move). The
    overview reuses the same words.
  - The cue editor keeps only what belongs to the graphic: a connected field it no longer has,
    with Disconnect. The source's own health moved to the line, so it is not drawn twice.
  - Not done: a sticky line. At 720 px tall the control area can scroll the line out of sight
    (Connect left it 42 px scrolled once); the connected-field marks still say stale. Sticky would
    cover the editor while scrolling and needs a stylesheet change outside this phase.
- **Extra files.** `src/components/home/CueEditor.tsx` (the line moved out of it; the phase text
  says C1c moves it). `src/control/sheetSource.ts` and `scripts/sheet-source.test.mjs`: the custom
  slot receipt found a duplicated Field ID reported twice, the second time as missing; it is now
  reported once (`SheetContent.doubled`), mutation-tested. `e2e/production-audience.spec.ts` and
  `e2e/configured/production-data-key-dispatch.spec.ts` open Advanced before using the per-field
  table and the add-a-value row. `src/control/cueData.ts` exports `datasetMatches`, the cue loader's own
  column test, so a table's "Loads into" can never disagree with what a cue offers.
- **`/check` review fixes.** Only graphics still in the pool are named as showing or following a
  value (bindings outlive a removed graphic); a data template's Field ID reads as the field's title;
  a Sheet's lines stay a list when emptied; the overview shows a read's problems; values a
  disconnected Sheet left in the tree are not called local; a source not read yet says it waits for
  the first read. Not taken: a `FieldControl` box on the overview (the overview mirrors the
  Advanced rows, which are tree values, not graphic fields); generalising `doubled` into a map of
  withheld leaves (one cause today); memoising the overview's scans (tens of values).
- **Traps.**
  - The graphic's fields sit in a shadow root: `document.querySelector('#f0')` in an iframe finds
    nothing, a Playwright locator does. Time a field with a locator polled in Node.
  - `.pd-bind-graphic h4` now also matches the overview's blocks; scope helpers to
    `production-bindings`.
  - Cloud browser runs go through `node scripts/jobs.mjs add`, and a queued job does not inherit
    the environment of the `add` call that queued it when another job started the runner: write
    outputs to a fixed path.
  - A commit message here carries no `Co-Authored-By` trailer (the command guard refuses it).

## Row 7, data-sources C1b: Sheet source, reader, Connect data

- **Previous verified `main` sha:** `1e81bfed1cd7345de84c3c160c4570a906e82bba` (row 6, C1a, #1576).
  This branch starts from `95078eb` (#1577, an evidence-only Phase 2 acceptance on top of it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration. `Show.sources` is additive
  optional: a reverted build keeps the field on the record untouched and no longer reads it; the
  connected fields stay bound to their `sheet.<id>.…` paths and hold their last value (nothing
  writes them). Browser leases live under `spx-gfx-sheet-reader:<production>:<source>` in
  localStorage and are ignored by a reverted build.
- **Q records used.** `sheet-latency.md`: an edit is in the export within 441 to 1,011 ms, so the
  ten-second wording stands and no "Publish to the web" fallback is needed for freshness (it is
  still accepted as a link). `sheet-endurance.md`: 720 of 720 five-second reads answered, slowest
  855 ms. Hence `SHEET_READ_MS` 5 s, `SHEET_TIMEOUT_MS` 10 s, stale after 3 misses (15 s), lease
  15 s; an edit reaches the graphic in about 5.9 s at worst while a page is open.
- **Decisions.**
  - `src/control/sheetSource.ts` is the whole reader, pure and Node-tested with a fake clock:
    link parse (share, tab, export and published links; the export address is built from the
    stored id and tab, never fetched as pasted), CSV through `model/csv.ts`, rows through C1a's
    adapters (`fillList`) or keyed values (`Field ID,Label,Value` by id, `Name,Value` by name),
    and the diff. The diff is against the reader's OWN snapshot of what it wrote, never against
    the tree: that is what makes D4 hold (a ± on a connected value stays until its cell changes)
    and makes Resume write only cells changed while paused. Only connected paths are written,
    because the published operator door refuses any path that is not bound (0060).
  - Tree layout: `sheet.<id>.lines` for lines, schedule and credits; `sheet.<id>.rows` and
    `.headers` for standings; `sheet.<id>.values.<key>` for keyed values. A key with a dot loses
    the dot, an all-digit key is reported (it would index an array).
  - One reader per source per browser: a lease in localStorage holding owner, claim id, expiry,
    the world it wrote (unpublished, or the published slug), the snapshot and the status. A second
    tab shows the owner's status and does not read. An expired lease is taken with its snapshot,
    so an unchanged cell after handover does not undo an override. An answer that comes back
    after the claim moved, after Disconnect or after `stop` writes nothing and cannot replace the
    new owner's status or snapshot. Publishing changes the world and so starts a fresh snapshot:
    the server's tree is written in full once.
  - The writer is `productionDataSession.applySourcePatch`: the same road as a ± press (local tree
    unpublished, `control_data_patch_by_slug` published), refactored into one private
    `operatorWrite` both use. It answers whether the write landed; a refused write keeps the
    snapshot so the next read tries again.
  - The one binding write moved into `productionData.ts` as `withBindings(bindings, entries,
    refuses)`; `setFieldBinding`, `setFieldBindings` and `connectShowSource` all call it through
    `applyBindings` in `shows.ts`, which supplies the prepared-message refusal. `proposeMapping`
    (a supplied key first, then one unique name match through `matchTitle`, ambiguous never
    guessed, refused fields marked) and `mappingEntries` (an existing different binding is kept
    until the operator picks a replacement) are the review's contract.
  - "Connect data…" sits in the cue editor's header (`CueConnectData`, on `LibMenu` like Paste
    rows). The review shows the tab's lines, every field's proposal with a picker for repair,
    "N connected · N need attention · Used by N cues", and the proposed values on the real
    PREVIEW monitor (the page overlays them on `settleData` while the review is open). Connect is
    one `connectShowSource` write; Cancel and closing write nothing. A proposal a field cannot hold
    (a number field and "abc") is not made. Reuse is the explicit "Use existing content…" choice;
    its Name box renames the source, which keeps its id and every connection.
  - A link with no tab reads the first tab and requires "Use it?" before Connect. The stored tab
    stays `null` ("the first tab"): the export does not expose the tab's gid to the browser.
  - A graphic whose own code carries the legacy Sheet block (`hasLiveData`) is refused with a plain
    reason until C6's migration, so no field gets two readers.
  - Connected fields stay read-only. The field mark says "🔗 Sheet: <name>" ("⚠ stale" after three
    misses); under the box, a list says "Connected to Sheet: <name>. Edit in the Sheet, or
    Disconnect to edit here." and a value offers Disconnect. Disconnect writes the last shown
    value into every cue of that graphic and removes a source no field follows any more.
  - One source line per source under the editor head: name, checked N s ago, paused, empty, or
    the failure since a time with its fix, stale, Pause/Resume, missing keyed rows, and a
    connected field the graphic no longer has (with Disconnect). The status lives in a small
    store outside React (`createSourceStatusStore`) so a read re-renders only the lines. C1c moves
    the sources line to Playout and adds checked versus changed.
  - Not in this phase (C2): writing `bindings`/`sources` to the published row at connect. A field
    connected after publishing reaches air after the next publish, as every binding does today.
    The operator door refuses a whole patch for one unbound path, so the writer leaves such a path
    out (said once), writes the rest, and the reader retries only that path; without this, one new
    connection froze every working one on the same source (assessment A, medium, fixed). The
    refused path is read whole (a Name/Value key may hold spaces) and is left out for a minute at
    a time, because a republish keeps the slug and so is no mode change (second review round).
  - Assessment A (fresh read-only session on `c5b9028`): PASS WITH NOTES. Its three low notes
    stay: a published write in flight is not cancelled by a handover (bounded by the 15 s lease);
    rename on reuse is a second write after Connect (nothing is lost); the writer now answers
    false once the session has ended.
  - `/check` review fixes: a pasted link mints a new source each read (a second Connect never
    reuses the first source's record); a read answering after the review closed or after a newer
    read is dropped; the PREVIEW overlay clears when the review closes or unmounts; a reader whose
    lease lapsed mid-read (a sleeping laptop) keeps reading instead of stopping; an answer that
    arrives after Pause writes nothing; a source no field follows is dropped by the one binding
    write whichever door unbound it; `/spreadsheets/u/<n>/d/<id>` links parse. Simplify moved the
    source-path helpers (`sourcePrefix`, `isSourcePath`, `sourceIdOf`, `sourcePaths`) and the
    review's choice rule (`chosenPath`) into `productionData.ts`, put the field-kind check into
    `proposeMapping`, and mounts the review only while it is open.
  - Not changed (simplify reports, judged not worth it here): the lease is a few small
    localStorage reads per source per read; moving the lease storage into model/ would add a file.
- **Extra files.** `e2e/configured/production-data-key-sheet.spec.ts` (new) and
  `e2e/configured/expected-run.json` (110 to 111) are the configured row's files.
  `src/control/contentFormats.ts` (C1a's) exports `valueFor`, so a Sheet cell takes the same
  field form as a data-template row (third review round: "TRUE" is "1" for a toggle, a padded
  select option is the option). In the same round the reader keeps its lease in memory when
  localStorage refuses the write, so the only open page still reads instead of standing down.
  `e2e/playout-baseline.spec.ts-snapshots/graphics-only-{1366x768,1920x1080}-chromium-linux.png`
  are re-recorded by `rerecord-screenshots.yml` (run 39602862082 on `8105c2f`): the cue editor's
  head now carries "Connect data…", drawn with the head's compact button class so the head keeps
  its 28 px and nothing below it moves; the other four pictures came back byte-identical. Masks and
  thresholds are unchanged. The `-win32` pair could not be recorded on this Linux worker; the
  laptop helper re-records it from this merge (they gate nothing in Actions). A last review
  round made one Sheet value that feeds fields needing different forms (a toggle's "1", a
  caption's "TRUE") held and reported (`pathValue`). The reader and the Connect review now
  share one rule: `connectedFields` reads each graphic's fields as the editor draws them (the
  library version, `templateForSavedGraphic`) and `pathValue` decides the value, so the review
  previews exactly what the reader will write, held cells included. Published, a Sheet write
  holds only the server's answer, never an optimistic tree, so a value the row refuses cannot
  reach PREVIEW or a Take.
  `src/model/teamShowMerge.ts` gains one label (`sources: 'the data sources'`) so a team merge
  conflict on the new field reads in words.
- **Traps.**
  - A button inside `.pd-bound-mark` is unclickable: the mark is clipped to its column with an
    ellipsis. Keep the mark short and put actions under the field.
  - `react-hooks/purity` refuses `Math.random` inside `useMemo`; a `useState` initializer is fine.
  - The E2E protection gate caps a per-test timeout at 120 s; the journeys take 20 to 30 s.
  - The `""` database case is carried by C1a's 0096 self-check and `production-data-migration`;
    the configured spec now walks it end to end (an emptied tab is an update row with `f0: ""`).

## Row 6, data-sources C1a: format adapters, Paste rows, starter data

- **Previous verified `main` sha:** `66c5f81948e7d37b2b8a0557e61c0b65c43206f5` (row 5, phase 13a,
  #1575).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No persisted format changes. Migration 0096
  is a self-check only (no table, column, function, grant or row), so a revert leaves it applied
  and harmless; nothing has to be undone in the database.
- **Decisions.**
  - The adapters live in `src/control/contentFormats.ts`, pure and Node-importable (they import
    `model/csv.ts` with its `.ts` extension, §5.2). They take rows of cells, so C1b's Sheet CSV
    and this phase's paste go through the same functions. Pasted text with a tab is read as a
    spreadsheet selection; without a tab, each line is one cell. A quoted cell is unquoted only
    when its closing quote ends the cell (and, without tabs, only when it spans a line break, as
    one copied column brings it), so a headline that opens with a quotation stays as typed.
    Review and assessment A each found a paste-reading defect here; both are fixed and tested. A single cell holding a pipe ("20:00 | News") is
    split for schedule and standings, so lines copied from a document work too.
  - A field's adapter is decided by what the graphic is, never by a field title the operator can
    rename: `ticker` f0 lines, `end-credits` f0 credits, an `infographic` whose runtime draws
    `.infographic-time` (the shared schedule runtime) f0 schedule, a `results-board` whose
    runtime draws `-row-cells` (the shared standings runtime) f2 rows and f3 headers.
  - Choices the spec left open: a third cell on a ticker row, or on a schedule row, is flagged
    and dropped rather than joined; a schedule row missing a half is written as it is and flagged,
    so the board drops it on air as its parser always has; credits read the raw cell count, so
    "Camera<TAB>" is "Camera:" while a lone "Camera" line from a document passes through in the
    credits grammar; the standings starter's first header cell is "Name"; blank rows at the ends
    are trimmed, interior blank rows kept for lines and credits (they close a kicker, break a
    section) and dropped for schedule and standings.
  - "Fill from… Paste rows" is a small component in `CueEditor.tsx` beside C0's message Fill.
    It lists the resulting lines with malformed rows flagged and changes nothing until Fill; Fill
    is one `editDraft` with every field the adapter owns (both standings fields in one edit), so
    the preview shows it and the draft saves it like any edit. A bound field shows no Fill (it is
    read-only, as before). The same menu downloads starter rows: the field's current content with
    the adapter's header.
  - The data template (`Field ID,Label,Value`) is downloaded from the cue editor's Advanced
    section (graphic-level, closed by default; C1b's header "Connect data…" is where the import
    lands). It carries every scalar field except pictures and the list fields an adapter owns,
    with the cue's value, the bound value where bound, else the default. The parser is
    `parseScalarCsv`; nothing in the UI reads a template back yet (that is C1b's Connect).
  - **Extra files.** `supabase/migrations/0096_merge_patch_empty_list.sql` and
    `scripts/production-data-migration.test.mjs`: the gate puts the `""`-over-a-list case in
    `scripts/merge-patch-conformance.mjs`, and that table must be answered by the plpgsql merge
    too. 0048 embeds the table and is applied history (never edited), so 0096 calls
    `jsonb_merge_patch` on the added case, and `production_data_format('""')` (an empty string
    writes, an empty array does not). The binding test now reads 0048's cases followed by those
    of each later conformance migration it lists. `scripts/fixtures/show-saved-before-c1a.json`
    is the fixture the spec names.
  - The fixture was made by driving this branch's app with Playwright (a temporary spec, not
    committed): Hairline with an embedded Sheet block appended through `liveDataBlock` and f0
    bound to `guest.name`, News Strip with a tab kicker, a seed and the live tree (`saveLiveData`,
    what Reset to seed does), a roster table, then Take on both and the PROGRAM text read back.
    This branch changes no persisted code, so it is what `main` at `66c5f81` saves.
    `show-fixture-compat` type-checks the record against `Show` with the compiler (an unknown or
    retyped field fails, checked by mutation), resolves it to the text PROGRAM showed, and checks
    the adapters leave its saved list exactly as it is. Later phases extend it.
- **Traps.**
  - The cloud machine refuses a direct `npx playwright test`; every browser run goes through
    `node scripts/jobs.mjs add … --cap`.
  - Commit messages here must not carry `Co-Authored-By` trailers (the commit hook refuses them).
  - A program-monitor locator needs the graphic's `iframe[title=…]`: with several graphics on
    air, `[data-testid="program-stage"] iframe` matches one frame per layer.

## Row 5, phase 13a: props-only cue editor extraction

- **Previous verified `main` sha:** `7ac4b22159ef3cb120271123599f70fda9fa559f` (row 4, phase 2+7,
  #1573).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of markup only: no state, storage key
  or persisted format changes.
- **Decisions.**
  - The graphic cue's editor (`data-testid="cue-editor"`) moves verbatim into
    `home/CueEditor.tsx`; a text diff of the moved block against the old one differs only at the
    two slots and the history prop below. Every value it shows is still derived in the page and
    every piece of state stays there (`advancedFor`, `foldedFields`, `lastLoaded`, `loadSide`,
    `editTarget` and the draft): the component gets them and their setters as props. 13b moves
    the four editor-only states (`advancedFor`, `foldedFields`, `lastLoaded`, `loadSide`) and the
    draft in. `editTarget` stays in the page: it picks `editingCue`, which Take and ✎ Update read.
  - The ends row (`CueEndsRow` with its next-cue hint) and the sound (`ProductionSounds` with its
    save) are built by the page, because both compute from page state (`cueArms`, `cueView`,
    `armsServer`) and write the record through page-owned verbs. The editor itself stays a
    renderer. The ends row is a render function (`endsRow()`), so it is built only while the
    setup fields are open, as the inline code was; the sound is an element, as it always
    rendered. Both keep their keys and their place in the tree.
  - The data-sources C0 "Fill from…" menu (`CueMessageFill`) renders inside the component, so
    C1's Connect menu lands there too. There is no Connect menu yet.
  - The component has no `key`, so its subtree persists across cue changes exactly as the inline
    markup did.
  - The page's rundown history arrives as `rundownHistory`, not `history`, so it never shadows
    `window.history` in the component.
  - **Extra files:** 23 e2e specs gain one comment line, `// covers: src/components/home/CueEditor.tsx`
    (no assertion or selector changes). These are the specs that drive the editor's test ids and
    already covered the page by name, so a later change to `CueEditor.tsx` alone (13b, C1's
    Connect menu) still selects them. Phase 2+7 did the same for its modules.
- **Traps.**
  - The draft still lives in the page, so typing still re-renders the page; this phase is not
    meant to change that (13b does, AC-9).
  - The StrictMode session fix of phase 2+7 (b12dd74) is untouched: this phase moves no effect.
  - The sound slot keys on the draft's `f0` (a picture cue's sound re-keys on its picture). When
    13b moves the draft out of the page, that slot has to move into the editor too, or the page
    reads a stale `f0`.
  - The moved markup keeps `editingCue` null checks that the prop type now rules out. They are
    left in to keep the move verbatim; 13b can drop them.

## Row 4, phase 2+7: store part, session skeleton, the production-data session

- **Previous verified `main` sha:** `304a440a121c51d650f78437496ffc2e1bd56d0a` (row 3, phase 1,
  #1568 and #1569, then the nightly e2e map #1570). Receipt: `phase-2-7.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration and no persisted format: the
  data part holds what the page's state held, under the same storage keys.
- **Decisions.**
  - The session is `createPlayoutSession(productionId)` with `key`, `alive`, `data`, `apply`,
    `onDispose` and `dispose`. `onDispose` is the one place a module registers its stop, so
    disposal runs every stop once and a stop registered late runs at once. It is the hook the
    later watchers (bridge, wire, arms) register with.
  - The page makes the session with `useMemo` on the id, and its end waits one task: the effect's
    cleanup schedules `dispose`, and a re-run of the same effect for the same session cancels it.
    `src/main.tsx` renders under `React.StrictMode`, whose extra cleanup in development would
    otherwise end the session the page goes on using. Two earlier versions on this branch failed
    review: `useMemo` with a plain dispose left the page holding a dead session, and replacing the
    dead session with a new one left the log follower (an effect that never restarts) refreshing
    the old one, so a feed row's re-read did nothing on a page opened while published. The route
    keys the page by production (S4, #1566), so in a production build the session lives exactly
    as long as the page.
  - The `data` part holds `liveData`, `dataKey` and `treeRead`. The dispatch baseline
    (`lastResolved`) stays private to `productionDataSession`: nothing renders from it, and in the
    part every dispatch would re-render the page.
  - `published(slug)` is the mode change of D2 for the data tree: it re-seeds the tree and the
    baseline, listens to other tabs when unpublished, reads the key when published, and answers its
    stop. A number that moves with every mode change drops answers from an earlier mode (the old
    page's `alive` flag did that for the key read only).
  - **Departure:** entering the published mode sets `dataKey` to `undefined` until the key read
    answers. The page kept the previous `null` for that moment, so a first publish could dispatch the
    (empty) tree locally once. `undefined` is the spec's and the folder contract's "not yet known".
  - `dispatch(resolved, tree, send)`: the page passes the resolve it rendered and the tree it came
    from, and the session passes over a tree the part no longer holds. A mode change sets the tree
    and the key in one write, so without the tree check a render's older tree could pair with the
    newer key in the same commit (unpublishing would have sent the server tree's values once).
  - A write that changes no field keeps the part's value, so nothing re-renders for it (as React's
    own bail-out did for an unchanged state).
  - The data API's types come from `productionDataApi.ts` through `typeof`, type-only, so the
    module stays Node-importable.
  - `cueItems.ts` type-imports `ControlSendItem` from `hostedControl.ts`: a type-only cycle, which
    `.dependency-cruiser.cjs` tolerates, so `hostedControl.ts` changes by re-exports only.
  - `// covers:` headers: every spec whose covers selected `hostedControl.ts`, `serverPlayoutStore.ts`
    or `ProductionPage.tsx` before the move now also names the module that code moved to (comment
    lines only, 57 specs), so `e2e-affected --files <new module>` selects them.
- **Traps.**
  - `src/main.tsx` uses `React.StrictMode`. Any session, watcher or engine a later phase creates
    must survive mount, cleanup and mount again in development without being replaced: an effect
    that never restarts (the log follower, eslint-disabled deps) keeps the objects of the first
    render. Keep one session per page and defer its end, as the page does now.
  - A disposed session is final by design: never revive one.
  - The local offline selection passed on both broken versions, so neither lifetime defect shows
    there: the first was found by review, the second by the independent assessment.
    `e2e/configured/production-data-key-dispatch.spec.ts` (a reload of a published page, then a
    feed row) is the walk that exercises the follower's re-read.
- **Left for later:** `ClipClock.tsx` still reads its two store parts with `useSyncExternalStore`
  directly rather than `useStorePart` (outside this phase's files). Answers from one mode that land
  out of order (two refreshes, two PATCHes) can still replace a newer tree with an older one, as
  before this phase: [#1572](https://github.com/NoaCG/NoaCG-Studio/issues/1572).

## Row 3, phase 1: safety net and baseline

- **Previous verified `main` sha:** `995272d56215f6e218da22a2b94baba6adec801f` (H0.1, #1561).
  Built on `4c1ae76` (S1 fix #1564) and the S4 fix #1566. Receipt: `phase-1.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Tests and evidence only, no migration. The two
  fixes revert on their own (`git revert -m 1 <#1564 merge sha>`, `<#1566 merge sha>`); reverting
  either turns its walk red.
- **Decisions.**
  - S1 confirmed and fixed (#1564): a press moving a bound field waits for the one before it on
    its graphic and counts from the newest tree; the ± stepper joins the same wait. The wait ends
    after a send's window plus an attempt, so a dead link cannot hold every later press.
  - S3 refuted: a held folder has no cue editor and holding it saves the draft, so the save wait
    in a folder Take is empty. Recorded with a fault-injection check.
  - S2 characterised and retained: only a press that does not blur the editor (SPACE from a
    checkbox field, a panel key) waits on the save.
  - S4 found and fixed (#1566): the route keys the page by production, so a production opened
    from another starts with nothing up. This is the per-production disposal phase 11 plans, done
    early by remounting; phase 11's session must keep that outcome.
  - The panel snapshot check of §5.3 is not offline-readable; left to the configured panel spec
    and phase 12 (`phase-1.md`).
  - Hosted control page has S1 too: #1567, outside this plan's fence.
- **Traps.**
  - A configured walk that seeds the tree through the data key must wait for the page to show the
    seeded value (`cue-bound-<field>`) before Take, or the Take carries the tree it held.
  - Holding a resolve's REQUEST lets the read reach the server after the Take, so the answer is
    not stale; hold the ANSWER (`route.fetch()`, then fulfil late).
  - A published page holds an empty tree until its data key and the server tree are read, so a
    walk that only holds the key has nothing to dispatch. An edit on the Data workspace while its
    key is unread moves that tab's tree (`setLiveData` takes an unread key as unpublished), which is
    what makes `production-data-key-dispatch` fail when `undefined` is read as unpublished. Hold the
    key on the context, so the workspace tab waits too.
  - Two graphics on PROGRAM are two iframes: read each layer's frame, never the bare locator.
  - Offline, a click or a key from outside the cue editor blurs it first and saves the draft; to
    walk inside the save wait, press SPACE from a checkbox field and hold IndexedDB writes open by
    issuing reads from the transaction's own success callback.
  - Local configured stack in a cloud worker: Supabase CLI from the npm package
    `@supabase/cli-linux-x64@2.111.0`, `dockerd` started by hand, the two accounts made through
    the admin API as `configured-suite.yml` does; jobs take the env from the shell that queues them.
- **Preflight before phase 2.** Phase 1's tests green on `main` (the offline spec, the four
  configured specs, the Node file, the gate test); S1 and S3 decided with evidence, S1's fix
  landed in #1564 and S4's in #1566; S2 characterised. Configured run 39540143070 on `a0682c7`: 118 passed, floor 110.
- **Left for later:** the two perf baselines on this merge's sha (laptop helper, non-gating).

## Row 2, H0.1: Companion package, guide, protocol and presets

- **Previous verified `main` sha:** `046a74598c96b0f161507954511e70bf799407a9` (P1R, #1558,
  checked). Built on `5d533e6cb7b8bd764e724e227953a3e16aca3163` (a quarantine entry on top).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration. A reverted guide and module go
  back to 0.1.1, which is also the previous known-good package for H0.2's recovery runbook.
- **Decisions.**
  - The module is 0.1.2: the guide (`companion/HELP.md`) in Companion 5.1's own words, with
    install by **Import module package**, the lease instead of the answer switch, "refused, never
    queued", and all 14 actions by the names Companion shows. `guide.test.ts` pins HELP.md to
    the action list and the 14 verbs. Trigger keys per cue in the presets; `last_press` says
    "Sent, waiting for the operator page" while a press is unanswered, so pending is its own
    state. Green means selected (what Take acts on), not PREVIEW.
  - No preview tally: protocol v1 publishes only what Take does next (`space`). A tally would
    bump the protocol, which extensions.md gives to E6 once; E6 should decide it there.
  - Spec and protocol drift fixed in place: D5 names `trigger-cue`, the stale table and `blocked`
    cover it, the switch requirement is marked superseded by the lease, the hosted page refuses
    only the clip verbs, the lease spec says it is built. `hardware-panel-control/work.json` is
    re-recorded against the edited spec (`reconciliation-2026-10-21.md`); AC-11 stays failed for
    the missing operator page in the app's docs.
  - Companion is qualified headless from the official image's own files (no Docker daemon
    needed), fresh `--config-dir` per walk, pressed through its HTTP API; the walk script stays
    in the scratchpad, since a suite spec would need Companion on every runner.
- **Traps.**
  - Two queue jobs of half a budget each run at once. Mutation runs that patch source must go
    one at a time, or one patch leaks into the other's run (here a "Take dispatched twice" showed
    up in an unrelated run and looked like a product defect).
  - Playwright's offline mode leaves open WebSockets alone, and stubbing `setInterval` after a
    page started leaves its running intervals alone. A cut-off or hidden page must be faked by
    routing the Realtime sockets and wrapping timers from the first script; the first version
    of the test passed with the guard removed.
  - The page has two ways to learn it lost the panel (the `claim` broadcast and the refused
    renewal). A mutation of one is hidden by the other unless the sockets are cut.
  - In a cloud worker: Yarn comes from npm (`COREPACK_NPM_REGISTRY` and
    `YARN_NPM_REGISTRY_SERVER` set to `https://registry.npmjs.org`, `NODE_USE_ENV_PROXY=1`);
    the Supabase CLI binary is the npm package `@supabase/cli-linux-x64`; `dockerd` starts.
- **Left for later:** hardware-panel AC-8, AC-11 and AC-12 on this merge's SHA (laptop helper);
  the trial kit (`playout-companion-qualification/evidence/trial-kit.md`) on the owner list; the
  app docs page ([#1560](https://github.com/NoaCG/NoaCG-Studio/issues/1560)).

## Row 1 repair, P1R: the two findings of C0's check

- **Previous verified `main` sha:** `cc3500f2d93359dc8add228d50c2353ec5d46f30`. Previous merge
  sha: `6ecd82133e65ebf7d0672c9b9724c7cc0a504aaa` (C0, #1556), which the check failed.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Reverting the baseline brings back the
  post-land advisor failure, so revert it only together with 0095.
- **F1, post-land advisors (run 39506808457).** What was wrong: 0095 applied cleanly, and
  `scripts/supabase-advisors.mjs` then reported `anon_` and
  `authenticated_security_definer_function_executable` on
  `audience_operator_add(p_slug text, p_items jsonb)`, which no baseline entry covered. Checked
  against 0095 before accepting: it resolves the slug through `audience_owner_for_control`
  (capability and audience kill switch, 0035), refuses a non-list and more than 100 items, only
  inserts into that production's `audience_submissions` (clamped by `audience_guard`), and writes
  no command log or production value. That is the same control-slug door as `audience_list` and
  `audience_update`, which the hosted control page calls signed out, so the grant stays. The fix:
  the judgement in `ACCEPTED_CLASSES` (both classes), the baseline re-recorded with
  `--update-baseline` (174: the 2 new entries in, 4 gone unused-index entries out), and the
  count paragraph in `docs/STACK_FRESHNESS.md`. A live re-run after recording reported no change.
- **F2, `production-audience.spec.ts:542` red in Actions (run 39506957594).** What was wrong: the
  trace shows the Playout tab's bind 4 ms after the Messages tab's prepare landed. Every model
  write rewrites the whole record from that tab's mirror, and the Playout tab had not yet adopted
  the prepare, so `applyFieldBinding` passed on its old copy and wrote it back: a binding and no
  prepared cue in the database. The adoption read, opened before that write, then put the older
  record into the Playout tab's mirror, which is why `record(page)` read `{}` at :578 while the
  Data tab read the binding. The fix: `rebasedDurableSet` (model/durableStore.ts) puts this tab's
  answer in the mirror and re-runs the mutation on the record IndexedDB holds, in one readwrite
  transaction; `patchShowChecked`'s rebased mode (model/shows.ts) uses it for `setFieldBinding`,
  `setFieldBindings`, a prepare (`addShowCue` / `updateShowCueChecked` with `stagedFrom`, which
  now also refuse a bound body or name field there) and `setShowMessageTarget` (the prepare's
  first write, which from a stale Messages tab erased the binding). `adoptWrite` no longer
  overwrites a write this tab queued while its read was out. Other writes keep the ordinary path:
  the general whole-record hazard stays as `durableStore.ts` describes it.
- **Review findings on #1558.** A team production keeps the ordinary save, and a refused
  team save is merged per field, so one member's prepared cue and another's binding on its field
  both survived: `mergeTeamShow` now drops such a binding and reports "the field bindings" as
  lost (two tests in `scripts/team-show-merge.test.mjs`, red before, green after). In the
  localStorage fallback a rebased write that hits the quota is now reported like any refused
  write instead of throwing out of the mutator. `src/model/teamShowMerge.ts` is the other file
  outside the row's list.
- **Reproduction.** Two tests in `production-audience.spec.ts` give one tab a durable-writes
  channel that hears nothing and read back from a fresh tab: a stale tab binding a prepared
  field, and a stale Messages tab preparing onto a bound field. Both failed before the fix (the
  first with the binding stored, the CI signature) and pass after; removing the prepare-side
  refusal fails the second again. :542 is unchanged.
- **Files outside the row's list:** `src/model/durableStore.ts` (the transaction the fix needs),
  `scripts/supabase-advisors.mjs` (where the advisor judgement lives) and
  `docs/STACK_FRESHNESS.md` (the baseline's count history).

## Row 1, C0: paste and safe staging (data-sources C0; fixes #1313)

- **Previous verified `main` sha:** `cc3500f2d93359dc8add228d50c2353ec5d46f30` (first phase; the
  run's base). Previous merge sha: none.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0095 stays applied (additive and
  harmless to the reverted client); its own header names the SQL revert if one is ever wanted.
- **Decisions.**
  - One staging function, `src/control/messageStaging.ts`, pure and Node-importable: the stores
    are handed in, so `scripts/message-staging.test.mjs` runs it against fakes. Messages'
    "Prepare cue on <graphic>" adds a cue; the cue editor's "Fill from…" fills the edited cue and
    keeps its name. A pasted message in the cue editor also joins the inbox, so one candidate
    record backs every prepared cue.
  - The cue receipt is `ShowCue.stagedFrom = { candidateId, fields, at }`: `fields` names what the
    message filled, and `preparedMessageField` in `model/shows.ts` reads it inside the one binding
    write (`applyFieldBinding`), so `setFieldBinding`, `setFieldBindings` and every door over them
    refuse. Unbinding is always allowed. The refusal sits in the model, the explanation and the
    "Add a separate card for live data" offer in `ProductionDataPanel.tsx`.
  - Destinations: body titles Message, Question, Comment, Body, Text, Request; name titles Name,
    Author, From, Sender, Handle, Asked by; vote boards excluded by `voteBoardFields`, which
    `pollFieldMap` now builds on, so "is a vote board" has one answer. A remembered target that
    stops being compatible is asked again, never replaced.
  - The first Prepare asks where messages go, in the row (the compatible graphics, or the four
    Q&A cards); "Messages go to" in the paste box changes it later. A card is added with its seeded
    cue, which the message fills (and renames), so one press makes one card and one cue.
  - Approve, Shortlist and the presenter Now/Next moved into the row's ⋯ menu, each saying what
    it does; the row shows "Prepare cue on <graphic>" and Reject. "Prepare again" is in the menu
    for a used message.
  - Local inbox: operator-added rows live in localStorage under `spx-gfx-audience-inbox`, keyed by
    production, read on every `list()` and announced to the other tab through `storage`, so the
    Playout tab's Fill and the Messages tab see one inbox. Simulated, chat and local-join rows stay
    in memory.
  - Migration 0095: nullable `external_id`, `source`, `reference`; `audience_list` dropped and
    recreated with them (db:push exempts a drop the same file recreates); `audience_operator_add`
    keyed on the control slug, bounded at 100, skips an `external_id` already in the inbox. The
    viewer burst caps in `audience_guard` would refuse a 21-row paste, so the function raises a
    transaction-local `noacg.audience_operator` flag that the guard reads; clients cannot set it.
    Applied to a scratch Postgres 16 with a stub of its 0035 dependencies: both self-checks ran
    (the behavioural one adds 25 items, past the burst cap), viewer caps still held, no
    `control_events` row.
- **Traps.**
  - `model/shows.ts` and `audience/localAudience.ts` are not importable in Node (extensionless
    imports, §5.2), so the binding refusal through `setFieldBinding` and `setFieldBindings` is
    proven in the browser journey (`page.evaluate` against the real store) and on the configured
    published walk, not in Node.
  - `control/` may not import `audience/` (dependency rules), so staging takes the candidate's
    `broadcastValues` from the caller instead of importing it.
  - Commit messages in this repo carry no Co-Authored-By trailer; the commit guard refuses one.
- **Fence.** Files beyond the named list, and why: `src/control/messageStaging.ts` is named;
  `src/components/home/useAudienceInbox.ts` (the shared provider choice and a comment the new
  storage made wrong), `scripts/copy-baseline.json` (re-recorded: the Messages view has fewer em
  dashes), `e2e/_workspace.ts` (a comment naming the old Setup labels), `e2e/production-chat-intake.spec.ts`
  (it pressed Approve and Send, which moved), `e2e/configured/expected-run.json` (the configured
  test this phase adds), `scripts/audience-operator-migration.test.mjs` (the migration's static
  guard). No stylesheet changed: the paste box reuses `.pd-aud-round` and the popovers use
  `LibMenu`'s default surface.
- **Check findings.** The delegated review found 10; 7 fixed in the PR: a refused or no-op cue
  write is now said rather than marking the message used, Prepare reports a failure, Fill stops
  when the editor's own draft did not save and cannot paste a second copy on retry, the cue editor
  reads the inbox only while Fill is open, the per-production viewer cap no longer counts the
  operator's rows (and a viewer may not use the `operator_` device prefix), and the header-count
  comment follows the new storage. Filed: #1554 (messages pasted before publishing are hidden after
  publishing; then fixed in this PR after the PR review, below) and #1555 (kept local messages
  outlive their production). Not changed: the Messages
  workspace keeps its own list effect, which also refreshes the join preview from the same signal.
  Simplify moved the provider choice into `useAudienceInbox.ts` (`useMessagesBackend`), reused
  `lastTitled`, `clampSubmission` and `freeName`. Not taken from simplify: letting `stagedFrom`
  fields win over bindings at resolve time (the spec chose the refusal inside `setFieldBinding`),
  an `origin` column instead of the `operator_` device prefix (the spec names three columns), and
  one shared paste component (the two doors lay out differently).
- **PR review (four findings on `fc41275`, all real, all fixed).** A cue that landed while marking
  its message used failed is now reported ready with a warning, and the page refuses a second cue
  for it unless "Prepare again". Kept local messages move into the published inbox on publish
  (`moveKeptMessages`, through `audience_operator_add`, deduped by `local:<id>` external ids, with
  edits and use carried), which closes #1554. The kept inbox is stored as `{ v: 1, inbox }`;
  damaged rows are skipped and a newer version is read-only. The Messages paste button is off while
  its add is in flight. `localAudience.ts` now uses `.ts` imports, so its store is tested in Node.
- **Left for later phases.** `scripts/acceptance-pack.mjs` presses the presenter buttons, which are
  now in the row menu; its clicks are tolerant (`.catch`), so it skips them rather than failing.
  C3 adds the unique `external_id` index this phase's dedupe anticipates.

