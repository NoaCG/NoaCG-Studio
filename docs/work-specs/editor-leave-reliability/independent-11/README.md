# Independent Phase 2 gate check — 2026-10-19

**BLOCKED before acceptance execution.** This checker built neither the phase nor its
repairs. A separate owner landed the account locator fix and normal classification;
all three account cases passed without retry on the exact merge. That configured run had
a separate deep-link failure followed by a passing retry. Editor-keys remains unresolved.
The owner's explicit instruction requires stopping at unresolved gates. No new product failure is claimed
from a fresh runtime challenge, and no acceptance pass is claimed.

## Source and isolation

Fetched `origin/main`: `86e795dc9f66183633d7c99a73bea8c27e4e32f6`, merge #1513.
Receipt branch: `codex/check-editor-p2-independent-11`; worktree:
`/workspace/NoaCG-Studio-independent-11`. The starting checkout was clean on branch `work`
at the same SHA. No local `main` exists. No product, test, classification, budget,
reference, carried probe or queue configuration was changed by this checker.

Repair #1487 merged as `b11adf155430c0f6888f524e16fa5ae599c28408`.
Readiness #1509 merged as `9294d250d67b6e274c7da7fac580bbb9f3391f73`.
Both are ancestors of the initial inspected source. At the initial `86e795dc9` snapshot, main contains
#1510 account quarantine, #1512 late-send release, #1511 verification observation and
#1513 editor-keys quarantine. There is no diff in `src/`, `account.spec.ts`,
`save-copy-arrival.spec.ts` or `save-transaction.spec.ts` across that range.

Subsequent fresh main audit after the separately authorized account repair:
`929d1f1f1137297e8763745f5217b48ee0370e6c`, merge #1515. Its only intervening changes from
initial `86e795dc9` are #1514's two workflow/runbook documentation paths and #1515's account
spec, quarantine entry and account receipt. No `src/` file changed. No acceptance runtime
execution has begun on either source.

