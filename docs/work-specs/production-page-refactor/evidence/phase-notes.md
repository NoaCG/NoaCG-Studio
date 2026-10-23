# Production-page run: phase notes

Newest first. Each phase's pull request adds what the next phase must allow for: the previous
verified `main` sha, the previous merge sha, the revert command, decisions taken, traps found,
and the check's findings (parent spec, "Phases"). This is an evidence file, so adding to it never
changes a spec's digest.

## Row 15, phase 3: ProductionShell and CueActions, props-only

- **Previous verified `main` sha:** C7 passed on main (#1615 at `44bfa89`); this branch starts at
  `823d160` (that plus the C7 walk receipt #1619). Receipt: `phase-3.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of markup only: no state, storage key
  or persisted format changes.
- **Decisions.**
  - *The shell moves with its own hooks.* `ProductionShell` was already a component at the bottom
    of the page, and it already called its own hooks (the verb keys, the edit keys, the cue
    shortcut set, the team state, the rail width). The spec calls this row "a file move" with "the
    current props", so it moves verbatim, hooks included; nothing moves into it from the page, and
    its props are unchanged. Lifting those hooks into the page would have changed the code under
    a move, which this phase forbids. `NO_CUES` moves with it, as its only reader.
  - *CueActions is the `liveBlock` fragment and nothing else.* The page keeps `liveBlock`,
    gated on `selectedGraphic` exactly as before, so where and when the block mounts is unchanged.
    One ⚡ button stays the page's `actionButton`, passed in as a render function (as 13a passed
    `endsRow`): its greying, its name and its hover read `legality`, `machineState` and the
    field descriptors, so drawing it inside the component would have meant deriving there. The
    props keep the page's names, so the moved text is byte-identical.
  - The markup's own expressions move with it unchanged (the section `heading`, the live
    number's `disabled` and `title`, the Recovery select's value parsing). They are part of the
    block as it was; this phase does not re-home them.
  - **Extra files:** 34 e2e specs gain one comment line naming `ProductionShell.tsx`,
    `CueActions.tsx` or both: every spec with a `// covers:` header that drives the moved test
    ids (the header's `verb-out-all`, back, home, tabs, follow line, panel status, team note,
    `data-renders`; the block's `cue-action-*`, `cue-actions*`, `machine-state-chip`,
    `machine-snap`, `live-number*`) and was not already selected by the new files. No assertion
    or selector changes. Left without: `score-tracker-moments` (declares `covers: none`, which a
    second line would make malformed) and four configured specs with no covers header at all
    (`bridge-real-server`, `dashboard-hosted-walk`, `follow-status-is-visible`,
    `hosted-control-profile`), which never mapped to the page either.
- **Traps.**
  - The element at `liveBlock`'s place changes type (a fragment becomes `CueActions`), so React
    mounts it fresh once per page load. Within a session the type is stable, so the Recovery
    disclosure and the arranger keep their state across renders as before.
  - The spec's line numbers (5398-5456, 4236-4410, 3945-3988) are from `cc3500f2`; the shell
    was at 5518-5798 and the block at 4579-4753 on `823d160`. 3945-3988 was `fireEvent`, which
    stays in the page (it is a verb, not markup).
  - Phase 4 (`useProductionPublish`) passes the header's status and action through the same
    `status` slot; nothing here changes that slot.
  - The spec's file table gives `CueActions` the `arranging` and folded state, but no phase in
    the phase list moves them: `arrangingFor` stays page state (it only computes `arranging`),
    and `foldedFields` is the cue editor's (13b). Assessment A flagged it; whichever phase next
    touches `CueActions` either moves `arrangingFor` in or the table drops it.

## Row 14, data-sources C7: combined technical rehearsal (software) and the content trial kit

- **Previous verified `main` sha:** C6 passed on main (#1607 at `198b685`, repair #1610 at
  `f9c9c26`); this branch starts at `6042b4f` (main when the row began).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration, no persisted field, no setting:
  the only product change is the Twitch reader's join check, and reverting it brings back the
  dropped " 366 " lines.
- **What landed.** `docs/work-specs/data-sources/evidence/rehearsal.md` (every AC-16 route, each
  with the journey or test that proves it and its result on this build), `evidence/trial-kit.md`
  (the eight unaided tasks of data AC-14, sheet AC-12 and audience AC-7, the six comprehension
  questions with their right answers, the four-of-five reading guide, where findings go), the
  Twitch regression test and its fixture, four new journeys, and one fix.
- **Decisions.**
  - *One production per route.* The brief says to reuse the journeys that already prove a route,
    so the rehearsal is the union of those journeys on one build, each on its own production;
    rehearsal.md says so at the top rather than claiming one combined production.
  - *Journeys added only where a route had none:* the quiz reveal beside a running clock, a guest
    row, schedule/standings/credits from a Sheet (only the ticker had a Sheet journey), and the
    published audience walk (join on a phone, presenter view, vote; no configured spec submitted
    from the join page or opened the presenter view).
  - *The independent clock is a second graphic.* No quiz template carries a clock, so the quiz
    plays beside Club Scorebug's running match clock, both bound to the data.
  - *Twitch fixtures are written, not captured.* "Captured once" would mean a live Twitch session,
    which is the owner's item; the frames follow Twitch's IRC wire format with invented names and
    text, and rehearsal.md says so.
  - *The message tasks' three questions* (audience AC-7 names "the three comprehension questions"
    without listing them) are read as questions 1, 2 and 6 of the six, the ones a message task
    can answer; the data tasks use all six.
  - *The YouTube live smoke ran 3.5 minutes, not 10*, inside the five-minute cap the job queue
    allows an uncommitted one-off selection; the spec allows at most ten.
- **Fix.** `src/audience/twitchChat.ts`: a line was taken as the end-of-names reply when it merely
  contained ` 366 `, so a chat message about "366 votes" was dropped and reset the reconnect
  ladder. The numeric must now be the IRC command. Found by the new test.
- **Mutation check** (each mutant alone, its test run):
  - `scripts/twitch-chat.test.mjs`, 18 mutants of the reader and the intake: the old ` 366 `
    substring, the tagged end-of-names allowance, the 30 s ceiling, the ladder reset, the first wait, PONG, the CAP request, `\s`
    unescaping, the CTCP strip, the nickname range, the display-name fallback, the asynchronous
    error, a 26-character login, binary frames, the 10-a-window throttle, the device-token
    prefix and the dedupe each turn it red (17). One survives by design: `stop()` without its
    `clearTimeout` (the pending retry still finds the driver stopped and opens nothing), an
    equivalent mutant.
  - Quiz beside a clock: a data write that also re-takes every graphic goes red (the quiz returns
    to Question); one that re-takes only the scoreboard goes red too, but on its machine state
    (Enter, not running), not on the clock's reading: origin-based clocks resume from their stored
    start, so the reading alone cannot see a re-take. Both checks stay.
  - Guest row: loading always the first row goes red. The re-take mutant passes it (the journey
    makes no data write), and its "PROGRAM unchanged after the row's edit and delete" half has no
    code path to mutate: nothing sends a table edit to air. That half guards a future one.
  - Sheet boards: a data write that also re-takes the graphic goes red on the entrance count.
  - The published audience walk runs only in the configured suite; it was not mutation-checked
    locally (no local stack on this worker), and its first configured run is its evidence.
- **Hostile input.** The Twitch test feeds 200,000-character frames (backslashes, tag pairs, a
  login with no `!`, `!` runs, a tag block with no space) and requires under a second; the new
  join check is anchored and linear.
- **Limits pinned by a literal:** the reconnect ladder (1, 2, 4, 8, 16, 30, 30 s), the 25-character
  login, the 10-in-10-seconds throttle, the five-digit `justinfan` nickname.
- **Runs.** The whole configured suite on `e53b7e7` (run 39838648044): 124 passed, 0 failed, 3
  allowed skips, the new audience walk included. The full offline suite on `86ebdd9` (run
  39843292132, `ci.yml` dispatched with no base): 15 of 15 shards green. Quarantined specs are
  outside both PR and dispatch shards; `production-chat-intake.spec.ts` is one, so its YouTube
  journeys are local-run evidence only (rehearsal.md says so per row).
