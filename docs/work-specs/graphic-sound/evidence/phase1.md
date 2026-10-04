# Graphic sound playback verification

2026-10-04. Code revision: ddd2b3f4855fb3042c3250eecc46e659d90cb9ed.
Scope: the 29 playback files from review-request against e88736a7100f895ee5f7fbaf7897e219bb08d1f0.
Review and simplification ran inline. The sound runtime is one fixed ES5 helper; no second audio
command route, new clock, per-template panel, or server-audio mutation was introduced.

## Acceptance

| Criterion | Result and proof |
|---|---|
| AC-1 | Pass. All 11 graphic-sound browser scenarios passed. Actual decoded buffers start at In, Next, accepted styled/ordinary/self transitions and timer execution; refused moves stay silent. Carried Out starts at the actual exit timestamp, early Out immediately; interruption cancels a pending Out. |
| AC-2 | Pass. Real contexts/sources verify countdown pause/resume/reset/stop, loop exit, same-attachment restart, independent parallel groups, natural end cleanup, replacement/disposal and suspended-context recovery. Out stops prior audio before its own tail. |
| AC-3 | Pass. Saved current state plus historical tail restores one final loop and zero historical stings. Empty/refilled/duplicate tails and repeated snaps do not restart it. Quiet deferred Out never plays later; skipped OGraf actions suppress one-shots. |
| AC-4 | Pass. Save/reopen, step reorder/duplicate/delete, published payload and dual-package import retain descriptors and byte-identical WAV assets. Missing/malformed assets or stale runtime refuse publication; decode failure refuses readiness/Take. Corrupt OGraf load disposes its DOM/context, and retry creates one fresh instance. |
| AC-5 | Unverified in this phase. Shared controls are the next phase. Silent authoring and default silent operator stage are implemented; existing graphics receive no attachments. Existing server-folder regression scenarios pass. |
| AC-6 | Pass for honest proof limits. Chromium runs actual Web Audio and packaged OGraf components; it does not establish any venue host's audio routing, sound pressure or recorded picture/sound skew. The receiving-host checklist records the physical rehearsal still needed. |

Scheduling is observed in the executing animation callbacks and actual BufferSource.start calls,
not by simulating an operator press. The -12 dB setting was measured in an OfflineAudioContext
render of decoded PCM and matched 10^(-12/20); parallel sounds keep independent gain nodes.
This is browser scheduling/graph evidence, not a frame-accurate physical-output guarantee.

## Checks

- npm run build: exit 0; 2,431 passed, 3 skips, types, lint, dependency rules, bundle,
  prerender, client-secret and line-ending gates green. Host log: noacg-graphic-sound-phase1-checked-build.log.
- node --test scripts/graphic-sound.test.mjs scripts/log-follow.test.mjs: 14 passed.
- Queued j-3236: graphic-sound, playout-folders and playout-sequence, 65 passed.
- Queued j-3230: sound, editor transforms, exports and OGraf conformance, 48 passed and one retired skip.
- Catalog: 528 emitted variants match the intended new runtime fingerprints. HTML/CSS unchanged.
  All six prescribed gates pass: type floor 526; overflow 528; field coverage 526 (105 variants
  explicitly not driven by that probe); numerals 349; catalog specs 4; factory 317 candidates.
- Queued j-3237 final broad focus: 1,153 passed, 447 existing skips, one cold editor mount
  timed out before fixture editing at editor-pen.spec.ts:15. Its catalog calibration gate passed 35/35.
  The broad command exited 1; this is not reported as a green broad run.
- The unchanged failing scenario passed on untouched origin/main in j-3241 (4.8s test)
  and this branch with trace enabled in j-3242 (7.6s test). No retries or deadline changes
  were added. Contention during the first mount is a possibility, not an established cause.

The initial broad run had 85 failures while builds/generated-source changes were concurrent.
The final unchanged-source run and targeted checks supersede it; it is not counted as passing.
No test was skipped, weakened or given automatic retries for this change.

## Confirmed review repairs

Six concrete review defects were fixed and exercised: the resolver name collided with the inline
CSS url scanner; deferred Out could replay after quiet recovery; boot applied a saved loop before
historical replay was quiet; empty tails/repeated quiet restoration could duplicate loops;
suspended contexts needed to drop one-shots and restore only the active loop; and failed OGraf
load had to dispose partial DOM/audio before retry. Parser/writer/runtime upgrades and attachment
identity were reviewed together; unsupported custom source remains preserved and refused.

## Limits

Tests pin backend access offline and receiving-host autoplay permission on. Publication tests
exercise validation, snapshots and packaged bytes locally, not a signed-in cloud upload.
No OBS Browser Source, vMix browser input, CasparCG HTML producer or external OGraf renderer
has physical proof from this work. Each must rehearse routing, recorded skew and gain, scene
changes and reconnect. Loops restart from their clip beginning on resume/recovery. Enabled
sounds require realtime OGraf; browser codec/permission/decode failure blocks readiness.
The separate server-file audio workflow, normalization, live mixing and cue colors are unchanged.
