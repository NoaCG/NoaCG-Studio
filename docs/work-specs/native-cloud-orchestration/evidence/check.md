# Native cloud orchestration cycle: independent check

Spec: [spec.md](../spec.md), phase 1, AC-1 to AC-5. Builder record:
[qualification.md](qualification.md). Nonce: `ncp1-check-20261017T191507Z-a7c8b381`.
Every value below was read by this checker itself; the builder's summary was not trusted.

## Checker receipt

| Field | Value |
| --- | --- |
| Native session ID | `session_01JKvaTpJJTCKavDDJ91zLdo` (own `get_session`, no session_id) |
| Parent session | `session_014ka1JkcBhgjXBaoBjxwCcm` |
| Environment | `env_017nuiDZBW9smUNLdWVQK8cf` (`anthropic_cloud`) |
| Origin | `claude_code_mcp_seed` |
| Created at | 2026-10-17T19:15:44.121111Z |
| Source revision | `0b3790fb87a5629bf2b66c1f668d93d838a56d68` (session_context) |
| HEAD | `0b3790fb87a5629bf2b66c1f668d93d838a56d68`, equal to `origin/main` and to `origin/claude/native-cloud-phase-1-check` at 19:16:16Z |
| Tree | clean (0 entries in `git status --porcelain`), own worktree |
| Resource profile | cloud, claude, 4 CPUs, memoryLimitBytes 14343688192, freeMb 13526, workers 2, limitsObserved true |

## Record and spec at the merge SHA

- `git show 0b3790fb:docs/work-specs/native-cloud-orchestration/evidence/qualification.md` exists.
- `sha256sum spec.md` = `92c6163abe2ea5353c97c001ba4d9e1543968fb2e7525f17b3a9b5459a434281`, equal
  to `work.json` `specSha256`. `work-spec.mjs status`: problems 0, status open, gap "convergence
  review missing", open AC-1..AC-5 (`review` is null by design).
- Merge commit `0b3790fb` has parents `c1e02c6e` (main) and `1d130798` (PR head); `git diff
  1d130798 0b3790fb` is empty. Branch commits: e32a18b, f41b041, db13997, ca394ff, 09ca4d3, 1d13079.
- Spec blob at `db13997` is `ec3272819f8b01daa48922864dded32bc0eb198b`, as the challenge expected.

## Native receipts

Builder `session_01T3fnUGoEP7oc6YS9b65jj2` (`get_session`, `list_events`, `get_event`):

- Different from the coordinator and from this checker. Environment `env_017nuiDZBW9smUNLdWVQK8cf`,
  origin `claude_code_mcp_seed`, parent `session_014ka1JkcBhgjXBaoBjxwCcm`, source revision
  `f41b0418e11f1fe61204933889025b9986eb9da6`, created 18:43:21.693362Z, status idle/completed.
- First prompt (event e82f4fb0, 18:43:21.713866Z, inbound_origin `mcp_create_session`) carries
  nonce `ncp1-build-20261017T184214Z-0b6689f7`; turn 1 result (18:44:51Z) repeats it, names pushed
  `db1399793fa99fa72047d0aa1e020603450af837` and ends READY FOR FOLLOW-UP.
- Follow-up: cross-session message from the coordinator, queued 18:53:43Z, with the CHALLENGE and
  expected SPEC_BLOB `ec3272819f8b` and ORIGIN_HEAD `db13997`. The builder's fresh read at
  18:54:02Z returned HEAD and ORIGIN_HEAD `db13997`, SPEC_BLOB `ec3272819f8b`; its send_message
  returned `delivered`.
- Auto-merge: the builder's shell call to the CCR auto_merge route was refused by its classifier
  at 18:56:51Z ("[Self-Approval]") and again at 19:08:37Z; after the owner's message in the builder
  session (19:08:02Z, desktop_app) `mcp__github__enable_pr_auto_merge` succeeded at 19:08:41Z.
  That is the session that queued #1408.

Coordinator `session_014ka1JkcBhgjXBaoBjxwCcm`: environment `env_017nuiDZBW9smUNLdWVQK8cf`, origin
`desktop_app`, created 18:39:40Z, no parent. Its own result (19:12:06Z) says it enabled auto-merge
at 18:58 and disabled it a minute later; the PR timeline shows that pair (18:58:03Z, 18:58:24Z).

## GitHub receipts

