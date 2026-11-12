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
- The new browser checks live in a new configured spec file at first; see "Capacity" below for
  where they ended.

## Traps met

- The local stack needed `iproute2` (`ss`) and an `--owner` outside Actions
  (`scripts/configured-stack.mjs up --owner <id>`); `mirror.gcr.io` lacked several images, the
  default registry served them all.
- A migration's self-check is skipped on a fresh instance with no account; it was run by hand
  after creating one (below).
- `scripts/db-push.test.mjs` requires a trigger function a live-path table calls to be in
  `LIVE_PATH_FUNCTIONS`: `production_authoring_guard` was added there and in `supabase/AGENTS.md`.
- Sync tests that load `sync.ts` through explicit stubs needed the new dependency stubbed.

## Verification

Results are filled in below as each ran.
