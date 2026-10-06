# Studio evening reliability

## Why and goal

The 2026-10-05 production exposed ambiguous cloud saving and readiness, confusing media
ownership and clearing, attached audio that was not verified at program output, a known
Illustrator import defect, and excessive navigation for independent effects. Make the
operator's next action predictable without disturbing working output.

## Decisions and boundaries

- Account edits with a valid session may remain pending offline, unmistakably labelled.
  Expired authentication preserves pending work and suspends account authoring, not playout.
  Fetch/reconcile cloud state before treating cached account data as current.
- Preserve account scopes, team compare-and-swap conflict handling and durable browser storage.
- Cloud confirmation flushes only pending cue edits. A saved draft cannot create another
  edit timestamp or overwrite a newer teammate value; a refused write retains its draft.
- Investigate the bad video against the two working originals before claiming a file-specific
  fix. Keep timing confidence separate from ownership; provide explicit immediate slot clearing.
- Diagnostics never enter the operational cue list or change its geometry or selection.
  A known sequence-stop warning remains while its slot stays unidentified; repeated polls and
  queued-file advancement cannot erase its cause. Clearing or identifying the slot removes it.
- Attached sound executes with program graphic lifecycle. Independent effects are real audio
  cues through existing adapters, not invisible graphics or another playback system.
- Browser/host audio support requires a recorded program-output rehearsal. No deployment,
  database migration execution, server restart, automatic upgrade or studio configuration change.
- Quiz cause investigation is closed: remove non-rendering Illustrator metadata and correct
  off-canvas mapping. Keep the 512 KB budget and use consistent early eligibility checks.
- One Publish & check readiness / Check readiness action; Put on air stays separate. Harmless
  metadata must not invalidate prepared assets, and amber explains current-output usability.
- trigger-cue plays/restarts one stable cue ID, preserving selection/preview/folder progress.
  Keyboard and Companion share it; existing take-cue toggle remains compatible. No implicit
  follow-on chain, auto-repeat, typing activation or replay after reconnection.
- Production-scoped hotkeys follow computers, reject conflicts, preserve moves, clear cue copies;
  unreserved letters/digits and Shift+letter initially, existing keys reserved.
- Whole-row cue tint, icons and actual-route badge; selection and on-air state stay distinct.

## Observable acceptance

1. Pending/new edits never appear cloud-saved, including debounce, first load, expiry and failure.
   Team pending edits survive closure/expiry, reconnect safely and are scoped to their account.
   Repeated confirmations create no cue edits; saved fields follow landed teammate updates.
2. Opening the account on another computer reconciles cloud data before claiming the view is current.
3. All three actual clips have correct or explicitly unavailable timing, and Space on the selected
   live cue performs its displayed Out. Immediate clearing works even without cue ownership.
4. Unknown-item appearance/disappearance leaves cue row coordinates, scroll and focus unchanged.
   A Bridge-restart warning still names the stopped folder after subsequent polls and a queued switch.
5. Attached In/Out/step sounds reach recorded program audio on each supported host/channel, with
   silent monitors and no duplicate recovery stings. Independent audio does not replace video/graphics.
6. Metadata-heavy SVG imports fit the unchanged budget without visual loss; off-canvas fields are
   identified before mapping; editor/import/rundown share publication eligibility.
7. Amber distinguishes a freshly healthy current output with pending changes from unconfirmed or
   failed output. Checks never reload under on-air graphics and resume safe deferred preparation.
8. V/F with the next question selected fires one effect each; Space still targets that question.
   Typing, composition, conflicts, repeats, stale panel commands and reconnects cannot fire wrongly.
9. Cue types/routes remain legible through row tint and custom colors without moving row geometry.

## Evidence required before studio sign-off

Three original video files and repeated CLS/INFO readings; exact studio server/Bridge version,
consumer/channel audio routing and recorded ATEM output; student's home browser/account/time
window. Missing physical evidence is reported as not checked, never inferred from unit tests.

## Original-media follow-up, 2026-10-06

