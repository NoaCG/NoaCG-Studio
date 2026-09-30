# R1.2a.5: cross-cue key moves and the Out flag

Base: R1.2a.4 (step authoring) landed through PR #572 as `ea2d63f9` and is live; the Steps-as-buttons
backlog item landed as `3de997ca`. This worktree branch `claude/editor-r1-2a-5-cross-cue-196874`
started from fetched `origin/main` `cfaa6019f`, which contains both. The R1.2a.4 owner-queue item
(`docs/acceptance/owner-queue/2026-09-30-editor-step-authoring.md`) has no answer yet.

Why: an author who has placed Steps needs to move a key or a layer's bar to the other side of a
flag, and to move Out, without the timeline changing what they did not touch, and without a
pause appearing between pressing Out and the exit.

Goal: dragging keys or a bar body across a Step or Out flag moves them into the other cue at their
absolute times, exactly, as one undo; Set Out and the Out flag follow the owner's 2026-09-30
decision below, including crossing out of a Next cue. Anything the runtime cannot play exactly
refuses atomically, with source and history byte-identical and the reason beside the control.

Non-goals: Steps as control buttons (`docs/backlog/steps-as-control-buttons.md`; a Step stays a
cue with a stable name so it stays possible), key copy and paste, magnets for keys, a drawn marker
for the carried part of Out, loops (R1.2c), machines, calls and dynamics (they keep refusing).

## Owner decision 2026-09-30: the exit belongs to the Out flag

The flag is where Out is triggered, and pressing Out plays the timeline from there. The exit keeps
its own timing relative to the flag, so it starts the moment Out is pressed, whichever way the flag
moves. No motion is ever cut.

- **Out later**: the exit moves with the flag and the graphic simply holds longer. This replaces
  the R1.2a.1 `CROSSES_OUT_KEY` refusal.
- **Out earlier, into still air**: the exit moves with the flag; no pause appears between the
  press and the exit (until now the exit kept its ruler time and left one).
