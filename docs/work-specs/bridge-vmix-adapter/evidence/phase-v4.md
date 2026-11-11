# V4 evidence for vMix clip cues in the rundown

The starting verified main is `e9b0c550082c540c925e2cce25ffdee093d2d7b3`, the independently accepted V3 Bridge player implementation. V4 implements AC-10. The vMix clip clock and reload recovery, fades and trims, sequence playback and Bridge releases are covered by later phases.

## Rules proposed before coding

- An added vMix item retains its adapter, relative media name and kind, with layer 0 and no channel. An item without an adapter remains CasparCG. A lookup, list result or fact about one adapter cannot change an item of the other adapter.
- The vMix picker uses the paired Bridge's advertised `vmix-media` capability and its folder-relative listing. Entering a subfolder asks the Bridge for that path. A late listing from a previous folder, pairing or picker cannot replace the current listing. vMix does not use CasparCG thumbnails or the typed-name fallback.
- Take, Out, Pause and Resume send the saved item's adapter and matching slot, including when sent from the existing shortcut, rundown or one-by-one controls. Audio uses the audio player and other supported media use the clips player. The current production system and pairing are checked before dispatch, including after an asynchronous capability check. A mismatch or lost capability sends no command. A failed or uncertain request does not create a new locally accepted cue and is never retried automatically.
- A successful Take replaces the previously accepted cue on the same player and keeps the other player. Out, Pause and Resume are enabled for the selected cue only while this page knows it as live. V4 uses the current session's accepted actions for that display. The page serializes commands to the same player, then rechecks which cue owns it before sending Out, Pause or Resume. A delayed command for the replaced cue sends nothing. An unknown outcome clears this page's ownership of that player until a new Take succeeds. Actions and replies belong to the current page and pairing. An old pairing cannot reintroduce its cue. The V5 clock and external or reload reconciliation remain separate.
- A CasparCG cue in a vMix production shows the mismatch and sends nothing. A vMix cue in a CasparCG or unassigned production also sends nothing. Play-through and Play next never route across adapters and V4 refuses vMix sequences before sending. All-together uses the existing member gate so a disabled member does not send. The cue editor shows NoaCG Clips or NoaCG Audio in place of channel and layer. Hold and Loop remain available. vMix capability checks gate the other clip controls, and the vMix still uses the mixer's native scaling. Unsupported vMix settings cannot silently degrade a Take.
- The Settings folder belongs to the Bridge pairing. Choosing is an explicit paired action. Cancellation and errors preserve the prior folder, and a result for an old pairing cannot change the visible folder for a new pairing. A successful change invalidates reads started before the choice and refreshes any open media picker against the new root. An uncertain choice cannot report a confirmed new folder.

The independent Rules review agreed with corrections. The rules above include its corrections for stale player controls, same-pair folder reads and the cue editor.

## Rule corrections after the first implementation review

The independent review of `2e3b09dbd91d709ff8f20fd2172f6b6eb038659c` graded it B and found three product defects. vMix readiness and metadata lookups now use exact relative names. A folder change refreshes open pickers in tabs connected to the same Bridge, while an earlier response cannot restore the old list. Folder navigation stays available if a listed child is no longer readable.

## Reassessment of file identity and late action replies

The full review of `389306ae14a3abb2ef8d7c848e3d9364c97056f0` graded it B. The fresh file-rule reassessment verified that the real Windows Bridge can echo a requested parent spelling when the directory resolves case-insensitively. The shared lookup checks every vMix ancestor by its exact listed name, and both readiness paths use the active adapter. A missing entry and an unavailable reading remain distinct. The explicit check discards results from a superseded pairing or root. A zero-frame file remains in the list beside playable siblings.

The action reply is also checked at the synchronous ownership fold. The new regression resolves an old Take, switches pairing before the fold and proves that the old cue never becomes actionable on the new connection.

## Allocation and rollback

Codebase-health #2285 is closed. Editor #2374 and live-publishing #2376 have no overlapping paths, and #1967 records that the cf13 merge hold ended. The current shared Take/verb owners are used for adapter checks and existing CasparCG gates.

After landing, revert the merge with `git revert -m 1 <V4 merge SHA>` through the merge queue. The item field is additive and needs no database migration.
