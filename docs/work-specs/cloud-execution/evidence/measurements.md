# Codex cloud measurements and provisional depth proposal

Owner approval is required before changing the shared verification rule. This
report completes the measurement-tool slice (AC-6), not the two-provider
measurement, policy or delegation acceptance. The owner will run Claude probes
from an existing Claude Code cloud session using [provider-runbook.md](provider-runbook.md);
that provider's measurements and the laptop handoffs remain pending.

## Execution and method

One prepared Codex cloud VM: Debian 13, Node v24.19.0, CPU quota
400000/100000 = **4 CPUs**, visible cgroup-v2 memory.max **16 GiB**.
/proc/self/cgroup was 0::/, so the visible mount root described this container.
The helper reports unknown effective limits for unsupported/nested scopes; those
need ancestor inspection before resource qualification. Node availableParallelism
reported 4 (the early receipt field is named affinityCpus).

Each receipt records its exact source revision, branch, command, time bound and
dirty paths. The PR changed-path sets were replayed through the current canonical
planner on the measured source; they are not claims about executing the historical
PR head. The application baseline throughout is main
55d01c993188d66e61f3ab9ccbe64e7d41cf06bd; later source changes are the measurement
tools/spec/tests, not the application.

Browser counts mean Playwright workers sharing this VM, not separate provider
tasks. Every browser measurement used the existing queue, declared --kind sweep,
with a 21-minute queue cap, 1200-second outer measurement bound and 1100-second
Playwright global bound. Explicit files from the affected plan or maintained
shard plan were passed. CI was not set to evade the local guards. Default offline
configuration retained zero retries and trace off. Configured/live suites were
not measured here. No provider model calls or subscription changes were made.

The sampler follows the entire child tree, including detached Vite/Chromium
processes, retains observed identities through reparenting, and checks creation
identity against PID reuse. It samples every 250ms. RSS sums resident pages and
therefore counts shared pages more than once; PSS apportions shared pages. Both
are sampled peaks, not a continuous high-water guarantee. Container memory
includes other task processes, kernel memory and file cache.

Wall time includes sampler overhead. The healthy four-worker shard used
0.385 CPU core in the monitor, about 9.6% of the four-CPU quota; later receipts
include monitorCpuSeconds. The same sampling method was used across the worker
comparison. npm ci took about 9s outside these timings; Chromium build 1228 was
already installed. Browser runs started their own server, while dependency/file
caches were warm after setup. GitHub uses its existing trace retention and
includes runner setup/artifact time, so the comparison is end-to-end cost rather
than a claim that the machines execute identical work.

Initial group-only sampling missed detached processes; those figures were
discarded. The JSON records the failed gate-registration attempt, process-call
contract failure, interrupted/contaminated attempts and the cancelled early
production selection. The detached wrapper was removed and the old runner
stopped before clean measurement. No discarded run counts as passing evidence.

## Actual work executed

