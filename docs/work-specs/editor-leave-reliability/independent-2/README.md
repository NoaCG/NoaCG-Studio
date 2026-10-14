# Second independent leave-editor check

**FAIL product: a newer command edit is lost when it arrives during the autosave drain.** [Issue #1147](https://github.com/NoaCG/NoaCG-Studio/issues/1147) and the [defect receipt](defect.md) retain the deterministic reproduction. This is the second failed check; the editor plan stops before Phase 3. No product repair was attempted.

## Scope before execution

Check current main d8c96727044191872abcfa36518e6e8ee2b853be, containing refused-discard repair #1140 (56ed14bb2add351fdc5fd671c1a30a7541baea74). The checker built neither implementation nor repair. No product code changes are authorized in this check.

Goal: a user resolves edited work over the mounted editor before Home, another graphic or history navigation. Successful Save and Discard survive reopen/reload without a repeated question. Refused writes and cancelled naming retain the original source, live session, selection and Undo/Redo; saved library, account and production copies remain separate.

Decisions: retain the exact original independent quota-refusal assertion. Repeat maintained regressions and independently challenge an unsaved refusal, pending autosave ordering, delayed confirmation, newer edits during confirmation and successful discard. Reuse the normal wizard/import/account and pinned reference task drivers, executing them afresh. Browser evidence comes from a disposable, never-merge CI branch; no scheduler floor or assertion is weakened. The notes branch contains only documentation and receipts.

Acceptance: unchanged refusal assertion passes; both linked and unsaved refusal preserve exact source/session/history/view; pending autosave precedes replacement; pending completion cannot publish a stale source; successful discard clears discarded history and survives reload; all bounded lifecycle and prior wizard/export regression tasks pass. Fresh Studio/Eyevinn source and runtime comparison, desktop/laptop/native 125% cumulative text/animation/save/reopen and nine executable browser outputs are inspected.

Non-goals: hosted cloud notices, loops, full projects, R2/R3, default switch, owner acceptance, broader comfort and physical receiving-host acceptance. The execution evidence below does not expand these boundaries.


## Fresh evidence

All probes execute the product tree of `d8c96727044191872abcfa36518e6e8ee2b853be`. [Provenance](provenance.json) records the exact commits, identical source tree, unchanged maintained regression files and unchanged original independent checker blob. Disposable branch `codex/probe-editor-p2-check-2` contains tests and CI recipes only; it has no pull request and must never enter the merge queue.

| Criterion | Independent result |
| --- | --- |
| Original one-put quota refusal after Save and second rectangle | Pass unchanged in [focused run 38485907485](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38485907485): all three original independent cases pass in 24.0 seconds. Undo and selection survive; retry discards and reload restores the saved copy. |
| Linked and unsaved refusals; exact source/session/history/view; Redo; retry | Pass in maintained cases and the separate unsaved challenge. Its [receipt](unsaved-refusal.json) retains the same session with Undo 1 / Redo 1, recovery and durable discard. |
| Pending autosave before replacement, delayed publication and first destination | Pass: [pending-order.json](pending-order.json) records two held confirmations, ordered writes, unchanged live source/history while pending, first Home destination retained and successful reload. |
| Newer edit while discard waits | Fail: [standalone run 38486709664](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38486709664) accepts a newer command during the autosave wait, then discards it and mounts Home without refusal. |
| Ordinary Home/Open, Save/Discard/Stay, naming cancellation, saved library and production copies | Pass in the unchanged maintained and original independent cases. No repeated question after successful discard/reopen. |
| Browser Back/hash; wizard mid-walk start-over and Back | Pass. The preview frame consumes the first Back; the next top-level Back asks over the editor. Completed wizard restoration still reaches Finish with its separate regeneration notice. |
| Two sequential exports | Pass unchanged in the same complete run, 10.6 seconds. |
| Signed-in local/cloud revision separation | Pass in [account run 38486088749](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38486088749), one case in 34.8 seconds. Exact hydrated cloud/source and raw saved-record equality hold; cancelled naming retains the draft and unsaved discard adds no graphic record. |
| Pinned Studio and Eyevinn lifecycles | Two fresh tasks pass in 17.2 seconds; new source hashes and rendered captures were inspected. [Source comparison](source-review.md). |
| Desktop/laptop/native 125%, cumulative editing, text, animation, save/reopen and browser outputs | Four fresh tasks pass in 2.0 minutes. Nine SPX/CasparCG/OGraf browser outputs execute with empty error lists. |

[Complete run 38486085859](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38486085859), disposable `1002d10a6`, reports 73 passed, one failed and eight unchanged legacy-editor skips in its 82-case lifecycle selection (10.9 minutes). Its reference, sequential-export and cumulative steps pass separately. [Step metadata](complete-run.json). No maintained test or assertion was changed, deleted or skipped; no timeout, test-maintenance or budget exception was introduced.

The complete run's added case at `e2e/leave-second-checker.spec.ts:91` also fails after losing the newer edit. It was intended to isolate replacement confirmation, but `settleDurableWrites` only drains handed writes, not the pending 800 ms autosave timer. Thus it also catches the earlier wait and does not prove a separate replacement-write defect. The standalone case explicitly creates and holds the pending autosave, records both write payloads and proves that window deterministically. Both original failed assertions remain intact. A separately isolated newer-edit replacement check was not executed after automatic approval review rejected that optional follow-up as continuing the phase after its second failure. The rejection was not bypassed.

## Rendering, account cleanup and limits

Twelve fresh captures were inspected and [hashed](captures.json): desktop, laptop, the complete native-125 content capture, their leave dialogs, nested copies, both reference editors, account dialog and both failure captures. The decision remains legible over the editor. The failure captures show Home after the unconfirmed newer edit was discarded.

Native browser zoom remains 1.25 before/after, with outer window 1366x768, content 1093x545, canvas 196px, timeline 180px and inspector 280px. The Fit artwork remains small and Properties/timeline scroll; this is the existing comfort limit. The native full-content capture is `native-125.png`; the ordinary Playwright native-zoom capture is cropped. [Native measurements](actual-125.json), [zoom](zoom.json) and [camera](native-camera.json) retain the exact values. Desktop/laptop receipts preserve fields, assets and the nine executed outputs.

The account driver refuses a non-local backend. `supabase stop --no-backup` succeeded at 23:48:09 UTC on October 13, recorded in [account-run.json](account-run.json). The synthetic account and stack were disposable; no hosted account, backend or migration was changed. Local browser/server/build/suite work did not run: measured free RAM was 1.74 GiB, below the unchanged 4 GB floor. The read-only CI watcher and artifact fetch process have exited; no checker-owned local server or browser remains.

Main CI `38482834734` and configured run `38482834809` at tested descendant `d8c967270` are green. The main CI includes all eleven full E2E shards, Build, Factory and the CI gate; retry jobs were skipped. [CI snapshot](main-ci.json), [configured snapshot](main-configured.json). Repair `56ed14bb`'s earlier CI was cancelled by supersession and is not claimed green. Existing hosted-latency alarm #987 remains separate.

This is engineering evidence only. Broader comfort, owner acceptance, physical receiving hosts, hosted cloud-status behavior, loops, full projects, R2/R3 and the default switch remain open. The next step is the coordinator's stop/owner-direction procedure for the second failed check, with #1147 as the bounded unresolved defect. This notes pull request does not authorize another repair or Phase 3.

## Documentation check

Review and simplification ran inline over the 26 files reported by `review-request.mjs`, base `d8c96727044191872abcfa36518e6e8ee2b853be`. The available review connector reads CI diagnostics and cannot execute a review. The pass checked receipt provenance, exact run outcomes, source hashes, failure attribution, captured dimensions, teardown and the explicit stop/limits. Simplification kept the plan note short and corrected spacing. Targeted contract freshness/citations, docs index, client-secret and copy gates passed; whitespace validation passed after removing an extra final blank line. The documentation verification passes for an accurate, reproducible report. The product verdict remains FAIL; no product acceptance is conferred by the notes stamp.
