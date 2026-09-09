# One dialog body and one backdrop-press guard, written out across ten components

**Filed:** 2026-09-09, out of the drained handoff for `claude/d-leaving-the-wizard`
(`git show 187a1c79:docs/handoffs/2026-09-02-d-leaving-the-wizard.md`, "Reported, not fixed - they
ripple outside this diff"). **Source:** that row's review, re-measured on 2026-09-09 during the
handoff drain.

## Why

Two dialog mechanics are copied rather than shared, and both copies have multiplied since they were
first reported on 2026-09-02.

**The body.** Three class names describe the same flex column with different padding:
`.wz-confirm-body` (`WizardConfirm.tsx:107`), `.save-dialog-body` (`SaveDialogs.tsx:82` and `:166`,
`StorageAlertDialog.tsx:83`) and `.team-dialog-body` (`JoinTeamDialog.tsx:101`,
`ShareWithTeamDialog.tsx:234`), defined in three stylesheets. The storage alert then overrides its
own copy three more times to get `overflow-y`, a tighter gap and two child rules. When the row that
extracted `WizardConfirm` reported this there were four sites; there are six now, in three files
that did not exist in that count.

**The backdrop-press guard.** The same handler shape - press on the backdrop closes, but only if
the press STARTED there, so a text-selection drag that ends outside does not dismiss the dialog.
Twelve components under `src/components/` pair an `onMouseDown` with an `onClick` this way. Three
of them spell the reasoning out in their own comment (`InsertTemplateDialog.tsx:40`,
`SaveDialogs.tsx:45`, `WizardConfirm.tsx:81`); the other nine, the storage alert among them, carry
the same `pressedOnBackdrop` ref with nothing saying why. That is the worse half - a reader who
does not know why the pair exists is a reader who simplifies it away.

Neither is a bug. What makes it worth a file is the rate: the body count grew by half in a week
without anyone deciding to, and each new dialog costs its author the same rediscovery of why the
guard exists. The next one that skips the guard will be found by a user losing a form to a stray
drag.

## What it would take

The extracted shape already exists. `WizardConfirm` is the one dialog written as a component rather
than as markup repeated in place, and the SHARED DIALOG ANATOMY section of the dialog stylesheet is
where a promoted `.dlg-body` belongs.

1. **Promote `.dlg-body`** into the shared anatomy with the common flex column, and let the three
   existing classes keep only their padding difference (or drop, where there is none). Cosmetically
   inert, so it can be verified by the existing dialog specs plus one screenshot per surface.
2. **Lift the backdrop guard into one hook** - `useBackdropDismiss()` returning the two handlers -
   and delete ten comments in favour of one.
3. **Then decide about the third-button slot.** The save guard and the import-step off-dialog both
   want `WizardConfirm`'s shape and neither fits it: `WizardConfirm` is cancel-plus-primary, while
   "keep or remove" is two actions with no cancel. That is a real design question and it is the
   reason this was deferred twice. It should be answered AFTER 1 and 2, which are worth doing
   whatever the answer is.

Step 3 is the only part that needs judgement. Steps 1 and 2 restyle dialogs across four areas, so
this wants a quiet window and its own branch.

## Evidence

- `src/styles/wizard-and-dialogs.css:226`, `src/styles/save-controls.css:96` (plus the three
  `[data-testid='storage-alert']` overrides at `:109`, `:115` and `:125`) and
  `src/styles/teams.css:45` - the three definitions.
- The six body sites and twelve guard sites listed above, all present on 2026-09-09.
- `src/components/wizard/WizardConfirm.tsx` - the extracted version, and the shape the others would
  adopt.
