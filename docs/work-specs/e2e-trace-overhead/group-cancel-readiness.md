# Group cancellation readiness — 2026-10-19

Goal: repair the landing blocker from CI run 39250656173, shard 7, while retaining
all existing cases, names, assertions and gate limits. Acceptance issue #1466
remains open; this is engineering evidence, not independent Phase 2 acceptance.

The whole failed job 118053453243 shows `editor-groups.spec.ts:347:94` failing:
a committed resize after Escape left CSS unchanged. The other 149 shard cases
passed. A local unchanged targeted run passed, as did the automatic same-commit
retry. Neither clears the original failure. Automatic quarantine proposal #1506
was closed: the owner explicitly forbids reclassification for this attempt.

`PreviewController.previewTemplate(..., 'cancel')` queues a pose; `data-pending`
can still be false while that cancellation is in flight. Reading a handle's box
then moving to it can use the previous draft's geometry. This spec now waits for
the correlated source/assets/pose receipt and asserts the actual member rectangles
are restored after Escape and undo, before starting the next independent gesture.
It also settles the initial grouped pose before recording those rectangles.
Every prior assertion and gesture remains. Product code is unchanged.

Controlled fault injection (temporary, removed before commit): hold the first
cancel preview for up to 1500ms; on the second handle-box read capture the draft
box, release cancellation and await its receipt before returning that stale box.
This forces the same paint-between-measurement-and-pointerdown race. Queue j-0005
failed at the original CSS inequality (shifted to line 375:94 by instrumentation).
With identical injection, the strengthened test passed in j-0006 (1/1, 26.6s wall).
This is a forced matching failure and fix check, not repeat-until-green evidence.

The final uninjected case passed in j-0007 (1/1, 19.0s wall), through the
prescribed queue, five-minute cap, with no retries. The executing machine has four CPUs and 16GiB memory; the selector
allows two workers and this one-case selection uses one. Full suites and builds
remain authoritative CI. No test selection, retry, assertion, timeout, budget,
exception or quarantine file is changed.
