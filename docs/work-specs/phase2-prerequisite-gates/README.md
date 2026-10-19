# Phase 2 prerequisite gate repair — blocked

This separate repair session performs no independent acceptance. Source fetched from
`origin/main`: `bf86052134d20a055246b7683433b2cae536fcb9`. Own branch
`fix/phase2-prerequisite-gates`, own worktree `/workspace/phase2-gates`.
Recorded start: 2026-10-19 17:36:22 UTC (20:36:22 Kyiv); authorized implementation
end: 19:36:22 UTC (22:36:22 Kyiv). The user's unsuccessful-probe stop condition
was reached before that deadline; elapsed authorization is not permission to retry.
No repair PR, reviewed repair SHA, merge SHA, queue landing or terminal landing
result exists for this session. No durable monitor is claimed.

## Audit and boundaries

Read root/e2e guidance and scoped rules, check/verify/queue-merge/cloud-delegate,
leave-editor README and repair-11, pinned editor-keys investigation `9ecdb199`,
pinned independent-11 `2c6e7739`, #1487 corrected receipts, #1509 fault receipt,
#800 cleanup dispositions, and #1515 terminal comment 6271344398. No local main
exists. The activity helper reports no work in flight; supplemental
`git diff --name-status origin/main...work` is empty, and only the primary `work`
checkout and this new worktree are registered. Open remote PRs were audited;
shared editor/save/store/router/saved-data/preferences/CSS reservations remain.

Network preflight passes Git and Actions API reads. Executing worker reports four
CPUs, 16 GiB machine memory, two workers; hidden cgroup ancestors are unreadable,
so these are machine totals rather than observed container limits. Browser work
uses the prescribed queue, affected planner and five-minute selection cap. No full
suite or production build was requested locally. Dependency installation initially
failed because npm's inherited cache path was unwritable; the unchanged lockfile
installed using task cache `/tmp/phase2-npm-cache`. Its normal prepare step built
the player host; no separate full product build ran.

#1516 quarantined late-send after fail-then-pass on run 39287029913. #1517 then
released it on claimed 20 passes. Its review explicitly reports reused historical
statuses: the preceding quarantine was only ten minutes old, so twenty fresh
post-entry main runs could not exist. That release does not prove a repair or a
clean gate. This session changes neither classification nor that automation.

## Editor keys: single ineffective probe, stopped

Original main run 39259495974 / job 118087214783 on `901116aab4a9f19843631940cf4596b2595c9f1e`
remains failed at case 161, post-drag 177:162 through ready 23:49. The refusal is
“Wait for the preview to reach this playhead and revision before editing.”
Retry 14/14 and quarantine #1513 do not resolve it. The three previous ineffective
fault probes and the later passing observation remain unsuccessful historical
investigation; the late observer's label did not prove controller ordering.

This session's sole additional probe used a top-document `page.addInitScript`
listener before app registration. It intended to stop an actual zero-time pose
before consumption, release it after the real ruler pointerdown, hold the actual
one-second pose 1500 ms, and record expected/consumed request ids, controller
receipt and exact canvas pointerdown. No reply body or product source was altered.

**Instrumentation error:** arming checked the button's `textContent` against its
accessible name. The actual button text is `◷`; “Enable Position X animation” is
its `aria-label` (`AnimationProperties.tsx:44`). The hook never armed. Queue
`j-0001` reports **1 passed**, retry 0, 3.0 s test / 8.2 s wall, events `[]`, stage
error null. No held reply, ordering proof, pointerdown mismatch or original refusal
was observed. This is an unsuccessful probe, not repair evidence. No corrected
second attempt ran. [Exact unsuccessful helper, patch and result](unsuccessful-probe.md)
are preserved; instrumentation was removed and the maintained spec restored.

No editor-keys repair or normal-classification restoration is justified.
All fourteen existing cases, gestures, assertions and budgets remain byte-identical.

## Configured deep-link: confirmed failure, cause unproved

Account repair #1515 is complete at merge `929d1f1f1137297e8763745f5217b48ee0370e6c`.
Reuse controlled account proof 39279909249; no account repair was rebuilt. All three
account cases passed normally retry 0 in the exact-merge configured run.

