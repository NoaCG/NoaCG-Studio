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

## Phase B: production-page history

Goal: route the plan's authoring operations through one acknowledged queue, then expose the
normal desktop shortcuts. Non-goals remain playback settings, source configuration, persisted
history, editor history and reversal of live commands.

History belongs to one production, team and account identity. Structural operations and cue
drafts read current data when their turn starts, await their own receipts, and record only exact
accepted results. Failed team saves retain the outbox and old history; inverse stays unavailable
until that exact save is confirmed or the underlying rundown changes.

Label, note and individual prepared-field intentions retain one before-snapshot across idle
saves. Blur, selection, navigation and live operations close the intention. Inverse cancels draft
timers; last-character teardown writes retain the captured production identity. Immediate paste
awaits a pending copy. Single and range duplication share the same queue and keep their selection
behavior. Copy, cut marking, selection and live commands add no history entry.

Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y and Delete stand down for native inputs, composition,
menus, modals, repeat, paused accounts and hidden workspaces. Live-source and running-folder
guards run again immediately before conditional persistence. No inverse calls the live dispatcher.
The page uses its existing feedback line rather than adding a history toolbar.

Review ran inline and found a single-cue duplicate bypass, captured-draft/identity races, receipt
masking by reentrant writes, clipboard timing, and stale/red failure feedback after success.
The final held-save reproduction also found a dropped Delete press and timed advancement
waiting for cloud acknowledgement. Delete now uses the authoring queue while Undo/Redo stays
disabled during a write. Timed advancement reads the current preparation and dispatches while
its save continues; it adds no history entry.
The first integration run reproduced stale prepared values on Take/Update after acknowledgement
cleared a draft, lost folder text at account expiry, and less explicit save-failure wording.
The draft view now falls back to the latest mounted cue record. Closing folder edits capture
their production synchronously before pause/teardown; ordinary edits still use the history queue.
Failure sentences remain separate from the labels used in successful history feedback.
Rendered inspection found that successful inverse feedback still used the failure colour; it now
uses the existing success tone, with a browser assertion and screenshot.
Simplification reused the existing cue ref and deferred-edit hook, kept its public flush stable,
and removed the obsolete duplicate draft callback and unused history label properties.
Fourteen Node cases passed; deliberately disabling the live guard made both relevant guard tests
fail. Browser acceptance and final integration results are recorded below.

The embedded-asset retention measurement retained 29 steps and 20,784,360 serialized bytes
within the 20,971,520-byte budget. In the final integration run, after garbage collection, the page
used 44,104,084 heap bytes before the retained snapshots and 69,935,548 afterward. These are
separate measurements; serialized retention is not a heap cap.

The initial combined integration run (`j-3588`) passed 768 cases, skipped 117 configured cases,
and failed nine. Eight reproduced the three causes above. One inverse fixture pressed Undo
after an optimistic redraw but before local acknowledgement, when the acceptance contract
requires history to remain unavailable. Inverse gestures in that fixture now await the existing
local durable drain; it does not wait for the cloud pump or weaken conflict/live-wire assertions.

The repaired focused selection (`j-3590`) passed all ten cases, retaining the original field,
rollback, expiry and command-count assertions. The inspected desktop screenshot shows green
successful Redo feedback below the transport; no history toolbar was added.

## Phase B acceptance coverage

| Acceptance | Runtime proof |
| --- | --- |
| Exact move/duplicate/delete/edit inverses, reload with empty history | Four-step round trip and multi-cue source/folder restoration in `e2e/rundown-history.spec.ts` |
| Meaningful typing, native text undo, no delayed draft replay | Idle-save/native-undo case and separate prepared-field/note intentions |
| Own save outcome, failure preserves redo/retry | Failed forward/inverse cases plus seven actual IndexedDB cases in `e2e/rundown-history-storage.spec.ts` |
| Team conflict, failed outbox recovery and metadata-only CAS | Two page cases and eight real save-controller tests in `scripts/team-save.test.mjs` |
| Remote changes and account/production boundaries | Metadata/remote, captured navigation text, account pause and conditional-storage identity cases |
| Shortcut focus, platform modifiers, menus, modal, IME and repeat | Native input and keyboard guards, including hidden Data workspace |
| Live sources/running folders remain safe; no inverse commands | Exact Bridge action counts, live-source/folder refusal and two failing live-guard mutants |
| Live transport/timers do not wait for held cloud authoring | Held-save Take/Out/Delete and timed-advancement cases |
| Bounded retention and oversized edits | Fifty-step/oversize kernel tests and the page's embedded-asset/heap measurement |

History browser cases capture page errors and assert none. Team tests use the actual Supabase
client/save controller with the transport stubbed at RPC. Physical Mac keyboard behavior,
production cloud collaboration and real OBS/vMix/CasparCG hardware were not checked.

Known unrelated console diagnostic: OGraf conformance coverage logs `applySelection` reading
`textContent` from a null node in an exported `graphic.mjs` timeline callback. The same diagnostic
is present in the pre-history runs `j-3541` and `j-3543`, and the corresponding conformance
assertions pass. It is recorded here for a separate renderer/teardown investigation; this phase
does not change exported graphic runtime. This is not a claim that the whole suite has zero
console errors.

## Final verification

- `node --test scripts/rundown-history.test.mjs scripts/team-save.test.mjs`: fourteen passed.
- Focused regression selection `j-3590`: ten passed after the integration repairs.
- `set E2E_WORKERS=3&& npm run test:e2e:integration` (`j-3591`): 777 passed, 117 configured skips,
  zero failed across 88 selected spec files. All fifteen page-history and seven storage cases
  passed. Existing `exports.spec.ts` quarantine is outside the blocking selection.
- Final desktop history feedback was inspected, including its success colour and the absence
  of additional history chrome. Existing studio desktop/phone flows passed in the integration run.
- Review: inline, ten findings fixed. Simplify: inline. Verify: inline. Final `npm run build`
  and the passing check stamp are required on the reviewed tip before the landing queue accepts it.
