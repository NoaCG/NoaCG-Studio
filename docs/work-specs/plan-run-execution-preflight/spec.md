# Plan-run execution preflight

The 2026-10-19 [continuing preparation](../continuing-plan-preparation/spec.md)
supersedes AC-3's project ceiling with immutable finite project authorization and
bounded work blocks. Legacy qualification-only windows and ordinary waves retain 24 hours.

Authority: the owner's 2026-10-18 request in chat `01a1508d-2b53-7151-9018-f59c2a23317d`,
renewed 2026-10-19 in this chat to finish and land today. The current window ends at
2026-10-19T23:59:00+03:00. It does not resume any product plan or PR #1487.

## Why and goal

An unattended coordinator repeatedly hit sandbox setup failures before commands started.
Detect unusable execution contexts before launching implementation, without mistaking one
successful terminal, an approval wait or a scheduling acknowledgement for readiness.

## Non-goals

No sandbox configuration, ACL or credential changes; no new scheduler or execution ledger;
no editor changes, CI budgets, shard timeouts, carried/maintained tests or capacity exceptions.
No qualification of an unsupported native cloud launch or durable recovery by simulation.

## Decisions

- A small read-only preflight reuses execution-profile, cloud-network-preflight and the
  plan-run ledger. Its disposable subprocess writes only inside its own worktree and cleans up.
- Run it in two separate shell calls per context and repeat in a fresh worker. Record those
  receipts and effective tool policies in the existing wave file, with no new readiness store.
- Permission review happens outside the executable. Pending approval is not an executed probe
  or its timeout. A required owner action produces one concrete request, then a checkpoint.
- An infrastructure/capacity failure before a test runs is blocked, not a product repair.
  Existing checker retry limits, product repairs, owner decisions and deadlines still bind.
- Keep one canonical procedure within its existing size cap and thin provider adapters.

## Acceptance criteria

### AC-1: Bounded execution evidence
Each invocation tests a bounded child process and disposable workspace IO, independently
qualifies Git and Actions API reads, and reports context and the executing machine's profile.
Timeouts, missing executables, denied access and malformed results fail with fixed non-secret
diagnoses. The parent cleans the probe file even after a child timeout. Real subprocess
integration and injected failure tests demonstrate this.

### AC-2: No false reusable-readiness or recovery claim
The workflow requires two separate calls and a fresh context, inspects effective permissions,
distinguishes pre-execution approval waits from process timeouts and stops approval loops with
one configuration request. A pass explicitly covers only this invocation; wake proof and native
cloud capability qualification remain separate.

### AC-3: Existing run boundaries hold
An invalid, expired or over-24-hour window refuses probes. A supplied wave is read without
mutation; the existing ledger's done/stop/time-limit decisions prevent new work. Instructions
preserve builder/checker independence, restart reconciliation, queue verification and explicit
repair limits. Infrastructure/capacity blockers do not consume product repair attempts.

### AC-4: Instructions and landing verified
Shared instruction checks and focused gates pass; fresh root and nested Codex contexts read
the changed skill and resolve its canonical procedure. Run /check and /queue-merge, observe
actual queue admission, merge commit and exact-merge checks. No durable wake is claimed;
the active session owns repairs through the post-landing results.
