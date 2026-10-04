# Shared production sounds

Owner approved 2026-10-04, including the final compact disclosure clarification.

## Why and goal

Attach effects once to a production visual, share them across its cues, and execute from prepared local audio at the actual accepted graphic action.

## Decisions

- Extend existing graphic sound playback, asset storage, publication and readiness. ShowCue carries no audio configuration or bytes.
- Production-local bindings follow the current library graphic through the central resolver. Pictures bind per selected image.
- Optional In/Out, named steps, semantic quiz and countdown triggers. No historical one-shot replay; recover current loops once.
- Private immutable reusable assets, decoded before Ready. Live effects require no fetch. Hosted command delivery retains its current backend transport.
- Sounds follows all existing graphic controls, collapsed by default to one row. Expanded lists attached bindings only. Add sound chooses an unused trigger.
- New attachments enabled at 0 dB, play once. Gain -60 to +6 dB; loop only during an eligible active state. Normal previews and monitors silent; explicit local audition.
- Fade visual-owned sounds on ordinary Out; let its Out tail finish. Re-take, All Out/clear and disposal clean up safely.
- Initial limits: 20 MiB encoded/64 MiB decoded per file; warn at 128 MiB decoded per output, refuse above 512 MiB. Existing cloud quotas remain.
- Server media workflows, normalization, mixer, cue colors and full offline hosted command transport are outside scope.

## Observable acceptance

- AC-1: PNG independent In/Out, linear steps and accepted quiz selection/verdict events play from decoded buffers; refused/duplicate/restored events are silent.
- AC-2: Countdown running/pause/resume/reset/finish, authored warning states, fades, interruption, tails, clearing and disposal leave no stuck or duplicated sources. Warning thresholds follow declared graphic states, not a second timer.
- AC-3: Hundreds of cues share one configuration; different production copies and individual images edit independently while audio bytes deduplicate.
- AC-4: Save/reopen, duplication, sync, publication and export/import preserve bindings, assets and deterministic content revisions.
- AC-5: Every enabled asset is available, verified, decoded and playable before Ready. Missing/corrupt/changed/blocked assets fail visibly and recover after repair; prepared effects perform no network fetch.
- AC-6: Closed Sounds is one row, None or attached count including disabled. Expanded shows only attached bindings; Add sound lists unused triggers. Slider/numeric gain, change/reuse/upload and remove work independently.
- AC-7: Substantial quiz fields, choices, actions, Update and recovery remain usable and positioned above Sounds with no sounds and with attachments, closed/open, desktop/narrow layouts.
- AC-8: Real receiving-host rehearsal records version, routing, picture/sound skew, gain and recovery. Browser/package evidence does not establish physical host support.

## Phases

1. Assets/resolver/publication/preparation and playback proof.
2. Semantic events and lifetime/recovery.
3. Secondary controls and persistence/package regression proof.
4. Receiving-host rehearsal. Unavailable physical equipment is recorded explicitly, never marked passed.

Playback was proved before exposing controls. These production assets, preparation, publication and controls form one atomic landing, with the phase proofs recorded together under /check and /queue-merge. Earlier graphic runtime and editor phases have already landed separately. The parallel health session owns its specification and fixture helpers.
