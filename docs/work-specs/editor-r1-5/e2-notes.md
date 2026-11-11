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

### Boundary and compatibility details

- Before activation the first key holds. Activation samples the chosen phase, which
  may fall in a repeat delay. For a finite loop the phase consumes elapsed time from
  its repeat budget and must precede its terminal hold. For an indefinite loop it
  is within one repeating waveform. Local zero always samples the activation
  phase. The finite ruler ends at the last pass's terminal sample after subtracting
  phase from the finite repeat budget. The indefinite ruler spans one pass plus
  delay, or both alternating passes with their delays for yoyo. Its far-right
  sample matches the activation phase except at an exact repeat restart, where it
  shows the arriving endpoint. Ruler seconds and frame nudges use the existing effective
  clock at speeds 0.5, 1 and 2.
- The authored cue duration stays a floor. When finite repeats extend it, the
  composition ruler and browser cue metadata show the derived finite end, including
  the actual terminal pose at the arriving boundary. The next cue's local data
  does not move. An indefinite repeat contributes no time beyond the authored cue
  to the composition ruler. Its phase at that finite boundary is also its settled pose.
- A styled edge still substitutes its style for destination motion and parks the
  destination's finite pose. An unrelated group's active loop keeps its phase
  during that swap and repaints its live sample after canonical composition.
  An ordinary edge, including a self-transition, stops only the departed group's
  loop. The Stop action and an authored edge into the main Out both retire all
  groups' loop writers. They take live samples for interrupted Out before any
  departing finite motion can replace those values. A styled stop keeps its
  existing style and starts with the live rendered pose.
- Existing saved loops under the exact older interpreter retain their existing
  playback on ordinary open, save and export. An explicit Apply in Edit Loop is
  the upgrade action. That document then uses finite settling and state-exit
  ownership for its loop table; untouched legacy loop keyframes, easing and
  forward samples remain as authored. Removing an editor loop leaves its keys
  and its recognized interpreter. The existing anchor and SVG group capabilities
  can still be applied after removal, with source outside the marked region intact.
- Existing structural cue split/join guards remain. A resize must preserve the
  range or, on an explicit stretch, scale its endpoints, phase and delay together
  with its keys. Refuse atomically any key write that makes a stored range invalid
  or removes its last moving segment while its loop remains. Unrelated tracks
  retain the same key edits they had before adding an editor loop.

## Baseline observations

The exact E1 baseline was clean and the worker preflight passed. On that revision the
current editor declares local loops unavailable for scrubbing and its bridge drops the loop
table when building the authoring timeline. It exposes no loop authoring command.

