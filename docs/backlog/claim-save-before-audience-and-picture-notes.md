# Claim the durable write before the Audience cue note and the picture upload note

**Filed:** 2026-09-28. **Source:** noticed while building rundown folders (phase 4 of
`docs/CLIP_PLAYBACK_PLAN.md`), outside that phase's scope.

## Why

Two production-page messages say a save worked before storage has agreed to it, which is the one
thing `components/never-report-save-storage-layer-has` forbids: the durable store accepts a write at
once and confirms it a moment later, so on a full or failing store the operator reads "✓" over a
change that is gone after a reload. The Audience workspace's "✓ Added a cue to the rundown ..." and
"✓ Updated the cue ..." lines, and the picture upload's success line, both report straight after
the model writer returns. The folder writers on the same page already wait and claim.

## What it would take

- `src/components/home/ProductionAudienceWorkspace.tsx`, the stage-tally handlers (around lines
  515-530 and 600-606): make them async, `await commitDurableWrites()` after `setShows`, and say
  its failure instead of the ✓ line.
- `src/components/home/ProductionPage.tsx`, `uploadPictures`: the same after the picture graphic
  and its cues are written.
- The pattern to copy is `writeRundown` in `ProductionPage.tsx`. A Playwright spec per surface
  with `e2e/_storage.ts` (`armStorageFailure`, `fillStorage`) that shows the failure and no ✓.

Small: two handlers and one spec.

## Evidence

The rule: `src/components/AGENTS.md`, "NEVER report a save the storage layer has not agreed to".
The handlers: `ProductionAudienceWorkspace.tsx` calls `setNote('✓ Added a cue ...')` right after
`addShowCue` with no `commitDurableWrites`; the phase 4 discovery sweep found the same in
`uploadPictures`.
