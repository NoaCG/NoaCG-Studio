# Dependable cloud execution

Owner authority: the 2026-10-16 request in this Codex chat authorizes bounded
measurements, provider probes and publication to NoaCG/NoaCG-Studio through the
existing check and merge queue. Existing environments and subscriptions only.

Ordinary implementation, review and unattended runs belong in cloud tasks;
device, installed-program and private local-file work stays local. GitHub Actions
retains authoritative PR and merge-group checks. Separate cloud tasks have
separate resources; native subagents in one task share its VM.

### AC-1: Verification depth is backed by executed measurements

Record both prepared environments' effective CPU and container memory limits,
production build, relevant gates, executed affected selections for recent changes,
one or two maintained E2E shards through the existing queue, and worker scaling.
Receipts include source revision, command, wall time, aggregate sampled process
memory, test identities/counts, failures and retries. Compare with GitHub queue,
execution and repair latency. Planner timing alone is not test execution.

### AC-2: The owner approves a precise local/cloud verification default

Present a numerical recommendation before changing the shared rule. Preserve
local guards; select cloud policy on the executing worker rather than inheriting
its coordinator's profile. Node tests cover guards and execution-profile selection.
Until approval, measurements are an explicit bounded exception authorized above.

### AC-3: Both providers return a revision-bound cloud worker result

Use supported official interfaces, current CLI help and live probes. Verify the
intended saved environment, native task ID, exact source revision, status, useful
result and artifacts. Exercise follow-up/resume where supported; report unsupported
operations before designing around them. API model calls are not subscription workers.

### AC-4: Delegation recovers without duplicate work or landings

Reuse existing wave/plan/job state and shared skill layout. Exercise uncertain
submission, coordinator restart/reconnect, reclaimed-container recovery and cloud
phase continuation with the laptop closed. Exactly one acknowledged repair owner
handles CI failures and no-webhook conflicts. Scheduled recovery stops at an
owner-authorized window and is re-armed and observed where necessary. Claim archived
revival or indefinite monitoring only after separate demonstrations.

### AC-5: A small meaningful task lands without a permission click

Reuse cloud-landing-recovery AC-1..AC-5 evidence and the qualified landing helper;
do not repeat qualification unchanged. Check concurrent follow-ups before edits.
Prove narrowly permitted Claude auto-merge with a fresh live exact-SHA landing
through the merge queue. Demonstrate the complete delegation flow with /check,
/queue-merge and post-land receipts, preserving assertions and gate standards.

### AC-6: Bounded measurement tools produce reviewable evidence

Derived delivery slice of AC-1: an owned Linux worktree can measure an explicitly
bounded build, canonical changed-path gates and named queued browser selections.
Node tests cover CPU/memory limit arithmetic, detached descendants, reparenting,
PID reuse, explicit command scope and termination of an unresponsive child.
Live receipts identify the revision, actual tests, failures and sampling method.
Shipping this slice leaves AC-1 open until both providers are measured and leaves
the shared policy and delegation acceptance unchanged.

## Phases

1. Ship the bounded measurement tools and reviewed Codex evidence (AC-6), then
   finish both providers' measurements and propose depth (AC-1/AC-2); approval
   precedes shared policy edits.
2. Qualify launch, result and recovery capability in each existing environment.
3. Implement the smallest shared delegation skill and approved policy; run the
   meaningful end-to-end task and land verified phases.

## Non-goals

Mac SSH setup, rented VMs, subscription changes, replacement orchestration state,
requalification of unchanged landing mechanics, publishing secrets/private files,
and relaxing tests or gates.

## Phase notes

- Baseline `55d01c993`: #1293 and #1298 supply Claude runtime/landing receipts.
  The landing still required one-time owner permission, so click-free readiness
  is open. No open cloud-verification measurement PR was found at intake.
