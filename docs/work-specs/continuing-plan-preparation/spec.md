# Continuing projects and verification observation

Authority: the owner's pasted request in this session, 2026-10-19. This authorizes
preparation tooling, documentation, controlled fixtures and queued landing only.
It authorizes no product plan, implementation worker, schedule or expired run.

## Problem and goal

Project deadlines currently inherit a wave's 24-hour ceiling. Pauses do not stop
the phase loop, phase recording races, and manual verification dispatch paths do
not compare the evidence already available. Preserve one finite authorization and
phase ledger while coordinators work in shorter blocks; observe verification
equivalence without changing the active GitHub Teams CI/E2E experiment.

## Non-goals

No product or individual plan changes, scheduler, distributed lock, provider
substitution, credentials/settings changes, CI topology or test-policy changes.
No live plan rehearsal or extra live verification dispatch. Fixtures cannot
qualify a native provider, wake, cross-machine exclusion or durable handoff.

## Decisions

- A and B are separate reviewable changes. Reuse the wave file, supervisor SQLite
  ownership/intent records, existing job/admission mechanisms and Git recovery.
- Project authorization records stable identity, source, scope, original finite
  deadline and the exact plan phases/acceptance. Ordinary day/night waves retain
  their 24-hour limit. A restart or changed block never renews authorization.
- A pause or prerequisite block prevents new launches. In-flight work checkpoints;
  a pause is not completion or cancellation. Resume requires evidence and a bounded
  work block under the same authorization. Completion requires every phase PASS.
- Supported launch authority is a single coordinator on one local control store.
  Serialize phase admission; reject stale ownership and uncertain delivery. Refuse
  cross-machine continuation absent enforcement where the provider accepts work.
- Verification decisions are WAIT, REUSE, RUN or UNRESOLVED with request identity,
  mode, reason and original evidence links. Identity includes actual tested and
  configuration revisions, resolved inputs, actual selection, environment, purpose,
  freshness, attempts and required completion reports. Unknown is never success.
- The experiment remains active. Supported manual dispatch paths report advisory
  results, including lookup errors, and perform their existing dispatch unchanged.
  Future enforcement is offline only and requires separate explicit activation.

## Observable acceptance

1. Explicit finite multi-day authorization passes every project validation path;
   invalid, cancelled and expired authorization refuses work. Short waves retain
   their bounds. Restarts cannot change the project deadline, identity or scope.
2. Pauses between phases and in flight stop launches, preserve findings/repair
   counts and resume at the first unfinished phase after reconciliation. Cancelling
   and completing are distinct; block wakes/keep-awake stop at block end/pause.
3. Competing local coordinators cannot admit duplicate phases. Stale owners and
   uncertain accepted actions fail closed. Remote ownership remains explicitly
   refused unless supported native fencing has actually been qualified.
4. An injected-clock multi-day fixture covers short blocks, restart, pause,
   cancellation, expiry, competing callers and lost acknowledgement without real
   workers or dispatches. Existing focused regression tests remain meaningful.
5. Lookup fixtures cover exact and mismatching requests, pending and completed
   attempts, missing evidence, failures, freshness and uncertain delivery. Tests at
   real dispatch entry points prove observation leaves the original calls intact.
6. Canonical instructions and thin root/nested adapters load within existing size
   limits. /check and /queue-merge record reviewed revision, actual queue admission,
   merge commit and exact-merge results, with execution/recovery gaps kept explicit.

## Initial qualification

Baseline: `742a5a655f78b4276acc02cd38a19ea6e19c9119` (current origin/main).
Isolated branch/worktree: `tooling/continuing-plan-preparation`,
`/workspace/plan-run-preparation`. No wave files exist in this environment's store.
Open PRs include #1487 and #1503; neither is owned or resumed by this task.

Landed coordinator preflight passed in separate shell calls at 12:24:00.953Z and
12:24:12.449Z. Fresh same-VM delegated worker-context calls passed at 12:24:54.872Z
and 12:25:07.990Z. Each bounded child/workspace, Git and Actions API probe passed
under workspace-write plus the shell tool's supported additional network access;
none used escalated execution. A separate default-sandbox nested subprocess read
returned EPERM; no reusable default-sandbox permission is claimed. Root/nested
adapter resolution was checked independently through filesystem reads.

These receipts cover their invocations only. Current supported cloud coordinator
execution is observed; native Codex child mapping/launch, actual wake/bootstrap,
remote fencing and genuine native uncertain delivery remain open in #1301/#805.
Do not retry a known denial or replace those observations with same-VM fixtures.
