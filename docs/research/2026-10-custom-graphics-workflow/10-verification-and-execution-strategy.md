# Complete run: cloud execution and avoiding duplicate verification

**Integration update, 19 October:** the owner has now authorized incorporation into the actual specs. See the [integration record](../../work-specs/production-page-refactor/evidence/plan-refinement-2026-10-19.md) and parent run plan. The proposal/status wording below records the earlier research stage; no implementation has started.

19 October 2026. Planning and read-only investigation; no CI policy, runner code, required check, agreed spec or product feature changed. No cloud task or production-page run was launched.

## Updated owner direction

The owner wants **all phases** in the production-page project, including the remaining refactoring, in a sensible dependency order. The current definitions total 22 execution steps across the earlier two windows, plus qualification Q. These should become one coordinated project targeting a stable build before Friday's user testing. Preserve useful cleanup; if a phase's intended outcome is already satisfied on current main, document evidence and disposition rather than performing an unnecessary move or silently omitting the phase.

The owner prefers cloud execution wherever it works as well as local execution. Local hardware and private workstation state remain local. The 24-hour limit was the owner's earlier scheduling convention, not a desired permanent product constraint; they now want to divide the run into practical blocks themselves.

This updates the two-window assumption in earlier research. The planned implementation start is Tuesday 20 October; Friday 23 October is acceptance and repair time. The exact multi-day end time still belongs in the execution setup, not an invented value in this research document.

## Recommendation

**Run implementation, review and software verification in the cloud. Use the studio workstation for explicitly identified hardware, Windows-performance and human-acceptance gates.** A local milestone can pause dependent phases without making all work require the laptop to remain open.

Use one durable phase ledger across the complete project. Keeping all source editing local would make travel and laptop uptime a bottleneck without improving the trustworthiness of most code or browser tests. Conversely, a cloud browser test is not evidence that a particular CasparCG installation and physical output work.

## Where each part runs

| Work | Recommended execution | Local dependency |
|---|---|---|
| C0, refactor 1/2+7/13a, C1–C6 implementation and reviews | Cloud worktrees, existing review/merge process | Phase 1's Windows performance baseline; source access where required. |
| Remaining refactor 3/4/5/6/8/9/10/11/12/13b/14 | Cloud, sequential ownership of shared production-page code | Existing performance repeats after 11, 13b and final 14; relevant real-output checks. |
| Node contracts and affected Playwright journeys | Cloud worker with the existing queue and resource selection | None for ordinary browser/logic tests. Device-specific behavior remains separate. |
| Full offline CI and configured/authenticated E2E | GitHub Actions; existing isolated test backend on its runner | Not the owner's production database or studio computer. Cloud-worker local-stack execution is optional only after separately qualified. |
| Real Sheet/feed/YouTube qualification Q | Cloud for network measurements and captured fixtures, using authorized test access | The early student trial needs people and C0's build. Provider access must be proven. |
| C7 technical rehearsal | Cloud for software/API/source assertions, plus local output leg | Actual CasparCG/Bridge and OBS/browser-source checks on the chosen installations. |
| Windows latency/render baseline and comparisons | Same local machine and controlled setup named by the spec | Required at the named checkpoints. Cloud timings are supplemental, not interchangeable baselines. |
| Friday usability and production acceptance | Owner's local production setup | Human participants, installed Bridge/CasparCG, fonts/assets, channels/layers and actual video output. |

There is no reason for a CasparCG-related refactor itself to be written on the CasparCG machine. Implement and test its contracts in cloud, then test the exact candidate revision against the installed system. If that check exposes a defect, the fix can be developed in cloud and verified locally again.

Use a pinned preview build/local candidate build for hardware checks. A moving production URL does not establish which revision was tested. Record application revision, Bridge/CasparCG versions, output configuration and evidence together. Existing software gates that require a local milestone must still wait; independent preparation can continue while the workstation is unavailable.

## Cloud capability: observed versus assumed

