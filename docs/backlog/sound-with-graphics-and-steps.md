---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: advanced
note: "2026-10-04: graphic playback/editor controls landed; codex/playout-shared-sounds adds production-shared PNG, quiz and state bindings, prepared private assets and compact Playout controls. Browser and package proofs are recorded in its verification. Hosted migration/deployment and physical receiving-host rehearsal remain to be confirmed."
asked: "a good way to trigger sound together with graphics (swoosh, clock tick, correct and wrong answer); maybe attachable to individual animation steps, but research how before building (paraphrase)"
---
# Sound with graphics, and possibly with animation steps

**Filed:** 2026-10-01. **Source:** the owner's studio-day feedback, point 2; expanded by playout
feedback point 3 on 2026-10-03.

## Why

Quiz reveals, clocks and stings need sound that starts exactly with the graphic's move. Without it
an operator presses two things at once, and the sound and the picture drift apart.

## What exists

An **All together** folder takes every cue in it with one press, server cues and graphics alike
(`togetherPlan` in `src/control/serverPlayout.ts`; `docs/CLIP_PLAYBACK_PLAN.md`). A server audio
cue in it keeps its own level and ending, loop included. That covers "swoosh with the lower third"
and "ticking with the clock" today, on the Bridge path.

## Attachments implemented; receiving-host rehearsal remains

[Graphic audio research, 2026-10-03](../research/playout-audio-2026-10-03.md) confirms the code
and existing server measurements, proposes optional sound attachments at actual step/transition
execution, and records packaging, migration, level, timing, output and recovery requirements.
The [implementation spec](../work-specs/graphic-sound/spec.md) records the two verified phases.
Playback is implemented and measured in Chromium with actual decoded buffers, including a
linear graphic, branched quiz and countdown. Shared Sounds controls attach or remove a sound,
enable it, set -60 to +6 dB, and audition it in the saved graphic or editor. New attachments
start disabled; previews and the operator monitor stay silent.
The [receiving-host checklist](../acceptance/owner-queue/graphic-sound-host-rehearsal.md) records
the audio-route and recorded-skew rehearsal still required on the venue's hosts.

The [production-shared implementation](../work-specs/playout-shared-sounds/spec.md) adds Sounds
below the visual's existing Playout fields and actions, collapsed by default. New production
attachments start enabled at 0 dB. Bindings apply to every cue of that visual in the production;
the [verification](../work-specs/playout-shared-sounds/verification.md) records PNG, quiz,
countdown, preparation/recovery and package proofs with remaining host limits.

Audio/video Level is -60 to +6 dB per cue, applied on Take through the file's audio filter.
All together sends server cues sequentially, then graphics concurrently; it does not guarantee
graphic/sound synchronization. Keep current folders and server audio cues unchanged.

[Feedback followups](playout-feedback-followups.md) owns later normalization and Setup colors
and maps all seven new feedback points to their existing night-wave rows without duplicate tasks.

## Questions the implementation must prove

- Prove attachment execution and level in real supported hosts, including output audio routing;
  existing server-file evidence does not prove CasparCG HTML-producer audio.
- Prove timing at the actual animation start, interruption and cleanup, and silent historical
  one-shots during recovery. Keep offline audio limitations explicit.

## Evidence

`docs/backlog/rundown-cue-timing-and-automation.md` items 8 (audio cues) and 10 (linked cues);
combined controls could not reach server cues, and were removed on 2026-10-02; a folder's All
together is the one-press-many-cues route now (`docs/PLAYOUT_DASHBOARD.md` §2i).
