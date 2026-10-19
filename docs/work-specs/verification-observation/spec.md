# Observation-only verification lookup

Authority: owner's pasted shared plan-run preparation request, 2026-10-19.
This is independently reviewable part B; A is PR #1508. No plan, native worker,
schedule, duplicate live verification or experiment dispatch is authorized here.

## Problem and goal

Existing manual Actions entry points can request verification without comparing
the job/landing evidence already available. Report a structured WAIT, REUSE, RUN
or UNRESOLVED decision using exact request and trustworthy completion identity.
Integrate the lookup into actual supported dispatch paths while preserving the
active GitHub Teams CI/E2E experiment's dispatch behavior.

## Non-goals and decisions

- The owner explicitly says the experiment remains active; no completion receipt
  has been supplied. Enforcement stays disabled. No trigger, concurrency, shard,
  required check, selection, test assertion, retry, timeout or quarantine changes.
- Reuse existing job records, verification admission and GitHub run/artifact reads.
  No scheduler, distributed lock or cross-commit result cache. A local lock cannot
  prevent duplicate dispatch on another machine.
- Identity includes repository, actual tested revision (including merge commits),
  workflow/configuration revision, resolved defaults/inputs, actual selected tests,
  relevant environment, purpose, freshness, attempt and required reports/artifacts.
  A head SHA, workflow name or claimed superset does not establish coverage.
- Keep the original evidence/failure/attempt history. Missing identity or delivery
  proof is UNRESOLVED. Failed/cancelled/skipped/incomplete work never passes.
- Observation failures are advisory and must not add a gate or retry. Existing
  fail-closed and uncertain-delivery protection retains its behavior.
- Design future enforcement as an offline decision model only. Activation needs
  an explicit experiment-owner completion receipt and separately reviewed change,
  plus persisted intent reconciliation and single authoritative dispatch owner.

## Entry-point inventory

Supported scripted CI dispatches currently occur in `cloud-queue.mjs`
(`reviveReviewed` after its existing confirmed-absence read), `queue-pr.mjs`
(mechanical token fallback), and `jobs.mjs` (`runRecovery`). Human/manual dispatch
instructions also occur in queue-merge/verify and direct gh examples. The durations
refresh workflow contains its own token fallback. Map each path to the shared
observer or explicitly document an unsupported path; do not claim interception of
GitHub's UI, raw gh, third-party callers or hosted workflow versions predating it.

## Observable acceptance

1. Deterministic fixtures distinguish exact/mismatching requests, head versus
   merge revisions, workflow/config/input/default differences, actual selections,
   environment/purpose/freshness, pending and completed attempts, missing reports,
   failures and uncertain delivery. Every result includes mode, reason, request
   identity and original run/evidence links when available.
2. Tests of supported entry points prove the observer runs before the unchanged
   dispatch call, including WAIT/REUSE/UNRESOLVED and lookup failure. No dispatch
   suppression, addition, reordering, serialization or automatic retry is added.
3. Offline enforcement refuses uncertain persisted intent replay and unsupported
   cross-machine ownership. RUN does not override failure or repair policy.
4. /check, targeted tooling gates and queued merge commit checks pass. Document
   the exact verified revision, active observation mode, future activation and
   execution/ownership/evidence limits. No live duplicate verification is used.

## Initial evidence

Baseline `b11adf155430c0f6888f524e16fa5ae599c28408` includes concurrent #1487's
landing; it is not resumed here. Existing job store has no wave plans in this
environment. Cloud coordinator preflight is repeated in this isolated worktree
under supported additional shell network permission; native child/remote fencing
qualification remains separate. Historical experiment/capacity evidence in
`docs/work-specs/e2e-suite-budget/evidence/experiments.md` and
`docs/work-specs/e2e-trace-overhead/spec.md` remains unchanged.