- **Out earlier, into unfinished motion** (the entrance, or the last Step's cue): the 2026-09-28
  rule stands and nothing is cut. The unfinished motion is carried into Out and plays first, and
  the exit starts the moment it ends, with no pause. The exit cannot start while that motion is
  still playing.
- Timing designed into the exit itself (a stagger, a beat before it starts) is kept. Only the
  stillness that moving the flag creates or removes changes.
- Acceptance is no longer "In then Out matches the original on the ruler": pressing Out plays the
  unfinished motion exactly, then the exit exactly, with no pause between.

## Reproduction (before any change)

Measured in Node with `moveOutBoundary` (`src/blocks/editorOut.ts`) and `moveLayerSpan`
(`src/blocks/animEdit.ts`) at `cfaa6019f`, and by `e2e/editor-cross-cue.spec.ts` queued on the
unmodified code:

- **Out later eats the exit's own timing, then refuses.** In 2 s with its motion ending at 1 s,
  Out keys at 0.5 and 1 s (a designed half-second beat): Set Out at 2.3 s moves them to 0.2 and
  0.7 s on Out's clock, shortening the beat, and at 2.6 s throws "This boundary would cross an Out
  key." An exit whose first key sits at its start refuses every later Out.
- **Out earlier into still air leaves a pause.** The same graphic, Set Out at 1.5 s: the exit keys
  move to 1 and 1.5 s on Out's clock, so pressing Out waits 1 s (0.5 s longer than designed)
  before anything moves.
- **Out into the entrance keeps the stillness.** The `e2e/editor-out.spec.ts` fixture (In 2 s,
  motion to 1 s, empty exit), Set Out at 0.4 s: Out is 1.6 s long, the carried motion ends at
  0.6 s and the graphic then sits still for 1 s before it clears.
- **Out cannot leave a Next cue.** With a Step whose motion runs to 0.8 s of its cue, Set Out at
  0.5 s refuses ("would move #box rotation out of the Next cue", the R1.2a.2 guard).
- **Keys and bars cannot cross a flag.** The new editor's key diamonds select and ease but do not
  drag, and the operation registry has no key move; a bar body dragged across a flag refuses
  ("This move crosses a cue boundary. Cross-cue movement is not available yet").

## Decisions

Terms as R1.2a.4: cues are In, then Step cues, then Out; stored times sit on each cue's own clock
and the ruler shows stored / speed; a flag is where a cue starts. **The exit** is Out's authored
motion. **Carried motion** is what Set Out moved into Out from the cue before it, which plays
first when Out is pressed at the last step.

### The Out flag

Let the cue before Out end at E, and let its **motion end** M be the latest of: a key whose value
differs from the key before it, a bar edge strictly inside the cue, and a legacy hide (at E). A
key that repeats the value before it, and anything after M, is still air. Set Out, a drag of the
Out flag and an Out flag nudge all move Out to b (snapped to a frame, at least a frame after the
last Step as before):

- **b later than E**: the cue lengthens to b and bars that reached E reach b. Out is unchanged:
  its keys, its bars and its carried part keep their times on Out's clock.
- **b earlier, at or after M (still air)**: the cue ends at b. Keys after b only repeat the value
  held at b and go, a track keeping one key where it would otherwise empty (a cut never removes a
  track); bars that reached E reach b. Out is unchanged, except that a layer whose bar ends
  exactly at b, which the hold now shows on its arriving side, is hidden by Out from the press.
- **b earlier than M (into motion)**: the cue is cut at b exactly as Add Step cuts (crossed
  segments split with `splitKeyframeSegment`; a flat segment needs no key, and a track whose first
  key comes after b needs no copy at Out's start, since each cue holds its first value from its
  start); the motion after b up to M moves into Out at its absolute times, with explicit eases
  where the two cues' default eases differ; a track with nothing but still air after b carries
  nothing; the exit, all of Out's former keys and bars, starts C = M - b later on Out's clock,
  keeping its own timing; the stillness between M and E goes. Out stores `carried: C`.
- **Carried motion rejoins first.** When Out already has carried motion, Out's first C seconds
  become a cue of their own and are joined back into the cue before (`joinCues`, which also
  rejoins the curves the cut split, and every cue keeps its name), and the exit returns to Out's
  start, so the rule above applies to the whole motion: any two moves equal one, and setting Out
  into the entrance and back gives the source. A key moved by hand across the end of the carried
  motion refuses, since it no longer tells that motion from the exit.
- **Visibility bars follow the same rule.** The exit's own bars keep their timing from the exit's
  start. Carried bars keep their absolute times. A layer visible at the new Out stays visible
  through the carried part and then shows as its exit bars say (or throughout the exit when it has
  none, needing no Out bars of its own); the part of a bar that only covered the removed stillness
  goes. A layer visible after b but hidden at b refuses, since Out never reveals a hidden layer
  (R1.2a.1). A bar that ended within carried motion keeps its end where the ruler showed it when
  that motion rejoins: it does not follow a later Out as a bar reaching the hold does. One case
  cannot be told apart once carried and is recorded as a limit: a layer whose bar ran on through
  the stillness while its own Out bars hid it from the press plays after a round trip as one whose
  bar ended with the motion (hidden in the returned stillness instead of shown).
- **A layer outside the root** revealed by a Step fades where the exit starts, after the carried
  motion (R1.2a.1 refused this crossing instead).
- **Refusals kept** (source and history unchanged, reason beside the control): a crossed segment
  without an exact split, a nonnumeric crossed track, keys stored past the cue's end, a carried
  track whose exit starts on another value (that instant change would become motion), a layer
  hidden at the new Out by its bars, by `autoAlpha` or inside a hidden parent that has carried
  motion, a legacy hide when motion would be carried, frame spacing, and custom interpreter
  bodies. **Refusals removed:** `CROSSES_OUT_KEY` (R1.2a.1), the Next-cue guard (R1.2a.2) and
  "has its own Out bars after this hold" (R1.2a.1 moving later): each protected the old absolute
  exit timing.
- The reverse/manual prompt is unchanged: it appears whenever Out has no keys after the move.

### Out pressed from an earlier step (D02)

- At the last step Out plays its cue from the start: the carried motion, then the exit. Out
  interrupting the last cue keeps R1.2a.3's policy on the same clock.
- From an earlier step the carried motion belongs to a cue the viewer never reached, which Out
  never plays (the 2026-09-29 contract), so its time is not part of the exit either: the
  interpreter skips `carried` for Out pressed at an earlier step, and the exit starts at the
  press. A track with nothing after the carried part holds its live value until the exit ends
  (R1.2a.4's one-key hold). Machine graphics are unchanged.
- This changes the emitted interpreter. The R1.2a.4 body is frozen by content hash in
  `animRuntimeLegacy.ts`, its text kept as `e2e/fixtures/interpreter-one-key-hold-v1.js`, and
  upgrades once on preview, save and export like the bodies before it. `carried` is an additive
  optional number on a step (at most its duration), preserved by the parser and serializer.

### Moving keys across flags

- A key drag moves every selected key (or the key group pressed, when it is not selected) by one
  delta, snapped so the pressed key lands on a frame (Alt moves freely at the stored precision).
  The arrow keys nudge the focused key to the neighbouring frame on the ruler (Shift for ten), as
  a flag nudge does, so a key stored between frames lands on one; the key keeps the keyboard, in
  its row.
- **A track is one curve on the ruler, cut by the flags.** Moved keys keep their values and eases
  and land at their absolute time in the cue that holds it. A key landing exactly on a flag stays
  on the side it came from: moved later onto it, it ends the cue before; moved earlier, it starts
  the next cue; so a key dragged onto a flag and back gives the source. Every flag inside a segment
  the move changed is cut again
  exactly, as Add Step cuts: a split key there with the two slices, and the next cue starting
  from a copy of its value; a flat segment needs neither. The last key of one cue and the first
  of the next at the same value are one boundary key, and move together.
- **A key a flag's cut wrote is part of the flag.** Where a move reaches a flag, the split key an
  Add Step, a Set Out or an earlier move wrote there is joined back into its curve first (the
  R1.2a.4 `unsplitAt`), and the curve is cut anew after the move, so a key dragged across a flag
  and back gives the source byte for byte (see the limits for a layer the move empties out of a
  cue). A split key moved on its own is a key like any other; moved together with both its
  neighbours it is still the flag's. A key that only holds a track's first value at a flag (what
  Add Step leaves before a track's first key) is the flag's too.
- **Keys keep their order on their track.** A moved key cannot pass or land on a key of its track
  that is not moving, including one authored on a flag (select it too to move both). Keys cannot
  move before In or past the end of Out: a move never changes a cue's length (the Out flag and the
  end of Out do that). The moved keys stay selected where they landed, both halves of a boundary
  key included.
- **Refusals:** a track that jumps at a flag the move involves (its value there changes
  instantly, which the cut would turn into motion or lose), a move that would start a track at a
  flag with another value than the layer showed before it (R1.2a.4's join rule), a crossed
  segment without an exact split, keys stored past a cue's end, a looping track, a key moved
  across the end of the motion Out carries, and a legacy hide in a cue the move involves (the
  hide happens at that cue's end, which the move would shift).
- Eases: a key moving between cues whose default eases differ takes an explicit ease, its own or
  its old cue's default, as in R1.2a.1. Keys the move does not touch, and flags it does not
  involve, stay byte-identical.

### Moving a bar body across flags

- As within a cue, the body moves the layer's visibility in that cue and every key of the layer in
  that cue by one delta. **A bar the layer's visibility continues across a flag moves as one**: a
  bar reaching its cue's end and the next cue's bar from its start are one bar on the ruler, so the
  body moves every cue it runs through, and a bar dragged across a flag and back gives the source.
  Across a flag the bars are cut at the flag (a piece ending on the flag keeps the layer on screen
  at the hold, on its arriving side) and join the other cues' bars; the keys move as above,
  without coupling a boundary key's other half. A layer on screen throughout moves as a whole; its
  bar keeps running to the end of Out, and a move that would take a key past Out's end refuses. A
  body that neither crosses nor touches a flag moves as before.
- Spelling out a layer's visibility in a cue without bars of its own now follows the runtime: after
  a cue with bars, the layer is as that cue left it (a cue without bars never sets visibility);
  before any, where its legacy reveal and hide put it. Until now such a cue after a hidden end was
  written as visible, which a within-cue move or trim could also write (only in mixed hand-written
  source; the runtime played it hidden). Out's visibility is spelled out only where a move reaches
  it. The timeline draws such a cue the same way; until now it drew a bar the runtime never plays
  (the fixture's tag, hidden after Step 2, drawn through Out), and dragging that bar erased it.
- **Refusals:** overlapping the layer's own bars in another cue, moving before In (which replaces
  the within-cue refusal "This move crosses a cue boundary"), a key passing one of the layer's keys
  that stays, a layer that would appear only after the Out flag (Out never reveals a hidden
  layer), a legacy hide, and a body moved earlier that would take its cue's copy of a boundary key
  past the key the cue before ends on.
- Legacy reveals convert to bars first, as within a cue; the reveal marker moves to the cue where
  the layer now first appears, and joins into In only for a layer inside the root (R1.2a.4).

### Scope

- Machines, loops, calls and dynamics refuse key and bar moves as all animation authoring in this
  editor does (`sequenceAuthoringReason`); a custom interpreter body refuses.
- No operation renames a Step: every cue keeps its `name`. Stretching Out scales `carried` with
  its keys and a shorter Out clamps it; applying a preset to Out clears it.

### Limits

Each is recorded rather than fixed: none changes what plays at the settled last step, and the
first three cannot be told apart from another source once written.

- **Out exactly at a bar's end, then later.** Out set exactly where a layer's bar ends shows the
  layer at the hold (its arriving side) and hides it at the press. Moved later from there, the
  bar reaches the new hold, so the graphic holds that pose longer, where the source hid the layer
  at the old bar end.
- **A layer that blinks during carried motion into an empty exit.** Its bar reached the flag but
  had a gap inside the carried motion; with an exit of length 0 that writes the same Out as a bar
  ending with the motion, so after a round trip the layer is hidden at the hold.
- **An exit that starts by holding the carried motion's last value.** A track whose exit has a key
  at its start and a later key at the same value (a beat) writes the same Out as one with no key
  at its start. After a round trip it comes back without its first key: it plays the same at the
  last step, but Out interrupting the cue before it holds the live value until the second key
  instead of moving from the press.
- **Byte identity.** Out moved into motion and back gives the source only when In and Out share a
  default ease; otherwise the keys that went into Out come back with that ease written on them.
  A move that empties a layer or track out of a cue and back re-adds it last in that cue's list.
  Playback is unchanged in both.
- **A Linear key authored on a flag** between collinear Linear neighbours reads as a cut there,
  so a move reaching that flag joins it into the line and cuts it anew, at the line's value.
- **Out from an earlier step, in the editor and OGraf.** The exit then plays `carried` shorter
  than Out: the editor's Out playback still runs its playhead over Out's full length, and the
  OGraf manifest still declares Out's full duration as its stop duration.

## Acceptance

| Portion | Observable result | Refusal (source and history byte-identical, reason beside the control) |
|---|---|---|
| Out later | Out keys and bars keep their times on Out's clock; the hold is longer; pressing Out moves the graphic on the first frame in the simulator, SPX, CasparCG, OGraf and single-file exports. | Frame spacing only. |
| Out earlier, still air | The exit keeps its Out-clock timing; no pause after the press in all five targets. | |
| Out earlier, into motion | Pressing Out at the last step plays the carried motion exactly (the original cue's values at the same times after the flag, within 1e-3), then the exit exactly, starting as the carried motion ends. Designed exit timing is kept. | Crossed segment without an exact split; a layer hidden at Out but visible after it; a jump where the exit starts; a legacy hide. |
| Out from a Next cue | Set Out inside the last Step's motion now moves; at the last step it plays as above; from an earlier step the exit starts at the press and no carried motion shows, in all five targets and the editor. | As above. |
| Round trip | Out moved into motion and back to its old frame plays exactly as the original (Node playback model and five targets). | |
| Key moves | Keys dragged within a cue and across a Step or Out flag land at their absolute times; the editor's sampling and all five targets play the curve the ruler shows; one undo; redo, Escape and save/reopen agree; the moved keys stay selected; a nudge moves a frame. | Passing or landing on a key of the same track, before In or past the end of Out, a jump at an involved flag, a new jump at a flag, the end of Out's carried motion, a legacy hide. Shown live while held. |
| Bar moves | A bar body dragged across a Step flag moves its visibility and keys into the next cue at their absolute times, one undo; a legacy reveal (card26-style) keeps appearing at its moved time. | Overlapping the layer's own bars, before In, appearing only in Out, passing a key, a legacy hide. |
| Preserved | The editor regressions (steps, out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation, alpha-entry), anim-engine and inspector pass, except the assertions named below. Untouched keys and flags stay byte-identical. | Machines, loops, calls and dynamics refuse. |

### Existing assertions this decision changes

Each encodes the old absolute exit timing, which the owner's decision replaces, or a refusal this
phase lifts; nothing else in them changes.

- `scripts/out-boundary.test.mjs`
  - "Set Out across the last In key keeps every absolute value, both velocities at b and the
    untouched keys", "the parts it writes" and "Set Out across a Hold splits it into two held
    halves and plays as before": Set Out cuts as Add Step does so the carried motion can rejoin
    exactly, so the box's scale, which starts after the new Out, holds its first value from Out's
    start without a copy, and the title's jump, finished by then, carries nothing. Playback is
    unchanged.
  - "a move with nothing after b behaves as before, and bars no longer refuse it": Out keys keep
    their Out-clock times earlier and later, Out later no longer refuses, and a bar reaching the
    old Out is clipped to the new one with Out unchanged.
  - "Set Out moves nothing out of a Next cue until Step/Next editing, and still moves within it":
    the guard is lifted; the cases now carry the Step's motion into Out.
  - "every refusal leaves the input untouched and names what could not be kept": the Next-cue
    reveal case no longer refuses by the guard.
  - "Out moved later keeps a layer visible at the old hold visible up to the new one": Out's own
    bars keep their Out-clock times, so the "own Out bars" refusal goes.
- `e2e/editor-out.spec.ts`
  - "Set Out before the last In key moves the rest of the entrance into Out as one undo": Out is
    0.6 s long (the carried motion) instead of 1.6 s, since the entrance's stillness goes.
  - "Set Out inside a Next cue refuses until Step/Next editing, keeping source and history":
    replaced by the same Set Out succeeding as one undo.
  - "Out interrupting an In shortened across its keys starts from the live pose in" each target:
    the exit timeline it finds is 0.4 s long instead of 1.4 s; the live-pose values it checks are
    unchanged.
- `e2e/editor-steps.spec.ts`
  - "a flag drag the runtime cannot play shows its reason while held and changes nothing": Out
    later no longer refuses, so the refused drag is the Out flag moved into a Step whose segment
    has no exact split.
- `e2e/editor-keys.spec.ts`
  - "bar movement carries disjoint spans and keys, cancel and refusal are atomic": a bar nudged
    before In now refuses as moving before In starts, since crossing a cue boundary no longer
    refuses.

## Verification plan

`scripts/cross-cue.test.mjs` (build gate, beside `step-authoring`, `out-step` and `out-boundary`)
runs the pure operations and the emitted interpreter over the stub DOM: the Out flag in each of
its cases with a playback model of pressing Out at the last step (carried motion then exit, no
pause), round trips, the earlier-step skip, key moves within and across Step and Out flags with
dense ruler equality against the moved curve, bar moves, every refusal atomic, byte identity of
untouched keys, `carried` round trip through the parser and serializer, and the interpreter
upgrade. Each new guard is mutation-tested. `e2e/editor-cross-cue.spec.ts` is written first and
queued on the unmodified code: five-target playback of the Out cases and of moved keys, and the
editor's key drag, nudge, refusal, undo, redo, Escape and save/reopen, and a bar dragged across a
Step flag. Then the editor regressions, the full affected run, catalog JS fingerprints, the
catalog battery against this worktree's dev server, taste frames (card26, qz02, lt01), build,
`/check`, `/queue-merge` and the deployed `/version.json`.

## Implementation

- [editorOut.ts](../../../src/blocks/editorOut.ts): `moveOutBoundary` follows the decision. Later, the
  cue lengthens and bars reaching the hold reach the new one. Earlier, it cuts the cue with the
  shared `holdAt`, `cutTracks` and `cutBars` (explicit eases where the cue defaults differ), moves
  the motion up to `motionEnd` into Out at its absolute times, shifts the exit by the carried
  length and stores it as `carried`. `rejoinCarried` first joins carried motion back into its cue
  through `joinCues`, so every move starts from the whole motion. The R1.2a.1 `CROSSES_OUT_KEY`
  refusal, the "own Out bars" refusal and the R1.2a.2 Next-cue guard are gone.
- [animData.ts](../../../src/blocks/animData.ts): `carried`, an optional nonnegative number on a
  step, parsed and serialized after `ease`. `resizeStep` scales and clamps it; `presetApply` clears
  it when a preset replaces Out.
- [animRuntime.ts](../../../src/templates/shared/animRuntime.ts): `noacgBuildExit` skips `carried`
  for Out pressed at an earlier step (its exit starts at its first key after the carried time,
  keeping a designed beat), and the outside-root fade for a layer a Step revealed starts where the
  exit starts and applies unless the exit itself animates that layer (keys after the carried
  time; a layer whose Out keys all sit at the exit's start now fades too, where before any Out
  track exempted it). The R1.2a.4 body is `ANIM_INTERPRETER_BEFORE_CARRIED_HASH` in
  [animRuntimeLegacy.ts](../../../src/templates/shared/animRuntimeLegacy.ts), its text in
  `e2e/fixtures/interpreter-one-key-hold-v1.js`, and data with `carried` re-emits the region.
- [animEdit.ts](../../../src/blocks/animEdit.ts): `moveKeys` and `moveTrack` move keys on one
  ruler: boundary pairs move as one key, the flags a move involves are joined (`unsplitAt`) and cut
  anew (`splitKeyframeSegment`), a key landing on a flag stays on its side (`landingCue`), and
  every refusal is checked before anything is written. `moveLayerSpan` takes a bar body across
  flags through `visibleRun` and `moveLayerAcross`. `shownWithoutBars` is the one rule for a cue
  without bars, which `explicitBars` writes and the timeline draws.
- [editorAnimation.ts](../../../src/blocks/editorAnimation.ts) and
  [operations.ts](../../../src/components/editorFoundation/operations.ts): the registry's `key.move`
  (`applyKeyMove`), one undo, re-emitting a known older interpreter where Out changes.
- [Timeline.tsx](../../../src/components/editorFoundation/Timeline.tsx): key diamonds drag by whole
  frames (Alt: freely) with the registry's verdict live while held, show the landing time or the
  reason beside the key, cancel on Escape, and nudge with the arrow keys to the neighbouring frame;
  [keySelection.ts](../../../src/components/editorFoundation/keySelection.ts) `movedKeys` keeps the
  moved keys selected where they landed.
- Tests: [cross-cue.test.mjs](../../../scripts/cross-cue.test.mjs) (build gate, 21 tests) and
  [editor-cross-cue.spec.ts](../../../e2e/editor-cross-cue.spec.ts), both on
  `e2e/fixtures/cross-cue.json`; `scripts/out-boundary.test.mjs` and the editor specs named above
  follow the decision.

## Review and simplification

Review ran as one workflow of four read-only reviewers (Set Out; key and bar moves; runtime and
exports; UI, tests and docs), each followed by one refuter. It raised 35 findings; the refuters
confirmed 34 and refuted one (a preset keeping a stale `carried`, fixed anyway). All confirmed
findings are fixed except six recorded as limits above: the ambiguous blinking bar, byte identity
with differing default eases and with emptied layers, the Linear key authored on a flag, and the
editor's Out playhead and the OGraf stop duration from an earlier step. The fixes, in short:

- Set Out: the outside-root fade after carried motion, a designed beat kept from an earlier step,
  Set Out at exactly the motion end giving the same result whichever way it was reached, no bars
  for a layer hidden by its own bars, duplicate keys at the carried end refused, the rejoin copying
  the exit's start only when the exit moves on from there, and `carried` kept consistent by resize
  and presets.
- Moves: a key on a flag stays on its side, a key only holding a first value is the flag's, chained
  linear cuts rejoin whole, moves never lengthen Out, and new refusals for the carried end, legacy
  hides and a bar body passing a boundary key; the timeline draws a cue without bars as the runtime
  plays it; nudges land on frames and keep focus in their row; the moved selection includes the
  next cue's copy of a key on a flag.

Simplification (four cleanup passes: reuse, simplification, efficiency, altitude) then shared the
rules the operations and the timeline both need (`shownWithoutBars`, `landingCue`, `cueStarts`,
`jumpsAt`, `crossesCarried`), spelled a layer's bars out once per bar move instead of three times,
shared the key writers, and made the key drag re-render only when its frame changes and a nudge run
the operation once. Mutation testing removed two redundant pieces of code it showed could not
matter. Skipped as larger than this phase or a behaviour choice: one per-track cut and join shared
by Add Step, Delete, Set Out and key moves; an explicit exit-start key in Out (the reviewer accepted
the current form); parsing the template once per drag; and unifying the eight "bar reaches its
cue's end" checks, which differ in tolerance.

## Verification receipt

- Reproduction: `e2e/editor-cross-cue.spec.ts` queued on the unmodified code from a snapshot
  worktree (j-2665) failed 15 of 15 where expected: Out later refusing with `CROSSES_OUT_KEY` in
  all five targets, no `key.move` operation, the Next-cue guard, no key drag or refusal in the
  timeline, no bar crossing a flag, and Set Out inside a Next cue refused. The Node reproduction
  is under "Reproduction".
- Node: `scripts/cross-cue.test.mjs` (21 tests) with `out-boundary`, `out-step`, `step-authoring`,
  `key-ease` and `ease-runtime`, 84 tests, pass. Mutation testing: 79 of 79 applicable guard
  mutations fail a test; two further mutants were equivalent, and the code they touched was
  removed as redundant.
- Browser: `e2e/editor-cross-cue.spec.ts` (16 tests) with the editor regressions (steps, out-step,
  key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation, alpha-entry),
  anim-engine and inspector at the tip (j-2692): 202 passed, 20 skipped, none failed. The key
  nudge's frame snap and focus are asserted there (a key stored at 0.81 s lands on 0.84 s, where a
  relative nudge would give 0.85 s); the Timeline.tsx guards were not mutation-run in the browser.
- Full affected run at the tip (j-2693): 72 spec files, 593 passed and 353 skipped, and the catalog
  gate 35 of 35. Two vite client errors in the OGraf export specs come from quiz machine code and
  appear the same in R1.2a.4's run (j-2629).
- Catalog: JS fingerprints re-recorded for the interpreter change (528 JS rows, nothing else), and
  `check-catalog-emit` passes at the tip. The catalog battery against this worktree's dev server
  (j-2697): type floor 526, overflow 528 with no regression, field coverage 526, numerals 349,
  catalog specs 35 and baseline 4, factory 317 of 317. The 32 taste frames for card26, qz02 and
  lt01 are byte-identical to this branch's first battery, made before review changed the
  interpreter again; card26's Out from step 2 exits without revealing the unreached rows.
- Real UI (j-2701), headless at 1920 on this worktree's dev server in one page, as the owner route
  runs, with no page errors: Clean Steps from the template search, a key dragged 20 frames across a
  Step flag (one undo, Undo restores), Set Out inside Step 5's reveal (0.4 s carried into Out),
  saved, then on its control page Play, every Next (parked partway into the last row's reveal) and
  Stop, and Stop right after Play, each clearing the graphic. Hairline from the template search: the
  Out flag dragged later keeps the exit's keys unchanged, a drag back into the box's clip-path
  reveal refuses with its reason, and Set Out inside the entrance carries 0.42 s. A drawn
  rectangle's bar dragged 50 frames across a Step flag starts 0.24 s into the Step and runs to the
  end of Out, one undo, and Undo restores the source byte for byte. Catalog rows animate `yPercent`,
  which this editor does not author yet, so their bars refuse to move ("Another source channel owns
  this transform"), as before.
- Build (j-2699): gates, 2247 Node tests in 152 files, typecheck, lint, dependency rules and the
  bundle pass. An earlier build (j-2696) stopped at the line-endings gate on files the editor specs
  rewrite in `docs/research/editor-r1-1d`, restored before the rerun.
- Not checked: the receiving CasparCG and OGraf hosts themselves (their exports run in Node and the
  simulator), a physical desktop at 125% scaling, and a phone.
