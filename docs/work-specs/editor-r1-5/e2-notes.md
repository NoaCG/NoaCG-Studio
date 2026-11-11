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
arriving endpoint before restarting.

In the public Studio 0.17 standalone editor from
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`, Windows Chromium job j-5193 added a
rectangle, selected its Position X track and opened Local property loop.
The loop used three linear keys over 25 frames, six frames of phase offset
and two passes. The rendered x advanced from the base of 100 through the
two passes, held at 340 and returned to 100 when Stop preview was clicked.
The composition ruler stayed at frame 0. The screenshot showed the moving
rectangle and the property editor beside the parked ruler. The executed
binary's SHA-256 was
`88836062eab024aac85e5f71400bcf2e198ca09f12447fe4c52ebc1e7473cebd`.
The work spec pin is five commits ahead of the release. The compared
`TimelinePanel.tsx`, `Stage.tsx` and `loopAnimation.ts` files are unchanged
in that range. Studio's Preview button runs its elapsed clock. The NoaCG
browser cases also seek the independent ruler backward, use repeat delay
and yoyo, and apply the loop to two tracks on the same layer.
[Executed Studio editor](https://github.com/zerodensity/ograf-studio/releases/tag/v0.17)
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
the installed property when there are no shared layer settings. j-5189 passed
all 61 targeted browser cases after the change.

The second final review graded
`310829a53171a35a0e9204a4184cd974ff9dc68b` B and reproduced three related
ownership failures. An equal value can be the result of a later authored
track. A completed loop still owns its last value, and a legacy loop that
left before its first key has not painted a sample. Out now reads committed
track ownership on the actual rendered element and channel, including
CSSPlugin aliases and separate scale axes. Canonical Snap and styled swaps
apply that ownership as they compose. Preview-only timelines do not adopt it.

A retired timeline can no longer arm a timer for a replayed state. A shared
operator event that takes the main group Out ends there. An explicit hide
uses the hide tween's current position on the parent clock, so slowing a
loop child does not shift that cue-level hide in wall time. The 18-case
bundled GSAP oracle covers all three families, including both linear and
machine finite Out, old and fresh timer callbacks, and GSAP root updates
through the hide boundary. The editor's committed composition seek uses the
same ownership record for preceding and current cues, including Out from
a parked flag after a nonwriting cue. The independent local ruler remains
a probe and cannot install an Out pose.

The third final review graded
`58a2927a7043e38eb765c652206c3886a5b597ca` B. It confirmed the
editor composition gap and showed both possible write orders on one
channel in valid parallel groups. It also measured a mixed legacy and
ranged cue whose preview settled too early. The independent reassessment
verified that bundled GSAP's identity modifiers see real element/channel
writes even during silent seeks. The Chromium probe j-5196 confirmed
which alias keys reach those writes and verified custom properties and
pivot accessors.

Committed timelines now publish only the paints they actually make.
Temporary local probes keep their writes private. Legacy delayed
children restore the previous writer when seeking back before their
first paint. Explicit hides are ordinary writers and follow their own
tween clock. The upgraded editor ruler and OGraf metadata include the
finite range-less children, even if the last ranged loop is removed.
Untouched legacy documents keep their earlier durations and source.

The expanded 21-case GSAP oracle advances the root clock through both
parallel write orders and checks the previous owner after a suppressed
backward seek. It also checks the common 1.8-second endpoint and x = 20
for an upgraded cue with a range-less yoyo and ranged opacity loop.
Browser job j-5195 verified the bridge handoff for inherited and terminal
loop samples at Out. The maintained browser parity case also checks the
1.8-second editor flag, the rendered terminal pose and OGraf metadata.

The full independent assessment graded `6add1f4ea149ceca6f745268a1200f7a537939de` A.
It identified an OGraf import that crossed the export dependency boundary.
Dependency Cruiser reproduced the violation. OGraf now reads the same exact
capability predicate through the existing animation migration entry point.

Codex's PR review also caught two template imports that crossed the nested
template contract, and key moves that used the shorter stored cue clock.
The shared clock literal and range detection now live in the model. Key moves,
clipboard positions and the selection after a move use the ruler's cue starts.
A move into a repeat-only tail or across a flag that would need a key in that
tail refuses before changing source. Keys within authored ranges keep their
existing edits. A terminal visibility span reaches the derived flag, so its
continuous layer stays on the arriving cue at that boundary. Legacy Out still
uses its finite authored duration.

The review of `d874c51f18911cbc59eb1c358d8ea9a77b1da02e` reproduced
an Edit loop disclosure that was remounted by each composition tick.
Entering the local controls parks the composition. A local sample also
parks it, and starting composition Play restores any local probe. The
disclosure now stays mounted within its selected cue and layer. Closing
it or changing the source clears the local readout. The maintained
browser journey exercises Play followed by a loop-ruler key. Its covers
header includes the model clock, verified by the affected plan.

Windows j-5199 passed 74 cases and found one existing SVG test with a
selector that matched both Inspector disclosures. The test now opens
Edit base values by its visible name. All of its source and rendered
position assertions are retained. The focused old-code job j-5200 also
showed that the loop disclosure closed before its settings could be used.

GitHub CI 42964189955 and Windows Chromium j-5202 both found four base-edit
cases whose shared helper selected both Inspector disclosures. The repair
selects the exact base-values summary. The input actions and assertions are
unchanged. Windows Chromium j-5204 passed 54 cases across the full base-edits,
keys and maintained Out/loop parity specs.

The independent review on `b041b4a5b8f362abeed7b14333204b2ec0ad9701` found
two product defects. Flat siblings widened or blocked Whole layer selection,
and flattening an existing ranged loop left invalid motion in source. Whole
layer now uses only tracks whose authored values change, and ranged-loop writes
use the same check. Legacy range-less tracks keep their previous behavior.

The same review found that changing a finite loop’s running rate left a state
timer at the earlier endpoint. A .5× change at 0.35 seconds preserved x = 60
but entered the next state at 2.31 seconds with x = 33. At 2× the finite cue
settled at 1.30 seconds but the timer still armed at 2.10. The pending GSAP
callback now follows the finite endpoint. The oracle checks the 3.85-second
and 1.30-second boundaries, an indefinite sibling, the authored delay and
suppressed settling.

The full review of `1bef2427eb0b7a3795c7d0404a8723560616e496` graded it B.
Windows Chromium j-5206 passed 101 existing affected cases. The focused
pre-repair Chromium probe j-5212 then reproduced three additional defects.

- **Composition placement.** A finite loop shifted Reveal from 1.30 to 2.10
  seconds. Pen and Image at 2.20 both wrote only an Out span at 0.50, while the
  equivalent plain cue wrote Reveal at 0.10 and the full Out. Both tools now
  use the same visible cue starts as key edits, keep authored span limits,
  and refuse when a placement would have to begin in the repeat-only tail
  or on its arriving flag. An ordinary arriving flag keeps its existing
  final-millisecond behavior. This is the second derived cue-clock repair.
- **Unrelated anchor keys.** An ordinary anchor key could be set, copied
  and pasted before the loop edit, then all three operations refused on
  the same unrelated artwork. The exact loop interpreter now keeps those
  edits eligible while retaining earlier sequence and pivot guards. This
  is the first repair for this family.
- **Finite stored numbers.** Forever with a finite input delay of `1e306`
  wrote `Infinity` after millisecond rounding, which made the literal
  unreadable. The writer and ranged parser now check that stored timing
  values survive serialization. This is the first repair for this family.

Windows Chromium j-5213 passed the maintained authoring journey with both
writers rendered hidden at 2.16 and visible at 2.24, the unrepresentable
placements refused, unrelated anchor set, capture and paste preserved, and
an overflowing delay refused before writing. The 26-case Node oracle also
passed, including two document speeds, the ordinary flag and older
range-less data before and after a runtime upgrade.

The next full review of `e19b3815317cd6820a11fcb6601e82f4a751c66e`
graded it B with one finding in the repeated styled Out family. The exact
public Stop wrapper is byte-identical to E1. E1 built a second fade when
Stop repeated at 0.10 seconds. E2 kept one exit, but the same wrapper
killed its root tweens. In the pinned bundled-GSAP probe E2 held opacity
at 0.666667 through 0.20 seconds and jumped at 0.30, instead of advancing
to 0.333333 at 0.20. The earlier oracle called the internal builder.

The second repair for that family keeps the native GSAP style painters
paused and detached and lets the public timeline drive both phases. Its
swap, style ease and callback suppression keep their original timing.
Only the E2 style path for Stop and an authored main Out uses this
protection. The legacy interpreter and the Stop wrapper are unchanged.
The 27-case Node oracle covers the public Stop and Play, both phases,
silent settlement, Snap and the existing cut.

The full review of `80f4db28701217c31a15adafd8f3bf7d8690b004` graded it B
on a timed export parity defect. Exact real-time and offline OGraf ZIPs
kept a valid explicit one-cue machine at one cue. Both emitted a null
entrance duration and re-entered the runtime to measure it. That second
entrance retired the visible ranged loop, and the probe then killed its
replacement. Both modes stayed at x = 20 from 0.35 to 0.60 seconds.
Forever scheduled the 700 ms hold immediately. The finite case scheduled
Out at 2.80 seconds but lost the same motion. The prepared linear control
already added a second cue and moved from x = 60 to x = 85.

The first timed OGraf parity repair takes the finite entrance from the
known E2 interpreter for a valid one-cue machine. Its real-time and
offline wrappers keep one running entry and start the 700 ms hold at
the finite boundary. Legacy and unreadable duration fallbacks and the
manifest stay as authored.

The full review of `0c9a1d6fe9694030c8c99e4299c37c5abcfe0a44` graded it B
with two further boundary cases. Exact ZIPs showed that the first timed
OGraf repair used the stored cue clock even when Play chose another
timeline. With a 1.30-second styled Play and a stored loop reaching 2.10,
both OGraf routes waited 2.80 seconds. E1 and the overlay waited 2.00.
With a measured 3.20-second entrance, OGraf again waited 2.80 while E1
and the overlay waited 3.90. The second timed export repair reads the
active finite end after Play in both modes and avoids rebuilding a known
E2 entry. The deterministic styled timed Play manifest reports 2.50
seconds including Hold and Out, as in the matched E1 control.

The second shared-dispatch ownership repair distinguishes a real last
Out after In from an explicit machine's only In waypoint. On the
pre-repair E2 source, a shared self-entry event left both groups off
and the main artwork stayed at x = 20. With a distinct Out control,
both groups entered and advanced from x = 20 to x = 85. The E1 one-cue
control mislabelled the main pointer but kept both writers moving. The
new public oracle checks main and parallel re-entry, the retired old
writer, real Out and built-in Stop followed by replay.

Windows j-5218 passed 65 cases and retained two new browser failures.
The focused diagnostics j-5220 and j-5221 isolated the styled timeline
identity and the non-real-time load. j-5222 reached public offline seek
after isolating browser clocks, then exposed a stale canvas in the test
read. The maintained browser checks now sample a running public clock
and read the current offline frame after each seek.
