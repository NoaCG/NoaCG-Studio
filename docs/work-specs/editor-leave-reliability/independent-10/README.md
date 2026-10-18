# Tenth independent leave-editor check

**FAIL product: a copy-arrival timeout manufactures unsaved work after a Save, without another
edit.** Main `1ac6093aff11d14d4f9fcbb9f01e209d0ee4be91` contains #1476. Its new conflict
relink works in ordinary, overlapping and chained-copy cases. But a second tab whose library
has not adopted the copy within ten seconds loses its clean copy link when the user presses
Save. After cancelling the naming dialog and letting the library catch up, Home asks about
"unsaved changes" although the source is already saved in its conflicted copy and no edit was
made. This fails AC 2 and the owner's explicit "unless the user edits again" condition.

The checker built neither the phase nor any repair. No product source, maintained test, carried
test, gate, baseline, budget or retry policy was changed. No repair is authorised here. Phase 3
remains gated. The coordinator received the failure immediately and stopped further product work.

## Reproduction and evidence

Fresh disposable spec:
[`leave-tenth-checker.spec.ts` at `9459323e2b84841fbdea911ea7860811a3ff55e5`](https://github.com/NoaCG/NoaCG-Studio/blob/9459323e2b84841fbdea911ea7860811a3ff55e5/e2e/leave-tenth-checker.spec.ts).
The probe branch is `codex/probe-editor-p2-check-10-ci`, never queued and with no pull request.
The docs branch is separate, `codex/plan-editor-p2-check-10`.

1. Import Riverlight through the normal wizard, draw a rectangle and first-save "Tenth gamma".
2. Open the same draft in a second tab. Hold only that tab's `noacg-durable-writes` library
   announcements. Other channels, actual IndexedDB writes and the first tab continue normally.
3. Run the actual sync engine against an in-page cloud holding a newer remote version under the
   saved record's id. One conflict, no sync failures. The local saved source is durable in a new
   conflicted copy. Both live tabs link to it, clean; the second tab cannot read it in its
   library mirror yet. This is the same arrival window the repair explicitly handles.
4. Make **no edit** in the second tab. Press its topbar Save. It shows "Saving…". After the
   ten-second bound, it asks for a name and becomes `{graphicId: null, dirty: true}`.
5. Cancel naming, release the held announcements, and wait until the library contains the copy.
   The draft stays unlinked and dirty. Home asks: "“Tenth gamma” has unsaved changes. Save them
   before continuing?" The original source and winner are intact; there are exactly two records.
6. In the real-timer case, cancel that question and reload. The durable slot restores the clean
   copy link. This is a live-session question after timeout, **not** a repeated-after-reload claim.

Independent Actions evidence, `--workers=1 --retries=0`:

- [39126381198, job 117672279521](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126381198/job/117672279521), probe `cefc8bb4a83d529bd65bdcf34359a323b308acd5`:
  unedited case fails on `homeAsked: 1`; edited control passes. The job's `Print bounded facts`
  step prints both unchanged JSON observations, including `winnerUnchanged: true`, `records: 2`
  and `sourcePreserved: true`.
- [39126488754, job 117672606522](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126488754/job/117672606522), final probe `9459323e2b84841fbdea911ea7860811a3ff55e5`:
  **2 failed, 1 passed**. The second failure uses **real wall time**, with no clock injection:
  `waitedMs: 10492`, `exactSourcePreserved: true`, `homeAsked: 1`; reload restores the same clean
  copy id. The third case is the edited control. JSON facts are printed in the job log.

Local work used the existing browser queue on this worker (4 visible CPUs, 16 GiB machine
memory, two-worker ceiling; cgroup ancestors could not be read). `j-0008`,
`node scripts/jobs.mjs add 'npm run test:e2e -- e2e/leave-tenth-checker.spec.ts --retries=0' --cap 5`,
gave **1 failed, 1 passed**, 7.5 seconds. `j-0009`, the same command with `--grep real-time`,
gave the independent real-timer failure in 14.9 seconds (`waitedMs: 10458`). The screenshot was
opened and inspected: the unsaved dialog covers the editor; Home has not mounted.

The first local attempt, `j-0007`, and the initial Actions tenth job on `2ccd1b8d` timed out
because this checker's new spec used a nonexistent `save-cancel` test id. They are harness
failures, not product findings or passes. The probe was corrected to press the actual naming
dialog's Cancel button. No carried or maintained test changed. GitHub cannot dispatch a newly
added workflow before it is on the default branch (404), so the two separate facts workflows
use a push trigger restricted to the disposable branch. All original carried recipes stay intact.

## Judgment of repair-10 and earlier departures

The ten-second bound avoids waiting forever, and the maintained `save-chain`, `discard-chain`
and `save-timeout` rows pass independently in the 49/49 matrix. Rechecking the live id after each
wait handles A to B. Discard's changed-link refusal preserves the newer draft. Those results
do not justify the timeout's fallback: a transiently unreadable known copy is not evidence that
already-saved, unedited work needs a new record. This check rejects that fallback for a clean
saved draft. Reporting a retryable Save failure while keeping its clean copy link would respect
the acceptance boundary; implementing a disposition requires the owner's authorisation.

The carried ninth checker remains **7 failed**, rather than being labelled green. Independent
bounded facts are in
[39126381198, job 117672279624](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126381198/job/117672279624).

| Carried case | Independent facts and judgment |
| --- | --- |
| C-overlap | First Save overlaps a conflict. Ends Saved, linked clean to "Beta (conflicted copy)", same after reload; next Save asks no name; Alpha unchanged. Its `:158` null-link assertion is replaced by the owner's clean-copy rule. Accept the product behavior, retain the red assertion. |
| V-superseded, newer list / refused list | Both tabs link clean to the copy; second-tab Save asks no name; Alpha unchanged. Both fail at `:199` on null-link. The new channel closes the earlier overwrite despite the list problem. Accept the behavior. |
| C-pull | Both live tabs link clean to the copy during the pass. That pass also pulls the newer account-wide working slot, containing the other device's draft and link. Reload opens **that other draft**, linked to Alpha. The subsequent deliberate rectangle edit/Save updates Alpha (`alphaUnchanged: false`); it does not put this device's conflicted source there (`alphaHoldsMine: false`, `copyHoldsMine: true`). Its `:117` null-link assertion is replaced. Accept within the existing single account-wide slot semantics, with this source-replacement limit explicit; do not call Alpha byte-equal in this case or claim the same draft stayed on its copy after reload. |
| V-reservations, newer / corrupt / missing | After both reservation and link writes are refused, an unusable/lost device-local reservation list causes naming and a second record. Original minted source is preserved; two records, no overwrite. These remain red at `:247`. Accept the earlier disclosed degraded-storage limit, requiring both write refusals and the list problem; it is not evidence that normal double-refusal handling failed. S6 passes unchanged. |
| Ninth R-departure | The independent configured facts show B unlinked at both boots and after sign-in, no A id in its own list, Beta minted under B’s own id, the pulled mint mark absent, C unlinked, `cLeave: {asked: 0, named: 0}`, `cMinted: null`, and `alphaFinalUnchanged: true`. Red only at `:281`, which wrongly expects that pristine-baseline C must ask. Accept the AC 4 baseline behavior and the reservation-field departure: this build does not honour another device’s id. The older-build/rollback window stays disclosed. |
| Fifth B1 | The unchanged spec times out on the unbounded read of an absent storage alert at `:246`; the carried bounded-B1 variant passes 1/1. No notice is the required behavior. Accept the expectation's product meaning, retain the original timeout. |
| Fifth F-hold / F-late | Both unchanged specs time out waiting for a library row after pressing Cancel at the guarded Open (`:464`). Cancel correctly keeps the editor (AC 1/3); letting Open proceed during the write would reopen #1392. Accept that departure, retain the red results. |

## Independent carried and maintained runs

Initial probe `893ac1fb5f344d779ff690739b11106aed6fc050` is exact main plus only the 21 paths
from `9bef784b73fa979d24fe254da1dbc156cb7ba342`. The path list comes from the three-dot
merge-base diff, **not** a two-tip diff that would revert subsequent main changes. Over all 21
paths, `git diff 9bef784b HEAD -- <paths>` is empty. Over `src/` and the maintained matrix and
helpers, `git diff 1ac6093a HEAD -- <paths>` is empty. Final probe adds only this checker's
disposable spec, two separate fact-printing workflows and their bounded JSON logger.
[Evidence](evidence.md) records hashes and the actual facts.

The original recipes were dispatched against the pinned initial probe, each once with its
named scope. Every result below was read from its job/step list and log. Actions remains
authoritative for broad scopes; no full suite was run locally.

| Scope | Result | Run |
| --- | --- | --- |
| Unchanged | original 3/3, second 4/4, third 10/10, `:24` repeated 20/20, fourth 11/11 | [39125980081](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125980081) |
| `:228` repeated | 20/20 | [39125983280](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125983280) |
| Fifth | 17 passed, 3 timed out: B1, F-hold, F-late; bounded B1 1/1 | [39125985849](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125985849) |
| Sixth | 10/10, including #1383 S6 double refusal | [39125988148](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125988148) |
| Seventh | 16/16, including #1402 H | [39125990453](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125990453) |
| Eighth | 7/7 | [39125993415](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125993415) |
| Ninth | 7 failed, departures above | [39125996198](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125996198) |
| Maintained | 85 passed, the same 8 legacy skips; two-graphic export 1/1 | [39125998711](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125998711) |
| Matrix | 49/49, unchanged | [39126001394](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126001394) |
| References | 6/6; all 17 source hashes match the earlier pins | [39126004350](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126004350) |
| Visual | 125% cumulative 4/4 | [39126006993](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126006993) |
| Configured | signed-in task 1/1, eighth X-device 1/1, ninth S-concurrent 2/2; R-departure red only at `:281` | [39126009521](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126009521) |

The final facts workflow [39126488754](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126488754)
is terminal **failure**, with all three jobs red: ninth 7 failed, fifth 17 passed / 3 timed out
(and bounded B1 passed), tenth 2 failed / edited control passed. No red job is relabelled green.

The configured facts were also printed independently in
[39126381213, job 117672279500](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126381213/job/117672279500).
Both S-concurrent orders keep B linked clean to B’s conflicted copy, Home asks nothing, and the
leaves-at-once order asks nothing at New before or after reload. Gamma keeps A’s source and B’s
source has its own record. The configured **run remains red** solely on R-departure’s baseline
expectation; passing subcases are identified individually.

## References and criteria

Fresh runtime lifecycle tasks ran in Studio official v0.17 (binary SHA256
`9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681`) and Eyevinn
`616841bd949e3a21137579451123f66c292543f0`. Studio's ten relevant files at
`3142fc7d02934494931eb14e7dc255393e4110d0` are byte-identical to release source
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`; all seven Eyevinn hashes match earlier receipts.
The checker fetched the source pins separately and inspected Studio's `Menubar` → `fileIO`
Save/New/Open handling, `projectStore` and `useAutosave`, its file-IO tests, and Eyevinn's
`TemplateManager` create/update/delete/storage, `main.js` preview-event wiring and model/storage
tests. The independent runtime run verifies source preservation and the rendered lifecycle.

Studio saves an explicit downloaded project, then separately autosaves after 500 ms; New asks
even after Save and direct Open loads a file. Eyevinn mutates and stores the template collection
immediately; deleting an experiment is explicit. Its records write precedes its active pointer,
and the carried pointer-refusal task verifies one record remains after reload. Neither reference
syncs one graphic between devices or has a counterpart to a conflicted-copy arrival wait. Their
behavior cannot excuse NoaCG's false unsaved question. No upstream source was copied.

| Acceptance | Judgment |
| --- | --- |
| AC 1: normal import/wizard; ask over editor; cancellation keeps source/history/selection | Preserved by original through eighth carried scopes. The new timeout dialog also remains over the editor; its reason for asking is the AC 2 failure. |
| AC 2: saves retain source; discard mints nothing; saved copies preserved; no repeated/delayed question | **FAIL** on the fresh unedited timeout challenge. Ordinary S-concurrent and maintained conflict rows pass. No source loss or winner overwrite in the new finding. |
| AC 3: Home/New/Open/Back/hash boundary; no early navigation/duplicates; no resurrection | Preserved in carried normal/refusal paths. The earlier V-reservations degraded-storage duplicate exception remains explicitly red. |
| AC 4: pristine baseline, wizard walk, library/cloud/production separation | Configured pristine C correctly asks nothing. Maintained selection passes 85 with the same 8 legacy skips; two-graphic export passes 1/1. No new source mutation was run: this check forbids product edits; held writes/announcements and the existing negative destination assertions supply the adversarial checks. |
| AC 5: comparable pinned reference tasks and source | 6/6 fresh executions and independent pinned source inspection, with hashes in evidence. No conflict-wait equivalent or whole-editor parity claim. |
| AC 6: desktop/laptop/native 125%, cumulative text/artwork/animation, save/reopen and outputs | 4/4 fresh carried tasks preserve source and executable SPX/CasparCG/OGraf browser outputs. Native allocation remains 196px canvas, 180px timeline, 280px inspector at 1093×545 CSS; no comfort, physical-host or owner-acceptance claim. |

## Local visual inspection

The carried four-case visual scope passed on Actions. Fresh local screenshots were also opened
and inspected at desktop 1920×1080, laptop 1366×768 and actual browser 125% zoom: text/artwork and
selection handles render, the inspector and timeline remain present, and the 125% Fit artwork
is still small with Properties scrolling, as earlier receipts disclose. Native measurements are
1093×545 CSS, viewport height 196, timeline height 180 and inspector width 280. All nine
SPX/CasparCG/OGraf exports execute without page errors and keep the authored data. This preserves
engineering qualification; it does not settle comfort or owner acceptance.

Local queue results: `j-0011` gave three passes (nested, desktop, laptop) and one native launch
failure because DISPLAY was not forwarded by the queue. `j-0012`, with the explicit queued
command `DISPLAY=:97 npm run test:e2e -- e2e/interaction-probe-task.spec.ts --grep "actual 125"
--retries=0` at cap 5, passed 1/1 in 14.8 seconds on an isolated Xorg dummy display. No test changed.
`j-0013`, desktop/laptop with a separate output directory, passed 2/2 in 17.2 seconds and retained
the screenshots for inspection. The initial wrapper command `j-0010` was refused by source
admission before any test ran; the named queue selections were used instead. These prerequisite
failures are recorded, not counted as passes. The dummy display was stopped afterwards.

## Exact-source landing checks and limits

The checker read these itself for `1ac6093aff11d14d4f9fcbb9f01e209d0ee4be91`:
merge-group CI [39125249444](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125249444),
Post-landing [39125792459](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125792459)
and Quarantine [39125792428](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125792428)
succeeded. Later deployment verification
[39125949589](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125949589) succeeded in both
production verification and deep-link jobs; drift was skipped. Earlier deployment-status runs
were skipped, not passed. Vercel's later commit status says deployment completed.

Exact-source push CI [39125792438](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125792438)
succeeded: all 15 full browser shards passed, and its retry job was skipped. CodeQL
[39125792547](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39125792547) succeeded for Python,
JavaScript/TypeScript and Actions. The full configured suite `39125792534` remains running at
12:29 UTC. The coordinator explicitly accepted this pending observation for the already-proven
FAIL product verdict and owns recording its terminal result in the findings PR and wave ledger.
Pending is not green and does not itself make the product failure blocked.

The new fault injection delays this tab's library notifications; the conflicted record itself
is committed. The real-timer reproduction rules out clock acceleration as the cause. There is
no claim about how often a real browser pauses announcements for ten seconds. The repair exposes
that bound as a supported outcome, and the owner's acceptance did not exempt it. The phase
fails on the observable result, not on a probability estimate. Browser output is not a physical
receiver test; hosted accounts, owner comfort and Phase 3's conflict notice remain outside scope.

**FAIL product.** A timed-out Save of an unedited clean conflicted draft must not create an
unsaved question. No repair was made. The next product action requires the owner's decision.