Detailed findings and the additional feature acceptance are in [Media follow-up](media-follow-up.md).

- All 15 supplied videos decode completely. Insert 2 has a significant trailing space in its
  filename. A copied test production reproduces successful playback with lost timer/ownership
  and disabled Out. CasparCG INFO preserves that space, but the Bridge trims it from file/name.
  Preserve file names and paths exactly when parsing INFO, including foreground and queued
  producers. Keep whitespace significant in identity comparisons; do not rename the originals.
- Acceptance: the captured Insert 2 INFO keeps its exact name, its Bridge instance and cue ID
  survive repeated readings beyond loading grace, and similarly named files remain distinct.
  Existing version-specific timing, transitions and XML validation continue to pass.
- A real Bridge request also reproduces a missing CasparCG adapter implementation of the
  existing `clear` verb. Complete its exact-slot CLEAR command and advertise that verb. It
  must clear foreground and queued background without cue ownership, forget that slot's
  instance/follower and leave other layers playing. Verify the full HTTP-to-AMCP route.
- Picture fitting and bulk media addition are additional requested work. Pictures should default
  to preserving proportions, with an explicit Stretch choice in the selected cue editor.
  Multi-file and whole-folder addition must preserve file identities and add the chosen files
  in one production edit. Record their compatibility and UI acceptance before implementation.
- Space Out also reproduces a transient unidentified producer and a 36-pixel rundown jump
  with the working Insert 1, independently of the filename defect. Verify the already prepared
  diagnostic relocation for accepted Out followed by a briefly nonempty, unowned INFO reading:
  cue positions, heights, order and selection must remain fixed through its arrival and removal.

## Delivery

Verified development on codex/studio-evening-reliability using repository /check. Hold the branch
before /queue-merge because landing starts production migrations/deployment automatically.
First rehearse copied productions and test accounts, record program audio and compare the three
original clips. Then use the normal merge flow for the controlled rollout, with rollback to the
last working application/Bridge/configuration. No automatic deployment during development.

## Approved release completion, 2026-10-06

The owner approved implementing and releasing the complete plan after the studio shows. This
supersedes the development-only deployment hold above. Continue on the existing feature branch,
verify with /check, land through /queue-merge, and verify the normal website/database deployment
and Bridge/CLI 0.9.0 release workflows. Preserve the previous website deployment and Bridge
binary for rollback; do not change CasparCG configuration or upgrade the server.

- Refresh rundown belongs in + Add. Flush pending edits, reconcile the current personal/team
  production, and confirm fresh cloud state. Failure/conflict retains drafts. Selection and
  scroll survive when their cue survives; refresh never publishes, Takes or reloads output.
- Move the existing team name/action into Setup. Pending and failed cloud-save notices stay
  independently visible during playout.
- Pictures default to Fit: centered proportions and opaque black padding on the same slot.
  The cue editor offers Fit/Stretch, persisted with the cue and applied at the next Take.
  Native fitting uses a held server-side scaled/padded frame, resolved through background INFO;
  failed preparation disarms its background while preserving the foreground. An explicit
  Bridge/server capability prevents an older Bridge silently stretching a Fit request.
- Media addition keeps the picker open until Done. Add selected and Add folder show counts;
  folders include descendants, respect filters, and append ordinary cues in stable path order
  in one production edit. Significant filename whitespace, routes and selection survive.
- The exact historical quiz graphic and additional owner checks are not release gates. Verify
  representative In/step/Out graphic sound, independent effects and two-browser cloud sync.
  Studio ATEM routing and unavailable historical account logs remain explicitly unverified.
- Re-run the complete build, affected browser tests, CLI/Bridge tests, guarded backend checks
  and Companion package checks. The final exact commit needs a passing check stamp and CI;
  cancelled checkout jobs are not passing browser evidence. Verify original picture shapes,
  black padding above lower layers, clear/replacement, bulk addition, menu placement, save
  failure/expiry/conflict and stable rundown geometry before landing.
