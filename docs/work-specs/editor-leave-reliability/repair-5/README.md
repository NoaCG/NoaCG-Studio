# Save link-write claim repair (#1367)

## Reproduction and scope

The owner authorised this as the one bounded repair after the fourth independent check failed
([issue #1367](https://github.com/NoaCG/NoaCG-Studio/issues/1367), receipt
[independent-4](../independent-4/README.md)). Once a Save's library write landed, Save and Save As
persisted the working draft's link (`persistLink`). That second durable write was neither awaited
nor claimed. When storage refused it, "Save & continue" had already gone to Home. The app-level
notice then said "Your work is still open here" over Home, and after a reload New asked about the
graphic just saved. Scope is acceptance criteria 2 ("a later New/Open does not repeat the
question") and 3 ("a failed durable write … cannot navigate early or mint duplicate records"),
and nothing else.

The fourth checker's `:298` cases (first and linked) are carried into `e2e/new-graphic-guard.spec.ts`
with their assertions unchanged. Only the helper names differ, and the probe's put-holding half,
which these cases never use, is left out. A retry leg is added for both variants, because `:298`
has none. With the link write refused, the Save's own dialog must show the failure over the editor,
with no app notice, no `spx-storage-error` event and no navigation. The library holds one record
with the requested source, and the live link is `{graphicId: <record>, dirty: true, status:
'failed'}`. The retry then leaves to Home once. The same record holds the source, and the link is
clean. New asks nothing, either before or after a reload.

On main's product code (disposable draft [#1372](https://github.com/NoaCG/NoaCG-Studio/pull/1372),
branch `claude/probe-editor-p2-repair-5-main` `19beedaf`: main `f0c79a0d` plus only the spec, as of
`e46c871`. That copy still had the probe's unused put-holding helper, and its test bodies are
identical to the final ones):

| Run | Result |
| --- | --- |
| [CI 39019272394](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39019272394), E2E 1/1 (`new-graphic-guard`) | **4 failed / 21 passed**. Both carried `:298` cases fail as in the checker's run, at "after a reload, New asks again about the graphic that was saved". Both retry legs fail at the dialog's save-failed line, because Home was mounted instead. Every other case passes, including the #1359 held-Save cases and the #1355 held-autosave case. |

## Change

`src/store/saveActions.ts`, `src/components/save/SaveDialogs.tsx`, one sentence in
`src/store/AGENTS.md`, and the wizard's mint in `src/components/wizard/shell/walkState.ts` (below).

- `commitLink` is a save's second durable write. It links the draft to the record that landed
  (status `saving`), captures the working-slot put that `persistLink` makes, and commits that
  receipt through the same claim as the library put (`commitSaveWrites`, the former
  `commitLibraryWrite`). `saveCurrentGraphic` and `saveGraphicAs` answer only once both writes have
  landed.
- A refused link write makes the save fail. The draft stays linked to the record, which exists, but
  reads `dirty: true, status: 'failed'`. The leave dialog shows "Could not save. Your changes are
  still open. Try again." and stays. The naming dialog shows the storage message and stays.
  Nothing reaches the app notice, because the write was claimed before its first await.
- Saving into the record the refused attempt minted: `saveGraphicAs` returns that record's id with
  its failure. The naming dialog's retry then saves into it (`saveCurrentGraphic`, adopting a
  changed name) rather than minting a second record.
- Found in Codex review on this PR: a wizard Finish door whose mint hit a refused link write
  dropped the record's id, so pressing the door again under a NEW name minted a second record.
  This path is new here, because main reported such a save as landed. `saveBuiltGraphic`
  (`src/components/wizard/shell/walkState.ts`, touched only to carry the id) now notes that
  record as the walk's own, so the retry writes over it. It is covered by a walk-state Node case
  (dropping the note fails it locally, 28/29) and by an export-door journey in
  `new-graphic-guard`. The journey passes on main too, where the door took the save as landed;
  it guards the path this repair opens.
- Found in review: when the draft was replaced while the link write waited, the save answers
  `saved`. The slot then belongs to the replacement, whose write comes after.
