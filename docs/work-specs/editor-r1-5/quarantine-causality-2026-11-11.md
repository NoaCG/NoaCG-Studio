# E1/E2 quarantine causality investigation — prewritten protocol

Owner request in run #2295, 2026-11-11: settle whether these landings caused the
quarantines before further phase work. E3 had already landed before this request;
its history is retained. E4 has no launch or intent. The same run is blocked on
this investigation; a quarantine/retry is not causal clearance.

## Exact comparisons and original evidence

| Spec | First parent | Landing | Original evidence |
| --- | --- | --- | --- |
| `e2e/output-debate-clock.spec.ts` | `fb04bbd9658857318e4b954611b6dd08a4815e9d` | E2 `d8b18080bfacf2303a1d88e4ca1398fb263d9657` | main43020316776/job130521736183; same-SHA retry130530591862; quarantine PR2382, mergea314415e |
| `e2e/configured/operator-outage-not-unpublished.spec.ts` | `a3f3e13caacb7bc8cbe4f00f8ffd5d694e489a44` | E1 `8c9f2684bc419242f79f4d36e5f61fe7e5e41d1f` | configured42945843116/job130278438628; quarantine PR2370, merge6bbe6c1f |

Both original jobs report **one worker**. The clock file has 24 cases; `15/15`
is the failing shard number, not 15 failed clock cases. Its one observed failure
was the `aThenB` precondition in the case at line292: B read302 seconds when the
assertion required at most260, before that case's Snap. The retry passed24 cases.
The operator file has two cases. The old-link case failed at line164 because
`page.evaluate` lost its execution context during navigation; its inline retry
passed. Those symptoms are evidence, not yet a verdict about either landing.

The clock spec blob is identical across its pair (`4bfa5c28`); the operator spec
blob is identical across its pair (`e5441f23`). All four package locks match
(`1c3ad675`). Changed runtime paths still require inspection and repeated runtime
proof; spec/dependency identity alone cannot establish non-causality.

## Counts committed before any experimental spec run

**Initial count:60 complete whole-spec invocations per commit per spec**, in60
paired comparisons. That is120 clock invocations (2,880 case attempts if complete)
and120 operator invocations (240 case attempts if complete). Each invocation uses
one worker, a fresh Playwright/browser process and the exact historical source.

Sixty independent invocations give a95.4% chance to observe a failure occurring
in5% of invocations (`1 - .95**60`); zero of60 has a one-sided95% binomial upper
bound of4.87%. This is an initial detection sample, not a claim that equal or
zero observed rates prove equivalence. Cases within an invocation are correlated;
the primary failure-rate denominator is whole-spec invocations, with every
case-level outcome also reported.

Use30 parent-first and30 landing-first pairs in a precomputed balanced order
(seed2295), and run one browser job at a time. Preserve the source SHA, spec hash,
Node/Playwright/Chromium versions, worker count, resource settings, ordering,
server lifecycle, case counts, primary failures and infrastructure errors for each
invocation. Do not pool different environments or failure signatures silently.

Use normal CI settings and existing per-test/assertion limits. Clock retries stay
zero. Operator diagnostic invocations explicitly use `--retries=0` so its normal
inline retry cannot hide a first-attempt failure; the repository's configured CI
policy is unchanged. Preserve clock CI tracing settings. No waits, polling
intervals, assertions, skips, source files or acceptance limits are changed.

Run the named spec directly so quarantine selection cannot exclude it. Require
24/2 collected cases and zero skipped cases respectively. Missing credentials,
missing reports, foreign/stale dev servers, changed snapshots and exhausted
resource caps are unresolved experiment outcomes, never passing samples. Keep
all such attempts and report them separately; do not silently replace them.
Isolate/reset disposable backend fixtures and verify actual authenticated local
persistence for the operator file. Never use production accounts/data/credentials.

## Deciding and extending

Report exact parent/landing rates, all failure signatures and uncertainty. Use
source/runtime evidence and, for a suspected causal change, an isolated hunk
reversal or minimal product correction to test the proposed mechanism. A
statistically non-significant result, a successful retry or zero/zero alone is
never sufficient for a “not caused” verdict.

If the original failure is not reproduced or a material rate increase remains
unresolved, record the next count and rationale **before** another matched batch
of60 pairs. Retain all preceding results and disclose adaptive/descriptive
statistics rather than claiming fixed-sample significance. Investigate original
shard/context differences where needed. Do not stop at an unsupported yes/no.

If caused by the landing, fix the product. Change a test only if it contradicts
a documented rule, retaining its intended outcome checks. Validate the correction
with **the same final number of whole-spec invocations used for that comparison,
with zero failures**, and normal checks in its own queued PR. Never add a wait,
retry or skip, weaken a judge, raise a limit or add a budget exception to pass.
Release quarantine only through its documented20-consecutive-main-pass route;
experimental repeats do not earn release passes.

