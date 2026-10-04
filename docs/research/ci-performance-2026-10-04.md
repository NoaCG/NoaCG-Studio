# CI performance, 2026-10-04

## Finding and immediate change

The cap is exposing workload and balance, not slow installation. Across the latest
seven completed ten-shard main runs, 70 shard jobs averaged 0.305 minutes before
the E2E command, 13.526 minutes in that command and 0.066 minutes afterward.
Setup is 2.2% of job time on this sample's cache path. The command includes browser
and dev-server startup as well as tests; it is not a pure application execution timer.

The latest completed green full run's ten jobs span 9.60 to 16.37 minutes. Its
measured test workload is 132.119 aggregate minutes. Repacking the same 202 files
with those weights changes the slowest assignment from 15.877 to 13.213 test
minutes, without dropping or duplicating a file. This is a replay, not an observed
new CI speedup. An independent run also improves under the new assignments.

Re-recorded `scripts/e2e-durations.json` with the existing command:

```text
node scripts/e2e-durations.mjs --refresh 37185036599 --body bench-health/performance-refresh-body.md
```

The recording names its source commit `522c91b80ed4a894cf3652bb0ee817e0cf00746a`,
updates 200 measured files to 202 and records overhead from ten jobs. It measures
three previously missing files: editor-pen, playout-feedback-health and
playout-rundown-feedback. It changes no timeout, retries, gate, test or selection
policy. The generator's materiality verdict supports refreshing the weights.

At the audit branch's base, `38b0deb9d9c635f9c9f71fbf06a0884cbc32986c`,
editor-foundation has been released and graphic-sound has landed since the source
run. Both remain unmeasured and explicitly warned about by the planner. Their
median fallback ensures they are assigned, but does not predict their actual cost.
The generator's replay over this newer suite reports 17.1 to 13.3 table-minutes;
that includes guessed costs for these files. Use the matched 202-file comparison
above for measured evidence, and refresh again from a full run containing them.

## Sample and calculations

The sample is the ten newest completed `ci.yml` runs on main returned by the REST
API at the start of this audit. Two newer runs, 37192689025 and 37192839957,
had not completed and are excluded. Seven sampled runs use ten shards; three
precede that change and use nine. All have attempt 1 and `(full)` browser jobs.
Read all jobs with `filter=all`, verifying the response count is complete.

| Main run | Shards | Slowest job, min | Setup range, min | Longest shard queue wait, min | Run creation to gate, min | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| [37185036599](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37185036599) | 10 | 16.37 | 0.20–0.37 | 0.05 | 16.80 | passed |
| [37165214344](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37165214344) | 10 | 16.62 | 0.25–0.42 | 0.03 | 31.00 | passed |
| [37165058077](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37165058077) | 10 | 16.25 | 0.20–0.47 | 0.12 | 16.63 | passed |
| [37163639314](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37163639314) | 10 | 16.03 | 0.20–0.48 | 0.63 | 17.37 | passed |
| [37160172142](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37160172142) | 10 | 16.32 | 0.22–0.42 | 7.32 | 22.97 | passed |
| [37159133579](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37159133579) | 10 | 15.57 | 0.23–0.40 | 1.78 | 17.47 | passed |
| [37157623085](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37157623085) | 10 | 16.68 | 0.23–0.37 | 0.63 | 17.65 | passed |
| [37155254392](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37155254392) | 9 | 17.52 | 0.22–0.33 | 0.03 | 19.68 | failed |
| [37152791087](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37152791087) | 9 | 20.23 | 0.25–0.33 | 7.55 | 30.72 | failed |
| [37151656287](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37151656287) | 9 | 18.13 | 0.22–0.30 | 0.03 | 20.68 | passed |

The 20.23-minute job was cancelled at the cap. Its time is censored, not a completed
workload measurement. Gate conclusions are separate from workflow badges, as in
the [reliability audit](ci-landing-reliability-2026-10-04.md).

Calculations use REST timestamps:

- Job wall time: `completed_at - started_at`.
- Setup: E2E shard step start minus job start.
- Execution command: E2E shard step end minus step start.
- Post-test work: job end minus E2E shard step end.
- Per-job queue wait: job start minus job creation.
- Whole-run latency: gate completion minus workflow run creation.

Run 37165214344 waited 13.97 minutes before its first jobs were even created.
That interval is separate from the per-job queue wait. It is consistent with the
existing serialized main workflow: the previous main gate finishes shortly before
these jobs are created. Run 37160172142 instead has a 7.32-minute shard queue wait.
Adding runners cannot be assumed to reduce either kind of waiting.

Reproduce metadata and report collection using explicit repository arguments:

```text
gh api "repos/NoaCG/NoaCG-Studio/actions/workflows/ci.yml/runs?branch=main&per_page=30"
gh api "repos/NoaCG/NoaCG-Studio/actions/runs/37185036599/jobs?filter=all&per_page=100"
gh run view 37185036599 --repo NoaCG/NoaCG-Studio --job 111385086054 --log
gh run download 37185036599 --repo NoaCG/NoaCG-Studio --pattern "blob-report-*" --dir <directory>
```

Flatten the ten uniquely named report ZIPs, then run Playwright `merge-reports
--reporter=json` with `PLAYWRIGHT_JSON_OUTPUT_FILE` set to a file. Use the existing
`minutesByFile`, `overheadFrom`, `packShards` and `minutesFor` functions to score
the plan job's actual assignments and repack that same file set. Raw metadata,
reports and calculation scripts are retained in this worktree's ignored
`bench-health/performance-*` files. Artifacts expire after seven days.

## Slowest files and coverage

