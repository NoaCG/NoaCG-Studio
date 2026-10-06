# Rundown history implementation

Baseline: `ba8ad8738758c6a87580f40e35a34c05b88bee13`.
The existing [plan](plan.md) remains the acceptance contract.

## Phase A: acknowledgement and conditional restore

Why: global durable-write draining cannot prove that a particular edit saved, and an inverse
from a stale in-memory production can overwrite concurrent work.
Goal: exact forward-edit receipts and data-only conditional restore, proved before UI history.
Non-goals: new database schema, replacement cloud synchronization, live command reversal,
or advertising Undo before the controller is connected.

Personal writes capture their own account, key, sequence and result. Failure rolls the mirror
back to the actual stored document, including when two optimistic writes both fail. A restore
reads and compares the target production inside one IndexedDB read/write transaction, preserves
other productions and metadata, and aborts when another local write supersedes it. The fallback
without IndexedDB refuses restore. Pending inverse writes participate in existing account drains.

Team receipts await the real save pump and require the exact intended accepted slice and an
advanced server revision. Restore shares the pump lock and uses strict existing RPC CAS. A
conflicting rundown is adopted and refused, rather than merged with a stale inverse. Metadata-only
conflicts can retry once. A newer local edit remains owned by the ordinary pump, even if the server
accepted the inverse while its response was pending. Invalid conflict documents are never adopted.

The pure history kernel projects cues, folders, graphics and server items; preserves stable IDs,
metadata and current collapse state; validates source/folder references and through restrictions;
retains at most 50 steps and 20 MiB of serialized unique snapshots; shares adjacent snapshots.
Serialized retention is not a heap cap.

Observable acceptance: a failed write cannot create a false receipt; stale personal/team slices
cannot replace newer ones; accepted inverses preserve unrelated work; failure leaves data and
retry ownership intact; no restore dispatches a live command.

## Evidence

- Twelve Node tests passed: kernel identity/validation/retention and real team save-controller
  receipt, concurrent edits, conflict, retry, malformed response and failure behavior.
- Six browser tests passed against actual IndexedDB: individual failure receipts, two failed
  optimistic writes, disk changed without mirror broadcast, other-production/metadata preservation,
  a newer write cancelling an inverse, identity invalidation and unavailable-storage refusal.
- Team transport is stubbed at the RPC boundary; no production cloud account was modified.
- A temporary copy with the semantic comparison disabled failed the stale-rundown guard test;
  the unchanged real kernel then passed all twelve Node tests. The refusal assertion is not vacuous.
- Full build passed, including unit, type, lint, layering, contract and bundle gates.
- The affected browser suite passed 685 cases and skipped 113 configured/quarantined cases.
  Four startup-wizard assertions timed out on that broad run; all four passed an isolated
  single-worker rerun without source or assertion changes. These remain recorded loading flakes.
- Review and simplification ran inline. Review fixed database rollback after multiple failures,
  inverse drain/identity ownership, team revision ownership during a newer local edit, and
  rejection of malformed conflict documents. Simplification kept restore in the existing save
  controller and retained the ordinary public mutator wrappers.

Phase B connects this kernel to the page's authoring queue, native-safe shortcuts and grouped
cue drafts. It requires the remaining live, identity, keyboard, remote and multi-step browser
acceptance before exposing history.
