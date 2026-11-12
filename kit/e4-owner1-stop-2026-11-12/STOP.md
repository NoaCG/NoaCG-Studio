# E4 owner-approved additional attempt stopped

Same run plan-editor-r1-5-2026-11-08, issue #2295, PR #2438.

Frozen clean committed and pushed head: `63d7d7b57253f49cdcfcaa20a5805dbdcc8c2baf`. Product code unchanged since `00a063a685fcf676f7adcff124df0383f8e46b23`. Ordinary repairs remain spent 3/3; owner extra granted1/used1/remaining0. No reset or further edit is authorized.

## Confirmed remaining product defect

Exact-head Codex review5882011573, inline4556338378: https://github.com/NoaCG/NoaCG-Studio/pull/2438#discussion_r4556338378

An unchanged legacy production without updatedAt or with an older version is falsely refused as a concurrent-edit conflict. `src/model/shows.ts:641-642` normalizes read records to version2 and a stable backfill timestamp; loadShows uses this shape. `src/control/projectInstallation.ts:44-56` captures that normalized value in plan.before. `src/model/projectInstallation.ts:55-62` compares the RAW transaction record with the normalized expected snapshot. These unequal representations trigger refusal without a real edit. Both worker and coordinator independently confirmed this concrete path from actual final source. Codex reports a reproduction; coordinator confirmation is static, not a new test claim.

This is an E4 product defect, distinct from the earlier view family. The explicit owner grant says: “Any remaining confirmed product failure after the combined additional repair ends this exception.” Therefore edits/launches stop; no automatic allowance or separate-family escape.

## Retained verification

15/15 targeted cases,33/33 source oracles,120/120 affected gates pass. j0117 remains176PASS/1faulty-fixtureFAIL9.4min; the confirmed-switch preconditions retain every original assertion and j0119 passes1/1(13.2s). j0118 remains a zero-test CLI selection failure. No second broader run.

Exact-head isolated run43305997998/job131489347411 PASS1case32.8s, zero skips/retries, account deleted; teardown0 resources and0TIME_WAIT, claims released. Artifact13982614865 339258bytes SHA25687adcd2a010677966e022186f6e5774a183f997885ce3bb5c377a26fa4623f4c. Wrapper/whole log inspected; artifact JSON was not directly ingressed.

Actual normal CI43305743222 is still in progress. Reviewed131488480173 failed solely for missing coordinator stamp after146s/28polls; no stamp/revival is appropriate with a known defect. Actual plan selectsALL63/fourstacks, capacityREPAY199.0/213(93.4%),adds1.3minutes; no limit changed. Existing CI and fresh FULLSO observations may finish; no new verification run or repair is admitted.

PR returned to draft, no land label/auto-merge/public coordinator stamp. E4 has neither landed nor passed; no E5C or later phase admission. Local/device work remains last. Owner disposition is required by the recorded grant and same-run stop/answered procedure.

## Subsequent collected evidence

Fresh FULL51path/base91a→63d7 independent review: AGREE WITH CORRECTIONS, gradeB/Do not land; exact finalreceipt hash e538d1f3c3ea5a7bc2c9d303a5b8a783055d8b4f802fb4caab8eb599fffc9dd9 read completely by root. One confirmed legacy snapshot defect at review completion; no other then.

Existing CI offline shard4/job131488795882 failed:162PASS/1FAIL9.5min. `e2e/new-graphic-guard.spec.ts:436`, line455 expected writes[1].dirty=false, gottrue, before later final-source/history assertions. Current saveActions preliminary changed check supplies a dirtylivecorrection. This is NOT proved data loss. It is NOT an established faulty fixture: `docs/EDITOR_REBUILD_PLAN.md:860-861` explicitly preserves the carried checker assertions and says the clean replacement remains written during the drain before the newer draft is durably restored. Therefore this documented-contract mismatch remains a real gate failure; no test change is authorized merely to pass. Same assessor clarification is collecting this existing evidence, with no new tests/reviewer/repair.

The supervisor stop was accepted2026-11-12T21:10:53.591Z and next explicitlySTOPPED. Initial stop publication rejected packet folder depth; its transaction rolled back, verified nextstillwait before retry. Packet flattened to supported text-only two-level format; no ledger duplication or source change.

## Terminal exact-head verification

CI43305743222 attempt1 TERMINALFAILURE: all33jobs terminal/read. Three red jobs: Reviewed131488480173 (missing publicstamp only); offline shard4/15131488795882 (documented Discard trace); CIgate131499073251 (propagated E2Efailure). All14otheroffline shards, Build, Factory, Catalog, both GuidedMod, all4configured stacks, configuredverdict131497151214 and Combinedreport131499072597 PASS. Configured148PASS0FAIL0FLAKY3existingSKIP acrossALL63. AutomaticBuildretry/E2Eretry and AftergateSKIPPED: no actual rerun. CapacityREPAY accepted by policy; LandingholdOFF.

All three headruns terminal: normalCI43305743222FAILURE, isolatedendurance43305997998SUCCESS, dynamicCodeQL43305735826SUCCESS, each attempt1/exact63d7. Draft63d7 read back, mergedfalse/automergeNULL/labelsEMPTY. Historical localPASS stamp retained as historical, not current landing clearance. E4stop persists; no phaseadvance or hiddenmonitor.
