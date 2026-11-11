The editor can repeat or yoyo a property or a whole layer on its own ruler. On-air loops keep moving through Hold, release the visible pose when the operator leaves the cue, and replay consistently in the browser exports.

**Risk** Loop timing and ownership affect live cue transitions and browser output. The interpreter capability installs on an explicit recognized loop edit. The legacy interpreter and SVG group paint have independent regression checks.

<details>
<summary>Details</summary>

GitHub runs the build and every test this change can affect before the queue merges it.

- Author repeat and yoyo loops on artwork tracks
- Track which cue owns the pose when a loop leaves
- Use the last rendered track when leaving a loop

</details>

This completes the loop portion of #774. [E2 phase notes](docs/work-specs/editor-r1-5/e2-notes.md) record the verified E1 base, revert command and compatibility decisions.

**Checks on `9c5ae1926d6662e0e2806f3233be85b83972f166`**

- Inline review and simplification covered all 43 changed paths from the verified E1 base. Exact-head checks passed 9 static gates, 223 tests across 26 targeted Node files, changed-file ESLint, TypeScript j-5230, merge compatibility and `sideEnds`.
- The bundled GSAP oracle covers property and layer loops, backwards seek, holds, settling, speed changes, finite Out, repeated public styled Stop, replay and one-cue self-entry with parallel dispatch. The pinned ordinary, legacy-loop and legacy-styled-loop interpreter output matches E1 byte for byte.
- Exact generated OGraf Both packages matched public Play and Continue timing in manual and none. Play took and advertised 1,300 ms. Continue took and advertised 400 ms for Fade, 600 ms for default Fade, 0 for Cut and 900 ms for the unstyled loop. Both timed OGraf routes kept one entrance and started Out at 2,000 ms for styled Play and 3,900 ms for the measured entrance. Timed styled Play advertised 2,500 ms including Hold and Out.
- The normal motion-preset writer and readback confirmed Fade kept the X keys and loop range and saved a 1.10-second cue. Slide Left replaced X and saved the usual 0.80-second cue.
- Windows Chromium j-5214 passed 134 cases on `e19b3815` across base edits, keys, loop and Out parity, the animation engine, groups, Pen and Image. The exact-head five-spec Windows selection is j-5229. It is waiting for normal scheduler RAM admission.
- Windows Studio 0.17 j-5193 rendered two Position X passes and restored the original pose while the composition ruler stayed parked. The pinned comparison is in the phase notes.
- Measured CI capacity completed with a warning at 173.1 of 210.7 table-minutes. The maintained Out and parity spec took 0.98 minutes, up 0.37 minutes. The branch adds no exception. Local Windows E2E protection stopped on the known dependency symlink permission error (#2373). The same `jc01` catalog fingerprint reproduced on the E1 and E2 Windows controls (#2372).
- The preceding [5b00e271a CI](https://github.com/NoaCG/NoaCG-Studio/actions/runs/42998288984) passed all 15 Chromium shards and all four configured stacks plus their verdict, including Out and loop parity, base edits, motion presets, editor keys and OGraf lifecycle. The Build Node gate caught 30 planner failures from one unreadable test helper. The fixture-only change replaces the generic arrow with an equivalent named function, and all 30 exact failed cases passed locally. The real fixture still selects the Out spec and unrelated paths select none. Test cases, assertions, planner and limits are preserved.
- Previous GitHub CI and j-5202 retain four base-values strict-locator failures at `cb0f639ab`. The scoped repair targets the named panel and keeps the original assertions. [Previous CI](https://github.com/NoaCG/NoaCG-Studio/actions/runs/42964189955)
- Fresh full independent second opinion **AGREE, grade A** on this exact 43-path diff. Independent checks covered the pinned planner reader, 28 bundled GSAP cases, five manifest assertions, app and API type checks, changed-file lint and dependency analysis. No introduced finding remained.
- The [exact-head CI gate](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43001220919/job/130466210042) passed. Build, Factory, Catalog, all 15 offline Chromium shards (210 selected specs), all four local configured stacks (all 64 specs), and the configured verdict passed. The CI test-protection check counted 319 specs, preserved every existing test, and found four additional cases in the maintained Out and parity spec.
- [Exact-head Codex review](https://github.com/NoaCG/NoaCG-Studio/pull/2374#issuecomment-6787338576) completed with no findings and no unresolved threads.

<details>
<summary>Rules</summary>

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

</details>

**Rules found after coding**

- Out starts from the channel's last rendered loop pose, including a completed finite loop and a loop inherited through a cue that never wrote the channel. An ordinary writer that paints later owns the channel even when its value is equal.
- The editor's committed composition seek, Snap, and styled composition use the same ownership rules. The local probe leaves ownership with the composition. Legacy range-less loops claim a channel only once they paint and restore the previous writer on backward seek.
- An old timeline cannot arm the timer for a replayed state. An event that sends the main group Out cannot restart a parallel group in the same dispatch. A cue's explicit hide stays at the cue's wall time when a running loop changes rate.
- An exact upgraded runtime includes its earlier finite loop children in the finite cue end. Legacy source and durations outside that upgrade keep their earlier behavior.

- The pending timer follows the finite endpoint after a supported running rate change. Suppressed seeks keep callbacks suppressed.
- Pen and Image place artwork on the composition clock within the stored cue's visibility bounds. Placements in a repeat-only tail or its arriving flag refuse atomically. Ordinary flags keep their earlier behavior.
- An editor loop keeps unrelated anchor edits eligible under the exact interpreter. Ranged timing remains representable after millisecond rounding.
- Repeated public Stop preserves the active styled exit, including its time and callbacks, through both phases. Exact E2 OGraf packages time Hold from the live finite entrance. A shared one-cue self-entry restarts its loop and lets the matching parallel event run.

- Manual and none OGraf metadata use the selected canonical Play or Continue style when it replaces a loop that extended the advertised cue. Dynamic custom actions, unstyled cues and legacy metadata retain their established estimates.
- A motion preset keeps the stored end of each ranged track it leaves in place. A preset that writes the same channel still replaces that loop.