| Work | Browser workers | Wall time | Aggregate peak RSS | Result |
|---|---:|---:|---:|---|
| Production build | — | 3m23s | 2.22 GiB | Passed; 233 general Node files / 2965 cases, plus 419 gateway cases; 23 general cases skipped |
| Gates: cloud-gates-clean | — | 7.5s | 0.44 GiB | Passed |
| Gates: pr1287-gates | — | 7.5s | 0.59 GiB | Passed |
| Gates: pr1292-gates | — | 6.0s | 0.24 GiB | Passed |
| Gates: pr1278-gates | — | 12.4s | 0.85 GiB | Passed |
| Gates: pr1293-gates | — | 5.4s | 0.21 GiB | Passed |
| v2-pr1278-w1 | 1 | 1m20s | 1.70 GiB | 60 passed, 17 failed, 1 skipped |
| v2-pr1278-w2 | 2 | 50.5s | 2.39 GiB | 60 passed, 17 failed, 1 skipped |
| v2-pr1278-w4 | 4 | 39.7s | 3.44 GiB | 60 passed, 17 failed, 1 skipped |
| v2-pr1287-w4 | 4 | 6.8s | 2.35 GiB | 8 passed, 0 failed, 0 skipped |
| v2-pr1292-w4 | 4 | 18m21s | 5.07 GiB | 459 passed, 6 failed, 30 skipped, 47 did not run; global time bound |
| v2-full-shard1-w4 | 4 | 5m24s | 5.01 GiB | 153 passed, 0 failed, 51 skipped |
| v2-full-shard2-w4 | 4 | 6m12s | 5.29 GiB | 161 passed, 0 failed, 44 skipped |
| v2-full-shard1-w2 | 2 | 6m05s | 3.11 GiB | 153 passed, 0 failed, 51 skipped |
| v2-full-shard1-w6 | 6 | 5m32s | 6.82 GiB | 153 passed, 0 failed, 51 skipped |
| v2-pr1299-w4 | 4 | 8.7s | 2.41 GiB | 8 passed, 0 failed, 0 skipped |

[codex-measurements.json](codex-measurements.json) contains the exact argv, source
revisions, raw limits, queue IDs, planned files, individual test identities,
outcomes, start times, durations, skipped annotations and every retry number.
All measured browser attempts had zero retries and zero flaky outcomes. A skipped
case is not executed coverage. In the capped production run Playwright's skipped
summary combines 30 ordinary skips and 47 unexecuted cases; 459 passing and six
failing cases completed. Its two global timeout errors are retained. The outer
timeout flag remains false because Playwright reached its own earlier bound.

The 21-file maintained shard runs the same 153 passing / 51 skipped cases at
2, 4 and 6 workers. Four workers took 5m24s; two took 6m05s; six took 5m32s.
Six consumed 6.82 GiB aggregate RSS and 11.30 GiB container memory, versus
5.01 GiB RSS / 8.63 GiB container memory at four. **Use four workers on this
measured four-CPU, 16-GiB VM.** The second maintained shard passed 161 cases
with 44 skipped in 6m12s at four workers.

The broad production selection was 48 specs / 542 planned cases. It hit the
18m20s inner bound while container memory peaked at 8.48 of 16 GiB. Full affected
execution for that change is not a useful unconditional pre-push default on
this VM. The smaller tooling selections completed eight cases in 6.8s and 8.7s;
the seven-spec selection exercised 77 cases in about 40s at four workers but
failed the snapshot checks described below. Planner time is never presented
as execution time.

## Failures and runtime alignment

The seven-spec selection completed with 17 public-chrome snapshot failures at
every measured worker count (9–10 changed pixels around the logo), 60 passes and
one skip. The large selection also failed six playout snapshots. The same
application source passed those snapshot cases in Ubuntu 24.04 GitHub jobs;
see [ci-visual-control.md](ci-visual-control.md). These are runtime-dependent
results; the exact font/rasterization cause has not been isolated. Assertions,
baselines, test timeouts, retries and quarantine rules were not relaxed.

A separate queued one-case trace reproduced graphics-only at 1366x768. The
inspected diff highlights text/icons while the pane geometry matches. Screenshots
and trace stay at /tmp/noacg-playout-diagnostic/ and are not committed; the
initial logo diff is at /tmp/noacg-chrome-diagnostic/. No screenshot is counted
as a passing test.

The managed Docker daemon passed the explicit local-socket health check
(28.4.0, vfs). A 120-second-bounded pull of the official pinned image
mcr.microsoft.com/playwright:v1.61.1-noble failed on blob/config download with
Forbidden after Docker's internal retries. Proxy/CA settings were preserved;
no container was launched and no access policy was bypassed. An aligned image
therefore remains unexercised. Do not make these native snapshot failures into
a green cloud gate or re-record baselines merely to pass.

