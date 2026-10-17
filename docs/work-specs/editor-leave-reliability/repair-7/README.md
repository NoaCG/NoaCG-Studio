# Save in flight repair (#1392 #1383)

## Scope

The owner authorised this as the bounded repair of #1392, with the #1383 residual, after the sixth
independent check failed ([independent-6](../independent-6/README.md), main `ea71261c`; main
`7bd9f79c` has the same `src/` and `e2e/`). Scope is acceptance criteria 2 and 3. The owner's
wording: the leave guard treats a Save whose writes are still in flight as unsettled and waits for
its answer; a refusal keeps the editor open with the failure shown, with no silent leave and no
delayed repeat question; the reservation is made durable with the record, so a double refusal plus
a reload cannot mint a duplicate. The change stays inside repair-6's transaction.

## What failed

- #1392 (S1-home-late, S1-hash-late). A topbar Save (or Ctrl+S) of a linked graphic sets
  `saved.dirty` false once its record lands, then waits for its link write (K). The guard
  (`hasUnsavedWork`) read only `dirty`, so Home or a hash change in that window left at once. When K
  was then refused, the Save claimed the refusal as designed, but its only answer, the topbar
  status, was gone. New then asked about the graphic just saved, before and after a reload.
- #1383 residual (S6). The reservation (R) was written only by the save itself, as the first of its
  slot writes. When R and K were both refused, the slot named no record, and after a reload the
  next Save minted a second one.

## The design

Both fixes are in the transaction (`src/store/saveActions.ts`) and its reservation
(`src/model/project.ts`). No second mechanism.

