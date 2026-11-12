# Phase 4 evidence: the production's copy is the only truth; old pages only play out

Acceptance (verbatim): "Design G1 graded A by an independent /so" and "AC-2".

AC-2 (spec): "Editing or breaking a graphic in the library changes nothing on the monitors, in a
publish or on an output; the graphic shows "Newer design in library"; Update keeps cues, values,
adjustments, links and stack position and names a dropped field first. An old-build page saving,
syncing and publishing after adoption is refused with "Reload this page to edit" and changes nothing
stored; its Takes, reports and heartbeats still work; reopened under the new build, its cue edits
merge and its library designs are dropped (E3)."

Design: `designs/G1.md`, graded A by an independent `/so` at e32746e and landed as #2404 (merge
eee7827). Its Rules R1 to R13 are what this build is held to. Base of the build: `origin/main`
eee7827892b1936c00acc263655cf6a6e753e4be. Hardware checks: none in this phase (no hardware path
changes).

## What changed, by rule

- R1, one source. `templateForSavedGraphic` and `designEditedAt` (`src/model/library.ts`) read the
  copy; every direct library design read in G1 section 1 reads it too (`SourcesLine.tsx`,
  `graphicsPack.ts`, `shows.ts` `ownSheetGraphics`, the sound editor, `libraryGraphicDigests` via
  `copyDigest`). A publish no longer copies library designs in; it still records stopped Sheet
  readers (`recordOwnReaderStops`, R12). The own-reader removal always edits the copy
  (`liveData.ts` `ownReaderRemoval`).
- R2, Update. `newerLibraryDesign` (library.ts), `updateCopyFromLibrary` and `droppedFields`
  (shows.ts); the cue editor shows "Newer design in library" with Update above Advanced
  (`CueEditor.tsx` `DesignUpdate`), the press goes through the production gate and the rundown
  history (one undo step), and a dropped field a cue uses or a binding names arms the button with
  "Update drops <field> from <n> cues." first.
- R3, the stamp. `SavedGraphic.designAt` (packets.ts), set by add, Update, the own-reader removal,
  the settle, adoption and an Undo or Redo of a design (`rundownHistory.ts`
  `stampRestoredDesigns`, in both the write and what the history records).
- R4, the send-time settle. `src/model/copySettle.ts`; called by the personal sync push and before
  a conflict copy (`sync.ts`), by the team save before its first attempt (`teamProductions.ts`), by
  a personal publish and an export (`syncController.ts` `settleProductionForSend`,
  `useProductionPublish.ts`, `ProductionExportDialog.tsx`).
- R5, R6, R9, the guard. `supabase/migrations/0115_production_copies_guard.sql` (live-path):
  triggers on `documents` (kind `show`), `team_productions` and `control_shows`, one definer
  function, the `production_copies` switch in `system_settings`, and `production_copies_state()`.
  Inert until the switch is on.
- R7, the split team merge. `teamShowMerge.ts` `mergeGraphic`.
- R10, adoption. `src/control/copyAdoption.ts`, `shows.ts` `adoptShowCopies`,
  `src/components/home/useCopyAdoption.ts`; runs only while the switch reads on.
- R11, the record digest. `publishedRecord.ts`: every copy's template without its name, `savedAt`
  and `designAt` left out, tagged `2:`; an untagged stored digest is read by the old formula.
- R13, the mark. `src/backend/supabase.ts` adds `x-noacg-production-copies: 1` to REST API
  requests only.

## Decisions (build)

- Adding a graphic the production already holds replaces its design as before, and stamps it. G1
  section 2 said that door would ask the dropped-field question too; the build first refused such
  an add, which broke the wizard's re-import "Replace anyway", a replacement it had already
  confirmed after naming what the new version drops. Cue values are never deleted by either door.
  Four other doors add by name and replace the same way without asking, as they did before this
  build: the rundown's add (`CueRundown.tsx`), a library row and the Graphics section's
  "+ Production" (`GraphicRow.tsx`, `GraphicsSection.tsx`) and the control page's
  (`GraphicControlPage.tsx`). Whether they should ask the dropped-field question is an owner choice
  left open; this build does not change them.
