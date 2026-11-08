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
- An unresolved personal failure stays visible through the same session's
  pending and in-flight retry, a valid refresh for the same account, actual
  network loss and route changes. A retry request or completed pass does not
  confirm the current revision. Only the controller's confirmed Synced state
  clears an unresolved failure within that session.
- A different authenticated account retires the prior personal failure even
  while the old durable library is still on screen. Expiry or session loss
  replaces the failure with the existing paused state and Sign in action.
  Deliberate sign-out retains its current behavior. Reauthenticating the same
  account starts fresh and stale failure events from an earlier session cannot
  revive its notice. Team error reporting and all controller scheduling,
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
   laptop sizes. Escape from the focused sync disclosure closes it, returns focus
   to Sync and leaves editor playback active. The visible notice leaves the lower
   editor reachable. Carry the cumulative editor and executable output checks with
   their original qualifications.

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

## Verification

Product and test source `9b18169feeb4ebf536496ffada01d433fe8a6b5f`. The previous
main pin is the baseline above. The implementation can be reverted with
`git revert 9b18169feeb4ebf536496ffada01d433fe8a6b5f`.

| Check | Observed result |
| --- | --- |
| Cloud status browser spec, one Chromium worker | All 15 cases passed with zero retries in 2.1 minutes. The normal editor import, edit and named Save left local Saved visible while the intercepted cloud write was pending. The late indicator explained the wait. The same global notice stayed mounted through the unanswered automatic retry and route changes. Manual retry confirmed the intended HTML and JavaScript, removed the notice and allowed an exact-source Home reopen and SPX download. |
| Library and production copies | The same journey added the graphic to a production using the control page. A subsequent linked Save updated the intended cloud graphic while the production's pooled HTML and JavaScript stayed byte-identical. The browser did not publish to a physical output. |
| Session and offline recovery | A valid same-account session update and browser network loss retained the unresolved notice. Session loss replaced it with the existing paused state and reachable Sign in dialog. Same-account resumption cleared the stale failure and confirmed the intended record. The browser used an isolated mock account and intercepted requests. |
| Laptop layout and input | At 1366×768 the local Save and cloud states both fit in the header. The retry panel fit entirely in the viewport and Escape closed it without changing the source. The screenshot was inspected with the test account's analytics choice dismissed. |
| Retained editor and account regression checks | Four selected cases passed with zero retries in 23.6 seconds. The cumulative 1920×1080 journey verified editable text, artwork, animation, cancellation, Save/reopen and executable SPX, CasparCG and OGraf browser outputs. The keyboard ownership, anonymous wizard export and current-revision confirmation/session-loss cases also passed. |
| Static verification | Targeted ESLint, client TypeScript and the eight reached repository gates passed. The unchanged Windows test-protection wrapper could not create its temporary directory symlink. Exact base/head Playwright inventories returned 13 and 15 cases. The unchanged protection functions returned zero refused or allowed removals on those inventories. The normal Linux CI gate remains authoritative. |

### Pinned comparisons

The two bounded reference lifecycle tasks passed on Windows in 17.0 seconds
with zero retries. Both used a new local browser profile and loopback-only
servers. No reference code was brought into NoaCG.