| What | Read |
| --- | --- |
| PR #1408 | merged 19:14:13Z by the queue, head `1d130798e060c9c2282b46cddf23fd7f48064c67`, label `land` |
| Timeline | auto_merge_enabled 18:58:03Z, auto_merge_disabled 18:58:24Z, added_to_merge_queue 19:08:41Z, merged 19:14:13Z (`0b3790fb`), removed_from_merge_queue by github-merge-queue[bot] 19:14:13Z |
| `noacg/reviewed` on `1d130798` | success, 19:01:12Z |
| Repair-owner comment issuecomment-6239053255 | coordinator, created 18:57:53Z, last updated 19:01:51Z (unchanged at 19:44Z) |
| PR CI 39060617075 | pull_request on `1d130798`: completed, success |
| Merge-group CI 39061191312 | merge_group on `0b3790fb`: completed, success |

Post-land on `0b3790fb`, read at 19:44:35Z:

| Run | Conclusion |
| --- | --- |
| main CI 39061580332 (push) | PENDING: in_progress. 17 jobs success, 4 skipped, `E2E 9/13 (full)` cancelled at 19:37:24Z, `E2E retry (failed specs, same commit)` still running |
| Post-landing 39061580299 | success (19:15:21Z) |
| configured-suite 39061580297 | success (19:41:45Z) |
| Quarantine 39061580321 | success (19:25:11Z) |
| deploy-verify | 4 deployment_status runs (39061584485, 39061585393, 39061630246, 39061666321), all skipped |

`origin/main` had moved on to `a1c9efb5` by 19:44Z; this check is pinned to `0b3790fb` as asked.

## Ledger consistency (AC-1)

The coordinator's `plan-run.mjs` output, read from its native events: build
18:42:14.776Z, landed 19:15:00.681Z, check 19:15:07.815Z. Order against native and GitHub times
holds: build line before builder creation (18:43:21Z) before turn 1 (18:44:51Z) before the
follow-up (18:53:43Z) before PR open (18:56:09Z) before queue entry (19:08:41Z) before merge
(19:14:13Z) before the landed line before the check line before this checker's creation
(19:15:44Z). The five lines in qualification.md match the follow-up text verbatim.

## Criteria

- AC-1 PASS so far: build, landed and check lines exist in the coordinator's `plan-run.mjs` output (its native events); the five build-time lines are copied verbatim into qualification.md (diffed against the follow-up text). The `pass` or `fail` line comes after this verdict.
- AC-2 PASS: builder `get_session` and events show a separate session at `f41b0418`, with the nonce in its prompt and its reply, a resource profile, the push `db13997` and a challenge reply whose values match git.
- AC-3 FAIL: `/check` stamp (`noacg/reviewed` success on `1d130798`) and the landing through the queue (timeline, merge-group CI 39061191312) hold, and the landed record names the PR, the reviewed SHA and the queue state at queue time. But AC-3 also puts the merge-queue entry, merge SHA and terminal conclusions in the repair-owner comment issuecomment-6239053255. At 19:44Z that comment still says "Auto-merge is off and there is no merge-queue entry" and names no merge SHA and no run results. The ownership acknowledgement itself (18:57:53Z, before the builder ended) holds.
- AC-4 this receipt: a different native session (`session_01JKvaTpJJTCKavDDJ91zLdo`) checked `0b3790fb` from `get_session`, `list_events` and GitHub. Main CI is recorded as pending, not passed.
- AC-5 NOT CHECKABLE YET: it is the coordinator's work after this verdict (ledger verdict, report, stopping wakes). Counters stay null rather than zero in qualification.md, which holds.

## Verdict

FAIL product: AC-3 repair-owner comment lacks the merge-queue entry, merge SHA and post-land conclusions; main CI on 0b3790fb still pending at 19:44Z

Findings:
1. issuecomment-6239053255 was last updated at 19:01:51Z and still reads "no merge-queue entry". AC-3 names it as the place that records the queue entry (19:08:41Z), merge SHA `0b3790fb` and terminal conclusions, and none of them are there.
2. Main CI 39061580332 on `0b3790fb` had not finished: `E2E 9/13 (full)` was cancelled and `E2E retry (failed specs, same commit)` was still running at 19:44:35Z. That is a pass or fail still to come, not a pass.
3. The queue entry came from the builder's `mcp__github__enable_pr_auto_merge` at 19:08:41Z, after the owner gave explicit permission in the builder session. Shell calls to the auto_merge route were refused as self-approval at 18:56:51Z and 19:08:37Z.
4. AC-5 is the coordinator's step after this verdict, so it cannot be checked here.