- A community pack built from a personal production (`community/packSources.ts`) reads the copies
  and is not settled. It is not a send of the production: it carries only the maker's own graphics
  to the shelf, never to an output, and settling would need a cloud read inside a synchronous list.

- The personal sync settle is called by the sync engine directly, not through a hook the app
  registers (G1 section 3 said a registration). `backend/` may import the kernel, and
  `model/copySettle.ts` is kernel, pure and needs no stamp or digest, so the registration bought
  nothing. The publish and export settle, which need the cloud read, live in `syncController.ts`.
- A team publish or export flushes the team save first (`flushTeamProduction`), which settles; with
  nothing pending the team record is the stored document, which needs no settle.
- The production page re-reads its library only when the stored library moved, compared by
  reference (`libraryStoreText`), so a cue save on a live page parses nothing extra. That re-read
  feeds only "Newer design in library" and Update (`designLibrary`); the library the monitors,
  measurer and pool machines read still moves only on the page's own-reader removal, so a library
  edit mid-show never rebuilds the program monitor (the final /so's finding 1, now held by the
  publish guard walk's frame check).
- A move to a team settles first (`ShareWithTeamDialog.tsx`), and a team publish or export whose
  flush failed stops while a settle is still owed (`teamSettleOwed`): the save returns before
  settling when browser storage refuses.
- The new browser checks live in the publish guard's maintained configured spec
  (`e2e/configured/publish-guard.spec.ts`, describe "production copies"), not a new file: the
  capacity gate refuses a new backend-tier file while backend growth is stopped, and the repo's own
  rule extends a flow's maintained spec. They add about 32 s to that spec on the local stack.
- `production_copies_state()` is granted to `authenticated` only (signed-in pages read it), and
  recorded in `supabase/advisor-baseline.json` as a meant definer grant, as
  `scripts/advisor-baseline-grants.test.mjs` requires.
- Existing tests whose expectations encoded library-first reads now take a library edit in through
  Update (`publish-guard`, `live-prepare`, `per-graphic-replacement`, `publish-drift`,
  `cue-adjust.test.mjs`, `legacy-sheet-block.test.mjs`); each still checks what it checked
  (publish carries the design, outputs swap, stopped readers are recorded), and none was loosened.

## Traps met

- The local stack needed `iproute2` (`ss`) and an `--owner` outside Actions
  (`scripts/configured-stack.mjs up --owner <id>`); `mirror.gcr.io` lacked several images, the
  default registry served them all.
- A migration's self-check is skipped on a fresh instance with no account; it was run by hand
  after creating one (below).
- `scripts/db-push.test.mjs` requires a trigger function a live-path table calls to be in
  `LIVE_PATH_FUNCTIONS`: `production_authoring_guard` was added there and in `supabase/AGENTS.md`.
- Sync tests that load `sync.ts` through explicit stubs needed the new dependency stubbed.

## Rules found while building

- R10 as built missed G1's own candidate list: page adoption had no base candidate, so on a reopened
  old page with a retained pulled design it found no match, kept the copy and stamped it, and the
  next push carried the pulled design. The configured walk caught it (job j-0002, the assertion
  "not 'pulled by an old page'" failed on both attempts). Fixed by settling against the server's
  copy before adopting (`useCopyAdoption.ts`); the same walk passes after (j-0003, j-0004).

- CI on aa58ff6 failed `shared-lab-computer.spec.ts` twice and the AC-2 walk once. Cause: the
  guard-route test posted a `look` with an empty body to the test account and left it. A look body
  without its id is posted again as a new row by every sync pass (existing behaviour on `main`, not
  this build's), so the account grew by one look per pass, the sync never read Synced, and an old
  page's passes went to the conflict branch. The test now writes a well-formed look and deletes it
  at once. The multiplying sync of an id-less look is left as found, out of this phase's scope.
- Adoption could be lost until the next reload: the hook marked a production tried before its
  async run, and a re-render with new inputs cancelled that run, so the next run found it tried
  and stopped. Hidden while the polluted account above made every pass slow; once cleaned, the
  AC-2 walk failed 4 of 4 at the adoption step (j-0028). A run cut short now clears the mark
  (`useCopyAdoption.ts`); the same walk then passed 3 of 3 (j-0030). The walk also waits for the
  production's record to reach the cloud before reading it.
- `e2e/shows.spec.ts` "a rundown export ships the LIVE graphic" encoded the library-first export
  that R1 reverses. It now checks both sides: the export ships the copy, and after Update it ships
  the library edit.

## Verification

All on one Claude cloud worker (4 CPUs) against the configured suite's local Supabase stack
(CLI 2.111.0, every migration including 0115 applied on a fresh volume).

- Migration 0115: applied by `supabase start` on a fresh volume; its self-check skipped there (no
  account) and was then run by hand against a real account: passed, and left no switch row and no
  throwaway rows.
- The guard through the REST gateway, as a browser calls it (scratch probe, then the committed
  configured test): 21 of 21 checks passed, including `request.headers` and the JWT role seen
  inside `team_production_save`, a refused save storing nothing, a Pause passing and a Connect
  refused, the service role passing, and the switch off restoring every write.
- Node: the 44 test files the changed paths reach, through `npm run gates -- run --changed
  origin/main`: 689 of 689 passed, with every cheap check of the gates. New:
  `copy-settle.test.mjs` (14, the settle against a reference written from R4, the split merge, an
  Undo's stamp, the owed edit beside a pulled design), `production-copies.test.mjs` (5: R1 with an
  edited, broken and deleted record; Update's keeps; the dropped-field rule; adoption against real
  `stampPayload` digests; never-published adoption), `sync-copy-settle.test.mjs` (4: push,
  stamped, unreadable base, conflict copy), a team-save test running the real settle, the mark on
  REST only (`cloud-answer-limit.test.mjs`), and the versioned record digest
  (`published-record.test.mjs`, the rename test digesting before the rename).
- Mutation checks: breaking the settle (skip an unstamped base) fails 5 copy-settle tests; dropping
  the conflict-copy settle fails the sync test; disabling the team save's settle fails the
  team-save test; the configured walk failed on the adoption defect above.
- Configured (`e2e/configured/publish-guard.spec.ts`, queued job j-0004): 3 passed, 1 skipped (the
  two-member walk needs teammate credentials, which this worker's stack did not have; CI has
  them).
- The real old bundle (current `main`, eee7827, the code an old page runs) on the same stack with
  the switch on, driven once by a scratch spec that was not committed (queued job j-0014). What
  that bundle shows: personal sync "Cloud put(show) failed: Reload this page to edit"; publish
  "Reload this page to edit" (its page note prefixes "Publish failed: "); Connect of a data source
  "Reload this page to edit"; the team save note "Reload this page to edit", state failed. The
  stored production kept its cue label (the old page's edit did not land). A Take pressed on it
  showed no note. Not established there: a command-row count before and after that Take (the
  count was read after only); a Take's route (`control_send`, `control_events`, `control_heads`)
  names no guarded table or column, and the committed configured test presses one on an old page.
  The run ended red in its own cleanup (deleting the test team hung) after recording.
- Offline browser specs (queued j-0006): `e2e/import-svg-reimport.spec.ts` and
  `e2e/publish-drift.spec.ts`, 21 passed. The first run (j-0005) failed "Replace anyway": a
  refusal this build had added to adding a graphic again broke a replacement the wizard had
  already confirmed; the refusal was removed (Decisions above), and the run passed.
- Configured: `live-prepare.spec.ts` (j-0009) passed, now taking its library edit in through the
  Update button; `per-graphic-replacement.spec.ts` with `publish-guard.spec.ts` (j-0007): 4 passed,
  the two-member walk skipped on this worker (no teammate account in the queue runner's
  environment); CI runs it.
- Capacity: `node scripts/e2e-capacity.mjs --changed origin/main` exits 0 (backend tier WARN, no
  new file); `node scripts/check-e2e-protection.mjs --changed origin/main` OK.

## Not checked here

- The production gateway's preflight for the header and `production_copies_state()` on
  production: G1 section 6 steps 1 and 3, the owner's or coordinator's steps around release and
  switch-on; this run never reaches production.
- Hardware: none in this phase.