Fresh handoff audit at `2026-10-19T18:11Z` (`21:11 Kyiv`) fetched main
`8687863db85845c11839c76adab8c23a2266d5b7` (merge #1518). Since `929d1f1f`, #1516/#1517 changed late-send quarantine
classification and #1518 changed coordination instructions. Product source and the two
unresolved target specs are unchanged. Acceptance runtime remains stopped.

## Blocking evidence and owner decision

The whole decoded logs were independently read using the GitHub connector. Bounded excerpts,
original line numbers and job links are in [gate-evidence.json](gate-evidence.json).

- Configured run [39252546204](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39252546204),
  job `118059664098`, has a successful workflow/job conclusion but reports **107 passed,
  1 flaky, 3 skipped**. At `account.spec.ts:58:78`, exact `Sign in` resolves to two buttons:
  Home and `account-save-notice`. The case failed and passed on retry. It is not a clean pass.
- Final readiness merge's configured run
  [39255931088](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39255931088), job
  `118071084143`, reports **108 passed, 0 failed, 0 flaky, 3 skipped**. Its source is
  `9294d250`, where account is in `released`, absent from `specs` in quarantine.json;
  the account cases appear in the normal configured job. This clean run predates #1510's
  landing. It does not erase the earlier failure or repair the ambiguous locator.
- #1510 merged at **2026-10-19 16:11:14 Kyiv (13:11:14 UTC)**, after the implementation
  deadline **16:03:27 Kyiv (13:03:27 UTC)**, as
  `ec79ae58c5b6c10bbd57e68b7cc42cabd38536d5`. Its stated purpose is to quarantine account
  after that fail-then-pass. Initial source still had the same global locator at line 58
  and account remained in `quarantine.json.specs`, citing run `39252546204`.
- The corrected [#1487 receipt](https://github.com/NoaCG/NoaCG-Studio/pull/1487#issuecomment-6253366662),
  [standalone prompt](https://github.com/NoaCG/NoaCG-Studio/pull/1487#issuecomment-6268291985)
  and latest [#1466 owner record](https://github.com/NoaCG/NoaCG-Studio/issues/1466#issuecomment-6267607886)
  explicitly call this unresolved and refuse quarantine as a gate bypass. #1466 remains open,
  last updated `2026-10-19T13:29:06Z` when rechecked. No later resolving decision was found
  in those conversations or #1510's discussion.

**Independent decision: do not proceed under the automatic quarantine.** A session question
requests an explicit owner decision on a separate repair owner/window, a coverage-preserving
locator repair and restoration of normal gate classification. This checker builds no repair.
The owner answered **“Authorize separate repair and restore gate”** in this chat. A separate
repair agent, `/root/account_gate_repair`, was assigned the narrow repair, classification
restoration and terminal landing ownership. Its implementation window is `2026-10-19
15:30:27–17:30:27 UTC` (`18:30:27–20:30:27 Kyiv`). Its branch is
`codex/repair-account-signin-gate`, worktree `/workspace/NoaCG-Studio-account-gate`.
This checker remains stopped pending that engineering result and builds none of
the repair. The decision authorizes repair; it does not accept Phase 2 or bypass its gate.

Earlier engineering checkpoint: [then-draft #1515](https://github.com/NoaCG/NoaCG-Studio/pull/1515),
head `876f87fe4caf73320441d5d3c9bec7cc12a428ca`. Independently inspected its three-file diff:
the existing Sign in visibility assertion is scoped to Home with the same timeout; the
account entry alone moves from quarantine `specs` to `released`; a pending-verification
receipt is added. The existing no-auth-modal assertion remains. This is not a landed or
verified gate restoration. Its fault proof `39279909249` was queued with no executed steps;
local backend setup and Node piped-input gates were incomplete and are disclosed by that owner.

Subsequent account evidence: independently read the whole proof job `118152031755` and queried
`actions/runs/39279909249/attempts/1`. It is **completed success**, exact probe
`61e79019570697a95cad9e0085059f1a6b6386b4`, attempt 1. The unchanged original assertion under
the two-second release delay fails at exact `:58:78` with two matches (one unexpected failure,
zero flaky/skipped). Under the identical delay the scoped assertion passes 1/1; explicit
diagnostics record `{all:2, home:1, notice:1}`. After restoring the fault, all three normal
account cases pass with zero failed/flaky/skipped, `--workers=1 --retries=0`.
`PRODUCT_SOURCE_RESTORED true` is logged. Excerpts are retained in the evidence JSON. This
supports the engineering repair; normal main classification is still pending landing.
The separate owner's unchanged local gates subsequently passed in the supported persistent
execution context; the prior interrupted attempts remain disclosed, not retroactively passed.

Final account head is `92ce1b2e6d9f45bba95c5517a19664429db288b2`. Independently queried
`actions/runs/39283658898/attempts/1`: completed success on that exact head. The required
`Reviewed` and `CI gate` checks are both formally completed success. Independent GraphQL
inspection confirms actual queue entry `MQE_lQDOSzVhWs8AAAABJXjCac4AA_nszgNZyZY`, position 2,
with that exact head and `merged:false` / no merge SHA at this checkpoint. The owner remains
active through landing and exact-SHA terminal results. Earlier draft CI `39280886245` on
`876f87fe` failed its missing-stamp Reviewed wait; that superseded failure is preserved.
Superseded proof `39279813869` was cancelled during backend setup before account tests.
Neither is counted as a passing run or a product assertion failure.

The account repair **actually merged** at `2026-10-19T16:43:21Z` (`19:43:21 Kyiv`) as
`929d1f1f1137297e8763745f5217b48ee0370e6c`. Independently fetched `origin/main` and read PR
metadata: exact reviewed tip `92ce1b2e...`, state MERGED and that merge SHA agree. The landed
quarantine JSON places account in `released` and removes it from `specs`; editor-keys remains
in `specs`, citing its original failed run. The account owner is following exact-merge CI,
configured, post-land and other terminal results. Pending checks are not yet passing evidence.

Terminal continuation: the owner completed landing ownership and published
[comment 6271344398](https://github.com/NoaCG/NoaCG-Studio/pull/1515#issuecomment-6271344398).
Independently queried configured `39287816358/attempts/1`: completed success on exact merge
`929d1f1f`. Independently read its whole 1,724-line job `118180087518`: all three normal
account cases pass, without retry. However, deep-link case `:80` fails at `:115:60` awaiting
`production-missing` for 60,000 ms, then passes retry 1. Totals are **107 passed, 1 flaky,
3 existing skips**; the guard explicitly says deep-link failed in quarantine. This is not
a clean cumulative verdict and does not clear acceptance. No rerun or repair was built here.
The owner's exact-merge main CI `39287816751` reports 2,171 passed / one existing skip /
zero flaky across 15 shards, with retry job skipped; this is owner-reported evidence, not
an independent whole-log audit of those shards by this checker.

The later separate session's pinned artifact audit at `36c2522b` reports that only the passing
deep-link retry has a trace; the failed attempt has error-context showing Opening production /
Looking for this production in your account. Its auth/sync/fallback explanations are static
candidates, not established cause. That session changed no product, maintained test or gate.

## Activity, reservations and current checks

### Additional current-main failure discovered by this audit

Main advanced beyond the supplied `901116aab`. #1513's only stated disposition is to quarantine
`editor-keys.spec.ts` after a fail-then-pass. Independently read whole logs for original
run `39259495974`, jobs `118087214783` and `118092999541`; excerpts are retained alongside the
account evidence. The original run's conclusion is **failure**, source
`901116aab4a9f19843631940cf4596b2595c9f1e`, attempt 1.

The case `nested SVG armed parent-coordinate drag and explicit base offset preserve motion`
at `e2e/editor-keys.spec.ts:161:1` failed in `ready` (`:23:49`), called at `:177:162`:
`.ef-stage-error` expected count 0, received 1 after 7000ms. The original shard reports
**124 passed, 1 failed**. The same-source retry reports **14 passed**. #1513 reclassified the
file into quarantine; it supplies no defect repair. No root cause or product-versus-harness
diagnosis is claimed from these logs alone. A passing retry does not clear the failed assertion.

The original `test-results-7` artifact `12189853796` was downloaded with the GitHub artifact
connector, then `download_file`, and its screenshot was opened. ZIP SHA256:
`dc76f062589d11a16f1d4a451424986dd21d05c96199fe62558accdf6ba69b60`.
Both screenshot and error-context show the actual alert: **“Wait for the preview to reach
this playhead and revision before editing.”** The retained trace shows a ruler click, the
existing `data-pending=false` / zero-stage-error checks, then measurement and drag; the
post-drag zero-stage-error check fails. This narrows the observed failure to a readiness
refusal; it is not proof of root cause, a product fix or permission to weaken the check.

This is a second unresolved gate issue; the account-only repair authorization does not
resolve it. The owner separately answered **“Authorize separate investigation and gate repair”**
in this chat. Agent `/root/editor_keys_gate_repair` was assigned the investigation, matching
fault proof, coverage-preserving gate repair and normal classification restoration in its own
worktree/window. The account owner was explicitly told not to broaden scope. Both owners must
coordinate their disjoint quarantine entries and the single local browser queue. Shared product
source stays reserved; a product-source fix needs a concrete additional owner decision. This
checker builds neither repair. Acceptance remains stopped pending both resolutions.

Editor-keys outcome: the separate owner pushed a **docs-only blocked investigation** at
[`c0d59d79aabd673a62dfd67e44e0ce61dddcbc72`](https://github.com/NoaCG/NoaCG-Studio/blob/c0d59d79aabd673a62dfd67e44e0ce61dddcbc72/docs/work-specs/editor-keys-gate/README.md).
Its own worktree is `/workspace/NoaCG-Studio-editor-keys-gate`, branch
`codex/repair-editor-keys-gate`; window `16:09:36–18:09:36 UTC` (`19:09:36–21:09:36 Kyiv`).
Unchanged target j-0001 passed 1/1. Three disposable scheduling probes j-0002/3/4 also passed
because they did not demonstrably hold the intended latest pose. They are unsuccessful
reproduction attempts, not repair evidence. After the third probe the owner stopped under
verify.md's attempt rule and restored the test byte-for-byte. All 14 cases remain unchanged;
spec SHA256 `4c946a7ddd997e00a9fde680813ad7441d5b4d826f1795835f7aae2fecd45929`.
No repair, quarantine edit, PR or landing was submitted. Exact hooks, jobs, timings and limits
are in that receipt's `fault-probes.md` and `facts.json`. A new session question asks for
explicit authorization of one observational target run, cap five minutes and zero retries,
recording real reply envelopes/receipt time/cue/revision at pointerdown.

The owner answered **“Authorize one observational run”**. The same separate agent resumed
for exactly that target, through the existing queue with a five-minute cap and zero retries,
with no injected delay/mutation, product-file change or gate reclassification. Its original
`18:09:36 UTC` implementation deadline remains. This decision authorizes the observation;
it does not establish a cause, authorize another fault probe or clear acceptance.

Observation j-0005 ran `2026-10-19T16:52:25.838Z–16:52:37.563Z`, source
`c3904ed4623bdeceac432153869e12ef0c9c5b96` (owner branch reconciled with main `929d1f1f`).
The same command above passed **1/1, zero failed/flaky/skipped/retries**, 4.3-second test,
10.6-second Playwright wall. The original refusal did not occur. Independently read all 23
event records and the exact temporary hook. At pointerdown, the session is source/assets
`5/1`, time `1`, cue `null`, selection `#nested`; receipt is ready, generation `4`, request
`11`, same revision/time/cue. DOM request `11` and pose time `1` agree; its literal cue stamp
is `arriving`, which is retained without interpreting it as the receipt's null cue.

At observed reply 11, that same receipt is already ready while the DOM still shows request
10/time 0. The raw label `reply-before-handler` therefore does **not** establish listener
ordering before controller processing. This limits all three earlier interception probes;
it does not prove the original failure's cause. Temporary patch SHA256
`d967b50438b914913416252a487ff97903b01058e9670740a9ebf29ef6e0723c` was independently checked.
The restored maintained spec matches the SHA256 above. No repair or gate release results
from this passing diagnostic. Further runtime work remains stopped pending an owner decision.
The completed observation and raw events are published at
[`9ecdb199fe9a67552f93de7f3dba74e484d1b96b`](https://github.com/NoaCG/NoaCG-Studio/blob/9ecdb199fe9a67552f93de7f3dba74e484d1b96b/docs/work-specs/editor-keys-gate/README.md).
Independently compared that commit with current main: `src/` and `e2e/` are byte-equal.
A session question requests a new explicit disposition for exactly one pre-app-listener
matching-window fault probe, same target/cap/zero retries, followed by another stop. It is
not authorized by the completed observational round; no answer is inferred from elapsed time.

The user subsequently opened a separate cloud owner with the provided two-hour handoff. Its
[complete investigation receipt](https://github.com/NoaCG/NoaCG-Studio/blob/36c2522b0bf749f1ae4312cc933b1cd8710aed27/docs/work-specs/phase2-prerequisite-gates/README.md)
and exact unsuccessful helper were independently read. That owner consumed the single
pre-app probe: one target passed, events `[]`, no stage error. Its click arming compared
`textContent` with the accessible name. Source inspection confirms the actual text is `◷`
and the name is an `aria-label` (`AnimationProperties.tsx:44`). No reply was held, so this
is an ineffective probe, not evidence that the race is absent. Maintained source/tests/gates
match fetched main. No repair or landing exists; that owner's overall repair stamp is FAIL.

Static-only preparation of a corrected diagnostic is now assigned to the separate editor-keys
owner. It must check the actual arming attribute and fail closed if it never arms/holds a reply.
No browser execution, injected fault or product/test repair is authorized by this preparation;
no prior implementation window is inherited. Acceptance and shared reservations remain blocked.

Prepared proposal, separately built by that owner and independently reviewed here:
[`71d3bc422d6c17be78102118e6d9dd5d29b9a12c`](https://github.com/NoaCG/NoaCG-Studio/blob/71d3bc422d6c17be78102118e6d9dd5d29b9a12c/docs/work-specs/editor-keys-gate/corrected-probe-preparation.md).
This checker independently ran the documented pure VM/fake-DOM checker: 15 pass. The recipe
also passes `git apply --check`; it is not materialized in maintained test paths. Review caught
and corrected a misleading microtask/turn label and an overstated stub-test oracle; raw consumed
part appearance is now recorded for a real pointerdown mismatch. The exact code is documentation
only, with zero browser runs. No runtime ordering, fault effectiveness or repair is established.
The proposal branch is based on earlier main; its late-send released count is 11 versus current
main's 12. That is inherited branch drift, not a classification edit. A future authorized owner
must reconcile current main and recheck the pinned assumptions before running it.

Independently read #1517's inline review: it reports that late-send was released using older
cycle statuses rather than 20 fresh runs after run `39287029913`. The main diff confirms only
classification changes. This is another unresolved gate disposition; neither the release nor
the review supplies repair proof. No automation/classification fix was built by this checker.

### Activity and checks snapshot

`worktree-activity.mjs` reports no other work in flight. Because its implementation suppresses
ahead-of-main comparisons without local `main`, this was supplemented with `origin/main`
diffs and branch enumeration. Before receipt edits, the only branches were `work` and this
checker, both at the fetched source, both clean; `origin/main...work` has no changed paths
and its left/right commit counts are `0 0`. This is a local audit, not proof that remote
sessions do not exist. Open PRs were #1503, #1486, #1452, #1450, #1432, #1322, #1157 and #1137;
none supplies a resolving account repair. Remote owner reservations remain binding.

At the audited main SHA, Actions reports terminal success for CI `39264214574`,
configured `39264214651`, CodeQL/Push-on-main `39264214761`, Post-landing `39264214656`
and Quarantine `39264214585`. Five deployment-verification invocations were skipped.
These are workflow conclusions; no whole-log clean-test verdict for these initial runs is
claimed. Their then-current account quarantine prevents treating them as clearing that blocker.

The original capacity CI `39250656173` was independently queried: completed **failure**,
attempt 1 on `742a5a655f78b4276acc02cd38a19ea6e19c9119`. #1506 is closed, unmerged.
The #1509 receipt documents matching cancellation-paint injection failing the original CSS
inequality, passing with correlated pose readiness, and a final uninjected target pass.
Its landing receipt records all 32 existing cases/assertions retained and 32/32 merge-group
passes. These remain engineering evidence; the original failed run remains failed.

Store, router, saved-data, preferences, CSS and shared editor/save files remain reserved under
this acceptance task. #800's older narrow Step 6 release does not override this prompt's stop.
No Step 6, Phase 3 or disjoint product implementation was started. The only delegated work
is the two separate owner-authorized gate investigations described above.

## Required sources and historical qualifications

Read AGENTS.md, the leave-reliability README and all six criteria, newest Phase 2 notes in
`docs/EDITOR_REBUILD_PLAN.md`, repair-11, independent-10 README/direct facts, corrected #1487
receipts, #1509's `group-cancel-readiness.md` and discussion, and #800's closing/follow-up
dispositions. Current disposition inventory: **476 rows: 268 G, 92 C, 116 R**. The retired
skip helpers have no E2E references. No retired helper or released skip was restored.

The tenth check's direct C-pull facts say the post-pass account-wide slot holds the other
device's Alpha draft. Reload opens that draft (`editorHoldsOtherDevice: true`,
`editorHoldsMine: false`). Its subsequent explicit edit changes Alpha:
`alphaUnchanged: false`, `alphaHoldsMine: false`, `copyHoldsMine: true`. This is not this
device's conflicted source overwriting the winner. C-overlap and both V-superseded facts
have `alphaUnchanged: true`. These are **read historical facts, not newly regenerated facts**;
regeneration and independent final departure judgments were stopped by the gate.

Retain all disclosed red assertions: fifth B1 and F-hold/F-late, ninth C-pull/C-overlap/
V-superseded and three V-reservations, and configured R-departure. The historical explanations
are preserved, not promoted to fresh passing verdicts. In particular, the degraded-storage
duplicate limit requires double refusal plus an unusable/lost reservation list. Nothing here
waives #1383 S6 double refusals, #1402 H or #1443 two-device protection.

Repair-11's 49/49 matrix, carried results, 6/6 references, 4/4 native/cumulative tasks and
nine executable outputs are historical evidence. Its 85-pass/eight-skip maintained count is
explicitly historical after #800 cleanup. Reference pins remain Studio `3142fc7d` / official
v0.17 and Eyevinn `616841bd`; no fresh reference, comfort or physical-host claim is made.

## All six acceptance criteria

| Criterion | This attempt's independent verdict |
| --- | --- |
| 1. Ask over editor; cancellation preserves source, selection/history | Not checked at runtime: stopped at unresolved prerequisite. |
| 2. Save/discard exact source; no duplicate or delayed/repeated question | Not checked: fresh real-time clean timeout/retry, edits during wait and chained-copy challenges deferred. |
| 3. New/Open/Back/hash boundary; refusal/double-submit; no resurrection | Not checked: no new refusal/navigation run. |
| 4. Pristine baseline, wizard walk, library/cloud/production separation | Not checked: no new maintained/carried run or mutation. |
| 5. Pinned reference lifecycle execution and source comparison | Historical receipts read; no fresh execution. Not accepted by this check. |
| 6. Desktop/laptop/native 125%, cumulative preservation and outputs | Historical limits read; no fresh browser/output check. Not accepted by this check. |

## Commands and limits

Principal exact shell commands, from the repository or the checker worktree as applicable:

```sh
git fetch origin main
git rev-parse HEAD origin/main
git log -12 --oneline origin/main
git status --short
git worktree list --porcelain
node scripts/worktree-activity.mjs
git for-each-ref --format='%(refname:short) %(objectname)' refs/heads
git diff --name-status origin/main...work
git rev-list --left-right --count origin/main...work
git worktree add -b codex/check-editor-p2-independent-11 /workspace/NoaCG-Studio-independent-11 origin/main
node scripts/cloud-network-preflight.mjs
node scripts/execution-profile.mjs
git diff --stat 9294d250d67b6e274c7da7fac580bbb9f3391f73..origin/main
git diff --exit-code 9294d250d67b6e274c7da7fac580bbb9f3391f73..origin/main -- src e2e/configured/account.spec.ts e2e/save-copy-arrival.spec.ts e2e/save-transaction.spec.ts
git show 9294d250d67b6e274c7da7fac580bbb9f3391f73:e2e/quarantine.json
nl -ba e2e/configured/account.spec.ts
gh pr list --state open --json number,title,headRefName,updatedAt
gh run list --branch main --limit 15 --json databaseId,name,headSha,status,conclusion
gh api repos/NoaCG/NoaCG-Studio/actions/runs/39250656173 --jq '{id,head_sha,status,conclusion,run_attempt}'
gh pr view 1506 --json number,state,closedAt,mergedAt
gh issue view 1466 --json state,updatedAt,comments --jq '{state,updatedAt,comments:[.comments[] | {url,body}]}'
npm run rules -- docs/work-specs/editor-leave-reliability/independent-11/README.md --loaded AGENTS.md
```

GitHub connector reads: issue/comments #1466, PRs #1487/#1509/#1510, comments #1487/#1509/
#1510/#800, and whole job logs `118059664098`/`118071084143`. Actions jobs API reads for
runs `39252546204`, `39255931088`, `39264214651` identified the relevant jobs.

Initial fetch without shell network permission failed at the proxy; fetch and preflight
passed with the prescribed additional network permission. `gh api .../actions/jobs/118059664098/logs`
failed at the redirected log host with Forbidden; the connector independently supplied both
whole logs. That transport failure is not a product verdict. No credentials, proxy or network
policy were changed. This independent checker launched no broad suite, build, browser job,
dispatch, rerun or fault injection while the gates are unresolved. The separate owners'
targeted verification is identified above and in their receipts. The runtime skill's readiness
observation was current but reported policy and
runtime-variable states unknown; actual Git and Actions read preflight both passed.

Receipt-only validation: `git diff --check` and JSON parsing passed. `npm run gates -- run
--changed origin/main` first stalled in `git check-ignore --stdin` in the restricted,
non-interactive shell; its owned process tree was terminated, leaving that attempt failed
(freshness interrupted; subsequent child-process Git calls reported `EPERM`). The identical
command in the supported persistent shell with granted network context passed all five cheap
documentation gates. No gate or source was altered to obtain that result, and no build was needed.

Executing worker: four CPUs, 16 GiB machine totals, two-worker selector; ancestor cgroup limits
unreadable, so these are not observed container limits. Any later authorized browser work must
use the existing queue/planner, five-minute small or twelve-minute broader limit, unchanged
local memory floor, and pinned recipes. Full suites/builds remain CI work.

Source SHA256: account spec `ed298be0d8de276f6bb62d8d1b9f3cf8a5c7d668e516a7020de10814d063fe8f`;
save-copy spec `907be17baccce13d82afc4d4a8041adf6b6e1111b8cdd00f89f6c974ee292972`;
tenth direct facts `e99c2725c1ae5a5380f4077e5abaff308751704885c110d0f9f2ec9490e5bbbe`.

**Verdict: BLOCKED, owner decision required.** #1466 stays open. Acceptance reservations stay
in force. This receipt supplies no authorization to bypass the gate or begin another phase.
