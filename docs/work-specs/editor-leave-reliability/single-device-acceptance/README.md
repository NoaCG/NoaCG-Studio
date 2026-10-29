# Phase 2 single-device acceptance

Current disposition, 2026-10-21: **ACCEPTED under the bounded single-device scope**
on `12eccdd8533ba710f0917cb3bcc78101070ecca8`, after explicit owner approval of the
[dated closure](../scoped-closure/README.md). That record adds final repair/local
evidence and the approved shared-lab diagnosis deferral. It supersedes the current
disposition only. The October 20 receipt, table, original failures and budgets
below remain historical, unchanged evidence; no original multi-device PASS,
auth/sync fix, physical-device proof, newer-main qualification or Phase 3 is claimed.

Maintained receipt, 2026-10-20. **Verdict: BLOCKED.** The owner now requires one
active authoring tab/device per account, with serialized device handoffs. This
narrows acceptance; it does not mean that the original multi-device criteria
passed. Neither the original failures nor unrelated storage/CI criteria are waived.
No Phase 3, default switch or automatic closure of #1466 is authorized here.

## Source and coordination

The audit fetched `origin/main` into feature worktree `/workspace/phase2-acceptance`,
branch `codex/phase2-single-device-acceptance`, at
`c417eadb4ba031239007f651e6191452303902e2`. Both its `src` and `e2e` Git trees are
identical to independent-12's source `4e067b65674a9bf0a7632430b5dd0772c03a0331`.
This permits source-qualified reuse of that receipt, not a claim of fresh execution.