This research workspace is a managed cloud executor. On this turn, the runtime reported running/current configuration with enforced HTTP policy, and the repository's network preflight successfully read both Git origin/main and the GitHub Actions API. The worker profile selected two browser workers from visible machine resources, while explicitly reporting incomplete cgroup observations. The presence of Docker was observed; Docker daemon/stack execution was not tested here.

Those facts support cloud research and the existing browser/software route. They do not establish remote access to the studio: the local policy reports no configured VPN. No attempt to expose CasparCG or change networking was made.

The repository's cloud-execution receipts distinguish a supported Codex cloud task from unqualified native child-launch/follow-up paths, and contain qualified historical Claude cloud dispatch/result receipts. No new unattended recovery proof was performed here. Choose the execution route that can actually demonstrate start, follow-up, result retrieval, landing and recovery, rather than assuming either provider's brand guarantees those capabilities.

Before claiming the laptop can close for the night, observe: cloud coordinator dispatches/resumes a phase; commits and ledger reach remote storage; the same task can be followed up; the merge/check result is read; and a supported wake resumes ownership after the coordinator goes idle. A local process waiting for a cloud result would still stop when the laptop sleeps. Cloud compute and unattended orchestration are separate things.

## What CI already does

Inspected source at current main **`c9f1769c2147acf12f37e7a19192f9c4ce036fea`**. The relevant workflow, affected-selector, verification and wave-window files are unchanged from the earlier inspected `4569b9622` baseline.

- `.github/workflows/ci.yml` avoids duplicate branch-push and PR-trigger runs. PR/dispatch runs can cancel superseded work; merge-group runs have their own protection.
- `scripts/e2e-affected.mjs` chooses affected journeys, escalating conservatively for shared core, unknown files or an unusable base. Main deliberately runs the full offline suite. That full run is an existing policy, not accidental duplication.
- Node modules and Playwright browsers are already cached through shared Actions. Cached dependencies accelerate setup; they do not prove that tests passed.
- `scripts/jobs.mjs` and worker policy already restrict builds/broader selections to committed source and prevent repeated admissions for the same source. Verification guidance avoids rebuilding or separately repeating lint/type checks already covered by a suitable build.
- The refactor spec already permits reuse across one evidence-only commit after proving the material inputs are unchanged. Material edits invalidate the affected matrix; edits to the page/control core demand broad revalidation.
- The configured suite runs after each landing and on a schedule. The final checker can use the landing's actual result; starting another identical dispatch simply because a new agent took over adds no independent evidence.

## Current measurements

A bounded read-only sample of 15 CI runs and 15 configured-suite runs is saved in [execution-evidence/ci-run-sample-20261019.json](execution-evidence/ci-run-sample-20261019.json). Four job summaries are in [execution-evidence/ci-job-sample-20261019.json](execution-evidence/ci-job-sample-20261019.json). This is a snapshot, not a benchmark of all changes or a promise of future runtime.

