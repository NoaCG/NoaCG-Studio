# Save stale-clean repair (#1359)

## Reproduction and scope

The owner authorised this as the one bounded repair before the fourth independent check
([issue #1359](https://github.com/NoaCG/NoaCG-Studio/issues/1359), found in review of #1355,
receipt [repair-3](../repair-3/README.md)). A Save whose library write succeeded marked the draft
clean from the editing context it captured before its durable-write wait. An edit the editor
accepted during that wait therefore read as saved. Leaving asked nothing, and the next Open or
Discard could lose the edit. Discard already refused this case (#1147); Save did not. Scope is
acceptance criterion 2 ("Save and first Save retain the exact edited source") and nothing else.

Two new cases in `e2e/new-graphic-guard.spec.ts` hold the Save's OWN library put. The carried
`holdWrites` helper now takes the key it holds (`spx-gfx-graphics` here, default unchanged), and
each case asserts that the held put carries the source Save was asked to write. With the put
held, the case commits a command edit, releases the put and checks the following: the link stays
dirty, the leave asks again, the library holds the requested source, a reload shows the saved copy
and the draft with the edit, and a second Save writes the newer source into the same record.

- "a newer edit during a held linked Save stays unsaved, and leaving asks again": linked Save
  from the leave dialog.
- "a newer edit during a held first Save is kept unsaved, and leaving asks again": first Save
  through the naming dialog, which goes through `saveGraphicAs`, as Save As does.

On main's product code (`0854925a`, disposable draft [#1362](https://github.com/NoaCG/NoaCG-Studio/pull/1362),
branch `claude/probe-editor-p2-repair-main`, only the spec changed):

| Run | Result |
| --- | --- |
| [CI 39012641143](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39012641143) on `6627e34f` (first test draft) | **2 failed / 19 passed**. Linked case fails at "changed while saving" (no refusal; the leave went on). First-save case fails at "confirm-switch visible" (no second question). |
| [CI 39013287977](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39013287977) on `35a52da3` (the final spec, byte-identical to this PR's) | **2 failed / 19 passed**: `:651` (no "changed while saving") and `:683` (no second question). The failure captures show Home mounted, the record listed and nothing asked. |

## Change

`src/store/saveActions.ts` and `src/components/save/SaveDialogs.tsx`.

- `saveCurrentGraphic` and `saveGraphicAs` compare the editing context after their receipt with
  the one they captured. `changedSince` is Discard's existing comparison (template, baseline, link,
  AI spec/thread, legibility), now shared. When it changed, the record is linked and the draft
  stays `dirty`.
- The leave dialog's Save refuses a saved-but-stale result with "The graphic changed while saving.
  Your newer changes are still open. Try again." and stays open, the way Discard refuses. The
  naming dialog hands its continuation back to `requestSwitch`, which asks again only while the
  draft is unsaved. The record is minted and linked by then, so the next Save writes into it and
  never mints a duplicate.
- A refused save sets `failed` on the CURRENT link, not the captured one. Before this, an edit
  made during a refused Save of a clean draft read as saved. Save As adopts the saved name on the
  current template. Before this, it restored the captured template and erased the newer edit from
  the draft.
- Found in review: a save that lands after the working document was REPLACED (another graphic
  opened during a topbar Save of a clean draft) no longer links that document to the saved record
  or marks it failed (`replacedSince`). Save As reports format issues from the copy it wrote.
- Unchanged: Save/Save As still commit exactly their own receipts (`captureDurableWrites`,
  `commitDurableReceipt`, #1355), `saveCurrentGraphic`'s result type, Discard's behaviour, and the
  wizard, routing and rendering files.

Decision: Save still answers `'saved'`, because its write did land. The stale part is the draft,
so the link's `dirty` flag carries it and the leave dialog reads it. A new `'stale'` result would
change the wizard's `LibraryIo` contract and its Finish copy, which belong to another phase.
Codex review asked for that result for the wizard's Export / Add-to-production continuation. The
trace on the PR thread found no source that edits the template during the wizard's own save. On
`#/new` no editor session is mounted, nothing in backend/model/app writes the store, and the
appliers run before the save. A second door press only re-applies the identical build, which is
now a replacement the earlier save leaves alone.

## After the fix

| Run | Result |
| --- | --- |
| [CI 39012706250](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39012706250) on `f0a84a53` (first cut) | All 13 E2E shards pass: 796 passed, 0 failed. Shard 11 ran all of `new-graphic-guard`, including both new cases, the #1147 newer-edit cases, the held-autosave case from #1355 and the unclaimed-notice case. |
| [CI 39013280901](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39013280901) on `cf62a68b` (final source) | 13 E2E shards: **796 passed, 0 failed**, 93 skipped. Shard 11 again ran all of `new-graphic-guard`, including both new cases. `Reviewed` waited for the stamp. |
| [CI 39013476454](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39013476454), disposable draft [#1364](https://github.com/NoaCG/NoaCG-Studio/pull/1364): `cf62a68b` plus the carried, unchanged `leave-checker.spec.ts` (sha256 `28988d71…`) and `leave-second-checker.spec.ts` (`ef78c1eb…`) | **803 passed, 0 failed**. All seven carried checker cases pass, `leave-checker.spec.ts:24` included. Build failed only on the spec-header test, because the carried files have no `// covers:` line. They are not part of this PR. |

After-state captures were inspected and not committed. They come from disposable
[CI 39013626796](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39013626796), branch
`claude/probe-editor-p2-repair-shot`, which stops each case right after its refusal. In the linked
case, the leave dialog stays over the editor with the "changed while saving" line under its
question. In the first-Save case, the naming dialog has closed and the unsaved-changes question
is back over the editor, now offering "Save & continue".

Cheap gates in this VM: `node scripts/gates.mjs run --changed origin/main` (contract freshness and
citations, client secrets, client-neutral, copy, preview serialization) pass;
`check-e2e-protection` OK; `eslint` on the three files and `tsc --noEmit -p .` pass.

## Limits

- Browser cases ran only in GitHub Actions. This VM refuses browser jobs (#1361), so nothing was
  repeated locally and no mutation run was made beyond the fails-on-main probe. The held cases
  force the order, so repetition adds nothing.
- No reference-editor task: neither Studio nor Eyevinn exposes a window between an accepted save
  and its durable confirmation, so there is no comparable task. The NoaCG contract is verified as
  above. No cumulative or native-125% task was run; the change touches neither rendering nor
  routing.
- The re-asked guard after a first Save shows the ordinary unsaved-changes question, without the
  stale line the linked path shows. It is accurate, and the record is already named.
- Not changed: two overlapping Saves (a second Ctrl+S while the first waits) let the first set
  `idle` while the second is still writing, so the topbar reads "Unsaved changes" for that moment.
  That is true, but it is not "Saving…". The first-save guard's `cancel` is not carried through
  the naming dialog, as before. `changedSince` lists the persisted document fields by hand, the
  same list the autosave subscription watches.
