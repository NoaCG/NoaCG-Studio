# Editor E4: stopped at the view-family repair cap

Same run: plan-editor-r1-5-2026-11-08, issue #2295. PR #2438 remains unmerged and held. Cloud execution and the real isolated backend are qualified; this stop is a repair-limit decision.

The builder stopped at 2026-11-12T18:21:59Z. Remote/local HEAD is 2767a30cb0fccbb9a04f4f2e0ca285b32e4f94d6. The nine-file final-attempt patch is uncommitted, unpushed and incomplete. This packet preserves it exactly. No fourth product edit, new allowance, test weakening, wait/retry/skip fix, queue stamp or auto-merge is authorized or claimed.

## Evidence and remaining failures

The new-source selection matrix j-0114 ran ten cases with two Cloud workers: six passed, four failed in 35.4 seconds. The original log is verification-final.log. Two failures are confirmed product defects:

1. After an aborted Discard, the latest #f0 selection remains in the live staged bundle, but immediate reload restores an empty selection. At src/store/saveActions.ts:449 the failure branch restores staging and returns the original failure without confirming the newer view's durability. The source/history/private owner remain preserved in the observed reload; the view is lost. Do not call this a successful preservation result.
2. A semantically equal sample map with different key insertion order keeps the editor context token unchanged but advances workspace generation from 5 to 6. At src/store/authoringProjects.ts:77-88, sampleData reference inequality reaches full-owner retention before the semantic producer guard; against a held Discard candidate, the live source is staged over the candidate. The assertion stops at the unexpected generation; no final Discard outcome is inferred for that case.

Two additional new fixture expectations are wrong about existing rules: switching visits another document whose ordinary writer legitimately reserves an ID; Save As legitimately chooses the free name E4 Lower third 2. Their original assertions/logs remain unchanged. They are not counted as product fixes or inferred passes, and may mask later assertions. The honest total remains six passes/four failures.

The worker reports app TypeScript and its maintained session oracle passed eight/eight. No new-source broader run, normal CI, isolated backend run or final full SO was admitted after the known product failures. The older 2767 source passed 162/162 bounded cases, all product CI gates and exact-head isolated persistence, but its fresh full SO was B for the selection class. Those results are historical, not clearance for this patch.

The before-repair j-0113 log preserves all four original failures: switch, autosave/reload and Home restore an empty selection; selection during held Discard can replace the live owner/source. Both complete fresh pre-code model receipts are preserved here with hashes in manifest.json.

## Attempt accounting and stop authority

This is confirmed PR review round 5 and the existing authoring-view ownership/freshness family. The coordinator conservatively counted three repairs: 4de8259f private-view lifetime first, 2767a30cb view-only Discard generation/refusal second, and this complete live-view producer attempt third/final. The 42be82a91 adopted-workspace repair remains a separate previously recorded family. All original failures, rounds and counts remain; no symptom/head/worker reset is allowed.

The plan-run skill follows the shared queue-merge procedure: “At most three repair attempts per failure; then stop and report what failed, what was tried and why it did not hold.” The native builder has returned its final BLOCKED receipt and stopped product edits. E4 has not landed or passed; E5C and later phases cannot start.

An owner disposition is required at the existing stopped checkpoint. The plan-run stop/answered mechanism records a genuine owner answer; it does not by itself erase this PR's exhausted family count or authorize an automatic fourth patch. Existing until-complete and block-renewal permission does not override exhaustion. Preserve this run, PR, scope and history when qualifying the owner's direction or an externally supplied repair.

## Concrete obligations for review

The saved model already requires both missing boundaries: genuine view transitions must be filtered before any full-owner staging side effect, and failed replacement recovery must preserve the newest legitimate complete owner durably before reporting preservation. Review those two seams against the existing unknown/adopted-envelope and retired-binding guards. Retain the original failure and any correction failure honestly.

Any supplied repair must preserve source, assets, baseline, history/future, historical view receipts, links/reservations, project membership, installation journals and installed/on-air copies. Equivalent sample maps must be idempotent; ordered selections and genuine away/back changes remain meaningful. Use the original failed-replacement/reload and equal-map/held-Discard assertions, then all required current-source checks. Correct only the two new fixture assumptions according to the documented switch/Save As rules. No limit or judge relaxation is proposed.

## Other completed work

The E1/E2 causality gate is settled No for both original specs. Clock rates were parent 1/60 versus E2 2/60; outage rates parent 8/301 versus E1 7/301, one CI worker and zero experimental retries. The standard automation later released clock through #2455 after 20 main passes. Its underlying pre-E1/E2 cause is #2456, owner miwco, original repair date 2026-11-25. Outage remains quarantined in #2371 with miwco and that date. No clock product fix is claimed.

Separate mandatory per-graphic quarantine #2453 landed as b9f3660e28c5cc339dbfb82d4415ebb492ac2cef and completed exact-merge main CI, configured, post-land, CodeQL and monitoring workflows. Its configured suite passed 159 cases with zero failed/flaky and three existing skips. The existing publish-output-setup monitor still failed and remains recorded in #2371. The finished quarantine worktree was safely removed; the editor worktree is retained.