| Evidence | Observation |
|---|---|
| [Main CI run 39233650555](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39233650555) | Approximately 22.8 minutes from creation to last update; full offline suite across 15 shards. Build job 4.67 minutes; slowest listed E2E job 17.45 minutes. |
| [Same landing's configured run 39233650524](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39233650524) | Approximately 28.2 minutes overall; stack startup 2.00 minutes, suite execution 25.47 minutes. Test execution dominates this example. |
| Other sampled main/configured runs | Main CI roughly 20–37 minutes; configured runs commonly around 26–32 minutes. Run-level intervals include waiting/administrative time and are not isolated test durations. |
| [PR run 39243729232](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39243729232) and [dispatch 39243785986](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39243785986) | Same reported head SHA, but subset versus full coverage, with additional calibration/tooling jobs in the dispatch. They cannot be classified as redundant from SHA alone. |

The sample also revealed existing [PR #1504, Reduce DOM snapshot overhead in CI traces](https://github.com/NoaCG/NoaCG-Studio/pull/1504), open when inspected. This is a related optimization already in progress; do not start a competing trace-settings change. Its sampled runs are not sufficient for a controlled speedup claim. Skipped-job timestamps in the API can even produce a small negative interval; those are not interpreted as runtime measurements.

## Turn “do not repeat work” into an executable rule

The rule should be: **before launching a check, resolve whether the required evidence already exists for the exact tested inputs and purpose.** A human reminder alone will not keep independent agents and Actions coordinated.

Use the existing job records, phase evidence and Actions run IDs. Extend their result lookup rather than building a parallel scheduler or accepting an agent's free-text assertion that something passed.

### Stage A: low-risk dispatch control for this run

1. Before a manual CI/configured dispatch, inspect existing runs and jobs for the requested revision, workflow version, inputs and required coverage. If an equivalent run is pending/running, wait on that run ID. If an acceptable completed result exists, cite it. If the result is incomplete, unknown or covers something else, report that and run the missing check.
2. Coordinate the lookup and claim through the existing run owner/ledger so two agents cannot both see “none” and dispatch duplicates. If GitHub accepted a dispatch but its acknowledgement was lost, reconcile that request before submitting another.
3. Emit a machine-readable decision and a plain explanation: RUN, WAIT, REUSE, or NOT APPLICABLE, with the reason and evidence link. “Not applicable” is a coverage decision, not a test pass.
4. Builders and final checkers reuse the same completed evidence when valid. Independent code review remains independent; it does not require rerunning identical tests merely because another person/agent reads the result.
5. Keep current required PR/merge/main checks and scheduled fresh runs. This stage stops avoidable caller-driven duplication; it does not substitute a worker pass for a GitHub check or suppress required integration evidence.

Example output, illustrative rather than an implemented interface:

```text
Configured suite: WAIT — matching run is already in progress; follow its run ID.
Targeted field tests: REUSE — tested revision, environment and selection match.
Merge-group checks: RUN — the integrated checkout differs from the tested candidate.
Nightly provider health: RUN — purpose is a fresh external-service observation.
```

### Stage B: trusted result reuse across equivalent inputs

This is a separately tested CI improvement, not a prerequisite for starting the production-page run. First calculate decisions in observation-only mode while all current checks still run. Compare proposed reuse with real outcomes before letting it omit work.

A result key must include the **actual checked-out revision/tree**, test and workflow/configuration versions, dependency lockfiles, browser/runtime/OS image, fixture/seed/schema, test selection and flags, and relevant environment identity/configuration. PR API `head_sha` alone may not describe the synthetic merge that was actually checked out. Dirty files or an unknown input prevent reuse. Secrets are not stored in the record.

Reuse only trusted, complete receipts with required assertions, no unexplained skipped coverage and accessible artifacts. A superset can cover a subset only when the actual per-test report and configuration prove it. Results from an untrusted branch or different permission context cannot certify a privileged job. Failed/cancelled/incomplete work remains recorded as such; a retry must not erase the original failure.

Initially require the entire relevant checkout to match. Cross-commit, per-area reuse requires a proven dependency/input map, including test fixtures and shared code; do not infer safety merely from a short changed-file list. A documentation file read by a test is a test input. Moving code can change behavior through imports, lifecycle or initialization and normally requires revalidation.

External-service health, hosted deployments and hardware checks need freshness and target identity beyond source bytes. Schedule/drift runs deliberately ask for new observations. A browser test cannot replace a real CasparCG test. A successful local stack cannot replace hosted-latency evidence.

### Acceptance for the dispatcher/reuse improvement

| Setup/action | Required result |
|---|---|
| Two callers request the same revision, environment, workflow and selection | One actual dispatch; both follow the same recorded result. |
| Resume after the dispatch acknowledgement is lost | Reconcile the existing request; no second speculative dispatch. |
| Same code, changed fixture/lockfile/browser/workflow/schema | Run again and state which input invalidated the receipt. |
| Same reported head SHA, different actual merge tree or broader test request | Do not reuse the narrower/different evidence. |
| Failed shard, cancelled job, missing report or unexplained skips | No reusable pass; retain failure history and run the necessary verification under existing retry policy. |
| Evidence-only documentation commit permitted by the spec | Reuse only after the exact documented material-diff check; final review stamp still names the current tip. |
| Scheduled health test or changed hardware installation | Fresh observation required even when source is unchanged. |

## Where the likely speedup is

Avoiding duplicate dispatch is useful but will not eliminate CI from this refactor. Most phases change the production page or control core, so the current acceptance matrix legitimately asks for revalidation. In the measured configured run, 25.47 minutes is real suite execution, not dependency installation.

After the existing trace work is assessed, inspect the slowest tests, repeated setup and isolation boundaries. Configured-suite sharding is an option only with independent test databases/accounts and validation that parallelism preserves assertions and exposes races. More shards can also increase queue contention. Do not reduce assertions, loosen limits or skip a required suite to manufacture speed.

Measure queue/wait, install/startup, test execution, retry and merge latency separately. Compare equivalent suites on the same revision/environment before claiming improvement. Broad main/configured checks currently remain policy; changing their frequency or substituting cached evidence requires its own reviewed change, not a secret optimization inside a phase.

## Replace the rigid 24-hour rule with the owner's run boundary

The current `scripts/wave-plan-store.mjs` hard-codes `MAX_WINDOW_MS = 24 * 60 * 60 * 1000` and rejects longer windows. The owner has now changed the scheduling requirement. Treat the ceiling as an implementation rule to amend, not as something requiring repeated owner permission.

Proposed small runner-preparation change: allow the explicit multi-day end time authorized for the project, retaining one run ID and phase ledger. Distinguish that end time from optional work blocks and safe pause points. Preserve cancellation, expired-run stops, one active owner, checkpoint persistence and reconciliation of uncertain actions. A restart or a new work block must not silently extend the overall end time.

Verify a window longer than 24 hours is accepted, a pause resumes at the first unfinished phase, no phase is dispatched twice, a second coordinator cannot acquire the same active work, and an expired/cancelled run stays stopped after restart. Do not just remove a constant while leaving the planning documents, lease logic and recovery records to disagree.

Until that preparation change is implemented and tested, the existing daily-window renewal can retain the same ledger; it is a temporary technical limit, not the desired organization of the project. This research has not changed that code or opened any run.

## Preparation sequence

1. Reconcile all 22 steps, Q and the six accepted scope additions into the formal run plan; keep the reviewed dependency order, with final technical and Friday human acceptance covering the complete resulting implementation.
2. Make the small multi-day/pause-resume runner amendment and validate cloud start/follow-up/checkpoint/landing/recovery. Reuse existing infrastructure; do not start a new orchestration project.
3. Apply exact-run lookup to manual verification dispatches through the existing coordinator/ledger, with explicit decisions. Keep broad input-fingerprint CI reuse as separate work until observation-only evidence supports it. Coordinate with the existing trace-overhead work.
4. Reserve local sessions for the baseline, performance repeats and CasparCG/OBS milestones. Transfer exact candidate revisions and preserve their receipts. If a required local result is pending, stop its dependent phases and continue only independent work.
5. Start the cloud-led run tomorrow; aim for Thursday technical readiness and Friday user/production acceptance. Report missing evidence and critical-path drift early. Cloud uptime improves the available time but does not guarantee that the entire run fits the calendar.

## Source references

- [CI workflow](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/.github/workflows/ci.yml), [configured workflow](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/.github/workflows/configured-suite.yml), [affected-test planner](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/scripts/e2e-affected.mjs).
- [Worker verification policy](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/.agent-workflows/verify.md), [job admission](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/scripts/jobs.mjs#L243), [phase revalidation and Windows performance requirements](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/docs/work-specs/production-page-refactor/spec.md#L374).
- [Cloud execution and actual capability limits](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/.agent-workflows/cloud-delegate.md), [dated provider receipts](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/docs/work-specs/cloud-execution/evidence/capabilities.md), [durable restoration contract](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/docs/work-specs/native-recovery/evidence/restoration.md).
- [Current window limit](https://github.com/NoaCG/NoaCG-Studio/blob/c9f1769c2147acf12f37e7a19192f9c4ce036fea/scripts/wave-plan-store.mjs#L124).
