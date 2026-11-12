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
