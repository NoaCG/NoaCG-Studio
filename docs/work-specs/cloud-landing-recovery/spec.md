# Dependable cloud landing and recovery

## Problem and authority

Owner request, 2026-10-16: use the existing NoaCG environments and subscriptions to
qualify cloud landing and failure recovery in Codex Cloud and Claude Code Cloud.
Current guidance assumes no gh and permits a cloud worker to leave without a fixer.
Earlier Reviewed-rerun and session-owned auto-merge fixes remain authoritative.

## Behaviour

One shared queue-merge procedure selects operations by measured capability, retains
one functioning repair owner through late CI and base-branch conflicts, reconciles
main and rechecks the resulting SHA, and records actual landing and post-land results.
Provider details describe available tools and their limits, not inferred permissions.

## Preserved behaviour and non-goals

Only the existing merge queue writes main. Preserve assertions, gates, budgets,
review and repair limits. Focused checks and browser evidence run in cloud; full
builds and suites run in GitHub Actions. Publish no secrets or private files. No
new environment, subscription, laptop daemon or competing repair system.

### AC-1: Runtime capabilities and prior work have evidence

Use current official documentation and actual git/GitHub operations, including
failed-log access and dispatch, to distinguish supported and rejected operations.
Record which suspected defects reproduce. Layer: runtime probes and Node tests.

### AC-2: A failed check is reproduced, repaired and rerun unchanged

Read a real failed Actions log, reproduce its relevant failure in cloud, repair the
cause and rerun the same assertions. Disposable probes never enter the merge queue.
Layer: focused Node/browser checks and disposable Actions qualification.

### AC-3: Reconciliation and queueing retain the reviewed SHA

Reconcile with newer main, run check on the resulting tip, stamp that exact SHA,
and observe merge-queue entry and actual merge. Reject moved tips and surface
stale Reviewed, dispatch, auto-merge and queue-entry failures. Layer: Node and live.

### AC-4: Exactly one owner covers late failures without a laptop

Before the worker ends, record an armed cloud repair owner, including a bounded
wake for conflicts caused by advancing main. A live recovery probe exercises the
owner after the initial worker response; ownership transfers must not overlap.
Layer: provider monitor/scheduled wake and live evidence.

### AC-5: Landing results and independent Claude qualification stay explicit

Record actual merge SHA and post-landing CI/workflow results. Provide an independent
Claude Code Cloud handoff with exact probes and expected results. Claude acceptance
stays unverified until a fresh session in that prepared environment passes it.
Layer: live receipts and independent provider qualification.