- Unchanged: the library-write claim (#1351), the stale-edit check (#1359), Discard, the wizard,
  routing and rendering, and `commitDurableWrites` and its other callers (#1360).

Decision: the link stays on the minted record after a refused link write. An unlinked draft would
mint a duplicate on retry, so it would break "no duplicate records". The checker's case also asserts
that the working draft keeps its link to the saved record. The draft reads unsaved, which is true:
the slot on disk does not yet say "saved".

## After the fix

| Run | Result |
| --- | --- |
| [39019986900](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39019986900), dispatch-only probe `claude/probe-editor-p2-repair-5-dispatch` `bb24e41` (the checker's own recipe branch plus this fix; scope `fourth`) | **11 passed, 0 failed**. All fourth-checker cases pass, both `:298` variants included. Spec hashes match the receipt: fourth `95317231…`. |
| [39019981381](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39019981381), same probe, scope `unchanged` | **All pass, unchanged**: original `leave-checker` 3/3, `leave-second-checker` 4/4, `leave-third-checker` 10/10, and `leave-checker.spec.ts:24` repeated 20/20 (a regression check only). Hashes `28988d71…`, `ef78c1eb…`, `71f8378b…`. |
| [39019988668](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39019988668), same probe, scope `maintained` | **84 passed, 0 failed**, with the same 8 legacy skips. That is the checker's 80 plus the 4 cases added here, across `new-graphic-guard` (every #1333, #1355 and #1359 case), library, wizard-draft and the other preserved selections. The two-graphic export passes 1/1. |
| Mutation, draft [#1374](https://github.com/NoaCG/NoaCG-Studio/pull/1374), `9010a02c`: the link write is made but neither awaited nor claimed | [CI 39019281915](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39019281915): E2E 11/13 **4 failed / 70 passed**. Both `:298` variants and both retry legs fail. Every other shard passes. |

| Rerun on probe `b727a511`, after the wizard fix: product files identical to this PR's final source | Fourth [39021458448](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39021458448): **11/11**. Unchanged [39021460723](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39021460723): **3/3, 4/4, 10/10, `:24` 20/20**, hashes as above. Maintained [39021462738](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39021462738): **85 passed**, 8 legacy skips, the export-door journey included. Export 1/1. |

The first three rows ran on the fix at `1029ec5`, before the wizard fix. The mutation ran on
`e46c871`. This PR's own CI runs the final head, `new-graphic-guard` and the walk-state Node
tests included.

The after-fix captures from 39019986900 were inspected and not committed. The first Save leaves
the naming dialog over the editor with "Browser storage is full …". The linked Save leaves the
unsaved-changes dialog over the editor with "Could not save. Your changes are still open. Try
again.". Neither shows an app notice. The checker's before-captures (39016115244) show the
"Could not save … still open here" notice over Home. Recorded facts after the fix, for both
variants: editor mounted, Home absent, no app notice, one record, the live link and the slot both
on the record with `dirty: true`, and the editor still open after a reload.

The carried third and fourth checkers set 150 s timeouts. PR CI's E2E protection gate refuses
anything above 120 s, so PR CI cannot run them unchanged. They ran in the checker's own
dispatch-only recipe, as in independent-4. Draft #1373, which tried PR CI, ran no E2E and was
closed.

Cheap gates in this VM: `node scripts/gates.mjs run --changed origin/main` passes, and so do
`check-e2e-protection --changed origin/main`, `eslint` on the changed files and `tsc --noEmit -p .`.

## Limits

- Browser cases ran only in GitHub Actions. This VM refuses browser jobs (#1361).
- If storage refuses the link write and the page is then reloaded without a retry, the slot can
  still be unlinked: the link exists only in memory until the next working-slot write. A first
  Save that changes the name schedules that write (the adopted name is an edit). A Save that keeps
  the template's name does not. After such a reload a Save would mint a second record. The user
  was told the save failed, and the retry this repair adds covers the ordinary path. Making the
  link durable without a successful write is not possible.
- A draft linked to a community-pack graphic is design-locked: as before, each of its saves mints
  a copy, and so does a retry after a refused link write. This is older than this repair.
- `:298`'s main assertion, "after a reload, New asks nothing", is reached only when the leave went
  to Home. After the fix the editor stays, so the retry leg is the case that pins the fixed
  behaviour. The mutation run shows that it does.
- No reference-editor, cumulative or native-125% task was run. The change touches neither
  rendering nor routing. Neither Studio nor Eyevinn separates a record write from a link write.