1. **The transaction says it is running.** `transaction` counts the operations it is running or
   has queued, and publishes `useSaveUi.inFlight`. The flag drops in the operation's own `finally`,
   before its caller hears the answer, so a continuation that goes back through the guard (the
   naming dialog's) sees the settled state.
2. **The guard asks while it runs.** `requestSwitch` asks when `inFlight` is true, as well as when
   `hasUnsavedWork()` says so. Every leave goes through it: Home, a hash change, Back and Forward
   (the router's guard), New, Open, and the control page's editor door. The leave dialog then has
   three states:
   - writing: "Saving “…”…", with Cancel, Discard changes and Save & continue;
   - refused: the usual question, with "Could not save. Your changes are still open. Try again."
     shown in the dialog, over the editor;
   - landed: "“…” is saved.", with Cancel and Continue.
   The dialog never leaves by itself. Continue, or Save & continue, goes through `saveBeforeLeave`.
   It waits for the running transaction. If that transaction landed what the draft holds, its
   answer is the leave's, and nothing is written twice. Otherwise, a refusal included, it saves
   again, and the leave goes on only on that save's settled `'saved'`.
3. **'Saved' means settled.** `commitLink` now sets the status back from `saving` only after the
   trailing autosave (F) settled. The topbar no longer says "Saved" while part of the save is
   still writing.
4. **The reservation rides every slot write.** `reservedGraphicId(baseline)` is the id the
   document's next first Save or Save As will mint. Every `saveProject` writes it, from the
   document's first autosave on, so it is durable before the record is written. The mint takes
   that id and keeps its own R write as the last carrier. When R and K are both refused, the
   earlier writes still name the record, and the boot relink repair-6 added finds it. The link
   write of a mint carries a fresh id (`releaseReservation`). A replaced document, which has a
   different baseline, takes a fresh one too, so it never points at another document's record. An
   id another record already holds (a second tab minted it) is never minted again.

Why the dialog does not continue by itself: the user answers a question, and a dialog that
navigates on its own while the user reaches for Cancel takes the choice away. The carried sixth
checker expects this too ("The leave waited and asked: answer it so the case still ends at Home").

Not reachable, so not crossed: Save As, the first Save's naming dialog, Discard and the wizard
doors are modal and busy while they write. Home, New and Open cannot be clicked under them. A
browser leave (hash, Back) is absorbed, as before: `requestSwitch` keeps the first decision. The
matrix pins that the address stays on the editor and that only the leave chosen before the save
goes on, once.

## The matrix (`e2e/save-transaction.spec.ts`)

Repair-6's 54 cases stay. Two of them change, and 51 are added.

- **matrix replace: topbar / K, F.** These replaced the document while a topbar Save waited, by
  opening another graphic. The guard now prevents that: Open asks while the save writes. The cases
  now assert that Open asks, nothing at Home mounts before the answer, and the dialog says "is
  saved" after the release. The other graphic then opens, and the old assertions are unchanged:
  the saved record holds its source and the opened graphic owns the link, also after a reload.
- **in-flight leave, non-modal doors** (30 cases): {topbar Save, Ctrl+S} × {Home, hash, Back,
  Open, New} × {K held, K refused late, K refused late + retry}. Each case asserts that the leave
  asks while K is unsettled, with the editor still there and no Home or wizard mounted. Held: the
  dialog says "is saved", and Continue reaches the destination. Refused: the failure shows in the
  dialog, with no app notice, and the link reads `{dirty: true, status: 'failed'}`. Cancel keeps
  the editor with "Save failed", and a reload is linked and unsaved with the source and one record.
  Refused + retry: Save & continue saves again and reaches the destination. Every landed case ends
  with one record holding the source, no notice, and nothing asking at Home, before or after a
  reload.
- **in-flight leave, modal doors** (18 cases): {Save As / K, first Save named / K, Discard / D} ×
  {hash, Back} × {held, refused late, refused late + retry}. The leave is absorbed and the address
  stays on the editor. Save As stays in the editor once it lands. First Save and Discard go on to
  the Home chosen before, once. A refusal shows in the modal. Discard writes no library copy.
- **double refusal** (3 cases): first Save under the kept name, first Save named, and Save As,
  with R and K both refused, then a reload and another Save. The reload is linked to the minted
  record, and the next Save writes into it: one record.

A new write class, D (Discard's slot replacement), is recognised by `discardDraft` on its stack.

## Results

Disposable dispatch-only probe `claude/probe-editor-p2-repair-7-ci`: this branch plus
independent-6's carried files and dispatch recipes, byte-identical (the probe's blobs equal
`claude/probe-editor-p2-check-6-ci` `7ed477b9`). Each run records the carried files' sha256:
sixth `0b5207f2…`, and the earlier ones as in independent-6.

| Run | Result |
| --- | --- |
| Sixth checker on the fix, VM j-0032 and CI [39042493167](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39042493167) | **10/10**. S1-home-late, S1-hash-late and S6 pass, and so do the other seven. On main's product code the same file gives 7 passed and 3 failed: independent-6, CI [39038386996](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39038386996). |
| `:228` x20, CI [39042491216](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39042491216) | **20/20**. |
| Unchanged checkers, CI [39042487378](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39042487378) | UNCHANGED_RESULT |
| Fifth, and fifth B1 bounded, CI [39042489221](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39042489221) | FIFTH_RESULT |
| Maintained selection and export, CI [39042495020](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39042495020) | MAINTAINED_RESULT |
| References, CI [39042502601](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39042502601) | **6/6**. |
| Repair-6's 54 cases, VM j-0033 | **52/54** before the two replace cases were updated: those two failed exactly where the guard now asks. After the update they pass (j-0035). |
| The new rows and the updated replace cases, VM j-0035 | **53/53**, 3.1 min with 4 workers. |
| Whole matrix on the final head, CI | MATRIX_RESULT |

Mutations, each run in this VM and then reverted:

- M1, the guard reads `dirty` only (`requestSwitch` without `inFlight`), j-0036: **30 of the 30**
  non-modal in-flight leave rows fail, each at "the leave asked while the save was writing". The
  same mutation is main's guard, on which S1-home-late and S1-hash-late fail.
- M2, the reservation is not durable before the record (the mint takes a fresh id, as repair-6
  did), j-0037: **S6 fails**, and so does `double refusal: first-kept`. `double refusal:
  first-named` and `save-as`, and `reservation kept`, still pass. A new name's adoption schedules
  an autosave that relinks the draft on its own, which is repair-6's note (h). Only the kept name
  isolates the reservation.

Captures: the sixth checker's own S1 screenshots, looked at and not committed. CAPTURES

## Limits

- A leave started in the few milliseconds between Save and its settle now asks, and needs a
  click on Continue. With local storage that window is short. The alternative, continuing on its
  own, is rejected above.
- The reservation is lost only when every slot write of the document since it was created was
  refused, which means its draft is not durable either.
- Not rerun: the 125% cumulative task and the signed-in task. The change adds no layout. It adds
  two sentences to an existing dialog, inside the dialog anatomy, and the account path is
  untouched.
