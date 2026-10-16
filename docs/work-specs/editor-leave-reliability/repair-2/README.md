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
clean replacement. Stopping early would change that assertion, and refusal would still restore
the slot. Removing the final comparison makes all four newer-edit cases fail locally, including
the replacement-wait case.

## Passing verification

- Local: the whole `e2e/new-graphic-guard.spec.ts` passes, 15/15 (4 workers, 0 retries). That
  covers maintained leave cases, both refused-discard sessions, delayed confirmation, refused
  pending autosave, saved-copy restore, clean default, Back/hash and the four newer-edit cases.
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

Run 38958180195 captures were opened and inspected:

| Capture | SHA-256 |
| --- | --- |
| desktop 1920 cumulative | `93c6ce9cda534696b38ec4a7a0db96853f6dd231a9f5520fdab66d72423a7c3e` |
| laptop 1366 leave dialog | `78c0cb37bb2d9d570aa22b0e482464f1723bab0f512eb237016bfd7f2f97f827` |
| native 125% full content | `fce24ce319b714da82e5b19e6d8cdd471aecee0320854a27d8b868a01986cf4c` |
| native 125% leave dialog | `15e952596f2aba9583c06845c66a11cd53209d5d619a7fdf310a066bbda2463f` |
| nested copy | `6387791ab05542058018706620103526a821c4d5ff6e30b83f1fc8b18962fc4f` |
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
