# Deep-link pending-completion fault — product decision required

Disposable source `b5d0b18054791589e02126ed794600a3d43bd3aa`, branch
`probe/deep-link-pending-completion`, based on the passive observation5050d952.
No PR, merge, gate release or product-source change exists for this diagnosis.
The original stopped receipt36c2522b and healthy passive observation39306382882
remain separate facts; neither is relabelled as a repair.

## Controlled path and actual failure

One dispatch, [39307804274](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39307804274),
job118249308071, using the same canonical isolated configured stack/CLI2.111.0.
The browser command remains cap5, retry0, original test timeout180000 and missing
assertion60000. All five original cases, names, gestures and assertions remain;
only the selected original production-link case executes in this diagnostic.

The added fault intercepts the first two actual GET show listings after the real
absent-id hash navigation. It creates one unrelated local production fixture
while each real pass is running, then continues the actual request unchanged.
It neither fabricates a server response nor calls syncNow, replaces a timer or
modifies product code. The exact provider-list URL fields were statically checked.
Each fixture uses a fresh id in the isolated runner account, not the absent id.
Passive state and path/status-only network observation remain byte-identical to
the preceding healthy diagnostic. Full original source/diff is retained below.

Actual fixture-write facts:

- Epoch1792436769438: first write, before syncing / after pending.
- Epoch1792436769469: second write, before syncing / after pending.
- Both writes happened at the original absent production hash, against actual
  GET kind=eq.show summary listings; neither gesture nor target id changed.

[Raw events](events.json) show completed passes with a result in pending state at
1792436769458 and1792436769529. A later clean pass reports **synced**, with a last
result, at **1792436769582**. Team status is ready/loaded throughout, without an
error. Despite the clean pass, the UI keeps Looking for this production. It only
renders missing at **1792436829444**, about59.9s after that clean completion,
when the existing fallback fires.

**Actual result: one failed, zero retry/flaky/skipped**, 71.97s whole run. The
original `production-missing.toBeVisible` assertion fails at its unchanged
**60000 ms**, “element(s) not found”. Diagnostic insertion shifts original115:60
to140:60. The failed snapshot matches the historical failure: Opening production
and Looking for this production in your account. The later missing=true sample
was captured during final collection; it does not erase the assertion's failure.
This is the original failure shape under the challenged pending-completion path,
not unique forensic proof of the historical runner's unrecorded scheduling.

Downloaded artifact12215340278 SHA256 matches
`b70c55ec605b5cfcc05bd0db9d36c113e2b11a6d360107dbf47fa36c656ee7a7`.
Its JSON report records expected0/unexpected1/flaky0/skipped0. The first-attempt
trace and error context are retained in that artifact; original run39287816358
and its passing retry remain unchanged. [Machine facts](facts.json) accompany
this receipt. No second execution of this fault has occurred.

## Why this needs product source

`graphicWhenSynced.cloudAnswer` awaits a qualified sync pass, then reads the
controller's **global** phase to decide whether an absent answer is known.
A completed pass may report pending because unrelated newer local work is owed;
a queued follow-up may already replace it with syncing before the lookup's
promise continuation runs. The lookup checks only once, and its data listener
only settles when the record exists. A later clean completion therefore need
not settle an absent lookup; the60s fallback competes with the existing60s test
assertion. This is not evidence of a wrong locator or a missing settling wait.

A test-only wait or increased budget would hide that product behavior. The
reservation boundary requires an owner decision before a product fix.

## Concrete proposed scope, not applied

[Proposed two-file patch](proposed-fix.patch.txt), **unapplied and not runtime
verified**, names exactly:

- `src/backend/syncController.ts`: return a typed read-completion receipt for the
  particular awaited pass, including its coalesced waiters. Completed pending,
  synced and completed-with-record-failures passes answer completed=true;
  skipped/thrown/account-superseded passes answer false. Preserve serialization,
  queueing, authoring, writes and all timer limits.
- `src/backend/graphicWhenSynced.ts`: decide absent from that awaited receipt,
  rather than mutable global sync state. Preserve found-on-arrival, signed-out
  behavior, unknown-on-incomplete and the existing60000ms fallback.

The proposal intentionally does not just whitelist phase pending: the next pass
can replace that phase before the continuation observes it. Existing callers
that only await syncNow remain unchanged; the additive receipt carries the
specific read's result to the one caller that needs it.

If authorized, add durable regression coverage for this exact pending/queued
window while retaining all five existing deep-link cases/assertions/budgets,
verify with this identical real-request fixture fault and without injection,
then restore normal deep-link classification only after proof. Product tests
and node/browser checks must also cover skipped/thrown/account-change receipts
so an uncompleted read never reports an absent record. No test-maintenance or
budget exception is proposed. Land separately through check/queue and retain
ownership through exact-merge terminal results.

No source file has been patched. The patch applies cleanly to the examined
source; syntactic/static validation is proposal evidence only, not repair proof.
The owner must decide whether to release these two backend paths plus the narrow
regression/classification work. Shared editor/save/store/router/preferences/CSS
remain otherwise reserved. No independent Phase2 acceptance, #1466 closure,
Step6/Phase3 or reservation release is claimed.

All disposable test/helper/workflow instrumentation was removed after this one
fault run; its exact diff is preserved in diagnostic.diff.txt and at immutable
b5d0b180. Product source, configured tests and workflow now compare byte-identical
to the examined base. The first proposal-only semantic check ran before this
worktree had dependencies and failed with missing-module diagnostics; that is
setup failure, not product/patch evidence. After ordinary locked npm ci, the
same unapplied candidate was checked through an in-memory TypeScript compiler
host (candidate text supplied from /tmp, repository source left unchanged).
Its result is recorded in proposal-static-check.txt. This is static compatibility
checking only; no repair execution or passing repair verification is claimed.

Inline receipt review checked exact original failure/signature, both actual
fixture writes and completed-pending→clean timeline, ready team state, artifact
hash/counts, source restoration and the explicitly unapplied proposal. No receipt
finding remains. Simplification ran inline with no additional change. Reached
static gates and configured-verdict27 tests pass; these verify documentation and
restoration only. Overall deep-link repair remains FAIL pending the product
owner decision and subsequent implementation/fault/normal/landing proof.
