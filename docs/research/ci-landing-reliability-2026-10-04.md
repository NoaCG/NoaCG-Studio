# CI and landing reliability, 2026-10-04

## Sample and method

The last 30 merged PRs at the start of this investigation span [PR #660](https://github.com/NoaCG/NoaCG-Studio/pull/660)
(2026-10-02 23:23:39 UTC) through [PR #694](https://github.com/NoaCG/NoaCG-Studio/pull/694)
(2026-10-04 07:11:28 UTC). Three batch members had no separate main push, so these
30 PRs produced 27 main CI runs. The same time window contains 30 merge-group CI
executions, including groups that retried or changed membership. Group executions
are not a count of distinct PRs or initial landing attempts.

Read `ci.yml` run metadata, every run's jobs with `filter=all`, and the failing
jobs' logs. All 27 main runs have `run_attempt=1`, so a manual rerun did not hide
their initial outcomes. Count workflow conclusions separately from `CI gate` and
identify timed-out browser jobs by their cancelled conclusion and approximately
20-minute duration. Do not count progress lines or slow-test warnings as failures.
Read every sampled PR's AddedToMergeQueueEvent, RemovedFromMergeQueueEvent and
MergedEvent through GraphQL, checking that the filtered timeline is complete.

Raw JSON, logs, the original editor trace and calculation scripts are retained in
the investigating worktree's ignored `bench-health/` directory. The GitHub links
below are the shared receipts. This is a short, busy interval, not a long-term
failure-rate estimate.

| Measure | Result |
| --- | --- |
| Main workflow badges | 10 success, 5 failure, 12 cancelled |
| Main CI gate | 11 success, 14 failure, 2 never started |
| Main runs containing a timed-out browser shard | 13 runs, 14 shards |
| Main runs with no jobs | 2 |
| Merge-group workflow badges | 27 success, 3 failure |
| Merge-group CI gate | 30 success |
| Sampled PR queue entries | 31 entries for 30 PRs; 29 entered once, 1 entered twice |
| Main after the ten-shard change landed | 7 gates passed; 6 green badges, 1 failed badge |

The last row includes the change's own main run. Its failed badge is the health
fixture's fail-then-pass, which passed the final gate and was quarantined. The
later fixture repair restored blocking coverage. A passing CI gate does not imply
that another required check, such as Reviewed, passed.

## Distinct causes and current state

| Cause | Observed cost | State and evidence |
| --- | --- | --- |
| Insufficient shard headroom and stale duration weights | 13 main runs contained jobs killed at the cap; 10 ended cancelled and 3 failed alongside another fault | [PR #684](https://github.com/NoaCG/NoaCG-Studio/pull/684) refreshed the missing weights and moved from nine to ten shards. All seven subsequent main gates in this sample passed. |
| Mobile Home fixture seed not reflected in the mounted page | The same layout assertion failed on three main commits, twice beside a dead shard; the third failed its same-commit retry | [Run 37096120413](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37096120413), [run 37118148332](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37118148332), [run 37155254392](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37155254392). PR #684 changed the returning-device fixture to boot from its committed seed. |
| Port-registry test read child output before pipes closed | One Factory failure; its same-commit rerun passed | [Run 37104930027](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37104930027). [PR #674](https://github.com/NoaCG/NoaCG-Studio/pull/674) reads on `close` rather than `exit`. |
| Bridge window test lost its allocated port | One Build failure, `EADDRINUSE`; its same-commit rerun passed | [Run 37118148332](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37118148332). [PR #678](https://github.com/NoaCG/NoaCG-Studio/pull/678) handles the test's port race. |
| Cross-tab test wrote before the first tab adopted the second tab's write | One merge-group failure, followed by a same-commit pass and quarantine | [Run 37118664889](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37118664889). PR #678 added the adoption barrier; the spec is now released. This was not a retired-editor assertion. |
| New-editor fixture evaluation | One merge-group failure, followed by a same-commit pass; `editor-foundation.spec.ts` remains quarantined at the sample boundary | [Run 37158179131](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37158179131). The seed's `page.evaluate` failed with the rewritten protocol-error spelling, including its final full stop. Investigation below. |
| Health fixture's repeated module fetch reset | One main failure badge; same-commit retry and gate passed | [Run 37163639314](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37163639314). [PR #694](https://github.com/NoaCG/NoaCG-Studio/pull/694) fetches once with a closed connection and serves reloads from memory. Twenty focused passes, controlled reset reproduction and restored CI execution are recorded there. |
| GitHub API 503 responses | Reviewed failed in one merge-group execution; the automatic revert for the layout failure also could not queue | [Run 37156246435](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37156246435) failed querying the PR through GraphQL; [issue #688](https://github.com/NoaCG/NoaCG-Studio/issues/688) records the label endpoint failure. These are external API errors, not browser assertions. No retry policy changed. |
| Cancelled before jobs started | Two main runs provide no verdict | [Run 37120040383](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37120040383) and [run 37110672631](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37110672631). The available jobs API is empty; the cause of these cancellations is not established. |

These rows overlap: a single run can contain a timeout and a fixture failure.
They must not be summed as separate failed runs. The timeout mechanism and the
mobile fixture explain repeated main failures; each repeated red commit was not
a new product defect.

On the final main run, the slowest of ten browser jobs took 16.37 minutes, leaving
3.63 minutes under the unchanged cap ([run 37185036599](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37185036599)).
That is a useful immediate improvement. New heavy specs still require measured
weights; a median fallback is not evidence that they fit.

Only PR #684 reentered the queue: first entry 21:46:00, removal 21:47:35 after
Reviewed's API 503, second entry 22:03:34 and merge 22:12:14 UTC on October 3.
This sample does not support redesigning the merge queue. It does not count
author repairs, local preflight refusals or repeated pushes before queue entry,
so it cannot dismiss the owner's broader experience of repeated attempts.

## Retired editor

No observed failure above requires the retired AppShell editor. The failing
foundation spec exercises the current editor. Tests that require the retired
editor call `skipOldEditor`; `no-old-editor.spec.ts` actively checks that no door
loads or briefly displays AppShell, including with an old Advanced preference.

The unfinished migration documented in
[issue #800](https://github.com/NoaCG/NoaCG-Studio/issues/800) is a coverage gap. Deleting
the editor source does not migrate those assertions or fix the incidents above.
There is no evidence in this sample justifying editor deletion as a CI remedy.

## Remaining editor fixture investigation

The failing evaluation is the shared `seed` in `editor-foundation.spec.ts`, not an
editor interaction. The CI trace exposes Playwright's `rewriteError` stack, which
replaces the underlying protocol error with a navigation message. Prior research
in `docs/research/context-destroyed-flake.md` reproduced Chromium collecting an
evaluation promise after store mutations queued rendering work, and provided
`evaluateInPage` to keep that promise reachable until the reply.

The unmodified spec passed 12/12 explicitly with CI tracing (j-3238). A 10 ms CDP
GC loop over the exact seed from the CI trace also completed all 36 evaluations:
12 plain Playwright, 12 raw CDP and 12 retained-helper calls. That pressure alone
did not reproduce the failure. The diagnostic's first navigation assertion
incorrectly counted two identical same-document events as two document loads;
the corrected probe counts main-document requests instead.

The second probe exposes GC in Chromium 149.0.7827.55 and queues one collection
microtask immediately after the seed's final store mutation, retaining the same
seed operations. All 12 raw CDP calls failed with `Promise was collected`; all
12 plain Playwright and all 12 retained-helper calls completed. Each case had
one main-document request, and the graphic was already seeded as Hairline after
the failed raw reply. This reproduces loss of the evaluation reply after the
work completed, rather than loss of the graphic or an application navigation.

The original CI failure through `page.evaluate` was not reproduced locally. Its
underlying protocol error was discarded by Playwright, so linking that failure
to promise collection remains an inference supported by this trace, the forced
collection proof and the earlier research. Applying `evaluateInPage` to the
shared seed both prevents the proven collection mechanism and preserves the
underlying error if another protocol failure recurs. The function body, stress
argument and all editor assertions remain unchanged.

The control run initially could not start because two small queued Node CLI
commands started together on this worktree's dev-server port. Subsequent browser
checks explicitly declared cost 1. This local verification setup error is not
included in the historical CI counts.

Removing the helper's `.set(id, promise)` retention while leaving its call,
argument and cleanup intact made all 12 helper evaluations fail with `Promise
was collected` (j-3251). The diagnostic test correctly failed; its wrapper
verified the twelve expected failures and restored `_evaluate.ts` in `finally`.
That file has no permanent change.

The repaired failing test passed 20/20 serially with
`--workers=1 --trace=retain-on-failure --repeat-each=20` (j-3252, 1.4 minutes).
The JSON report verifies exactly twenty passed results with retry 0, and zero
unexpected, skipped or flaky outcomes. Diagnostic specs remain in the ignored
bench directory, outside normal test discovery.

The complete repaired spec passed 12/12 with one worker and CI tracing (j-3254,
1.3 minutes). Only then did
`node scripts/e2e-quarantine.mjs release e2e/editor-foundation.spec.ts` restore
blocking coverage through the existing release flow. Retry, timeout, quarantine
threshold, scheduler and gate policies are unchanged.

## Follow-up measurement

For the next 30 merged PRs, repeat this count using main and merge-group jobs and
run attempts. Record separately: first workflow attempt passing, final gate
passing, timeout jobs, same-commit fail-then-pass specimens, API failures and
queue reentries from each PR's timeline. Compare with 31 queue entries for 30
PRs here. Also record author repairs and local landing refusals before queue
entry; those are not represented by queue timelines alone.

Compare against 13 timeout runs and 14 timeout jobs in this baseline. Check that
new heavy files receive measured weights before attributing another cap failure
to the runner count. Investigate the first recurrence of a repaired signature.
Do not make the suite quieter by increasing retries, timeouts or weakening its
gate. Configured and nightly workflows were not included in these counts.
