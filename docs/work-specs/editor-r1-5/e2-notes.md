# E2 local loops

The previous verified main is `8c9f2684bc419242f79f4d36e5f61fe7e5e41d1f`.
[E1 independent acceptance](https://github.com/NoaCG/NoaCG-Studio/pull/2369#issuecomment-6785538392)

After landing, revert the queue merge with `git revert -m 1 <E2 queue merge SHA>`
on a revert branch and use the normal merge queue. The queue assigns the SHA at landing.

The editor needs a local clock for repeated property and layer motion, while cues remain
operator-controlled. Complete R1 HTML/SVG loops and prove the same lifecycle and poses in the
editor and browser exports. Animated asset clips, reusable compositions, and host qualification
belong to later phases.
[Finalized phase](https://github.com/NoaCG/NoaCG-Studio/blob/f0f2e3fe0c2cc14e23b171957b6f8d18905fd434/docs/work-specs/editor-r1-5/spec.md#acceptance-coverage-and-receipt-rules)

## Rules

- Edit Loop targets the selected layer and the named cue where the editor would place a key.
  A property loop affects only its own keyed track. A layer loop applies the same range,
  phase, repeat, yoyo and pause to all of that layer's supported moving tracks in one undo.
  It keeps their unequal interior key times and holds each endpoint through unkeyed parts
  of the shared range. The default range is the selected keys' extent. Range edits must
  contain those keys and stay in the cue. Refuse a mixed layer containing unsupported moving
  channels and refuse an Out loop. Removal leaves the original keys.
- A range starts on that cue's authored clock. Phase offsets where playback begins within
  the repeated motion. Repeat counts extra passes, with an indefinite option. A delay holds
  each arriving endpoint. Exact pass boundaries arrive at the preceding endpoint. A repeat
  restarts on the following sample, and yoyo heads back from that endpoint. Finite repeats
  hold their terminal pose. The editor shows the range in seconds and can seek it backward.
- The local ruler previews the selected loop channels while the composition ruler stays
  parked. Re-seeking the same loop time produces the same pose in either direction. The
  local probe fires no calls, updates or timers and does not become an authoring pose.
  Closing it or returning to composition restores the cue sample. Source changes and undo
  discard outstanding local probes through the existing revision/request boundary.
- On air, the cue reaches its finite end, while an indefinite loop keeps moving during Hold.
  A finite repeat contributes its actual duration to settling. Indefinite loops do not
  extend the finite endpoint. Settling samples the same authored phase at that endpoint
  every time, with motion paused. An existing state timer still starts from the finite end
  and a supported loop can coexist with it. A measured builder keeps its existing timer
  guard.
- Leaving a state or linear cue retires its own loop writers before the incoming state
  can paint. Channels the destination does not own keep the live sample on a direct
  transition. The state machine still completes the departing finite sibling motion where
  it previously did. Out and replay retire loops across groups. An Out pressed during a
  running loop takes the visible live values before the first advancing frame, follows
  existing interrupted-Out rules and finishes in finite time. Repeated Out keeps its
  ongoing exit, unreached reveals stay hidden, and Play starts the cue and loop again.
- Changing a supported running loop child's GSAP time scale keeps its playhead and rendered
  value at the change, then advances at the new rate. The stored document speed remains
  the existing speed-relative conversion for future builds.
- Store settings in v2's per-track loop table with optional range and phase. Only an explicit
  loop write on a recognized exact interpreter installs the capability. Existing group
  and anchor capabilities compose in the same body. Old group paint, untouched source and
  fields survive. Opening, saving or exporting unrelated saved motion does not install
  the capability. Unknown bodies and channels are refused without a source or history write.

## Baseline observations

The exact E1 baseline was clean and the worker preflight passed. On that revision the
current editor declares local loops unavailable for scrubbing and its bridge drops the loop
table when building the authoring timeline. It exposes no loop authoring command.

The baseline interpreter with bundled GSAP 3.15 and a stub DOM painted x = 60 at 0.50 s
of a 20 → 100 one-second yoyo. After Next, advancing the old In to 0.75 s wrote x = 80.
The authored finite endpoint at 1.30 s sampled x = 76, while seeking to progress 1
sampled x = 20 at the 10-billion-second sentinel.
[#774](https://github.com/NoaCG/NoaCG-Studio/issues/774)
