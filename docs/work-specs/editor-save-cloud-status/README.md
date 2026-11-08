# Graphic editor save and cloud status

Phase 3 of the October 13 editor run, bounded to the
[October 6 repeated cloud notice feedback](../../research/editor-owner-feedback-2026-10-06.md).
The [single-device closure](../editor-leave-reliability/scoped-closure/README.md) governs this work.

## Why

On main at `4dab8e67af7d76d2e7f2cd180e36d14df9d151b4`, a signed-in author could
import a graphic from Home, draw on it, and Save. The editor displayed Saved after
local persistence. When the cloud did not answer for more than a minute, that
header still had no cloud status. Home showed the late save as Not synced with a
reason and an action.

## Goal and scope

Show the existing account sync control beside Save in the graphic editor. Keep
local Save and cloud confirmation distinct, and keep saving separate from updating
a live production copy. Reuse the shared labels, timing and retry/sign-in actions.
The app already starts account sync at boot.

Continue with one active authoring tab/device per account. Concurrent conflict
handling, the prior shared-lab diagnosis, broader editor changes, default editor
switches, owner acceptance and physical receiving-host acceptance are outside this
phase.

## Rules

- The graphic editor uses the same cloud control and recovery actions as Home.
  A device Save can succeed while the cloud copy is pending. The existing cloud
  confirmation boundary and separate live production copy still apply.
- A routine pending or in-flight save keeps the header quiet. Its existing
  delayed indicator never claims confirmation early. The first actionable
  personal sync failure makes the existing account notice visible.
- An unresolved personal failure stays visible through the same account's
  pending and in-flight retry. Starting a retry or changing routes cannot
  dismiss and repeat the notice. A confirmed sync clears that failure.
- A different account or loss of the session retires the prior personal failure.
  The existing pause and sign-in state takes over if the session expires.
  Deliberate sign-out retains its current behavior. Actual network loss does
  not count as signing out. Team error reporting and all controller scheduling,
  retry, and revision rules keep their existing behavior.

## Acceptance

1. Import and edit a graphic through the usual controls. Save durably on the device
   with the cloud write held. The local Save remains visible. The cloud indicator
   starts quiet, becomes Not synced after the existing delay, explains the wait
   and offers recovery. Routine activity and unchanged state across route changes
   raise no repeated prompt.
2. A failure, expired session or offline transition leaves a truthful visible state
   and usable recovery. Reconnect or retry, verify the intended saved record in the
   isolated backend, reopen it from Home and check the saved source and output.
   Cloud status clears with confirmation. The existing production copy stays intact.
3. Keep Save, Home, the canvas and timeline usable with status at desktop and
   laptop sizes. Check normal keyboard and focus ownership. Carry the cumulative
   editor and executable output checks with their original qualifications.

## Baseline evidence

The same isolated browser workflow on the pinned main source reproduced the
missing chip twice. Both runs found a locally Saved graphic, zero editor sync
controls, zero global notices during the delay and zero confirmed cloud graphics.
The first probe also failed after retry because its synthetic storage route
returned font bytes for an upload that requires JSON. With that fixture corrected,
only the missing editor chip failed. Home showed the delay and failure, the retry
confirmed the graphic, the notice cleared and reopening returned the exact saved
source. No product source was changed between these runs.

A third unchanged-source probe kept the cloud silent through the first
automatic retry. The account notice was present after the first failure,
disappeared when the retry began with the graphic still unconfirmed, and
reappeared at its next timeout. During the gap Home still read Not synced.
The two intended failures were the missing editor indicator and the removed
notice. Manual recovery and exact-source reopen still passed.