PR #1300's initial Build run 38895003090 also caught a new test-fixture error:
Actions checks out detached, and the timeout test originally used its parent
checkout. Its whole failed Build log (job 116953254384) was retrieved; the sole
failure was Measure on an owned feature branch. The repair uses an owned
temporary Git fixture and preserves the guard, explicitly checks main and
detached refusal, then exercises termination on its feature branch. All original
timeout assertions remain. Four tests passed from an actual detached checkout
at 3f9bad2b2; this is a code/setup repair, not a same-SHA retry or a quarantine.

## GitHub queue, execution and repair cost

[ci-comparison.json](ci-comparison.json) records revisions and every sampled
job's start/end/conclusion. Samples are dated examples, not a population median.

| Observed run | First runner wait | Creation to CI gate | Detail |
|---|---:|---:|---|
| [Docs PR #1293](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38871969395) | 2s | 3m21s | Build 3m11s; no E2E selected |
| [Its merge group](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38876634477) | 2s | 4m43s | Build 4m32s |
| [Production-page PR #1292](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38868907459) | 3s | 12m40s | E2E jobs began 71–373s after creation; eleven parallel shards |
| [Onboarding PR #1299](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38885257383) | 3s | 4m55s | One E2E job, 27s including its job work |
| [Its merge group](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38885864153) | 2s | 4m49s | One E2E job, 31s |
| [Main after #1293](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38877208505) | 17m | 56m21s | Workflow cancelled; timed-out shard's same-commit retry passed and CI gate was green |

The prior qualified delayed repair went from red completion at 06:13:36Z
([38859992515](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38859992515))
to repaired green at 06:19:08Z
([38860508595](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38860508595)):
5m32s including the wake/repair interval; each focused job took about 11s.
This reuses existing evidence and is not a new recovery qualification.

## Provisional default for approval

This is a proposal, not an activated process rule. Complete Claude measurements
and runtime alignment before claiming a qualified cross-provider default.

| Execution site | Proposed verification depth |
|---|---|
| Shared laptop | Keep targeted relevant gates, changed-file lint/type checks and one or two direct E2E specs; resource-aware queue and one browser job per machine |
| Dedicated cloud VM | Execute relevant gates and domain unit checks; routine TypeScript gets lint/type checks. Run the full affected browser selection when its measured/predicted wall time fits a five-minute budget at the executing VM's calibrated worker count |
| Larger or shared-core changes | Run direct acceptance flows; where broader integration evidence helps, add one maintained shard within an explicit eight-minute browser budget. Report a capped/incomplete run as incomplete. Leave the larger full affected set and whole suite to authoritative CI |
| Build/bundle/dependency/entrypoint or packaging risk | Run a production build once for the reviewed code state; it already includes the build gates/type/lint checks, so avoid duplicating them. Routine copy/docs changes do not need a build unless they change an actual build input |
| GitHub Actions | Retain authoritative PR and merge-group gates, including their configured browser/catalog paths; cloud pre-push checks do not replace them |

For this measured VM the worker count is four. A different VM or image must
select/validate its own execution profile from its visible quota and memory,
regardless of a local coordinator's settings. Existing whole-suite refusals and
one-browser-job scheduling remain intact until the owner approves and the
canonical instructions, contracts, planner and scheduler are updated together.

The numbers justify a distinction by scope: relevant gates cost 5–12s; a narrow
selection costs seconds; a maintained shard costs roughly 5–6m; a full production
affected selection failed to finish in 18m20s, exceeding the sampled 12m40s
parallel PR gate. Always building or always running the full set before each
push would add avoidable time. Reproducing a known CI failure or a specifically
authorized bounded measurement remains an explicit exception, not a guard bypass.

No shared policy, cloud profile selector, delegation skill or scheduling rule
was changed by this delivery slice. Remaining acceptance and precise recovery
steps are in [capabilities.md](capabilities.md) and the open parent ledger.
