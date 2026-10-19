# Durable planned runs and waves

For continuing projects, the owner's 2026-10-19 decisions in
[continuing preparation](../continuing-plan-preparation/spec.md) supersede the
24-hour project ceiling below. Ordinary waves and historical receipts stay unchanged.

Authority: owner's 2026-10-16 research, design and minimal implementation request in this session.

## Why

The wave store and phase ledger preserve progress across local worktree removal, but do not
survive losing the repository host. Wake delivery has no transactional ownership, and a marked
Wake line does not prove a scheduler was created. A replacement needs a small, explicit handoff
and must reconcile effects before retrying.

## Goal

Recommend a researched architecture that keeps the existing plan, wave and merge semantics.
Prove one opt-in deterministic recovery path on this machine, without paid model calls or
changing the working desktop task. Separate local demonstrations from hosted qualification.

## Non-goals

No new agent framework, production scheduler, credentials, cloud deployment, changed merge
policy, automatic permission expansion, or claim that local storage survives host loss.
No extension of an existing authorized run window. The 24-hour boundary remains in force.

## Key decisions

- Keep `plan-run`, `wave-recover`, the shared wave store and the GitHub queue as authorities.
- Use Node's built-in SQLite for the opt-in supervisor's local claims, leases and wake intents.
  CI and this machine use Node 24. One local database, no new package or server.
- Separate observation from dispatch. A registered adapter inspects the coordinator and
  reconciles a stable wake action ID before delivering it. Unknown delivery blocks retries.
- Persist authorization, adapter identity, explicit waits and a bounded recovery packet.
  The adapter is responsible for using the recorded permission policy and reconciling workers.
- Renewed authorization is a separate operation, not a supervisor restart. This slice refuses
  windows over 24 hours; multi-day progress can span explicitly renewed windows.

## Acceptance criteria

### AC-1: Evidence and recommendation

A primary-source comparison covers Pi Durable, Beads, both Ralph implementations, Temporal
and retaining the scripts. The recommendation includes current code findings, hosting and
compatibility limits, a state model, recovery protocol, context budget and migration sequence.

### AC-2: Crash recovery and duplicate suppression

Kill an inert coordinator process. Fresh supervisor processes sharing the durable store detect
its absence and deliver one wake. Concurrent ticks cannot deliver competing wakes. Restart
after an unrecorded successful effect reconciles the same action instead of repeating it.

### AC-3: Explicit waits and bounded retries

A healthy coordinator running a quiet long command stays alive. Owner, permission and external
waits suppress delivery until explicitly cleared; usage waits suppress it until the recorded
reset. Unknown observations and unknown delivery never authorize a competing coordinator.
Confirmed non-delivery uses bounded backoff and preserves the action ID.

### AC-4: Authorization and terminal states

Reported, cancelled, finished and expired runs never restart. Restarting a supervisor cannot
extend the deadline or modify the adapter, scope or permission policy. Oversized packets and
invalid observation/receipt shapes fail closed.

### AC-5: Measured context and honest limits

Measure local healthy-check and recovery timings, packet bytes and available Claude wake usage
including cache reads/writes. No transcript is loaded by the supervisor. Provider cloud host
replacement is demonstrated only if a real exposed platform permits it; otherwise name the
missing access and qualify it as unverified.

## Delivery

Research: `docs/research/durable-orchestration.md`. Implementation and protocol:
`scripts/run-supervisor.mjs` and the research document's first-slice instructions.
Evidence: `evidence/verification.md` and `evidence/measurements.json` in this directory.
