# Refused-save claim repair (#1351)

## Reproduction and scope

Owner authorised this bounded repair on 2026-10-17 after the third failed independent check
([issue #1351](https://github.com/NoaCG/NoaCG-Studio/issues/1351), receipt
`independent-3/` on notes PR #1350). A linked Save that storage refused sometimes went to Home and
marked the draft clean. The refused put was the Save's own. `commitDurableWrites` waited for
every pending write. While a slower autosave of the working draft settled, `reportError`'s
`setTimeout(0)` sent the Save's refusal out as an unclaimed `spx-storage-error`. Save then found
nothing to claim and answered `'saved'`.

Both reproductions ran on main `5ccdbbc4` source, locally, through the job queue:

| Case | Result on main |
| --- | --- |
| Unchanged `e2e/leave-checker.spec.ts:24`, `--repeat-each 20`, 4 workers | **3 failed / 17 passed** (1.2 min). All three fail at `:37` (no Save refusal in the leave dialog). Their error contexts show Home with the app-level "Could not save … Your work is still open here" dialog, which is the issue's signature. |
| New deterministic case: the autosave's completion is held while the Save's library put is refused (`e2e/new-graphic-guard.spec.ts`, "a linked save refused while an autosave write is in flight…"), `--repeat-each 3` | **3 failed / 3**. Each run reaches Home with the same app-level dialog. |

The carried checker files are byte-identical to probe `39a900183` and to
`claude/probe-editor-p1-check-3-diag` (`7dd7e2d7`). They were copied into the worktree only
to run here and are not committed:

| File | sha256 |
| --- | --- |
| `e2e/leave-checker.spec.ts` | `28988d718686064e747d2bcda910d8d9a23b2fd62d3609ee044963780952d982` |
| `e2e/leave-second-checker.spec.ts` | `ef78c1eb394c0c24abd7766a850c5dc980424eb6ca74cbf7bde0467226c8b162` |

## Change

`src/store/saveActions.ts` and `src/model/durableStore.ts`. Save (`saveCurrentGraphic`) and Save As
(`saveGraphicAs`) capture the library puts they make with `captureDurableWrites('spx-gfx-graphics', ...)`,
and wait for exactly those receipts through `commitDurableReceipt`. Before, they waited on
`commitDurableWrites`, which waits for every pending write. `commitDurableReceipt` now claims its
write's sequence before its first await. The claim is counted, so two callers can wait on one
write. `reportError` does not announce a claimed write at all. The Save learns of its refusal
from that write's own receipt, so it no longer matters how long other writes take.
`commitDurableWrites` is unchanged. A refusal of any other write, an autosave included, stays
unclaimed and reaches the app-level notice. Routing, rendering, wizard and import files are not
touched.

A first cut (`beac1f6d`) put the claim inside `commitDurableWrites`, claiming every write still
pending when a caller started waiting. It passed the same runs: held case 5/5, `:24` 40/40, and
the maintained selection below 84 passed with 2 skips. Review rejected it, because any waiting
caller (sync, video autosave, a Home row) would then silently take an unrelated autosave refusal
away from the app notice. A minting caller (Save As, wizard production doors) could also be told
that its landed write failed, and a retry would duplicate the record. The receipt-scoped claim
is the narrower fix, and it is the one that lands.

## After the fix

Final source (sha256): `durableStore.ts` `a011e297e1de273580944a532588eecb3ebcc3cefef4a909316d4241b2cbe828`,
`saveActions.ts` `700d85b15a8dddabceac858e49360c1bf00695ab1e0ff4184fe3a5a40359e768`,
`new-graphic-guard.spec.ts` `a721260645626b297f2687df39ed10d81019e87a00ebf885c3fd8b4984da956c`.
Locally, through the job queue, 4 workers:

| Run | Result |
| --- | --- |
| Unchanged `leave-checker.spec.ts:24`, `--repeat-each 40` | **40 passed / 0 failed** (2.6 min) |
| Maintained selection: `new-graphic-guard` (all, including the new held-autosave and unclaimed-notice cases, the #1147 newer-edit cases and the quota-refusal/Undo/history cases), `leave-checker` (all three), `leave-second-checker` (probe `39a900183`), `storage-full`, `wizard-finish`, `project` (wizard-open and native export-notification continuations), `wizard-draft-guard`, `rundown-history-storage`, `rundown-history` (receipt-claimed failures) | **85 passed, 2 skipped, 0 failed** (4.0 min). The two skips are the existing legacy-editor skips in `project.spec.ts` (#800). |
| Mutation: Save waits on `commitDurableWrites` again (one line in `saveCurrentGraphic`), held case `--repeat-each 2` | 2 failed / 2 at `:592`: no Save refusal, and Home is mounted. The line was restored and the file hash re-checked. |

The added case "a refused autosave nobody waits on still raises the app-level storage notice"
checks the unclaimed path: the "Saving to this browser" alert appears, the status reads `failed`
and the editor stays open. No existing spec asserted that path. It passed 3/3 with the first cut.

GitHub Actions on the pull request is the authoritative full build and suite. It runs the
maintained cases. It does not run the two carried checker files, because they are not on main.

## Limits

- The carried `leave-checker.spec.ts:24` repetition ran on one machine only. The held case is the
  one that forces the order, and it is maintained, so CI runs it.
- No cumulative, reference or native-125% tasks were run. This is a store-level change that does
  not touch rendering or routing (the row brief allows this). No reference editor has an
  equivalent of this internal write claim, so no comparable task was run.
- Other callers that branch on `commitDurableWrites` keep its old race, in which a refusal can be
  announced generically before they look. That is unchanged by this repair. The fix for any of
  them is the same: capture and commit their own receipts.
- Not covered by a spec: an autosave refused while a Save waits on its own held write. By
  construction it is unclaimed, so it goes to the app notice.