If not caused, identify and demonstrate the actual cause. Retain quarantine and
its incident [#2371](https://github.com/NoaCG/NoaCG-Studio/issues/2371), assigned to
`miwco`; both existing policy rows have repair due2026-11-25. Preserve that real
owner/date rather than inventing one. Publish the exact evidence and any fix or
release PR. Further phase launches remain stopped until both cases are settled.

## Execution and diagnostics

The independent protocol review at `ea2a9edb` returned AGREE/A; it is a method
review, not a causal result. Use the existing browser queue for individual named
spec invocations with the normal five-minute small-selection bound. Never turn
sixty pairs into one oversized job or evade broader-selection admission limits.
If a complete trial needs a different existing bound, stop and document that
route before continuing; preserve any exhausted-cap result.

Set `CI=1` for the historical config, with `GITHUB_ACTIONS` unset in this actual
Cloud worker; the execution profile remains Cloud. Explicitly request one worker.
Add JSON reporting while retaining existing integrity checks/reporters. Verify
exact source/spec identity and clean snapshots, and reject an unexpected existing
listener before each server start; record the same lifecycle on both arms.

The historical live config traces only its retry. With diagnostic retries zero,
primary operator runs consequently have no trace. Preserve that primary setting;
if tracing is needed, declare a separate matched trace-on diagnostic condition,
retain its counts and never pool it into the primary failure-rate comparison.


## CI execution route amendment, before additional trials

The first Cloud pair completed all24 clock cases on both commits (0/1 failed
whole-file invocations each). Preserve those two reports as a separate Cloud
stratum. The operator stack never reached readiness: CLI2.111.0 image unpacking
exhausted the managed Docker vfs disk. No operator trial ran. Its nine downloaded
images were removed and free space returned to56GiB; there were no containers.
This is an infrastructure outcome, not evidence about E1.

Use the **existing** manual `endurance.yml` workflow without changing any workflow
or normal gate. Add one opt-in diagnostic npm entry and a bounded controller;
its only job is measurement, never a plan phase launch or causal verdict. Dispatch
on twelve immutable clock batch refs (five complete paired invocations each) and
four immutable operator batch refs (fifteen paired invocations each). Thus the CI
stratum still has exactly60 invocations per commit per spec. Use the seed2295
balanced ordering globally, split across batch refs. Each worker runs only one
browser job at a time, with explicit workers1 and diagnostic retries0. Parallel
batches live on separate GitHub runners, not shared-VM agents. The already completed
Cloud pair is not pooled into the primary CI failure rates. No abandoned or failed
attempt is silently replaced.

Before implementation, obtain a fresh Rules-first second opinion on this route.
The controller must verify the actual CI runner, batch ref syntax, first attempt,
exact source/spec/lock identities and the unmodified Supabase tree (`3c50971d`).
Create both historical feature worktrees before preparing them. Reuse only the
identical installed package files; give Vite caches and generated postinstall
artifacts their own worktree. No tracked snapshot file changes. The root runner's
endurance script and package entry are diagnostic harness only.

Use `local-supabase=true` only for operator batches. Endurance starts and tears
down the same CLI2.111.0 stack as configured CI. Reuse the original composite
action's export, schema/grant/publication and disposable-account shell blocks
verbatim, rather than a weaker replacement. Check exact Supabase tree equality
on both historical arms and the diagnostic branch. Require loopback API/auth and
actual successful sign-in; no production config or credentials. Keep the primary
operator trace setting and all original timeout limits. Both arms use fresh
Playwright/browser/server per invocation; require an empty assigned server port.

Admit each invocation through its snapshot's existing browser queue with cap5.
Keep every admission, log, JSON/blob/result artifact and per-case first outcome.
Require24/2 collected cases respectively, one worker, no skips/flaky/retries,
no global errors, and consistent terminal queue/report status. Product failures
remain data and planned measurement continues; missing/invalid/incomplete results
stop that batch as unresolved. The controller has a75-minute ceiling within the
existing90-minute workflow. Upload receipts through the workflow's existing
always-upload step, including partial evidence. No cap or workflow is raised.

Dispatch once per immutable batch ref, record intent before submission and
reconcile the returned run ID plus exact head. Lost acknowledgement stops that
batch pending native/API reconciliation; never blindly resubmit. Explicitly
retain GITHUB_ACTIONS on actual Actions; never fake it in Cloud. The active owner
stays through diagnostics and the causal gate. These opt-in results cannot pass
normal gates or earn quarantine release;20 consecutive main passes remain required.

## Read-only evidence retrieval, before analysis helper implementation

The managed Cloud shell cannot download Actions ZIP storage: both the GitHub
artifact redirect and the connector's returned file URL are denied by its proxy.
The attachment-download tool also cannot create its directory under this task's
read-only permission profile. Original job logs remain readable through the
GitHub connector. Do not bypass the proxy or change the environment allowlist.

Use a separate diagnostic feature branch, never merged to main, for a read-only
artifact analysis dispatch. Its copy of the existing manual endurance workflow
adds only `actions: read` and passes its own scoped job token to the analysis step.
No user credential is copied or exposed. It does not start a backend or tests,
change a primary batch, earn release passes or change any normal gate/limit.
Before implementing this retrieval helper, obtain a fresh method second opinion.

The helper reads only this repository's16 recorded immutable primary run IDs,
verifying head81f782eae, expected batch refs, attempt1 and artifact ownership. It
keeps each original ZIP and checksum privately in its existing always-upload
output, reads trial JSON without extracting archive paths, prints a bounded
sanitized summary with counts, failed titles/errors and unresolved attempts,
and never treats a missing or unfinished artifact as a passing sample. It also
reads original clock failure artifact13854769457 from run43020316776, extracting
only relevant trace API results/network timing for diagnosis. It never changes
source, reruns tests, modifies quarantine or submits a later phase. Use a finite
15-minute read ceiling within the existing90-minute workflow and retain partial
results. Inspect/publish only relevant synthetic-fixture evidence, not tokens,
headers, service keys or raw private environment metadata. Fresh final review
and targeted validation precede this read-only dispatch.
