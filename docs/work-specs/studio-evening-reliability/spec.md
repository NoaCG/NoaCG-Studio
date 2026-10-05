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
- Investigate the bad video against the two working originals before claiming a file-specific
  fix. Keep timing confidence separate from ownership; provide explicit immediate slot clearing.
- Diagnostics never enter the operational cue list or change its geometry or selection.
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
2. Opening the account on another computer reconciles cloud data before claiming the view is current.
3. All three actual clips have correct or explicitly unavailable timing, and Space on the selected
   live cue performs its displayed Out. Immediate clearing works even without cue ownership.
4. Unknown-item appearance/disappearance leaves cue row coordinates, scroll and focus unchanged.
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

## Delivery

Verified development on codex/studio-evening-reliability using repository /check. Hold the branch
before /queue-merge because landing starts production migrations/deployment automatically.
First rehearse copied productions and test accounts, record program audio and compare the three
original clips. Then use the normal merge flow for the controlled rollout, with rollback to the
last working application/Bridge/configuration. No automatic deployment during development.
