# Independent Phase 2 gate check — 2026-10-19

**BLOCKED before acceptance execution.** This checker built neither the phase nor its
repairs. The account locator defect and its quarantine classification remain unresolved.
The owner's explicit instruction requires stopping here. No new product failure is claimed
from a fresh runtime challenge, and no acceptance pass is claimed.

## Source and isolation

Fetched `origin/main`: `86e795dc9f66183633d7c99a73bea8c27e4e32f6`, merge #1513.
Receipt branch: `codex/check-editor-p2-independent-11`; worktree:
`/workspace/NoaCG-Studio-independent-11`. The starting checkout was clean on branch `work`
at the same SHA. No local `main` exists. No product, test, classification, budget,
reference, carried probe or queue configuration was changed by this checker.

Repair #1487 merged as `b11adf155430c0f6888f524e16fa5ae599c28408`.
Readiness #1509 merged as `9294d250d67b6e274c7da7fac580bbb9f3391f73`.
Both are ancestors of the inspected source. Since the latter, current main contains
#1510 account quarantine, #1512 late-send release, #1511 verification observation and
#1513 editor-keys quarantine. There is no diff in `src/`, `account.spec.ts`,
`save-copy-arrival.spec.ts` or `save-transaction.spec.ts` across that range.

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
  after that fail-then-pass. Current source still has the same global locator at line 58
  and account remains in `quarantine.json.specs`, citing run `39252546204`.
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

## Activity, reservations and current checks

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
These are workflow conclusions; no whole-log clean-test verdict for these latest runs is
claimed. Current account classification prevents treating them as clearing this blocker.

The original capacity CI `39250656173` was independently queried: completed **failure**,
attempt 1 on `742a5a655f78b4276acc02cd38a19ea6e19c9119`. #1506 is closed, unmerged.
The #1509 receipt documents matching cancellation-paint injection failing the original CSS
inequality, passing with correlated pose readiness, and a final uninjected target pass.
Its landing receipt records all 32 existing cases/assertions retained and 32/32 merge-group
passes. These remain engineering evidence; the original failed run remains failed.

Store, router, saved-data, preferences, CSS and shared editor/save files remain reserved under
this acceptance task. #800's older narrow Step 6 release does not override this prompt's stop.
No Step 6, Phase 3 or disjoint product implementation was started. The only delegated work
is the separate owner-authorized account gate repair described above.

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
policy were changed. No broad suite, build, browser job, dispatch, rerun or fault injection
was launched. The runtime skill's readiness observation was current but reported policy and
runtime-variable states unknown; actual Git and Actions read preflight both passed.

Executing worker: four CPUs, 16 GiB machine totals, two-worker selector; ancestor cgroup limits
unreadable, so these are not observed container limits. Any later authorized browser work must
use the existing queue/planner, five-minute small or twelve-minute broader limit, unchanged
local memory floor, and pinned recipes. Full suites/builds remain CI work.

Source SHA256: account spec `ed298be0d8de276f6bb62d8d1b9f3cf8a5c7d668e516a7020de10814d063fe8f`;
save-copy spec `907be17baccce13d82afc4d4a8041adf6b6e1111b8cdd00f89f6c974ee292972`;
tenth direct facts `e99c2725c1ae5a5380f4077e5abaff308751704885c110d0f9f2ec9490e5bbbe`.

**Verdict: BLOCKED, owner decision required.** #1466 stays open. Acceptance reservations stay
in force. This receipt supplies no authorization to bypass the gate or begin another phase.
