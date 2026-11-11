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

## Reassessment after three review rounds

The third review graded `98bae714744b40bebb20b0bb60e89587a8744696` B. A fresh read-only reassessment confirmed that a required vMix media check must contribute a result even when output preparation times out or the read fails. The stamp checks the same source and active file references captured at the press. Late results belong to their original run. The verb bar and destination line use the same eligible folder members as the Take plan. Studio preserves exact nonempty Bridge names and reports the Bridge's typed uncertainty while the media root is being saved.

Normal [CI run 43004109036](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43004109036) on that earlier head failed Build when the test-protection guard could not list the unchanged exact base. The base and both adjacent candidates have the same `e2e/_keys.ts` blob, and the two candidates have the same E2E tree. The previous Build passed. An isolated Windows control ran the guard's own `listCounts(base, null)` on exact base `e9b0c550082c540c925e2cce25ffdee093d2d7b3` and listed 2,770 tests across 319 specs. The control checkout was removed. The failed run remains in the record, with the guard and CI policy unchanged.

## Allocation and rollback

Codebase-health #2285 is closed. Editor #2374 and live-publishing #2376 have no overlapping paths, and #1967 records that the cf13 merge hold ended. The current shared Take/verb owners are used for adapter checks and existing CasparCG gates.

After landing, revert the merge with `git revert -m 1 <V4 merge SHA>` through the merge queue. The item field is additive and needs no database migration.

## Reassessment of uncertain Bridge replies

The fourth review of d041c1ca reproduced two cases where a sent request could change Bridge or vMix while Studio still trusted its previous reading. A fresh read-only Codex Cloud reassessment reproduced both on the exact draft and confirmed the shared rule. An unknown outcome retires the affected evidence until a fresh reading or accepted action establishes it again.

A malformed 401 or 403 retires the old cue's ownership of its player. A genuine token or origin refusal keeps it. An uncertain folder choice invalidates outstanding folder reads in the same pairing across tabs and leaves the selection unconfirmed. The same invalidation applies when the choice reply is lost or malformed. Cancellation and definitive refusal keep the previous reading.

After #2380 landed as c0bc989f, the merge retained both sets of tests and carried the current pairing guard through the new action wrapper. The new Windows Node regressions reproduced both failures before the repair. The tests cover genuine refusals, old Pause, Resume and Out after an uncertain replacement, successful Take recovery, and fresh folder reads after an uncertain publication.

The independent review of 4e0f1a64 reproduced unexpected target errors that the chooser could not have returned and a repeated health request on known vMix media actions. The chooser now validates its own error shapes before the generic target rules. A paired Bridge whose strict health reply established vMix media support receives the action directly. An uncertain action discards that capability observation, and a missed reply can trigger one diagnostic health request without resending the action. The current pairing and ownership checks still guard dispatch and acceptance.

The independent review of 5ae2d18c reproduced an older health reply reviving capability after an uncertain action or a newer negative reply. Strict health observations now belong to the pairing entry and are ordered by request. An uncertain action retires the entry, and an earlier reply cannot replace a newer observation. The direct action still checks current authority immediately before dispatch.


## Pairing changes while Settings is open

The independent review of 6fa491f8 verified both capability races and reproduced a stale Settings press reaching the previous Bridge. A fresh read-only reassessment also reproduced the originating Bridge missing folder invalidation if an already-sent chooser reply settled after the initiating tab switched away.

Both Settings entry points now observe saved pairing changes. A chooser press requires its displayed pairing to match current storage immediately before dispatch and is never transferred to a new Bridge. A completed or uncertain choice invalidates readings for its originating Bridge. Settings reads the folder again from Bridge instead of folding the chooser reply into the newly displayed pairing. A picker also checks the pairing before sending its list request, so a switch back cannot admit rows from a request that used the intervening pairing.

The next exact review of 5ccb5151 reproduced a delivered switch away and back that never reached the production binding, and a Settings path remaining displayed after an uncertain folder publication. The read-only reassessment distinguished pairing changes from folder changes. One delivered pairing transition now retires the old player binding, pending status, strict capability and media reads synchronously, even if both credentials match again by the next render. A folder change only retires media readings. Settings leaves the path unconfirmed until a fresh Bridge read establishes it. File checks compare the expected pairing and revision before each nested read and before accepting a result.


## All out after leaving a production

The exact review of c4878797 reproduced a second player continuing after an accepted All out when the operator navigated away during the first cut. All out captures each player instance and its pairing at the press. Only those cuts can finish after navigation, and a pairing change or new owner ends that authority. Bridge checks the captured instance against the reconciled player in its mixer turn before issuing a function. A distinct guarded Out verb rejects on a Bridge that lacks the guard, even if a previous health reading advertised it.

A genuine uncertain player action or Bridge deadline preserves the Bridge's detail while retiring the old player reading. V4 has no Bridge version or release. The next planned Bridge release is V5.

Dispatch checks the captured owner. Reply handling checks the pairing, so retiring an uncertain owner does not hide the Bridge's error. A successful cut on the other player does not overwrite that error. A late status probe can use the latest strict observation in the same pairing. A superseded action probe still cannot authorize a send.
