# Newer-edit discard repair (#1147)

## Reproduction and scope

Owner authorised this bounded repair on 2026-10-16 after the second failed independent
check. [Issue #1147](https://github.com/NoaCG/NoaCG-Studio/issues/1147): an edit accepted
while Discard drained the pending autosave was erased, because `discardCurrentGraphic`
captured its stale-edit snapshot after that wait. Only the replacement-write wait was covered.

The checker's two newer-edit cases from probe `39a900183` (`e2e/leave-second-checker.spec.ts:91`
and `:106`, failing assertion `:135`) are now maintained in `e2e/new-graphic-guard.spec.ts`. Their
bodies and assertions are byte-identical except one `any` cast, retyped for lint. Two new cases
hold exactly one working-slot confirmation each and assert which write was held: the autosave
(dirty, the requested source) or the replacement (clean, not the requested source).

Before the fix, on main `abe2b616` plus these tests only:

| Run | Result |
| --- | --- |
| Local, 4 workers | `:106` fails at its line `:135` (Home mounted; capture inspected). Autosave-wait case fails. Replacement-wait case passes. `:91` passes: its window depends on whether the 800 ms autosave timer is still pending. |
| [CI 38958175985](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38958175985) | `:91`, `:106/:135` and the autosave-wait case fail. The replacement-wait case passes, so main already covered that window. |
| [CI 38960652865](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38960652865), complete selection | The same three fail again. 74 passed, eight unchanged legacy skips. The three original independent leave-checker cases, two references, export and four cumulative tasks pass. |

Disposable branches `claude/probe-editor-p1-repair-reproduce` (`07565773`) and
`claude/probe-editor-p1-repair-complete` (`24d33b83`) carry the probe spec files and workflow from
`fbb83d01`. They have no pull request and must never be queued.

## Change

`src/store/saveActions.ts`: the snapshot is now taken when Discard is clicked, before either
wait. The click calls `discardCurrentGraphic` synchronously, so the comparison covers the whole
interval. The durable replacement is still written and confirmed before any live
source/history change. The final comparison is unchanged: a newer edit refuses with the
existing "changed while discarding" message, then re-persists the newer draft.

Decision: an edit made during the drain does not stop the replacement write. It refuses at the
final comparison instead. The carried `:106` assertion requires the second held write to be the
clean replacement. Stopping early would change that assertion. Removing the final comparison
makes all four newer-edit cases fail locally, including the replacement-wait case.

Review on #1333 found a gap: the refusal re-persisted the newer draft without waiting. Until that
write landed, the slot still held the clean replacement. A reload in that window, or a refused
write, could reopen the discarded copy while the dialog said the changes were still open. The
refusal now waits for that restoring write's durable receipt. A refused restore reports the storage
failure instead. Two cases cover this: one holds the restoring confirmation, checks that no refusal
shows while it is pending, then reloads straight after the refusal and gets the newer source. The
other refuses the restoring write and expects the storage message, with the editor and newer source
kept. Both failed on the previous commit `c157d61e` and pass after the change.

## Passing verification

- Local: the whole `e2e/new-graphic-guard.spec.ts` passes, 17/17 on `fba526f1` (4 workers,
  0 retries). That covers maintained leave cases, both refused-discard sessions, delayed
  confirmation, refused pending autosave, saved-copy restore, clean default, Back/hash, the four
  newer-edit cases and the two restoring-write cases.
- [CI 38964718798](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38964718798) covers the final
  source `fba526f1` with probe files (`ab918e45`, branch `claude/probe-editor-p1-repair-complete-2`).
  All six newer-edit and restoring-write cases pass, and references pass 2/2. The 87-case lifecycle
  selection gives 79 passed and 8 unchanged legacy skips in 11.6 minutes. Two-graphic export
  passes 1/1 and cumulative/native 4/4 in 1.9 minutes. One worker, zero retries.
- [CI 38958180195](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38958180195), fixed commit
  `c0ba7619` plus probe files: four newer-edit cases pass. References pass 2/2, export 1/1 and
  cumulative/native 4/4. The lifecycle selection gives 76 passed, 1 failed and 8 skipped. The
  failure is the original independent linked-SAVE refusal (`leave-checker.spec.ts:24`), which
  never reaches Discard. See the trap below.
- [CI 38960648689](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38960648689), same commit:
  newer-edit 4/4, references 2/2. The 85-case lifecycle selection gives 77 passed and 8 unchanged
  legacy skips in 11.9 minutes; it includes all three original independent cases and the wizard-open
  continuation (`project.spec.ts`). Two-graphic export (native notification) passes 1/1 and
  cumulative/native passes 4/4 in 2.0 minutes. One worker, zero retries.

Trap: in 38958180195, `leave-checker.spec.ts:24` armed a one-shot `spx-gfx-graphics` refusal.
Another library write used it before Save did. The capture shows the app-level "Could not save"
notice over Graphics. Save itself succeeded and navigated as designed. The same spec passed on main
(38960652865), on the same commit (38960648689) and locally. It fails before Discard runs, so this
change cannot cause it. It is a timing hazard in the checker's injection. Its source is
unidentified, and this repair claims nothing about it.

## Rendering and references

Captures from the final-source run 38964718798 were opened and inspected, plus the same set
from 38958180195:

| Capture | SHA-256 |
| --- | --- |
| desktop 1920 cumulative | `7ef81458a4df51f66e514d1127622385a0e0f58d721a89e0018b5cab6fb32472` |
| laptop 1366 leave dialog | `aefae24a2feff9763f8da8992d1a356e75b41162f7756486976cbf992aea62f1` |
| native 125% full content | `fce24ce319b714da82e5b19e6d8cdd471aecee0320854a27d8b868a01986cf4c` |
| native 125% leave dialog | `7e23f52b1ec0d2e8beda88eefb3ca17f006c2d2637483ed3e586eae98112cd72` |
| nested copy | `6eaae7f00b3dac26ed5bc64f356a01ffcf2a0f8e4ffda8006237c8471e42e70c` |
| newer edit refused over the editor | `399d29d6d8e021087416b8a589208c86ffc6bcd839b976ba3f4fd3940d6636da` |
| Studio reopened | `d9501c35300d2043864d97b1b7c90c9d9facb9ce38a5aba69424e9cf5170baa6` |
| Eyevinn kept | `05ec2e4f1c473a9a465bf24c805ba4b1a8e650bf3455d5f3c7b7390522d61e7f` |

- Native zoom is 1.25 before and after. The window is 1366x768 outer and 1093x545 content.
  Canvas is 196 px, timeline 180 px and inspector 280 px. The Fit artwork stays small and
  Properties scrolls; this is the existing comfort limit.
- Desktop, laptop and native keep fields `f0`/`f1` and three assets. Their nine SPX, CasparCG and
  OGraf outputs execute with empty error lists.
- The refusal capture keeps the editor and all three layers under the decision.
- The pinned Studio `3142fc7d` (v0.17, binary checksum verified) and Eyevinn `616841bd`
  lifecycle tasks run fresh. Their captures match the repair receipt's hashes byte for byte.

## Limits

- No local build or full suite ran; those are pull-request and merge-group CI work.
- The signed-in localhost account task was not re-run. This change does not touch account, sync
  or library code, and the earlier receipts stand.
- Physical receiving hosts, hosted cloud notices, broader comfort, owner acceptance, loops, R2/R3
  and the default switch remain open.
- A fresh independent check of this phase still follows landing, before Phase 3.
