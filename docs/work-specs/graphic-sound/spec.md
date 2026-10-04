# Graphic sound attachments

Owner request: 2026-10-04, implement the attachment proposal for the upcoming production in
verified phases. Sources: [research](../../research/playout-audio-2026-10-03.md) and
[owner ask](../../backlog/sound-with-graphics-and-steps.md).

Why: sound must accompany the graphic's accepted move without a second operator press.
Goal: portable packaged sounds, actual execution timing, predictable cleanup and silent recovery.
Non-goals: normalization, live mixing, cue colors, changes to server audio, health-session helpers.

Derived decisions: optional `sound` on a step or transition, stable id, packaged asset path,
enabled flag, -60 to +6 dB, one-shot or loop. Transition sounds are one-shots; loops belong to
the running state's timeline, including a zero-duration inline timeline. An edge overrides a
destination one-shot; an edge into a loop state cannot override its sound. This makes recovery
unambiguous from the existing state snapshot. Pause leaves the running state and stops the loop;
resume enters it and starts one loop from its beginning. Levels stage for the next execution.
No offsets or new clock semantics. No defaults are added to existing graphics.

Phase 1 proves playback, persistence, packaging and recovery with a linear graphic, branched
quiz and countdown. Phase 2 adds the common Sounds authoring controls and explicit audition.
Each completed phase runs `/check` and `/queue-merge`; physical receiving-host proof is separate.

### AC-1: Sound starts only when the move executes

In, early Out, Next, accepted answer/self-transition and timer moves play once. Refused events
play nothing. Styled edges replace destination one-shots. Parallel groups remain independent.

### AC-2: Loops and interruptions have bounded lifetimes

Leaving running, pause, stop, reset, replacement and disposal stop their sounds. Repeated Take
and the same attachment restart without stacking. Normal Out stops prior sound and may finish
its own one-shot tail. No loop on Out. Resume starts one countdown loop.

### AC-3: Recovery is silent for historical one-shots

Snap, skipped animation, boot replay and refill never play historical one-shots. The final active
state restores at most one loop per group. Duplicate delivery stays on the existing applied-once road.

### AC-4: Assets and settings survive the production path

Save/reopen, step edits, packaged export/import and published snapshots retain descriptors and
sound bytes. Missing assets, invalid descriptors and stale runtimes refuse publication;
undecodable enabled sounds refuse output readiness and Take.
OGraf is explicit about real-time audio and refuses non-real-time audio export.

### AC-5: Shared controls preserve silent authoring

Attach/remove, enable/disable and level controls use the same descriptor for steps and edges.
Previews and the PROGRAM monitor stay silent unless explicitly auditioned. Existing graphics
without attachments and independent server audio cues keep their behavior.

### AC-6: Evidence distinguishes runtime proof from receiving-host proof

Measure scheduling and gain with real browser Web Audio, verify cleanup/recovery and packaged
runtime isolation. Record browser/backend limits honestly. OBS, vMix, CasparCG HTML and external
OGraf renderers need physical audio-routing, recorded skew and scene/unload rehearsal before use.
