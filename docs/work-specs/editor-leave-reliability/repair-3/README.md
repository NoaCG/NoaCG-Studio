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

`src/model/durableStore.ts` only. `commitDurableWrites()` and `commitDurableReceipt()` now claim
by sequence every write still pending when they start waiting. The claim is taken before their
first await, and it is counted so two callers can wait on one write. `reportError` does not
announce a claimed failure at all. The claimer takes the message from that write's own receipt
(`settled`), so it no longer matters how long the other pending writes take. A failure that
nobody is waiting on still goes through the `setTimeout(0)` announcement unchanged. A failure
reported before the caller started waiting is still taken from `unclaimedFailure`, as before.
`saveActions.ts`, routing, rendering, wizard and import files are not touched.

## After the fix

Head `beac1f6d` (source hash `durableStore.ts` sha256 `bea171a5…0e675`), locally through the queue:

| Run | Result |
| --- | --- |
| Deterministic held-autosave case, `--repeat-each 5`, 4 workers | 5 passed / 0 failed |
| Unchanged `leave-checker.spec.ts:24`, `--repeat-each 40`, 4 workers | **40 passed / 0 failed** (2.5 min) |
| Maintained selection: `new-graphic-guard` (all, including the #1147 newer-edit and quota-refusal/Undo/history cases), `leave-checker` (all three), `leave-second-checker` (probe `39a900183`), `storage-full` (claimed failures named by their surface), `wizard-finish`, `project` (wizard-open and native export-notification continuations), `wizard-draft-guard`, `rundown-history-storage`, `rundown-history` (receipt-claimed failures) | **84 passed, 2 skipped, 0 failed** (3.7 min). The two skips are the existing legacy-editor skips in `project.spec.ts` (#800). |
| Added case: an autosave refused while nobody waits still raises the app-level notice ("Saving to this browser", status `failed`), with the held case, `--repeat-each 3` | 6 passed / 0 failed. No existing spec asserted the unclaimed path, so this case was added. |
| Mutation: only the `claimed` check in `reportError` removed, held case `--repeat-each 2` | 2 failed / 2 at `:594` ("Save claims its own refusal"). The source was restored from the commit. |

GitHub Actions on the pull request is the authoritative full build and suite. It runs the
maintained cases. It does not run the two carried checker files, because they are not on main.

## Limits

- The carried `leave-checker.spec.ts:24` repetition was local only (one machine, 4 workers). The
  deterministic held case is the one that proves the order, and it is maintained, so CI runs it.
- No cumulative, reference or native-125% tasks were run. This store-level change does not touch
  rendering or routing (the row brief allows this).
- A Save now also claims a failure of any other write still pending when it starts waiting, for
  example a refused autosave. That was already the documented contract of `commitDurableWrites`.
  It used to depend on timing and is now deterministic. In that case Save reports the failure in
  its own words instead of the app-level notice.
