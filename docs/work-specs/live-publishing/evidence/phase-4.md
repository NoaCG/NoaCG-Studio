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
  "Update drops <field> from <n> cues." first. Adding a held graphic again with such a design is
  refused with a note pointing to Update.
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

- The personal sync settle is called by the sync engine directly, not through a hook the app
  registers (G1 section 3 said a registration). `backend/` may import the kernel, and
  `model/copySettle.ts` is kernel, pure and needs no stamp or digest, so the registration bought
  nothing. The publish and export settle, which need the cloud read, live in `syncController.ts`.
- A team publish or export flushes the team save first (`flushTeamProduction`), which settles; with
  nothing pending the team record is the stored document, which needs no settle.
- The production page re-reads its library only when the stored library moved, compared by
  reference (`libraryStoreText`), so a cue save on a live page parses nothing extra.
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
