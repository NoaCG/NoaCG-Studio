# Leave-editor reliability

## Why and goal

The October 6 review reported that unsaved work was questioned after reaching Home.
Current main `4508e1331` deliberately guards document replacement only; Home changes
the route without resolving the draft. Resolve that decision while the editor is
still present and preserve explicit local Save, cloud sync and production revisions.

## Scope and decisions

- Reuse the existing Save / Discard / Cancel dialog and working-document slot.
  Guard navigation out of the mounted editor before publishing its destination.
  Browser history and hash navigation use the same decision; cancellation keeps
  the editor and its original history position.
- Save waits for the existing durable-write confirmation. First-save naming can
  be cancelled without navigating. A failed save keeps the draft and destination
  pending. Prevent repeated submissions while a write is in flight.
- Discard restores the linked library document, or resets a never-saved experiment
  to an unlinked clean default. It never creates, updates or deletes a library
  graphic. Clear discarded undo history and persist the working slot so reload
  cannot resurrect the experiment or ask again at Home.
- An untouched wizard Edit result remains a pristine unsaved baseline and leaves
  without a question, preserving the October 7 correction.
- No project tabs/manifests, cloud-status redesign, publishing, on-air updates,
  loops, R2/R3, default switch, owner acceptance or physical-host claim.
  Wizard shell/import files belong to other active phases and are not edited.

## Acceptance and checks

1. Normal wizard/import route, never-saved edited artwork: Home asks over the
   editor, with no Home mounted or destination URL committed. Cancel/Escape and
   cancelled naming preserve source, selection and history.
2. Save and first Save retain the exact edited source after Home and reopen;
   discard creates no graphic. Existing saved copies remain byte-equivalent when
   their experiments are discarded. A later New/Open does not repeat the question.
3. New/Open from the editor and browser Back/hash changes use the same boundary.
   A failed durable write and double submission cannot navigate early or mint
   duplicate records. Discard and reload do not resurrect discarded work.
4. Preserve the pristine-baseline guard, wizard-held-walk decisions, local library
   links, cloud-sync separation and production copies. Target maintained
   `e2e/new-graphic-guard.spec.ts`, library and wizard-draft regressions; mutation
   test the navigation guard by proving the destination remains absent.
5. Fresh comparable Studio `3142fc7d` / official v0.17 and Eyevinn `616841bd`
   lifecycle executions, inspected event -> mutation -> preview and tests, exact
   file hashes and deliberate differences. No upstream source is copied.
6. Inspect desktop/laptop/native 125% and preserve prior cumulative text, artwork,
   animation, save/reopen and executable SPX/CasparCG/OGraf receipts. Browser work
   runs through the scheduler or disposable CI at the unchanged 4 GB local floor.

## Reproduction and receipts

Disposable CI reproduction: run `38445327031`, product tree `4508e1331` plus the
docs-only independent checker receipt. Results and source comparison follow in
the verification receipt. Full suites/builds belong to pull-request CI.

[Passing verification, failed-attempt history and limits](verification.md).