- **Assessment A+** (a fresh read-only `/so` session on the diff and the rehearsal at `93a83e5`):
  PASS WITH NOTES. Its findings and what was done: the Row 13 heading this entry had overwritten
  (restored); the YouTube rows rested on a quarantined spec that CI does not run on a branch
  (restated on the Node tests and the live smoke, the journeys named as local evidence); the
  configured run unfinished (finished green, recorded); the pushed-score row's offline citation
  pushes nothing (restated on the configured spec); the four boards on real CasparCG/Bridge and
  OBS, the actual consumer and a browser output receiving a data update not named as unverified
  (named; the browser-output halves cited separately); operator-page closure checks rows, not
  PROGRAM (said so); the guest edit's landing unchecked (now checked); the trial kit ran the
  message tasks on a published production and named a lower third no task uses and a real-shaped
  phone number (two productions, the lower third dropped, the number zeroed, task 8 tied to its
  row); the mutant count (corrected to 18). Its re-assessment on `01b1b2a`, with both runs
  finished: **PASS**, every finding fixed or accepted, nothing blocking the landing.
- **Advisor judgement:** none needed; no migration and no database object.
- **Traps.**
  - A clock's reading survives a re-take (it resumes from its origin), so "the clock was not
    reset" needs the machine state too.
  - The job queue refuses a broader (12-minute) job on an uncommitted tree; a one-off live smoke
    that must not be committed is held to the five-minute small selection.
  - A Playwright config outside the repository resolves the base config's relative paths against
    its own folder; run a one-off spec from inside `e2e/` instead, and delete it after.

## Row 13, data-sources C6: Compatibility, truthful operation and docs

- **Previous verified `main` sha:** `7057915b44e237fa9879ec49f2363b8ab15bc123` (row 12, C5, #1604);
  this branch starts at `a285d94` (that plus the quarantine entry #1605).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration and no persisted field: a
  reverted build reads every record this one wrote. A graphic whose reader was removed through
  "Stop its own reader" stays without it after a revert (the removal is an ordinary design edit;
  Undo in the editor or re-adding the block by hand restores it).
- **One way to connect a Sheet (sheet AC-10).**
  - The editor's graphic-level panel (`LiveDataControls`, in `editorFoundation/`, where the former
    `ControlPanel.tsx` panel moved) offers nothing to a graphic without the block. A graphic that
    has one sees what it reads and "Remove live data". The `liveData.set` editor operation stays
    (records and tests still create the block); no UI reaches it.
  - Exports are unchanged: `scripts/legacy-sheet-block.test.mjs` builds the SPX package from the
    C1a fixture's Hairline, finds the block byte for byte in `js/template.js`, and runs it against
    a CSV: it fetches its address and hands `update` the mapped row.
  - **The explicit migration.** Connect data… on a graphic whose code reads a Sheet offers "Stop
    its own reader" or "Keep it" instead of the review (`ownReaderGate`). Stop removes the block
    from the library record (the design every production plays, so other productions using the
    graphic lose it too, and the panel says how many) and, before Publish, from the production's
    copy (`ownReaderRemoval`). Published, the copy is what the output runs, so it is left for
    Publish to replace (`refreshGraphicCopies` takes the newer record), and Connect says "Publish
    changes, then connect" until the copy no longer has it. A published graphic with no library
    record cannot carry the removal to its output, so the migration is refused with that reason
    (a rare case: an unlinked legacy copy on a published production). The review only opens once
    no copy that plays has the block.
  - **Every other binding door refuses too** (assessment A found the Advanced bindings table,
    Bind all by title and a typed path could still bind such a graphic): the binding write path
    (`applyBindings` in shows.ts, beside the prepared-message refusal) refuses a new binding on a
    graphic whose copy or library design has the block (`ownSheetGraphics`, the same reach as
    `ownReaderGate`), and the table says why; Bind all by title names what it skipped, a binding
    saved before C6 stays (and can be unbound) but takes no new path, the prepared-message
    "separate card" offer leaves the block behind, and Connect's refusal names the reader when that
    is the cause (the delta review's findings). The block's marker
    moved to `src/model/liveDataMark.ts` so the model can test for it without importing control/.
    Bindings saved before C6 on such a graphic stay as they were (the C1a fixture has one).
    Not guarded, by scope: a door that gives an already-bound graphic the block afterwards (adding
    a legacy template under the same name, or Publish taking an older library design that still
    has it). Nothing in the app offers the block to a graphic any more, so neither has a way in
    short of hand-editing code.
  - **Cross-production effect, on purpose.** Stop on a library graphic changes the shared design:
    every production using it loses the reader (a published one at its next Publish). The panel
    names how many other productions use it before the press.
  - **Pause is honest.** Every graphic still reading in its own code is listed under the cue editor
    (the Playout sources line) and on the Data overview as "Sheet in X's own code · read by the
    graphic · Pause does not stop it", with no Pause button.
  - The removal itself (`ownReaderOf(...).remove` in ProductionPage.tsx: the library write, the
    copy write, the commit) is page logic beyond "presentation wiring", recorded here; its rules
    are the Node-tested `ownReaderGate` and `ownReaderRemoval`.
  - The page's library snapshot is re-read after the migration (`libraryRev`), so PREVIEW and
    PROGRAM rebuild on the design the production now plays; otherwise the old block would keep
    running in the page's own monitors until a reload. The production's copy write sets `savedAt`
    for the same reason (ProgramStage's pool signature).
  - `/docs` (docs.html, "A Google Sheet") now describes Connect data… and the migration;
    `docs/PRODUCTION_DATA_PLAN.md` carries the supersession note in its status block.
- **AC-9.** Setup's "Messages…" and "Data…", the Data overview, the Playout sources line with
  Pause, local content without freshness and the reader/cadence/checked/changed details were
  C1c's and are unchanged; C6 adds the own-reader line to both lists (the "explicit fallback" for
  a reader Pause cannot reach).
- **AC-16 presentation: which observations the output route supplies.** This page observes:
  whether the production is published; each graphic send's answer from the command log
  (`control_send_many` / the seq road), an accepted write and never a rendered picture; whether it
  can reach the server (the browser's `online`/`offline`, and the resolve retrying); the outputs'
  presence (READY); for server cues, the Bridge's answers and the server's own slot readings.
  No output reports its picture back, and there is no per-command render acknowledgement, so
  nothing says a picture is confirmed on air. What was added:
  - PROGRAM's status tag (`programAir`), in the frame's bottom-left corner like PREVIEW's length
    tag: "sending…" while a send waits, "logged HH:MM:SS" (state `logged`, never `confirmed`) once the log took it (its tooltip says
    outputs do not report their picture), "not confirmed" while a failed send is still owed (read
    from `sendDebts`, the page's one record of that, through a new `owed()`; a later send of
    another graphic does not settle it), and "last logged HH:MM:SS" when the page cannot reach the server
    (the centre tag below says the connection is lost; review found the two said it twice). Nothing pressed yet shows nothing. Unpublished it shows nothing either: the
    header's existing PROGRAM · NOT PUBLISHED and "up, not live" already label the local
    simulation (a first cut put "this page only" in the header, which truncated the monitor's name
    at 1280 px; seen on the after screenshot and moved).
  - A lost connection dims PROGRAM and puts "CONNECTION LOST · NOT LIVE" over it; NoaCG Bridge
    not answering (its `bridge` or `server` state, not a Bridge that answers with a warning) while
    server cues are up puts "BRIDGE NOT ANSWERING · NOT LIVE" (or "CASPARCG NOT ANSWERING" when the
    Bridge answers but CasparCG does not: assessment A), whose badge turns amber with a "last reported"
    tooltip (its words stay short: the header already truncates the monitor name with a long badge).
  - The target line under the verbs (`takeTargets`): "To: this page only", "To: N outputs ·
    CasparCG 1-20", "(not loaded)" when the output is not on its slot, or a server cue's slot
    ("To: CasparCG 2-10"; the re-recorded baselines showed "through NoaCG Bridge" wrapping the
    line at 1366 and 1920 px, and the server badge on PROGRAM already names the Bridge). "0 outputs" rather than a sentence, so the line never wraps the verb row.
  - The folder panel lists every child's own outcome (ON AIR, NOT TAKEN with the reason) and, in
    All together, names both cues of a collision ("same place as …"). The policy is the existing
    one: All together never takes two cues to one place (two clips on a slot, two graphics on a
    layer, two cues of one graphic); the Take is refused before anything is sent and the folder
    says why. A first cut said "the later one replaces it", which the after screenshot showed to be
    false (the refusal line sat right above it); corrected.
  - Selection, PREVIEW and staged edits already had their own words (the cursor, PREVIEW's label,
    the unsent line and ✎ Update); they are unchanged.
  - No new confirmation protocol, renderer acknowledgement or composite renderer.
- **Files beyond the phase's list, and why.** `src/control/liveData.ts` (the gate and removal
  rules, Node-testable), `src/model/shows.ts` (`setGraphicCopyScript`, the copy write),
  `src/control/playoutStatus.ts` (`programAir`, `takeTargets`: the existing Node status contract),
  `src/control/folderAir.ts` (`folderChildren`: the existing folder contract),
  `src/components/home/SourcesLine.tsx` and `src/components/home/ProductionDataPanel.tsx` (the
  own-reader line on Playout and the Data overview), `src/styles/playout-dashboard.css` (the chip,
  the stale picture, the folder rows), `docs.html` (the /docs page is this file).
- **Baselines.** The six `playout-baseline` Linux pictures changed (the target line under the
  verbs); re-recorded only through `rerecord-screenshots.yml`, looked at, masks and thresholds as
  they were. The `-win32` set is not recorded from a Linux cloud worker (as in row 7).
- **Advisor judgement:** none needed; no migration and no database object.
- **The output's own running frame (the PR's automated review, P1).** After Publish, an output keeps
  an on-air graphic's old frame, its embedded reader included, until the graphic is cleared
  (`src/output/swapPlan.ts`), and a Publish that fails after refreshing the copy leaves the output
  on the old version with a clean copy. The copy alone cannot prove the reader stopped, so the gate
  also reads two observations of the output. The published payload this page last saw (at its
  resolve, or its own successful Publish, read from the record as published) still carrying the
  block keeps "Publish first". And for any graphic this page has seen with a reader (design, copy
  or payload), Connect waits while a connected output has not wholly taken the published version:
  it reports a change preparing, failed or waiting for an on-air graphic's clear, or holds another
  version. A first cut read only the per-graphic "waiting for clear" list; a review of it found
  that list misses a failed preparation, whole-page reloads and more than six graphics, so the
  wider rule replaced it. It is limited to graphics seen with a reader, so a routine republish of
  any other on-air graphic never blocks Connect. Not covered: the Data overview's own-reader list reads
  design and copy only; a teammate's Publish is not seen until this page resolves again (which only
  keeps Connect waiting longer).