- [OGraf Studio v0.17](https://github.com/zerodensity/ograf-studio/releases/tag/v0.17)
  saved a native file using its documented download fallback. A later experiment
  was discarded, and the original saved wording rendered after reopening the
  file. The official Windows executable matched published SHA-256
  `88836062eab024aac85e5f71400bcf2e198ca09f12447fe4c52ebc1e7473cebd`.
  The [prior source receipt](../editor-leave-reliability/reference.md) pins
  inspected source `3142fc7d02934494931eb14e7dc255393e4110d0` to the v0.17 paths.
- [Eyevinn ograf-editor](https://github.com/Eyevinn/ograf-editor/tree/616841bd949e3a21137579451123f66c292543f0)
  was run at the exact pinned revision with its lockfile. Switching templates
  retained the already autosaved record. Cancelling deletion kept both records.
  Confirming deletion removed only the experiment. Reload kept the intended
  template.

Both rendered results were inspected. The comparisons cover local persistence
and reopen. NoaCG additionally distinguishes its named local save from account
confirmation. The references did not exercise NoaCG's account retry state, a
physical receiving host or owner acceptance.

## Rules found in review

On candidate `304a219ad9608f9e17f62c569e58494f4898898f`, pressing Escape with
focus on the open sync panel both closed the panel and paused running artwork.
The same browser journey returned to the editor with an unresolved notice.
At 1366×768 the editor footer ended at y=768 and the notice began at y=711.
Hit-testing the footer reached the notice. Both failures were reproduced with
the candidate product bytes unchanged.

The focused sync disclosure owns its Escape and returns focus to the button.
The shared menu still handles closing. The editor uses the existing measured
notice height to leave the canvas and timeline above the notice, without changing
their layout when the notice is absent.

## Corrected candidate verification

At `c77036773e787caafb0488c93b297b635c2e8852` the full sync spec passed all
16 cases in 2.1 minutes with one Chromium worker and zero retries. The four
maintained cumulative authoring, browser output, keyboard, anonymous export
and session-loss cases passed in 21.8 seconds with zero retries. Targeted
ESLint, client TypeScript and the affected repository gates passed. Exact
Playwright inventories now count 13 cases at the base and 16 at this source.
The unchanged protection functions found zero removals. The Windows wrapper
limitation and Linux CI requirement above still apply.

The review regression case plays the editor artwork, opens the sync details
and focuses the recovery button. Escape closes the disclosure and returns
focus to Sync while the artwork keeps playing. With the failed save still
unresolved, the same notice leaves the editor footer above it at 1366×768.
The before and after browser screenshots were inspected.

The account tests separately held two successive writes. Confirmation of the
older content left the notice visible while the newer write was pending.
Confirming the intended latest content removed it. The isolated personal
session test checked that an old in-flight attempt could not restore the notice
after same-account reauthentication. On a different sign-in it recorded the
paused notice without the retry action while the old durable library was still
loaded, before the browser replaced that document.

Two earlier personal-session probes remain failed. The first observed the
separate team recovery notice during reauthentication. The next tried reading
the old page after Chromium had destroyed its navigation context. The final
driver isolates personal recovery from the unchanged team behavior and observes
the old document's pause before navigation replaces it. The team cases still
exercise the real team controller.

For an owned rollback branch, revert the two product and test commits in
order with `git revert c77036773e787caafb0488c93b297b635c2e8852 9b18169feeb4ebf536496ffada01d433fe8a6b5f`.

## Restored session rule found in review

On `eb13eb67c3945783ab4de32b801483bd39873811`, a still-unanswered old pass
held up the new pass after the same account signed in again. The authoring
gate reopened and the paused notice cleared. The sync details continued to
offer Sign in until the old pass finished. A browser probe reproduced that
action with the candidate product source unchanged.

When a personal library is loaded, its authoring gate is open and the
controller still reports the previous offline phase, the personal chip shows
pending confirmation and offers Sync now. The pending reading follows the
existing minute wake, delay wording and network-offline detail. Synced still
requires controller confirmation. Team production status keeps its existing
reading. Cold boot, account switching, retry timing, revision ownership and
deliberate sign-out retain their existing behavior.

The inverse also reproduced during a real sign-in to a different synthetic
account. Before reload, the old library was still loaded. Its notice showed
the paused state without Retry cloud save, while the open personal sync
details still offered an enabled Sync now for that old library.

While a loaded personal library's gate is closed, its Sync now action is
unavailable. The existing paused notice keeps Sign in available. The chip
keeps the existing cold boot reading and its existing session-loss action.
The team production path and the account transition itself keep their
existing behavior.

### Verification of the two session actions

At product and test source `087d945919b2546f09308bdb17cd9e3b80b1fd1b`, the
focused browser probe passed both boundaries with zero retries. With an old
request held, the restored personal session still showed unconfirmed work,
offered an enabled Sync now, and accepted the click without opening Sign in.
The isolated cloud then confirmed the intended latest content. Before a real
different-account reload, the old library was still loaded. Its paused notice
kept Sign in enabled and its previous Sync now button was disabled.

The full sync spec passed 16 cases in 2.1 minutes. The same four maintained
editor, output and account cases passed in 23.2 seconds. Both ran with one
Chromium worker and zero retries. Targeted ESLint, client TypeScript, the
affected gates and the 13-to-16 Playwright protection inventory comparison
passed. The six changed paths returned an empty side-ending set under the
current CI measurement rule.

To revert the product and test changes on an owned rollback branch, first
revert `087d945919b2546f09308bdb17cd9e3b80b1fd1b`, then the two commits
listed above.
