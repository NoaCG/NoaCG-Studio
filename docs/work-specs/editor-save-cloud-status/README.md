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