- **Every binding door reads the output too** (the automated review's second P1): the Playout page
  records what Connect holds back per production in this browser (`src/model/ownReaderHolds.ts`,
  key `spx-gfx-own-reader-holds:<id>`, never synced), and the binding write path and the Data
  view's tab (through the `storage` event) refuse those graphics as well. A device-local record:
  only a page that observes the outputs can say what they run.
- **Across a reload** (the automated review's third P1): the graphics seen with a reader are kept in
  the same device-local store (`spx-gfx-own-reader-former:<id>`) and restored when the page opens,
  so a page reloaded after the migration and Publish still holds Connect and the binding doors
  while an output runs an old frame. An entry clears only when verified: presence has joined, no
  output reports anything pending or another version, and nothing reads in the design, the copy
  or the published payload (an output that connects later loads the published version afresh).
  This closes the reload gap listed above for this browser; another browser that never saw the
  reader did not know it until the repair below.
- **Only positive evidence clears it** (the automated review's fourth P1): an output can drop out of
  Presence and keep running its frames, so absence proves nothing. While a graphic's history entry
  exists, Connect and the binding doors hold it ("take it out, then connect"); the entry clears
  only when the graphic is off air (every output still following the log takes its Out and swaps
  to the published version), presence has joined, no output reports anything pending or another
  version, and nothing reads in the design, the copy or the published payload. And only once this page
  has recovered the production's live state (its resolve has answered, the wire's on-air map and
  the rows after it applied): an empty on-air map before that is no evidence (the fifth P1).
- **Kept on purpose.** The editor's `liveData.set` operation stays: nothing but its own Node test
  (`editor-project.test.mjs`) sends it now that the panel offers no Add, and the specs build the
  legacy block through `liveDataBlock`. Removing it would widen the phase into the editor.
- **One rule for "reads a Sheet in its own code".** The sources line, the Data overview and Connect
  data… all ask `ownReaderGate` through `ownSheetReader` (SourcesLine.tsx), so a published
  graphic whose copy still has the block after the migration stays listed until Publish replaces
  it, and nothing can be offered the migration without being listed (review and simplify findings).
- `src/control/failedSends.ts` and `scripts/failed-sends.test.mjs` are touched for `owed()`;
  `src/model/liveDataMark.ts` (new) holds the block's marker for the binding refusal;
  `src/model/ownReaderHolds.ts` (new) carries the Playout page's holds to the other doors.
- **Assessment A** (fresh read-only `/so` session on the diff at `bc97f3b`): PASS WITH NOTES. Its
  findings and what was done: the binding doors (fixed, above); the CasparCG hop named as the
  Bridge (fixed); journeys for a library graphic on a published production (added: the scope
  count, the design stripped and the copy kept, Publish first, the own-reader line kept); the
  `confirmed` state name (renamed `logged`); the page logic and the cross-production effect
  (recorded above). The refusal for an unlinked graphic on a published production is pinned in
  Node only.
- **Repair 1, 2026-10-22** (independent check `checker-p13-pp-p13c-3605` on `198b685`: FAIL).
  - *Finding 1, competing writers across browsers.* Browser A stops library graphic G's reader and
    publishes while G is on air: the output keeps G's old frame and reader until G is cleared, but
    another browser (a teammate, a second device, A with cleared site data) saw only clean design,
    copy and payload and empty device-local stores, so every binding door let it bind G's fields.
    Fix: the production's own synced record carries the stop (`Show.ownReaderStops`, by graphic
    name). It is written by Publish, in the same write that refreshes the copies
    (`refreshGraphicCopies`), for every published graphic that publish takes a reader from: its copy
    loses one to the refreshed design (this production's Stop, or another production sharing the
    design: the fresh assessment's finding), or the payload the page saw published reads and the
    copy no longer does. Until Publish the synced copy still reads, so every door already refuses
    on it. Every browser reads the record: the gate answers `clear` for a recorded stop
    (`ownReaderGate` `stopRecorded`, through `ownSheetReader`), and `ownSheetGraphics`, which every
    binding door and the Data view ask, includes it, so `applyBindings` refuses too. It clears on
    the same positive evidence as the device-local history (off air, live state recovered,
    Presence joined, no output behind, nothing reading), from whichever Playout page sees that
    first, and the clear syncs. Read only while published (`publishedReaderStops`); unpublishing
    drops it (a re-publish mints a new output URL); left out of the published-record digest (it
    never reaches an output); inert on duplicates and conflict copies, which drop the hosted slug.
    A refused team save merges it by name (`teamShowMerge.ts`): an added stop is kept, one goes
    only when a side cleared it and the other had it unchanged, and a binding the merge leaves on a
    stopped graphic is dropped and reported. Chosen over "hold whatever an output reports waiting
    for its clear": that covers only a browser with the Playout page open and its outputs in
    Presence, not the Data view, a typed binding, or an output that dropped out of Presence and
    still runs its frame. A JSON field on the record: no migration, no database object, no advisor
    judgement. The device-local stores stay: they also carry what this page saw in a payload.
  - *Finding 2, the migrated path uncovered.* The published-migration journey now runs past
    "Publish first": a Publish without the reader while G is on air, a reload in the middle (the
    clear gate `cue-connect-clear-first` restores; the binding write refuses), three reloads that
    must still hold (an output on another version; Presence never joined; G on air with no output in
    Presence and the resolve answering late), and the release on positive evidence (link offered,
    record and stores empty, the binding takes). A second journey stops the reader in one browser
    and opens the production in a fresh browser context holding only the synced record and design:
    held there (gate, binding write, Data view's Advanced row) until the same evidence releases it.
    Node (`scripts/legacy-sheet-block.test.mjs`, shows.ts bundled like the export): the gate holds
    a recorded stop, and the binding write refuses a held graphic and a recorded stop, ignores a
    stop while unpublished, and binds once cleared.
  - *Mutation check* (each applied alone; the two Node files and the four C6 journeys run): the
    checker's two mutants (verified at once and the history forgotten on load; `applyBindings`
    without the holds) and twelve on the new rules (the page ignoring the record; the binding doors
    ignoring it; the gate ignoring it; release before the live state is recovered, while on air,
    without Presence, while an output is behind; Publish recording no stop; Publish ignoring the
    payload's readers; the merge letting theirs win; the merge keeping a binding on a stopped
    graphic; unpublish keeping the stops) each turn at least one test red.
  - *Fresh `/so` assessment* (read-only, on the first cut): FAIL, because the stop was written by
    the Stop button for its own production only, so a second production sharing the design took
    the clean copy at its own Publish with nothing recorded; and a team merge could drop a stop.
    Both fixed as above, with the unpublish clear it suggested. Its re-assessment of the fixed
    diff: PASS WITH NOTES; its note that duplicates and sync conflict copies kept stale stops is
    fixed (both drop them), the others are gaps below.
  - The journeys stand in for Publish (`publishWithoutReader` calls the app's own
    `refreshGraphicCopies` and builds the payload): the real Publish button needs a signed-in
    account, which the offline suite has not got. Publish's recording is pinned in Node.
  - Known gaps now: the Data overview's own-reader list reads design and copy only; a teammate's
    Publish is seen at this page's next resolve; a browser binding from a record older than the
    stop (before sync brings it) is the record's ordinary last-write-wins case; stops and the
    history are keyed by graphic name, so renaming an on-air graphic before its clear escapes the
    hold (as the history already did); the clear is an automatic record write, so on a personal
    production two devices clearing at once can leave a conflicted copy (rare: once per stop); an
    output that stays behind (a stuck prepare, an old output tab) now holds the graphic for every
    browser until it catches up or is closed; a graphic removed and re-added clean under the same
    name, then published from a page whose resolve has not answered, records no stop; a merge
    cannot tell a re-stop inside one save window from the stop it clears; the journeys stand in for
    Publish, so its call site's third argument is pinned only through the function; a team merge
    now drops a binding left on a stopped graphic, reported as "the field bindings".
- **Traps.**
  - The production page reads the library once per mount; a design change made from the page
    itself must re-read it or the monitors keep the old design.
  - The SPX export cannot be imported in Node with the `.ts` resolver (it imports `.txt` licence
    files); bundle it with rolldown to a temp file, as `ograf-timed-exit.test.mjs` does.
  - `context.setOffline(true)` fires the browser's `offline` event, which is what the page reads.

## Row 12, data-sources C5: "Another system" card and Pause

- **Previous verified `main` sha:** `503b029976d78c5b49a758aae449df87b9649f0b` (row 11, C4, #1599 and
  repair #1601). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0100 is additive and stays applied:
  a reverted build never calls `control_data_pause_by_slug`, so no production is paused and the
  widened `control_data_apply` and `control_data_send` behave exactly as 0097's and 0047's. Resume
  any paused production before reverting (the card's Resume), or its held writes stay held until
  someone calls the function. Fields connected to `api.` paths stay ordinary bindings; a reverted
  page shows them as bound paths with no "Another system" name.
- **The tested Pause, named explicitly: suppress-and-diff, not the fallback.** The spec's smallest
  design proved proportionate, so the "to freeze, stop the sender" fallback is not used. One change
  from the spec's wording: while paused, `data` stays the ON-AIR tree and the API's writes go to
  `data_pending` (the spec had `data` take them and a `dispatched` copy hold air). The review found
  that with the spec's layout every reader of `data` (a Take, an Update, the operator pages,
  `/state`) aired held values; with this one they cannot.
  - `/patch` while paused: `control_data_apply` with `'api'` merges into `data_pending` and appends
    nothing; it answers that tree with `paused: true`, and the route adds `paused` and a `message`.
  - `/update` while paused: `control_data_send` keeps the values in `data_held`, a per-graphic
    last-write map, and answers NULL; the route answers `event: null`, `paused: true`.
  - Operator presses, the owner's Data view and the server tick air at once as unpaused, and also
    merge into `data_pending`, so the LAST write wins at Resume either way. A held `/update` field
    is dropped when a later write names its path, a null or a repeated value included (the
    review's ordering finding, then two of the PR's automated review).
  - Resume diffs `data_pending` against `data`, lays the held `/update` values over it (the spec's
    "applied after", as one row so a field is never aired twice), appends one row per graphic,
    `src: 'api'`, and makes `data_pending` the tree. It never refuses: a cap check there could
    leave a production held for good (review); the rows are bounded by the graphics.
  - A null while paused deletes the path in `data_pending`, so Resume sends nothing for it: the
    same as an unpaused null today. The configured walk pins it.
  - `data_received_at` is written by every API write (at most once a second when nothing changed):
    the card's "Received N s ago".
  - The owner's Data view on a published production went through the data key, so Pause held the
    owner's typing and the card counted it as a receipt (review, high). It now goes through
    `control_data_owner_patch` (the row policy's test, then the apply as `'operator'`), falling back
    to the key on a database that has not run 0100.
  The cases are `scripts/data-pause-conformance.mjs`, embedded as a `$pause$` literal in 0100 and
  run by its self-check on the real bodies (twenty cases); `data-pause` fails when the two differ.
  Mutation checks of the final bodies (ten, each turned the self-check red, run on the local
  stack in a rolled-back transaction): held values laid under the diff instead of over it;
  `/update` held without merging per field; the paused API branch removed; the API's paused write
  landing in `data`; a held `/update` kept after a press (and, found by assessment A, kept after a
  press of the value air already showed, now dropped by the API's-tree diff too); kept after a
  later `/patch`; kept after a later null; kept after a later write that repeats the value (the
  last two found by the PR's automated review: held fields are now dropped by
  `production_data_addressed`, every bound field whose path a later write NAMES, under or over a
  written path included, whether or not its value changes); the prefix rule reduced to an exact
  match; the owner's
  door labelled `'api'`; operator writes not joining the API's tree; Resume not making the API's
  tree the tree.
- **Sample sender, run for real** (assessment A asked for the whole chain, not only stubbed tests).
  On the local stack (every migration through 0100 from empty), a production with a scoreboard
  whose four fields were retitled Leading, Margin, Counted and Turnout ("Riverside count", an
  unfamiliar custom graphic) was connected through Connect data…, Another system in one
  confirmation, published, and the card's "For the sample sender" file downloaded: it named the same
  four `api.riverside_count.*` paths as the fixture. With the card's key in `NOACG_DATA_KEY`:
  `results-first.json` -> `Received (200): Riverside count (f0, f1, f2, f3)` ("Polling stations"
  reported as not connected, not sent); `results-correction.json` -> `Received (200): Riverside
  count (f1)` (only the corrected margin moved); `results-cut-off.json` -> "Acquisition failed ...
  Nothing was sent", exit 1. The log held exactly two update rows, `src: api`: the four values,
  then `{f1: "214"}`. The card showed "Received N s ago"; no output line carried the key. No
  lifecycle event was sent: the key reaches only the data RPCs (`data-pause` pins it).
- **Decisions.**
  - Another system is the data key as ONE source with no `Show.sources` record (AC-8: no
    per-sender attribution or Pause). Its fields are ordinary bindings to `api.<graphic>.<field>`
    paths, so no persisted format changed (show-fixture-compat proves an older record with such
    bindings still reads and plays). The group is the graphic's name, made unique against other
    graphics' groups; a connected field keeps its path.
  - Connect data… gains an "Another system" button beside Read: nothing to read, every field is
    offered its path keyed by its field, so the review proposes the whole graphic; the mapping
    table, repair, "Used by", the preview monitor and the one confirmation are the Sheet's.
    `connectApiFields` (shows.ts) is the write, through the one binding path (prepared-message
    fields refused). The connected field says "Another system", names its path, and has
    Disconnect.
  - The card is on the Data view under Production data: published, the address, the key behind
    Reveal and Copy (moved here from the panel's "▾ Data key", so there is one place), the
    receipt and Pause/Resume read from the row every 2 s while open, the connected paths, a curl
    example that reads the key from `$NOACG_DATA_KEY`, and "⬇ For the sample sender" (address,
    example body, which field each path fills; never the key). Local, it says publishing is the
    step, with the page's own Publish on the card. A team member without the key is told it is on
    the owner's view.
  - Pause is on the control slug (`control_data_pause_by_slug`, anon and authenticated like
    `control_data_patch_by_slug`); `control_data_owner_patch` is authenticated only. The judgement
    is in ACCEPTED_CLASSES and the three entries in the advisor baseline (186), with a line in
    `docs/STACK_FRESHNESS.md` (lesson 1).
  - The sample sender (`scripts/data-sample-sender.mjs`) reads one local synthetic file, names its
    records after the destination labels, sends one patch and prints the receipt; a failed
    acquisition (missing, cut off, no records, a non-scalar value) or a report naming no field
    sends nothing; the key comes from `NOACG_DATA_KEY` and is never printed. A path through a list
    index (only possible when bound by hand under Advanced) is in neither the card's example nor
    the sender's patch, since a merge patch would replace the whole list; generated segments never
    look like an index (`2026` becomes `n2026`). Names match in any
    script, and two records that read as one name (or a name of punctuation only) fill no field
    (from the PR's automated review: an ASCII-only match sent one record's value to every
    non-Latin field). Fixtures are an
    unfamiliar custom "Riverside count" board and invented count-night numbers, labelled
    synthetic.
  - "Offline e2e: the receipt": the offline suite has no backend, so it cannot hold a receipt;
    it covers the card, the Connect flow, the example and the sender file, and the receipt's
    words are in `data-pause`; the receipt within 5 s is the configured walk.
- **Files beyond the phase's list, and why.** `api/_lib/dataIngest.ts` (the held answers),
  `src/control/productionDataSession.ts` and `scripts/production-data-session.test.mjs` (the
  owner's Data view names its production, so it takes the owner's door),
  `src/control/anotherSystem.ts` (new: paths, example and words, Node-testable),
  `src/control/productionDataApi.ts` (read the row's Pause and receipt; the Pause RPC),
  `src/model/shows.ts` (`connectApiFields`), `src/components/home/ProductionDataPanel.tsx` (the key
  moved to the card; API values grouped as "Another system" in the overview),
  `src/components/home/ProductionPage.tsx` (hands Publish to the card), `src/styles/feedback.css`
  (the example block), `docs.html` (the /docs page renders the Data API section itself),
  `scripts/supabase-advisors.mjs`, `supabase/advisor-baseline.json`, `docs/STACK_FRESHNESS.md`
  (lesson 1), `scripts/data-pause-conformance.mjs` and `scripts/fixtures/data-sample/`.
- **Pre-existing failure found.** `e2e/production-data.spec.ts` "Connect closes only once the save
  landed" fails 4 of 4 on `origin/main` (`503b029`) on this machine and 1 of 2 on this branch: the
  app's "Could not save" dialog covers the second Connect. Filed as #1603; not this row's.
- **Traps.**
  - `bootstrapGraphic`'s `name` is the catalog VARIANT, not a name for the graphic.
  - A plpgsql `case ... when ... then perform` is a statement and needs every branch, so the
    self-check's unknown step raises.
  - The local stack started before the migration file existed; `supabase@2.111.0 migration up`
    applies a new file to a running stack.

## Row 11, data-sources C4: Feeds

- **Repair, 2026-10-22 (P11 repair 1, the check's FAIL on `ed8394c`).** `childrenOf` copied an
  item's child list on every append, so same-name direct children were quadratic (0.7 MB took
  98 s; 5 MB about an hour, past `maxDuration`). It now pushes in place: 5 MB in 0.35 s. The audit
  of the rest of the parser found one more rescan: `plainText` split on a lazy CDATA regex, which
  rescanned the 16 KB title cap from every unclosed `<![CDATA[` (1.3 s for 5 MB of such titles);
  it now scans forward with `indexOf` (0.25 s). Both shapes joined the 5 MB hostile-markup test
  under its 2 s bound. No time check was added inside the parse: it could only sit between items,
  and the shapes that went quadratic were inside one item; linearity is pinned by the test instead.
- **Previous verified `main` sha:** `570da40a4e32fc6b0876d109fa41e679eb5490c1` (row 10, C3, #1593
  and repair #1594). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0099 is additive and stays applied:
  `feed_cache` is then read by nothing, and `control_data_tick_due` keeps listing feed sources,
  which a reverted tick reads as Sheets and fails harmlessly (`readSheet` of an undefined id; the
  outcome is recorded as failed and nothing is written). Remove feed sources from productions
  (Disconnect) before reverting if any exist; a reverted page ignores them otherwise.
- **Q record used.** `docs/work-specs/data-sources/evidence/feeds.md` and its six fixtures, cited
  for markup and conditional requests: the parser is tested on every fixture (CDATA titles of the
  Node.js blog, `&#39;` in the GitHub releases, emoji and the `media:` namespace of YouTube, the
  Vercel blog's escaped `&lt;script ...&gt;` read as text, PyPI identified by link, Yle's
  `<ttl>5</ttl>`); the record's advice is taken: the reader honours `<ttl>` and `max-age` as lower
  bounds on the 5-minute floor, the size cap (5 MB, decompressed) sits above the Vercel blog's
  3.9 MB whole feed, and an oversized or failed read keeps the last good list.
- **Receipt.** `docs/work-specs/data-sources/evidence/feed-real-receipt.md`: Yle through the
  emitted data function on the local stack (CLI 2.111.0, every migration through 0099 from an empty
  database): 200 with 11 headlines and a weak ETag; a second read served from the row with no
  request; after the wait, a conditional request answered 304 with the headlines unchanged.
- **Decisions.**
  - The route is `GET /api/data/feed?url=<address>`, a public segment of the data catch-all (one
    segment deep; no new function). It answers `{ ok, items, fetchedAt }` (headlines only), or
    `{ ok: false, error, fix, failingSince }` with the last good headlines when there are any.
    One client is refused after 30 reads a minute (`checkFeedIpRateLimit` in
    `api/_lib/rateLimit.ts`, in-process and per instance as the other data gates, `FEED_RATE_MAX`
    to tune); one address is fetched at most once every 5 minutes whatever the readers. A client
    that leaves ends only its own wait, never the fetch other readers are waiting on.
  - The guard (`api/_lib/feedFetch.ts`): http and https only, on their own ports, no credentials;
    the name is resolved by the reader itself and EVERY answer must be public (a name answering one
    private address is refused whole); the connection is pinned to the checked address through the
    request's own `lookup`, so TLS still checks the certificate against the name; every redirect is
    checked the same way, at most 5 (the validators go only to the same site); the body stops at
    5 MB after decompression (`stream.pipeline`, so an abort ends the decoder too) and the read,
    every lookup and redirect included, at 10 s. IPv4 is connected first when a name has both, as
    a function may have no IPv6 egress. The page runs the same address check before asking
    (`normalizeFeedAddress` lives in `src/control/feedSource.ts` and the route imports it). Public means: IPv4 outside the special ranges (private, shared,
    loopback, link-local with the 169.254.169.254 metadata address, documentation, benchmarking,
    multicast, reserved); IPv6 only inside global unicast 2000::/3, minus Teredo and protocol
    assignments, documentation and 6to4, so loopback, unique-local (fd00:ec2::254), link-local,
    IPv4-mapped and NAT64 forms all fall outside. A refused address answers 400, from the row too
    (`refused`), and is not looked up again for 5 minutes. A row whose wait ended a day ago is
    deleted at the next fetch (any address in use is fetched at least hourly), so addresses
    nobody reads do not pile up.
  - Politeness: the wait after a read is the 5-minute floor, or longer when the feed asks
    (`<ttl>`, `max-age`, a `Retry-After` on a refusal), never longer than an hour. ETag and
    Last-Modified go back only for headlines in hand. Headlines: titles as plain text (entities
    decoded once outside CDATA, so escaped markup in a text title stays text; CDATA and Atom
    `type="html"` read as HTML), each item once by guid/id or link, newest first when every item is
    dated (else feed order), 20, at most 300 characters.
  - The shared cache is `feed_cache` (0099), keyed by the SHA-256 of the normalized address, with
    the two lease times defaulting to the epoch so the claim is one conditional update
    (`claimed_until < now and next_allowed_at <= now`) through the service-role client, as the
    spec says; no SQL function, so no new advisor class. A reader that loses the claim serves the
    stale row; before any first read it waits for that read to settle (looking at the row after
    250 ms, then twice as long each time up to a second, never longer than the read's own time),
    so two readers at once make one fetch.
  - The browser reader reuses the Sheet reader: `createSheetReader` gained `read`, `everyMs`,
    `renewMs` and `timeoutMs` options. A feed asks the route every 5 minutes and renews its claim
    every 30 s in between, because the published row holds any lease at most a minute (0097):
    without the renewal the tick or another tab would take the feed while the page is open. The
    lease is three renewals (`leaseOf`, 90 s for a feed, 15 s for a Sheet as before); Connect and
    Resume read at once. One `FEED_CADENCE` and `FEED_LEASE_MS` in `feedSource.ts` feed both the
    reader and the published lease. Feed paths are `feed.<id>.lines` (the spec's content line);
    `sourcePrefix(id, kind)` takes the kind, and `isSourcePath`/`sourceIdOf` know both prefixes.
  - The tick lists feed sources (0099 widens `control_data_tick_due`, same signature and grants)
    and reads them through `readFeed`, never with its own fetch; their rows keep the label
    `'sheet'`, which names the server tick, not the kind (widening `control_data_apply` again for a
    word was not worth a second copy of its body).
  - "Connect… News feed" is the ticker's existing Connect data… box: on a graphic whose shape is
    `lines`, a pasted address that is not a Sheet link is read as a feed through the route, and
    the review, mapping, "Used by" and one confirmation are the Sheet's. The Playout sources line,
    the Data overview and the connected-field mark name the kind ("News feed: …", "about every
    5 min"); a connected feed list says "Connected to News feed: …" with Disconnect, as there is no
    source to edit.
- **Files beyond the phase's list, and why.** `src/control/sheetSource.ts` (the reader's `read`,
  cadence and lease options, kind-aware leaves), `src/control/hostedControl.ts` (the published
  lease's length), `src/model/productionData.ts` (the `feed.` prefix), `src/model/shows.ts`
  (`FeedShowSource`, `fillsFields`, `sourceKindWord`), `src/components/home/ProductionPage.tsx`
  (starts a feed's reader beside the Sheet readers), `SourcesLine.tsx` and
  `ProductionDataPanel.tsx` (show feeds, with their cadence), `ProductionAudienceWorkspace.tsx`
  (one type guard the new union needed), `api/_lib/dataTick.ts` (the tick reads feeds),
  `api/_lib/rateLimit.ts` (the feed route's per-client limit beside the other routes'), and
  `scripts/supabase-advisors.mjs` with `supabase/advisor-baseline.json` (`feed_cache`'s deny-all,
  lesson 1 of the run). Each is the smallest change that puts the feed on the reader and the tick
  the spec names.
- **Mutation checks** (each mutation turned its test red, then was reverted): floor 5 to 4 min;
  the hour cap 60 to 120 min; timeout 10 to 11 s (the test is cancelled: the read never ends at
  10 s); redirects 5 to 6; body 5 MB to 6 MB; claim 20 to 30 s; items 20 to 25; title 300 to 400;
  address 2048 to 4096; client limit 30 to 60 a minute; first answer checked instead of every
  answer; a second lookup at connect time instead of the checked address; redirects not
  re-checked; validators not sent; dedupe off; a failure dropping the last good headlines; the
  browser cadence 5 to 1 min; the lease 3 renewals to 2; the renewal 30 to 60 s; Resume not
  forcing a read; a failure with headlines read as success; the prune age 24 to 48 h; a refusal
  not kept on the row; IPv6 connected first; validators sent across sites; the lookup outside the
  read's time (the test is cancelled); a headline cut by UTF-16 units; and, in the configured
  walk, an insert that claims whether or not it won (two upstream fetches).
- **Check.** Review (delegated, high): 10 findings, all confirmed and fixed (decoder not ended on
  abort, published lease lapsing between reads, unbounded rows, IPv6-first connect, refusal status
  lost from the row, lookup outside the timeout, validators across sites, the route's wait ignoring
  a client gone, surrogate-splitting cut, a defaulted prefix kind). Simplify (four delegated
  angles): the feed cadence and lease in one place, the reader plan carries the kind, one address
  check for page and route, the rate limit as a `rateLimit.ts` pair, shared `sha256`, patch
  builders and a regex cache in the parser, one read path in Connect. Skipped: a shared byte-cap
  helper with C2's `cappedFetch` (would reshape C2's tested path), a `sourceShape` helper (two
  call sites), a longer renewal (30 s keeps margin under the one-minute row lease).
- **Assessment A** (a fresh read-only session with the `/so` brief, on `45f7cf91`): AGREE WITH
  CORRECTIONS. Its four corrections are in: (1) the parser was quadratic on hostile markup (its
  lazy regexes rescanned to the end from every unclosed tag; 400 KB of `<item>` took 5 s), which
  could hold the public route and the tick; it now scans forward only (`indexOf`, an element
  without its end stops the scan, a headline's markup is read up to 16 KB), and `feed-fetch` feeds
  it nine 5 MB hostile documents, each under 2 s (slowest 352 ms; the old comment regex turns it
  red); (2) a tick cut-off was saved as the feed's failure for every reader for 5 minutes; a read
  the caller cuts short now lets only the claim go; (3) the real connection had no test; two now
  run `nodeFeedNet` against a local server, one reaching it only through the pinned address under
  an unresolvable name (with gzip), one proving a stalled compressed body ends at the abort (both
  red when the `lookup` or `pipeline` is removed); (4) the never-written `updated_at` column is
  gone from 0099. The real receipt was repeated on the final code with the same result.
- **Codex review** of `90033f8` (two P2 findings, both regressions this branch introduced, both
  fixed in `a142a68` with a test that fails on `90033f8`): the forward-only parser no longer read
  an Atom feed written with a namespace prefix (`<atom:feed>`, `<atom:entry>`), so such a feed
  would read as empty and clear the ticker; the prefix is now taken from the root and used for the
  entries and their children. And a 304 forgot the feed's own `<ttl>` (only the body carries it),
  dropping an hourly feed to every 5 minutes; 0099 gains `feed_wait_ms`, kept with the headlines
  and applied after a 304 (and kept as at most an hour, so any `<ttl>` fits the column). Its
  re-review of `f665175` found two more, also fixed with tests that fail on `f665175`: an item's
  metadata was the first matching substring, so a `<title>` inside a description's CDATA could
  replace the headline; items are now read as their DIRECT children with CDATA masked, and a
  stray unclosed tag cannot hide the rest of the item. And a 200 body cut off early parsed as an
  empty feed and cleared the ticker; a document without its root's end is now a failed read that
  keeps the last good headlines (a feed with no items still ends its root and reads as empty).
  The final parser read three live feeds (Yle 11, PyPI 20, GitHub releases 10 headlines) and the
  hostile 5 MB set, now twelve cases, stays under 2 s each.
- **Traps.**
  - A lazy regex over a body someone else wrote is a denial of service at 5 MB; scan forward.
  - `node:http`'s `lookup` option must answer both shapes (`all: true` gets an array); a typed
    `LookupFunction` cast keeps the root tsconfig's check.
  - The configured walk replaces `feedNetwork.current` in the route's own process, so the guard
    still resolves and checks every address; the stub answers only the checked public address.
  - A local Supabase stack runs on a cloud machine once `dockerd` is started by hand; `supabase@2.111.0
    start -x studio,edge-runtime` then applies every migration from empty.

## Row 10, data-sources C3: Sheet messages and YouTube

- **Repair, 2026-10-22 (P10 repair 1, the check's FAIL on `a868bc5`).** Post-landing run 39706145334
  failed in Advisors after 0098 applied: `audience_operator_settle` for `anon` and `authenticated`
  was not in `supabase/advisor-baseline.json`. The judgement is now in `ACCEPTED_CLASSES` in
  `scripts/supabase-advisors.mjs`, the two entries were added by hand (180 to 182; re-recording reads
  production, which only that workflow does) and `docs/STACK_FRESHNESS.md` says why. No migration or
  product code changed. The flaky `e2e/production-chat-intake.spec.ts:311` the check also saw is filed
  as its own issue.
- **Previous verified `main` sha:** `4890bbdfd272dcf524b03a63a0de92cd86f0aede` (row 9, C2, #1591 and
  repair #1592). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0098 is additive and stays applied:
  a reverted build calls `audience_list` and `audience_operator_add` with the same arguments,
  reads their columns by name (ignoring `withdrawn_at`) and never calls `audience_operator_settle`.
  YouTube entries already saved in `Show.sources` are skipped by the reverted server tick (0097's
  due query reads `kind = 'sheet'` only) but a reverted page would start a Sheet reader for them that
  fails harmlessly; remove them in Messages before reverting if any exist.
- **Q record used.** `docs/work-specs/data-sources/evidence/youtube.md`, both halves: a key alone
  reads public comments and live chat (so both modes are promised); comments are fetched with
  `order=time`, `textFormat=plainText`, `maxResults=100` and sorted by their own `publishedAt`
  (the record's first slot held a 2020 comment); live chat's first page is history (68 messages
  over 7.6 minutes) and is delivered marked earlier; the API hinted 2,853 to 3,145 ms, so the 5 s
  floor sets the pace: 60 units a minute, 3,600 an hour, the 10,000-unit day lasting 2 h 46 min
  (the spec's "about 2 hours 45 minutes"; the line shows the computed 2 h 46 min). Error shapes
  used: 404 `videoNotFound` and 401 `authorizationRequired` as recorded; `quotaExceeded`,
  `commentsDisabled` and a bad key in the API's documented shapes. Tests run on synthetic fixtures
  (`scripts/fixtures/youtube/`) with the record's shapes, counts, intervals and times and invented
  text; no live call was made in this phase (0 units of the shared key).
- **Decisions.**
  - A message Sheet is a `sheet` source with `inbox: true` (Messages, "Message Sheet"), read by the
    page's one reader under its lease; `src/audience/sheetMessages.ts` is the inbox consumer: rows
    to candidates by the audience spec's identity (a cyrb53 hash of Name, Message, Source and
    Reference plus `#<occurrence>`, external id `sheet:<source id>:<hash>#<n>`), arrivals through
    `addCandidates` at most 100 a call, then `settleImported` with the tab's whole id set. Only the
    tab's first row names columns (Message required; Name, Source, Reference optional, with the
    staging titles as synonyms); Source becomes provenance `Sheet: <label> · <cell>`, Reference the
    private note. At most 2,000 messages a tab; more is said.
  - Vanished rows: the backend gained one method, `settleImported(prefix, present)`: an unused
    candidate under the prefix whose id is not present leaves the inbox; a used one is kept with its
    original and marked `withdrawnAt` ("no longer in the Sheet"); a returning row is unmarked.
    Published, it is `audience_operator_settle` (0098), keyed on the control slug, bounded at
    2,000 ids, refusing any prefix that is not `sheet:<id>:` so it can never touch a paste, a
    YouTube item or another Sheet. A column was needed so every operator page sees the mark, not
    only the reading page.
  - The unique index per show on `external_id` (partial, built concurrently, file safe to re-run
    from the top), and `audience_operator_add` now inserts `on conflict do nothing`: two calls
    adding one id at once give one row and neither fails (proven on a scratch Postgres with two
    sessions: the second waited, skipped the clash, and still added its other item).
  - YouTube sources are `Show.sources` entries of a new kind, `{ kind: 'youtube', config:
    { videoId, mode: 'comments' | 'chat' }, inbox: true }`; the record never holds the key.
    `ShowSource` became the union `SheetShowSource | YouTubeShowSource`; every reader that needs a
    Sheet narrows by `kind` (the Playout sources line and the Data overview show Sheets only; the
    cue editor's "Use existing content" lists Sheets only; the page starts Sheet readers only).
  - YouTube lines and comments go through the OPERATOR door (`addCandidates`, the published
    `audience_operator_add`), not the viewer's `submit`: they need no open audience and dedupe by
    `yt:<platform id>` in the database. Twitch keeps the viewer door unchanged
    (`twitchChat.ts` untouched). The platform word is provenance (`YouTube comments`,
    `YouTube chat`, `YouTube chat · earlier`), never in the name.
  - The key: memory for the tab, browser storage only with "Remember on this browser" (unticked by
    default). On reload a remembered live chat reconnects by itself; without the key Messages shows
    "Key needed" on the source. Live chat is read by ONE tab per browser (a 15 s claim in browser
    storage, renewed every 5 s, only by a tab that has a key), because the Playout tab and the
    Messages tab both run the production page and each poll is quota.
  - The quota line: comments "1 unit of your key's 10,000 a day"; live chat "about 3,600 units an
    hour ... about 2 h 46 min"; while chat runs, "About <h min> of chat left today, counting this
    browser's use since midnight Pacific time; other users of the key are not counted" from a
    per-browser spend record (`{ v: 1, day, units }`, day in `America/Los_Angeles`).
  - The cue editor's "Fill from… Pick a message" shows each candidate's provenance; Sheet and
    YouTube candidates reach it because they are ordinary candidates.
  - Duplicates already in production (owner decision path: the coordinator ruled that this row does
    not read production, and the migration must succeed either way): before the unique build, 0098
    clears `external_id` on every later duplicate, keeping the first row's id. The duplicate keeps
    its row, text and moderation and becomes an ordinary candidate no source settles; nothing is
    deleted. Proven on a scratch Postgres seeded with three rows of one id (one used) and one
    unique: the index built valid, the first kept the id, the used flag survived.
  - A message Sheet's source id is stable per tab (`msg-<hash of sheet id and gid>`), so removing
    and connecting it again finds its candidates instead of adding every row again; a tab already
    followed for fields keeps its own id and gains the inbox.
  - Only the lease's holder feeds the inbox (`sheetSource.ts` calls the consumer after the settle
    is kept): an old owner's late read can no longer put back what the new owner took out.
  - The inbox consumer seeds what the inbox holds on its first read, without withdrawn rows, so a
    reload re-sends nothing and a row restored while no page was open is unmarked.
  - Leaving a production stops this tab's YouTube chats for it and releases their claims; a
    comments answer that lands after its source was removed adds nothing.
  - Messages from a Sheet keep arriving only while a page of the production is open: the server
    tick (C2) reads Sheets for fields, not for the inbox. Not in C3's acceptance; said here so C7
    does not expect closed-page messages.
- **Extra files** (beyond the named ones), each needed by the union type or the backend method:
  `src/model/shows.ts` (the union, `addMessageSource`, `removeMessageSource`),
  `src/audience/audienceTypes.ts`, `src/audience/localAudience.ts`, `src/audience/audienceData.ts`
  (`settleImported`, `withdrawnAt`, `OPERATOR_SETTLE_MAX`), `src/components/home/ProductionPage.tsx`
  (the inbox consumer on the page's Sheet readers, Sheet readers only, the YouTube hook),
  `src/components/home/SourcesLine.tsx` and `src/components/home/ProductionDataPanel.tsx` (Sheets
  only), `src/control/sheetSource.ts` (the inbox fed only by the lease holder, with its test in
  `scripts/sheet-source.test.mjs`), `scripts/message-staging.test.mjs` (the interface list gains `settleImported`),
  `scripts/audience-identity-migration.test.mjs` and `scripts/fixtures/youtube/`.
- **Recorded responses.** The C3 row asks for recorded responses; the repository may hold no comment
  text or author name, so `scripts/fixtures/youtube/` carries the Q record's shapes, counts,
  intervals and times with invented text. That is the departure from the wording, for its intent.
- **Assessment A** (fresh read-only session, `/so`): AGREE WITH CORRECTIONS; the three code
  corrections and the two-cue journey are in, the rest is weighed in the PR.
- **Traps.**
  - `on conflict (show_id, external_id)` inside a `RETURNS TABLE (... external_id ...)` function is
    ambiguous (42702) and an index target cannot be table-qualified; `#variable_conflict
    use_column` fixes it. Only the self-check that CALLS the function caught it (supabase/AGENTS.md).
  - The chat spec's `productionFor` returns nothing; use `openProductionWithCurrent` for an id.
  - `production-chat-intake` "the throttle and the dedupe" failed once (`0 in · 14 dropped`) while
    the machine also ran mutation tests; it passed in the 7 runs before and after. Not reproduced,
    not chased.

## Row 9, data-sources C2: published ownership and the server tick

- **Repair, 2026-10-21 (P9 repair 1, the check's FAIL on `b05bd28`).** The Q record bullet below
  said each guard was tested; two were not. `maxDuration` 30 for `api/data/[...path].ts` and the
  `* * * * *` `/api/data/tick` cron were checked by nothing, and the 26 s cut-off was asserted
  against `READS_END_MS` itself. `data-tick` now reads `vercel.json` and pins both values, and the
  late-read test expects a literal 7 000 ms (26 s less 19 s). Mutation-verified red: 30 to 300,
  the cron removed, the cron to `*/5 * * * *`, and `READS_END_MS` 26 000 to 29 000. Still tested
  by nothing, holding by reading only: the no-`sources`-column fallback in `hostedControl.ts`
  (`PGRST204` in `writePublishedSources`, `PGRST204`/`42703` in `firstPublishedSources`); a Node
  test would need a stub Supabase client for a browser module, more than this repair should add.
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
  safety rests on four guards, each in code and each tested (`maxDuration`, and the 26 s cut-off
  below, only since the repair above): the 10-second read timeout
  (`SHEET_TIMEOUT_MS`, `data-tick` "cut at 10 s"), no read started after 20 seconds
  (`NO_NEW_READ_MS`, "no read starts after 20 seconds"), `maxDuration` 30 for
  `api/data/[...path].ts` in `vercel.json`, and the switch's expiry, at most 48 hours ahead
  (`dataTickOnAt`, `data_tick_on()`; the record bounds a runaway 48-hour window at about $5). Its
  advice is also taken: reads run four at a time, and a tab over 1 MB is not read. One more guard
  came from the review: a read started late gets only the time left before 26 s
  (`READS_END_MS`), so its write, the release and the run's record still fit inside the 30 s.
- **Receipts** (`docs/work-specs/data-sources/evidence/sheet-timed-published.md`), on the local
  stack with the owner's sixth test Sheet through the service account, at `169b090`: with an
  operator page open, 20 of 20 API edits on the published output within 10 s, median 3.4 s,
  slowest 5.6 s (sheet AC-3 published); with every operator page closed and the tick called on the
  minute, 6 of 6 edits on the published output in 25.6 to 60.0 s (sheet AC-4); each recorded tick
  run took 1.1 to 1.4 s for one to three sources. Nothing was taken, advanced or removed.
- **Decisions.**
  - The row carries `sources` (0097) beside `bindings`. Publish writes both; Connect, Disconnect
    and Pause write both again at once (`writePublishedSources`, from one effect in
    `ProductionPage.tsx` that skips the value the page opened with or published), so a field connected after
    publishing moves the output with no new publish. A direct column write through the owner's
    row policy, as DS17 says: no RPC.
  - The published lease is on the row: `control_source_reads` holds the owner, claim, expiry,
    snapshot, content fingerprint and status of each published source. `control_source_lease` is
    the one lease function the browser readers (on the control slug), the tick (service role) and
    later E4 call. The claim decides, not the owner's name: a live lease is renewed only with its
    own claim and let go (ttl 0) only with it, so a duplicated cron call, which shares the name
    `tick`, can neither take over nor release the other run's lease. The lease answer also carries
    the row's Pause, so a Pause made on another device holds this page's reader too. The write is `control_source_commit` (browser, through
    `control_data_patch_by_slug` with all its guards) or `control_source_tick_commit` (service
    role only, `control_data_apply` labelled `'sheet'`), both through `control_source_settle`,
    which checks the claim and writes under one row lock. That closes C1b's low note: an old
    owner's write in flight across a handover is refused by the database, not by a browser check.
    The write takes changed paths as text by path; a path the row does not bind yet, or one that
    0088's rules for a press would refuse (an object a feed wrote there, a branch above it that is
    not an object), is left out and keeps its earlier snapshot, for both labels, so the tick can
    never erase what the operator's door protects. That replaced C1b's
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
    module), without hidden fields as the browser reads them; `data-tick` pins the two against
    `fieldDescriptors`.
  - `sheetSource.ts` and `contentFormats.ts` import each other by `.js`, because the function's
    emit keeps the specifier; the Node tests that load them import `scripts/lib/tsResolve.mjs`
    first, one resolve hook for `.js` and extensionless specifiers under `src/` and `api/`. Their type imports moved off `model/packets` to
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
    showing "read in another tab" for up to 15 s, its own previous page's lease. Published, the
    release is a keepalive request straight to the RPC, because a reload cancels an ordinary one.
  - The value a page opens with (or publishes) is never written to the row, so a page holding an
    older copy cannot overwrite newer sources (assessment A, medium); every change after it is,
    including a return to that first value. Comparing later values with the first one dropped a
    Resume back to it and left the row paused (review, fixed; the configured walk pauses and
    resumes around it). One writer per published production (`latestWriter` in `sheetSource.ts`)
    sends one write at a time with the newest value last, so a slow Pause cannot land after the
    Resume that followed it. Plans are compared as canonical JSON (`publishedRecord.ts`
    `canonical`), since a record read back from the server reorders its keys.
  - `control_shows.sources` is NULL until first written (0097 adds it with no default): a row
    published before it holds no sources, and the page opening it writes its own once
    (`firstPublishedSources`, an update conditional on sources still being NULL, retried under the
    same condition), so it never replaces sources another page wrote meanwhile; a written row, even
    an empty one, is never overwritten on open.
  - Trap: React runs each effect twice in development with its refs kept, so "skip the first
    value" must treat that first value, seen again before any change, as no change. Without it the
    dev server wrote the opening value at once and hid both this and the never-written case from
    the configured walk (found by mutation). A failed write is
    tried again every 10 s while the page shows it (said once); a write that matches no row (signed
    out) counts as failed. A change whose write was lost to a reload reaches the row at the next
    publish.
  - A lease the page cannot reach (offline, or an instance that has not run 0097) is a missed read
    with its reason, so the line goes stale rather than silent.
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
  `scripts/lib/tsResolve.mjs` (the hook itself, shared), `src/model/publishedRecord.ts` (exports
  `canonical`), `scripts/production-data-session.test.mjs`,
  `supabase/advisor-baseline.json`, and the receipt `evidence/sheet-timed-published.md`.
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

