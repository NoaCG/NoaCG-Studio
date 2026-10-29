# Correlated seek readiness repair

Separate gate-repair owner; no independent Phase 2 acceptance is performed.
Fresh authorized window: 2026-10-19 18:39:17–20:39:17 UTC
(21:39:17–23:39:17 Kyiv). The active session owns any submitted repair through
terminal exact-merge results, even if CI extends beyond implementation time.
No durable wake is claimed. Worktree `/workspace/phase2-gates-prepared`, branch
`fix/phase2-gates-prepared`, fresh main `8687863db85845c11839c76adab8c23a2266d5b7`.

## Source and ownership audit

Continues the stopped investigation at `36c2522b0bf749f1ae4312cc933b1cd8710aed27`.
That attempt remains ineffective: the textContent arming mistake yielded events
`[]`, no held reply and a passing journey. Three earlier ineffective probes and
the passing late-listener observation remain preserved at `9ecdb199`; none is
retrospectively called proof. Original main CI 39259495974 and its retry retain
their separate failure/pass outcomes; quarantine #1513 was not a repair.

Root/e2e scoped rules and check/verify/queue-merge/cloud-delegate were read.
Git/Actions preflight passes. Activity helper reports no local work in flight;
local main is absent, so origin/main branch diffs and registered worktrees were
checked separately. The primary `work` branch has no unmerged task files. Open
remote PRs were audited. Shared editor/save/store/router/saved-data/preferences/
CSS reservations remain. No older branch was merged.

Only the seven prepared documentation artifacts were imported from exact
`71d3bc422d6c17be78102118e6d9dd5d29b9a12c`, in preparation commit `f5b45152b`.
All seven compare byte-identical to that commit; all five recorded payload hashes
match. Relevant editor product source and the maintained spec are unchanged from
its pinned assumptions. The original spec SHA256 is
`4c946a7ddd997e00a9fde680813ad7441d5b4d826f1795835f7aae2fecd45929`.
Its static recipe was read and its 15 pure stub checks passed again; adapter
syntax and git apply checks pass. These static results are not runtime proof.

Resources: four CPUs, 16 GiB machine memory and two browser workers; hidden
cgroup ancestors are unreadable, so these are fallback machine totals. Browser
work uses the affected planner and existing queue, named selections, cap five
minutes, zero retries. No full suite or production build ran locally. Normal
npm ci prepare built its player-host dependency, not a full product build.

## One authorized matching diagnostic

Exact prepared init/adapter/spec diff were materialized without rebuilding or
editing the instrumentation. Queue `j-0001`:

```sh
npm run test:e2e -- e2e/editor-keys.spec.ts --grep 'nested SVG armed' --retries=0
```