The baseline interpreter with bundled GSAP 3.15 and a stub DOM painted x = 60 at 0.50 s
of a 20 → 100 one-second yoyo. After Next, advancing the old In to 0.75 s wrote x = 80.
The authored finite endpoint at 1.30 s sampled x = 76, while seeking to progress 1
sampled x = 20 at the 10-billion-second sentinel.
[#774](https://github.com/NoaCG/NoaCG-Studio/issues/774)

## Verification

| Coverage | Evidence |
| --- | --- |
| Property and layer authoring, source and history | Windows Chromium j-5182 exercised the keyboard-accessible Edit loop action. Applying a property loop left opacity keys independent. Whole layer applied one range and phase to two tracks with different key times. Undo and redo restored exact animation source. Save/reopen retained the original HTML, CSS, operator field, keys and user source sentinel. |
| Independent local and cue rulers | j-5182 sampled the property and SVG layer in both directions, with the composition playhead and unrelated score motion parked. At document speed 2, Arrow Right advanced 0.04 effective seconds at 25 fps. A finite repeat extended the cue to 2.10 s without changing subsequent cue-local keys. The rendered controls and visible canvas were inspected. |
| Hold, boundaries, interruption, replay and settling | The hand-written oracle in `scripts/editor-loops.test.mjs` checked samples at speeds 0.5, 1 and 2, both directions and the repeat seam. It checked finite end and settled pose, direct and styled state exits, a parallel group's continuing loop, timer arming, live-pose Out, repeated Out, hidden unreached reveals and replay. Nine cases passed with bundled GSAP. |
| Browser outputs and live speed | j-5182 executed the simulator, SPX, CasparCG, OGraf and single-file outputs in Chromium. The same fixture sampled Hold, backward seek, no jump on timeScale change, new-rate motion, Next, Out, replay and two identical snaps. The timed browser overlay continued looping during Hold and then completed Out. |
| Legacy playback and exact source | The generated legacy interpreter SHA-256 equals the E1 reference `141e1f264ab80a20acec26cc64e9563cf234d1dbc21ea278d9089a1b2a39035c`. The oracle checked exact recognition with E1 SVG group and anchor capabilities, repeated preparation, removal, a later group capability and refusal of a custom body. The maintained prior Out, ticker speed and credits speed tests passed in the 59-case targeted Node run. |

The first Node oracle run found a backward seek before a delayed activation could keep
the chosen phase painted. Giving the lead-in its own interval fixed the failure.
The first browser job j-5180 passed the export and timed overlay tests. It found that
a local seek just after applying settings could be lost while the preview reloaded.
The controller now retains that seek until the matching preview is ready. The SVG
fixture also needed the standard imported artwork wrapper to expose its named layer
in the editor. j-5182 passed all four cases after those corrections. The combined
Windows job j-5183 passed 61 cases covering the same loop journey, the legacy
starting-soon and measured motion, existing Out behavior and E1 SVG grouping.

The fast Windows catalog check reported a `jc01` JavaScript fingerprint mismatch.
The isolated Chromium control j-5184 loaded the pinned E1 source and candidate in
the same browser and emitted the same HTML, CSS and JavaScript fingerprints for
`jc01`. All other 538 emitted designs matched the recorded catalog. CI owns the
full rendered catalog battery. The local E2E protection command reached its normal
base-checkout path and failed on Windows `EPERM` creating a dependency symlink.
The final diff extends the maintained Out and parity spec with all four named loop
cases and keeps its original cases. The standalone spec checkpoint hit the offline
growth refusal at 88%, with 0.40 minutes of unmeasured estimated growth, using
weekly report 42647874522. The cases moved to the existing spec that covers the
same Out, runtime and browser export paths. The capacity rules, existing test
assertions and browser protection checks stay in force.

### Same-task reference

Executed the public Studio `getLoopFrameAtElapsed` function from
`3142fc7d02934494931eb14e7dc255393e4110d0` and the NoaCG clock with a one-second
period, 250 ms phase and two total passes. At elapsed 0, 500, 749, 751 and
1750 ms they returned 250, 750, 999, 1 and 1000 ms in the pass. Seeking back
from 1750 to 751 and 250 ms returned 1 and 500 ms again. At the exact 750 ms
repeat boundary, Studio samples the next pass at zero and NoaCG shows the
arriving endpoint before restarting. This comparison ran the pinned clock
function. E5 owns the comparable full-editor tasks.
[Pinned Studio sampler](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/loopAnimation.ts)

## Rules found after coding

The first final review found product defects on `71d57cd9e8f767904dd529de51d4290fb7d44e55`
and graded it B. The repairs below add observed cases to the loop and export oracles.

- **State exit and Out.** A pose-only group may have no timeline at a styled swap. A loop channel
  still showing its held sample enters Out from that sample even after a nonwriting Next. Its
  remaining authored keys keep their timing. A later writer on that channel and all unrelated
  tracks keep the authored Out. Repeated styled Out keeps its existing exit until replay or Snap.
- **Visibility.** A declared hide stays effective during Hold even when an opacity loop is still
  running. An explicit visibility span controls whether the layer exists, and an autoAlpha loop
  in that span writes opacity. Seeking backward reproduces the earlier visible pose.
- **Preview ownership.** Opening Outline or Assistant leaves the local ruler and restores the
  composition sample, including when a preview reply is still owed. Reopening Edit loop
  chooses an installed property loop when the whole layer has no shared settings.
- **Finite phase.** A finite phase can begin after the first waveform and must be before the
  terminal sample. It consumes the corresponding elapsed part of the finite repeat budget.
- **Source ownership.** Legacy edits that were data-only keep that behavior for custom text around
  the original interpreter, including spans. Installing the new loop runtime still requires an
  exact recognized body.

Windows j-5188 passed 60 of 61 cases. The new Outline/Assistant regression found
that reopening Edit loop selected Whole layer for a property-only loop, hiding
its local ruler until the property was chosen again. The default now selects
the installed property when there are no shared layer settings.