Read root/scoped rules, check/verify/queue-merge/cloud-delegate workflows,
`EDITOR_PLAN.md`, `EDITOR_REBUILD_PLAN.md`, leave-reliability's six criteria and
repair additions, repair-11, #1487's corrected terminal comments, #1509,
#1515/#1519/#1520 and their terminal evidence, the immutable
[independent-12 receipt](https://github.com/NoaCG/NoaCG-Studio/blob/49286d650fdcca44c0b784ac7037fbf2b16ff3f2/docs/work-specs/editor-leave-reliability/independent-12/README.md),
and #1522's [final receipt](https://github.com/NoaCG/NoaCG-Studio/pull/1522#issuecomment-6281782704).
The older source reservations are read together with the owner's later narrow release.

The activity helper reported no other local work in flight. That is not a remote
inventory: local `main` is absent. Worktree inventory, `origin/main` diffs, open
PRs/issues and current chat activity were audited separately. The original local
Step 6 chat `01a152c8-9a1f-7452-a356-5539c360b642` handed draft #1526 to active
cloud owner `01a1578f-ce03-7254-9f07-8773128be053`; its repair-owner comment acknowledges
the transfer. The local heartbeat is paused. No cleanup or competing editor fixer
was launched here. No #1526 path is changed by this receipt or the tooling repair.

[Coordination sent on #1526](https://github.com/NoaCG/NoaCG-Studio/pull/1526#issuecomment-6283413687)
preserves Step 6's approved release and sole ownership. Native tools here can
read/wait for existing chats but expose no send/resume or local-execution operation.
No cross-chat acknowledgement or local device execution is claimed. Shared
editor/store/router/save/data/preferences/CSS changes remain serial with Step 6.

## Acceptance table

“Satisfied” below identifies the evidence actually available at its stated source;
it is not a whole-phase verdict. Retained items still need the final independent
source pin after landed repairs. “Deferred” applies only to concurrent authoring,
never to a failing test result. Every original assertion and budget remains.

| Original criterion | Scope | Status and evidence |
| --- | --- | --- |
| AC1: normal wizard/import, edited never-saved artwork; question appears over editor before Home or destination URL commits | Retained | Satisfied in independent-12's maintained/carried runs; same product/test bytes on audited main. Final post-repair independent execution outstanding. |
| AC1: Cancel, Escape and cancelled first-save naming preserve source, selection and history | Retained | Satisfied in recorded original–eighth scopes and maintained guards; no exception introduced. |
| AC2: Save/first Save preserve exact edited source through Home/reopen; discard creates no graphic; discarding a saved experiment preserves the saved record | Retained | Recorded ordinary/refusal cases pass; cumulative acceptance remains blocked by the retained duplicate condition below. |
| AC2/AC3: no duplicate after failed record/link writes and reload | Retained | **Failed** in all three original `V-reservations` assertions. These are single-device degraded-storage cases, not concurrent authoring. See below. Normal S6 double-refusal remains required and its recorded pass is preserved. |
| AC2: no manufactured unsaved question after known saved-copy timeout; edited/chained copy waits, retry and winner preservation | Retained regression protection | Independent-12's three real-time cases pass, including 10-second waits and chained copies. This receipt changes none of those tests/guards. Concurrent creation/adoption of the copy is separately deferred, not claimed to pass here. |
| AC2: concurrent losing Save, other-device working-slot pull and simultaneous first-Save overlap | Explicitly deferred by current owner decision | Original `C-pull :117`, `C-overlap :158`, both `V-superseded :199` failures stay red. S-concurrent and X-device recorded passes remain historical engineering results; no original multi-device acceptance is claimed. |
| AC3: New/Open/Back/hash share the leave boundary; refused durable write and double submission cannot leave early; discard/reload cannot resurrect work | Retained | Recorded maintained and original–eighth evidence passes. Single-device duplicate subcriterion above still fails. |
| AC3: two-tab reservation ownership / cross-device reservation propagation | Concurrent-authoring portion deferred; ordinary storage recovery retained | Preserve #1402 H and #1443/X-device recipes and results. Defer only the requirement to support multiple active authoring tabs/devices, not all reservation/storage tests. |
| AC4: pristine wizard baseline, held-walk decisions, local library links and cloud/production separation; maintained guard/library/wizard regressions and negative destination checks | Retained | Recorded maintained and signed-in separation evidence passes. Original `R-departure :281` remains failed: pristine C observed `asked:0,named:0`, which agrees with AC4; no assertion is edited or relabelled. |
| AC4: serialized device handoff | Retained under narrowed scope | **Unverified** as an end-to-end device journey on the final source. Save, retain backup, close first editor, open intended saved record from Home on second device and inspect contents before editing. A local Saved label alone does not prove cloud arrival. |
| AC5: comparable Studio official v0.17 / `3142fc7d` and Eyevinn `616841bd` lifecycle execution, inspected event→mutation→preview/tests, exact hashes, deliberate differences, no copied source | Retained | Six independent-12 runtime cases passed; binary and 17 source hashes recorded there. Reused evidence, not fresh execution in this session; final checker must assess applicability. Neither reference supplies conflict-copy parity. |
| AC6: desktop/laptop/actual 125%; preserve cumulative text/artwork/animation/save/reopen and executable SPX/CasparCG/OGraf receipts | Retained | Recorded browser tasks/nine exports pass; 125% larger virtual display gives 196px canvas/180px timeline/280px inspector. The earlier 1919×1079 setup failure stays failed. Fresh applicable local/native checks are **unverified** here. |
| AC6: native file interaction, physical receiver and owner comfort/acceptance | Separate evidence classes; no new waiver | Virtual-display browser zoom is not native/physical-host proof. Prior receiver qualifications retain their original limits. No new physical or owner-comfort acceptance is claimed; do not broaden this bounded phase into R1.5. |
| Repair additions: refused discard preserves session/revision/history/Undo/Redo/selection/playhead; newer edits in each wait survive durably; pending autosave, linked/unlinked and retained Redo; wizard Back/start-over and two sequential exports | Retained | Recorded maintained/original–eighth coverage stays required. Current main retains the exact tests, helpers, limits and original failure history. |
| All 32 #1509 group cases/assertions, including rendered cancellation/pose restoration | Retained | Byte-identical to reviewed `ce50f669a9a42d4217087d08506b420895f8856a`, SHA256 `978d49bee880f4f31bbc73c994c975ce45c3c4415e512dcc7f378c9af2632a78`. Fresh discovery lists all 32 in [manifest](groups-cases.json); audited main CI executes all 32 successfully at retry 0. Original CI `39250656173` stays failed. |
| Applicable CI, nightly budget, configured completeness/classification and valid release evidence | Retained | **Failed/blocked**, as detailed below. Successful workflow colors and released classification do not satisfy these criteria. |

### Original red assertions remain visible

Independent-12 records original fifth B1 `:263` and F-hold/F-late `:464` failures,
seven ninth-checker failures, and configured R-departure `:281`: **eleven original
failed results** across those three selections. B1's separate bounded variant
passes; Cancel on guarded Open correctly stays in the editor in F-hold/F-late.
Those independent explanations do not change their failed verdicts. The virtual
display setup failure and nightly arrangement failure are additional failed results.

`V-reservations` newer/corrupt/missing each refuses both R and K, then reloads
after the reservation list cannot identify the already minted record. Each case
uses one `page`, with no second authoring device. Facts retain the minted source
but show two records where the unchanged assertion requires one. Historical
receipts described this duplicate-only degraded-storage limit as allowed by an
earlier brief. The present concurrent-authoring decision does not defer or pass
that unrelated assertion. It remains a retained failure unless repaired; no new
exception is inferred here.

The other-device source replacement in C-pull stays explicit:
`alphaUnchanged:false`, `alphaHoldsMine:false`, `copyHoldsMine:true`. Do not claim
the winner byte-equal or this device's original draft retained after that reload.
All 19 carried spec paths remain retrievable byte-identically from canonical
`9bef784b73fa979d24fe254da1dbc156cb7ba342`; their complete hashes are in
[evidence](evidence.json). No old workflow/helper is restored to current main.

## Retained blockers and attempts

### #1524: bootstrap failure reproduced, root cause not repaired

Original #1522 merge CI `39358824342`: 2,184 original passes, one failure, one
existing platform skip; retry 17 passes/one failure. Both fail template-file
at wizard-shell `565:65`, before mounting. Original artifact `12236388688` was
downloaded through the GitHub connector, independently SHA256-verified as
`f72ebde491509431a2fd3e7e8745bf480f92412ad656ef7290ea2eb9c6d8d1d7`, and inspected.
Its trace contains **61** Chromium `net::ERR_INSUFFICIENT_RESOURCES` module errors
before App import fails. This is stronger evidence than the error screen alone,
but does not prove the browser/server resource-lifetime cause.

Current audited-main CI `39368805306` is also **failed**, attempt 1. Original
shard `118451831071` reports 109 passed/one failed; automatic retry `118455642396`
reports 17 passed/one failed, both template-file at unchanged `565:65`/7,000ms.
The combined original report independently decodes to 2,184 passed/retry 0,
one failed/retry 0, one existing platform skip/retry 0, zero flakes. All 32 groups
and 14 editor-key cases pass. Its complete per-case facts/hash are in evidence.json.

Executing cloud worker: four CPUs, 16 GiB machine totals, two browser workers;
hidden ancestors are unreadable, so these are fallback totals. All browser work
used the existing serial queue, cap 5, retries 0:

| Job | Result |
| --- | --- |
| j-0001, unchanged original cold-open test | **Failed** at original `565:65`, slug video, boot failure before wizard. Screenshot opened. No repair/retry claim. |
| j-0002, same original test with passive request/console observation | **Failed**, slug video, same assertion shifted to `574:65` only by observer lines. Each preceding boot completed all 668 requests; pending was zero before every next iteration. Total 5,293 requested/5,204 finished/89 failed; all 89 failures are ERR_INSUFFICIENT_RESOURCES. |

The observer was removed and the file restored byte-identically. These are two
bounded diagnostic executions, **zero repair attempts**. No slug, assertion,
7-second budget, worker cap, reload retry or classification is changed. Replacing
the loop with fresh pages would remove the repeated-navigation challenge and is
not presented as a repair. No network/server root cause is proved yet.

### #1498: nightly setup failure remains

Original nightly `39201147576` failed the unchanged 5.50s mean-time ceiling at
6.09s. Independent-12's new-source `39323236011` passed that budget at 3.88s,
but **failed overall**: 2,184 passed/one failed/one existing platform skip, no
retries; only 231/232 fresh traced files completed. The original budget failure
stays failed and the rolling alarm stays open.

Arrangement job `118302580795` and artifact `12221976050` were read/downloaded
and hash-verified here (`4e41255e6ec22b2e96078f5fbd4599f962dc0637f078c6512fa98064f380c13d`).
The `open()` applyTemplate evaluate fails at `15:14` before resize assertions.
The trace shows no established navigation or page error; a weak evaluation
promise is a documented diagnostic candidate, not matching proof for this case.
No speculative helper change or extra GC campaign is called a repair.

### #1516/#1517: release accounting and the original late-send failure

#1517's twenty-fresh-pass claim remains unsupported. Current main's empty active
quarantine and released count 12 are classifications, not a repair or release proof.
The original late-send report `12205042779` was downloaded/parsed here, SHA256
`074e44c95aafb1c344df50c5d5e74c68cfc5e7f901c174d71d184f0e7f52250d`.
It records failure at `_helpers.ts:237:8`, caller late-send `96:9`, predicate false
after unchanged 30,000ms; retry 1 passed. Only the **passing retry** has a trace.
Neither an output leak nor a repaired harness follows from it. This remains a
retained gate concern independent of concurrent authoring.

The confirmed bookkeeping cause is repaired separately in this branch:
`passHistories` now verifies the current entry's exact triggering-run/count/since
against the quarantine store on each candidate main commit. It stops at a different
cycle or unreadable source boundary; missing provenance earns no automatic release.
Unique commit counting, the 20-pass threshold, failure resets, skipped-result
semantics, all original assertions and classification bytes are preserved.

Before the change, added regression fixtures fail **3** tests: twenty old successes
plus one fresh one falsely count 20; a 19-fresh sequence can release from older
successes; missing provenance can release. After the repair **13/13** focused
tests pass, including all ten pre-existing tests, fresh-twenty release, duplicate
run rejection, later failure and unknown boundary refusal. Changed gates pass
113 tests across three selected files. The initial restricted-context Node wrapper
failed before named cases and is not counted; the granted-shell baseline is the
actual 10-pass/3-fail proof. No product or late-send runtime repair follows from
this tooling result. Landing and exact-merge results belong in the repair PR.

## Prerequisites reused without another diagnostic

| Repair | Exact-merge evidence retained |
| --- | --- |
| #1487 `b11adf155430c0f6888f524e16fa5ae599c28408` | Corrected configured `39252546204` is 107 passed/one flaky/three skips, not clean. #1509's later pre-quarantine configured 108/0 flaky/three skips does not erase the account locator failure. |
| #1515 `929d1f1f1137297e8763745f5217b48ee0370e6c` | Main CI 2,171 passed/one existing skip; configured 107 passed/one deep-link flaky/three skips. Three account cases pass retry 0. Reuse matching fault `39279909249`. |
| #1519 `70714e8f594479aa064486c75bb58bb7cc47695c` | Main CI 2,185 passed/one skip; configured 108 passed/three skips, deep-link still quarantined. All 14 keys retained. The corrected one-baseline diagnostic authorization is consumed and was not rerun. |
| #1520 `ba5e72e37f3dd1771e40e87ce229cad3ff907402` | Main CI 2,185 passed/one skip; configured 109 passed/three skips, all retry 0. All three account and six deep-link cases normal. Reuse original fault `39307804274`, identical-fault pass `39309819955`, normal six-case `39309903933` and eight Node guards. |
| #1522 `4c69d916fc10239037e44894bab10dc835e6723a` | CI failed as above; Post-landing passed; Quarantine passed with no browser execution; configured 109 passed/three allowed skips, retry 0. Documentation revert #1523 was closed; Step 6 release stays effective. |

No new run replaces original CI `39250656173`, any failed configured attempt,
the ineffective earlier probes, or the closed #1506 quarantine proposal.

## Remaining acceptance sequence

The release-accounting repair is bounded tooling work, not completion of Phase 2.
The bootstrap cause, nightly setup cause, late-send failure and retained
single-device duplicate recovery still require matching diagnosis/repair and
normal landing. Coordinate any shared product path with #1526's owner first.
At most three repair attempts per failure; no consumed diagnostic is renewed.

After applicable repairs land and their exact-merge checks finish, obtain a fresh
checker who built none of them, starting without builder conversation. Pin one
source including any landed Step 6 changes. Use the prescribed queue: named small
selections cap 5, one relevant broader selection cap 12, whole suites/builds in
Actions. Verify actual counts/retries/skips/classification and carry all assertions.
That post-repair checker has **not** run; a knowingly red gate is not bypassed by
starting an acceptance campaign early.

The existing local session must separately execute the applicable desktop/laptop/
actual-125 and native interactions when available. Its idle status/paused heartbeat
is not permission to invent a completed check. Cloud virtual-display outputs remain
browser engineering evidence. A physical receiving host and owner comfort are
separate claims, never inferred from those outputs.

Acceptance is not waiting only on owner judgment: retained assertions and CI are
still red. The decision to remove concurrent authoring alone is already explicit;
no further owner approval is requested to repeat it. **BLOCKED** remains the verdict.