Cap 5; one worker for the single case. **Expected matching failure**, not green.
[Raw facts](repair-evidence/matching-failure.json),
[exact disposable diff](repair-evidence/baseline-diagnostic.diff.txt) and
[inspected screenshot retained at the initial immutable head](https://github.com/NoaCG/NoaCG-Studio/blob/165cff4738c73d6bc8888ea1fb0c32d2177f0c6f/docs/work-specs/editor-keys-gate/repair-evidence/matching-failure.png) are retained.

All required facts are present together:

- Pre-app hook installed, connected and armed by the exact aria-label. No probe
  problem, safety release, ineffective marker or PROBE_NOT_REPRODUCED occurred.
- Actual current zero pose request **11** was stopped while controller consumed
  request **10**. Receipt stayed pending through the microtask witness. Source
  identity matched the current iframe, document id matched, generation **4**,
  source/assets revision **5/1**, selected part **#nested**, cue null.
- After the real ruler pointerdown, session time changed to **1**. The retained
  actual zero reply was replayed unchanged and consumed as request **11**.
  Expected request advanced to **12**. The actual matching one-second request
  **12** was stopped before consumption, including its microtask witness.
- At the real canvas pointerdown (epoch ms **1792435297651.4**), raw consumed
  #nested appearance was **time 0**, live session **time 1**, receipt pending,
  consumed request **11**, expected **12**, same document/generation/revision and
  cue lineage. DOM likewise showed pending false, request11 and pose0.
- The unchanged post-drag ready assertion failed **expected 0 / received 1**, on
  `.ef-stage-error`, under the original **7000 ms** budget. Diagnostic insertion
  shifts original ready23:49/post-drag177:162 to **24:49 / 183:162**. Exact refusal:
  “Wait for the preview to reach this playhead and revision before editing.”

This establishes the challenged readiness path and matches the original failure
signature. It does not claim unique forensic proof of the historical runner's
unrecorded scheduling. No additional baseline probe was run.

## Narrow repair and identical-fault verification

The existing seek helper treats any changed request stamp as proof of its seek.
The old zero-time acknowledgement can satisfy it while the requested one-second
pose is still pending. Source pending false and no stage error are insufficient
at that point; the subsequent gesture correctly refuses the stale appearance.

The test-only repair retains those original checks and adds a readiness poll
within the existing default expect budget. It requires the controller's correlated
receipt for the current session revision/view plus the DOM-rendered pose at the
requested time/cue. It changes no product source, gesture, case, original assertion,
retry, test/expect timeout or queue limit. No shared helper is modified.

Queue `j-0002`, same command/cap, **1 passed in 9.2 s wall**, zero retries.
[Raw repaired-fault facts](repair-evidence/repaired-fault.json) and
[exact verification diff](repair-evidence/repaired-diagnostic.diff.txt) are retained.
The prepared init and adapter are byte-identical to baseline: actual zero reply
11 stopped before consumption/replayed after ruler, actual one reply12 held for
1500 ms, all hold flags true, no problems. The verification-only wrapper replaces
the baseline diagnostic's demand that the drag happen during the hold with a
check that the same hold happened and released; it removes the baseline-only
PROBE_NOT_REPRODUCED terminator. No original maintained assertion is removed.

At repaired canvas pointerdown (epoch ms **1792435383283.1**), the raw consumed
pose is **request12 / time1**, live time1, receipt ready, generation4, revision5/1,
cue null. The one reply released at **1792435382883.4**, before the press. Every
original downstream motion/source/base-offset assertion passes. Stage error null.

Instrumentation was then completely removed. Queue `j-0003` ran the whole named
file, cap5, two workers, zero retries: **14 passed in 40.4 s**.
[Exact normal output](repair-evidence/normal-run.txt) is retained. No case skipped,
failed, flaked or retried. The final spec equals original bytes with only the seek
helper insertion; all original case declarations/bodies/assertions/gestures are
byte-identical. No retired #800 helper or released skip was restored.

Only after both proofs, editor-keys was moved from quarantine specs to released,
retaining count3 and date2026-10-19. Deep-link and all unrelated classifications
are preserved exactly. This is an explicitly authorized proved repair release,
not a claim of twenty consecutive passes or reliance on #1517's stale statuses.

## Separate deep-link and historical blockers

The prior receipt's confirmed deep-link failure remains unresolved:
configured39287816358 / job118180087518, exact account merge929d1f1f,
107passed / 1flaky / 3existing skips. Artifact12204499974 SHA256
`4d6406a7178f0940e9a2a057b49300957cb66fabba033f6c996b6a02f005e6ee` matched.
At deep-link80 / assertion115:60, production-missing remained absent for60000ms;
failed snapshot showed Opening production. Only the passing retry has a trace.
The prior auth/sync/fallback candidates remain unproved. Account #1515 is finished;
reuse matching proof39279909249, not a rebuilt account repair.

Further static tracing identifies another observational discriminator:
ProductionPage's opening expression also reads model/teamShows loading, which is
independent of the personal lookup's fallback. backend/teamProductions starts it
as loading and awaits team/member/head reads. Thus an Opening snapshot alone
cannot distinguish personal lookup still looking from team status still loading.
A real diagnostic must record both; no assertion or settling wait is changed.
A local Docker metadata read was denied at its daemon socket in the default
sandbox before any service was started; this is setup evidence only.

#1516's late-send quarantine followed fail-then-pass39287029913. #1517's review
reports its immediate release reused statuses from older cycles, so release alone
is not repair clearance. This patch changes neither that spec nor its classification.
Original CI39250656173 remains failed; #1506 stayed closed; #1509 retains all32
cases/assertions. #1487/#800 historical corrected receipts remain applicable.
No independent acceptance, #1466 closure, Step6/Phase3 or reservation release.

## Review, queue and terminal continuation

Changed-file ESLint and `npx tsc --noEmit -p tsconfig.json` passed. The latter checks
src (not e2e semantic types), and is not described as e2e type-check coverage.
All five reached gates passed: contract freshness866, citations4538, docs
index150, client-secrets3924 and copy902. Git diff whitespace check passes.
Inline review covered the initial 16-path scope from review-request.mjs, base
8687863db85845c11839c76adab8c23a2266d5b7, including the failure screenshot. CI then identified that committing this picture
violated the tree-shape rule; it was removed from the current tree and linked at
the immutable initial head instead. The final reviewed scope has 15 paths. It checked correlated request/pose readiness, unchanged original test
bodies, all matching-fault requirements, identical hook/adapter timing, disposal,
classification isolation and historical failure preservation. No confirmed finding
remains. No separate review tool is exposed. Simplification ran inline; no useful
behavior-preserving change remained. Verification ran inline using the recorded
fault/normal runs and static checks, not documentation checks as repair proof.
The exact reviewed head, queue and terminal exact-merge results are recorded on
the repair PR by this owning session before ending.
No local full suite/build or reference-editor equivalence claim is needed for
this test-only readiness repair; the NoaCG correlated-pose contract is the oracle.


### First CI packaging correction

Initial exact-head PR CI39305465434 failed Build job118241246529 at
check:tree-shape: pictures under docs are forbidden. The whole completed Build
job log was read through the GitHub connector while the rest of the workflow was
still running; gh run --log-failed could not yet read an active workflow. This
was the sole Build failure. The current tree no longer tracks the picture; it
remains inspectable at original reviewed165cff4738c73d6bc8888ea1fb0c32d2177f0c6f,
SHA256 recorded below. No gate exception or picture allowlist was added. The
readiness helper, classification and all tests remain byte-identical to that head,
so matching-fault and14-case verification results are reused. Review found/fixed
this one receipt-packaging issue; simplification remains inline with no further
change. Repair attempt2 addresses this CI packaging failure, not another baseline
probe or a manufactured retry.
Screenshot SHA256: `587a9d1d412cf82e66253c4473044ea7bdd76b77c5b98822a77f7cdca4801f57`.