Run 37185036599 reports 1,379 passed, 544 skipped, zero unexpected and zero flaky
tests. These five files account for 28.558 minutes, 21.6% of aggregate test time.
The figures include time spent before a runtime skip.

| File | Test minutes | Passed / skipped | Finding from the code and report |
| --- | --- | --- | --- |
| `playout-folders.spec.ts` | 7.437 | 51 / 0 | Fifty-one independent browser scenarios repeatedly create a graphic and production, seed additional items and reload. Bootstrap already bypasses the wizard. Profile this preparation before proposing reuse; storage-failure, persistence and Bridge assertions need isolation. |
| `import-svg.spec.ts` | 6.717 | 53 / 47 | The import door and mapping are the subject of active tests. Legacy cases can walk this UI before their local create helper reaches the retired Advanced-mode skip. Skipped results alone cost 2.611 minutes here. |
| `import-svg-corpus.spec.ts` | 6.475 | 20 / 3 | One passing 214.4-second test sweeps accepted corpus files and checks growth, pictures and caps in one walk. Three late-skipped picture cases spend another 0.818 minutes. Keep all corpus fixtures and columns if restructuring. |
| `bridge-connect.spec.ts` | 4.145 | 41 / 0 | Active pairing, persistence, diagnostics and production tests use a network fake, without a real CasparCG server. A few waits represent delayed replies or persistence observations; removing them requires preserving that observation window. |
| `import-svg-behaviour.spec.ts` | 3.784 | 34 / 4 | Active tests exercise imported behaviour and operator controls. Four legacy export cases reach the retired-mode helper; their skipped work costs 0.218 minutes. |

The longest individual tests are the 214.4-second corpus sweep and the
122.8-second seven-SVG production walk. Both perform multiple real user flows;
their size is not evidence that an assertion should be removed. Splitting a file
alone does not reduce aggregate cost, though file-based packing can redistribute it.

## The retired editor's measurable CI cost

Of 544 skipped results, 543 carry the retired-editor annotation. Those results
spent **7.614 aggregate runner-minutes** before skipping, about 5.8% of the full
run's measured test time. This is not 7.6 minutes of wall-clock savings: the work
is spread over ten runners. The largest contributors are import-svg (2.611),
import-graphic (1.225), import-canvas (1.194) and import-svg-corpus (0.818).

This is obsolete test preparation, not evidence that AppShell executes or causes
current product failures. `_create.ts` skips when a retired helper is called, which
can happen after browser work. Moving a skip earlier would also remove incidental
assertions that still execute before it, so do not mass-edit these tests as a speed
fix. The existing [migration backlog](../backlog/specs-that-still-open-the-old-editor.md)
explicitly requires retaining assertions for behaviour still in the product. Port
the useful cases to current surfaces and delete only assertions for retired features.

## Independent replay and next actions

The new weights are also scored against run 37165058077, which reports 1,378 passed
and the same 544 skips. Score only the 201 files shared by both reports: the health
spec was quarantined in the earlier run and is excluded from both sides of this
comparison. On the latest run's original assignments the shared files' costs peak
at 15.882 minutes; on assignments packed with the latest weights they peak at 13.977.
This 1.905-minute improvement is an independent-cost replay, not execution of the
new assignment. Overall workload varies from 126.073 to 132.119 minutes between
the two runs, so perfectly equal predictions are not a promise of equal CI jobs.

Priority order:

1. Land the material duration refresh, then measure the next completed full run,
   including restored editor-foundation and graphic-sound. Retain a target of about
   three minutes of headroom, evaluated against actual slowest jobs, not averages.
2. Profile repeated production preparation in playout-folders and import preparation
   in the SVG family with step timings. Compare unchanged assertions and repeated
   passes before accepting faster fixtures. No measured fixture speedup is claimed here.
3. Continue the existing retired-editor migration, beginning with the late-skipped
   import cases. This restores useful coverage and removes wasted preparation.
4. Evaluate runner waiting across overlapping branch, PR, merge-group and main runs
   before adding capacity. The workflow currently accepts duplicate branch/PR runs;
   changing that needs a coverage and required-check analysis, not just timing edits.

Keep ten shards and the 20-minute cap for now. The sample supports balancing and
profiling before increasing either. Installation caches already address the earlier
registry bottleneck; this cache-path sample cannot predict a dependency-cache miss.
Trace overhead remains worth profiling, but local trace-off measurements are not
CI proof and removing first-failure diagnostics would change a deliberate policy.

The audit can run alongside another worktree. It touches documentation and generated
weights only. Any later fixture change needs a fresh main baseline and ownership
check; the merge queue reconciles independent landings. No graphic-audio files are
edited here.

## Verification

- Metadata: ten full runs, complete jobs payloads, explicit nine/ten-shard distinction.
- Browser report: all ten source ZIPs merged; no unexpected, flaky or retry results.
- Balancing: matched-file replay, independent-cost replay and coverage assertions.
- Generator: material refresh from the verified full run; current missing files named.
- Planner tests: 89 passed, zero failed or skipped.
- Full `npm run build`: passed, exit 0; 2,434 repository tests, 2,431 passed and
  three existing skips, plus typechecks, lint, bundle, 526 prerendered pages,
  client-secret scan and line-ending check. The first sandboxed invocation was
  interrupted after shared-port-registry and temporary-worker permission errors;
  the complete run used the necessary host permissions.
- Review: inline; corrected the independent replay to score only measured common
  files. Simplify: inline; no further change. Verification: inline.
- Landing status: recorded in the pull request after queueing.
- Not performed: new full CI execution or a fixture benchmark in this worktree. Predicted
  savings remain predictions until the refreshed assignments execute in CI.