[Whole-log and artifact evidence](configured-evidence.md): run 39287816358 / job
118180087518 is workflow SUCCESS but **107 passed / 1 flaky / 3 existing skips**.
Artifact 12204499974's downloaded SHA256 matches
`4d6406a7178f0940e9a2a057b49300957cb66fabba033f6c996b6a02f005e6ee`.
The unchanged production-link case at line 80 failed `production-missing` at
115:60, budget 60000 ms; retry 0 lasted 68253 ms and retry 1 passed in 12979 ms.

The failed snapshot shows “Opening production…” and “Looking for this production
in your account…”, with Back and Home present. It is a real unresolved lookup
state, not evidence of a wrong test locator. The failed attempt has error-context
only; trace.zip belongs to the passing retry. Its healthy events cannot explain
the failed attempt's auth/sync state. No matching deep-link fault or normal
verification was run, and no test-only repair is proved.

Static candidate, explicitly **not a proven original cause**:
`src/backend/graphicWhenSynced.ts:75` awaits `getAccessToken` before installing its
60000 ms cloud-answer backstop. Its completion test at line 132 accepts
`synced` or `error` with a result; `src/backend/syncController.ts:222` can finish a
pass in `pending` when a newer local revision is owed. The UI assertion also has
60000 ms, and can expire before a later-started fallback renders. The artifact
does not reveal which path occurred, whether auth waited, whether the fallback
was restarted, or whether the team-loading state dominated the page.

Relevant owner-review paths if product diagnosis becomes necessary:
`src/backend/graphicWhenSynced.ts`, `src/backend/syncController.ts`,
`src/components/home/ProductionPage.tsx:416` and `:2400`, and possibly auth/team
lookup dependencies. Proposed diagnostic change is read-only observation of
lookup start/settle, auth status, sync phase/result and team-loading at the failed
boundary, retaining the existing case, assertions and time limits. No product
fix is proposed before that evidence exists. No reserved source was changed.
Waiting out extra time, making sync settle first, or changing the final assertion
would hide or alter the tested window without proving this failure's cause.

## Coverage and verification

`git diff --exit-code origin/main -- src e2e` passes after probe removal. Both
specs and quarantine.json hashes are in [facts.json](facts.json). All fourteen
editor-key and five deep-link cases, every assertion, skip, classification,
retry policy and budget remain as found. No #800 helper/skip was restored.
Original CI 39250656173 stays failed; #1506 stayed closed and #1509 retains its
32 cases/assertions. No Step 6, Phase 3, #1466 closure or reservation release.

Receipt review ran inline against the four paths printed by
`node scripts/review-request.mjs --json`, base
`bf86052134d20a055246b7683433b2cae536fcb9`. No review capability is exposed here.
It verified scope, the original failed location and refusal, actual empty probe
log, the arming mistake, exact removed patch/helper hashes, artifact hash and
counts, failed-versus-retry attachment provenance, unchanged source/specs and the
single-probe stop. No receipt finding remains. Simplification ran inline; no
further change was needed.

`npm run gates -- run --changed origin/main` passed all five reached checks:
contract freshness (866), citations (4539 text files), docs index (150), client
secrets (3915) and copy (902). `git diff --check` and source/e2e byte comparisons
pass. Queue and browser-holder lists are empty. These verify the receipt only;
**overall repair verification is failed/blocked**, and no passing repair stamp or
queue admission is claimed. The branch is pushed for evidence retrieval only.

## Fresh independent-checker handoff

```text
Remain blocked before independent Phase 2 acceptance in NoaCG/NoaCG-Studio #1466.
Fetch current origin/main and read docs/work-specs/phase2-prerequisite-gates/README.md.
Account #1515 is finished; reuse its matching proof 39279909249 and terminal receipt.
Editor-keys' single newly authorized probe j-0001 was ineffective: arming used
textContent instead of aria-label; no actual reply was held and no refusal reproduced.
The attempt is preserved and further probing needs a new owner decision; do not retry it.
Configured39287816358 remains 107 pass/1 flaky/3 existing skips. Artifact hash matches;
failed snapshot is Opening production, while only the passing retry has a trace.
No coverage-preserving gate repair, normal classification restoration or repair PR exists.
Resolve both blockers through proved repairs before accepting. Inspect late-send #1517's
stale-status review; release/quarantine alone is not clearance. Keep all original failures.
No acceptance, #1466 closure, Step6/Phase3 or shared reservation release is authorized.
Suggested model: current Codex, high effort. Audit activity again; shared editor/save paths
remain reserved. This session owns no submitted landing and has no continuing monitor.
```
