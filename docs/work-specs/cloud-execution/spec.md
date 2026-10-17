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

Owner approval is recorded in #1301 comment 6223002051. Implement the approved
5-minute small / 12-minute broader browser budgets and at most four workers,
reduced for lower effective resources. A risk-triggered production build runs
once per reviewed source state, bounded at five minutes on measured Codex or ten
on measured Claude; do not duplicate checks already included in that build.
Docs/copy do not trigger builds unless build inputs. Larger selections remain CI. Preserve
local guards; select cloud policy on the executing worker rather than inheriting
its coordinator's profile. Node tests cover preserved local guards, worker-side profile selection independent
of coordinator hints, cgroup v1/v2 mount roots and ancestor limits, lower/unknown
resources and the four-worker cap. Unknown limits permit conservative targeted
work, never an unlimited-memory profile.
Reuse historical measurements; their explicit exception does not authorize new benchmarks.

### AC-3: Both providers return a revision-bound cloud worker result

Use supported official interfaces, current CLI help and live probes. Verify the
intended saved environment, native task ID, exact source revision, status, useful
result and artifacts. Exercise follow-up/resume where supported; report unsupported
operations before designing around them. API model calls are not subscription workers.

### AC-4: Delegation recovers without duplicate work or landings

Reuse existing wave/plan/job state and shared skill layout. Exercise uncertain
submission, coordinator restart/reconnect, reclaimed-container recovery and cloud
phase continuation. Laptop-closure probes were dropped by the owner as unnecessary. Exactly one acknowledged repair owner
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
  That historical landing required one-time owner permission; #1305 later
  supplies the fresh click-free Claude landing receipt. No open cloud-verification measurement PR was found at intake.
- PR #1300 delivers AC-6: bounded tools and Codex measurements. The measured VM
  has a four-CPU quota and 16 GiB container limit; the healthy shard comparison
  favors four browser workers. The large affected selection reached its explicit
  time bound; screenshot results differ from the same source on Ubuntu CI.
  AC-1..AC-5 remain open: Claude measurement/account access, current Codex launch
  mapping, owner approval, shared policy/skill implementation and live delegation
  recovery are not completed by this slice. See `evidence/measurements.md` and
  `evidence/capabilities.md` before continuing.
- Owner correction, 2026-10-16: laptop-closure probes are dropped. Each provider
  launches its own workers; no cross-provider launcher. #1305 supplies Claude
  measurements and revision-bound cloud launch/follow-up/git transport, plus
  fresh click-free exact-head queue landing. Its main workflow was cancelled
  after a shard cap; recovery and CI gate passed. See the dated continuation receipt.
- The measured 5-minute small selection, 12-minute broader selection, four-worker
  cap and conditional 5/10-minute Codex/Claude build budgets were approved
  in #1301 comment 6223002051; the policy phase implements these limits.
- Codex current-UI coordinator runs at the pinned #1307 source. Native CLI child
  qualification remains blocked by cloud authentication and unproven saved/runtime
  binding relationship. #1307 inert-process tests are not native recovery evidence.

- Approved policy implementation phase: reuse the existing affected planner, worker
  count selector and job queue. Add one shared resource/profile helper, bounded
  queue admission and a discoverable cloud-delegate skill pointing to one canonical
  procedure. Keep local-only tasks local and unsupported/uncertain native launches
  explicit; no replacement scheduler, state store or credential path. Node tests
  and an independent same-VM forward evaluation verify this slice; they do not
  qualify a separately resourced child or durable recovery. AC-3/AC-4 stay open.
