# R1.2a.4: step authoring

Base: R1.2a.3 landed through PR #564 as `d0642028`; production reported `d0642028` with
`deployedCommitIsCurrent: true` (`/version.json`). This worktree branch `claude/editor-r1-2a-4-steps`
started from fetched `origin/main` `26488f9d0`, which contains it.

Why: an author who wants a graphic to reveal in stages needs to place, name, move and remove the
points where the operator presses Next, on the one timeline they already animate on, without
retiming what they animated.

Goal: the owner's 2026-09-29 Step/Next contract (`docs/EDITOR_PLAN.md`, `docs/EDITOR_REBUILD_PLAN.md`
"Flags and transport", register rows D01, B05, B13 and G02). A graphic may have any number of
Step/Next states and Next walks them in order. Add Step at the playhead, rename it inline, delete
it and drag flags, keeping every key and bar at its absolute time on the concatenated ruler, as
one undo each. The editor is strict: In, Step and Out flags stay ordered, at least one frame
apart and never stacked, and anything the runtime cannot play exactly refuses atomically with
the source and history byte-identical and a reason beside the control. Out from any step already
works (R1.2a.3). Owner decision 2026-09-30: a one-key or zero-time Out track pressed from an
earlier step holds its live value until the exit ends.

Non-goals (R1.2a.5 and later): cross-cue key moves, and Set Out crossing out of a Next cue (the
R1.2a.2 guard in `moveOutBoundary` stays). Loops, machine, call and dynamics authoring.

## Reproduction (before any change)

- The new editor has no step authoring. Its ruler draws each flag as a plain label
  (`Timeline.tsx`, `<span className="ef-flag">`), the operation registry has no step operation
  (`EditorOperation` in `operations.ts`), and nothing adds, renames, deletes or moves a Step. The
  old editor's `addStep`, `deleteStep` and `resizeStep` (`animEdit.ts`) insert an empty 0.45 s
  step before Out, drop a step's motion back to channel defaults, and retime by resizing: none
  keeps keys at their absolute times. The browser spec below, queued on the unmodified code,
  finds no Add Step control and no step operation.
- The one-key Out cut. Measured in Node with the emitted interpreter and the bundled GSAP over the
  stub DOM of `scripts/out-step.test.mjs`, on `e2e/fixtures/out-steps.json` with the Out track
  `#title y` reduced to one key at -50 (the pose Step 3 ends on): parked after In, `#title` y reads
  0; Out pressed, it reads -50 at exit time 0 and holds there. Out from an earlier step shows
  the pose of a step the viewer never saw, because `noacgBuildExit` treats a one-key track as an
  explicit cut at every step.
- Flags read by exact float equality. `segmentAt` and `authoringPosition` compare a playhead time
  with sums of cue lengths divided by speed, which can sit a float step off the frame the flag was
  set on (R1.2a.3 fixed the same reading in the preview bridge only).

## Decisions

Terms: a machine-less graphic's cues are In, then Step cues, then Out. A **Step flag** is where a
Step cue starts, which is also where the cue before it ends and where the graphic parks and waits
for Next. Times are stored on each cue's own clock; the ruler shows stored / speed. A flag always
sits on a frame (Set Out and flags snap the playhead: 0.5 s at 25 fps rounds to 0.52 s) and is
stored at the serializer's 3 decimals; a cue is at least one frame long (speed / fps stored,
within half a stored unit).

### Add Step at the playhead

- It snaps the playhead to a frame and splits the pre-Out cue holding it, strictly inside, into
  that cue up to the frame and a new cue after it. **On a flag** (In at zero included) it refuses
  as a duplicate flag, **at or after Out** as a Step after Out, and within a frame of a flag as too
  short.
- **Keys keep their absolute times.** A track with a key after the split meets it one of four
  ways. **On a key**: the key stays and the new cue starts from a copy of it. **Inside an eased,
  Hold or jump segment**: an exact split (`splitKeyframeSegment`, R1.2a.1) writes a key there whose
  own ease says what it is (a slice of the curve, the Hold or the jump it halved), and the new cue
  starts from a copy. **Inside a flat segment**: no key is needed on either side, the cue holds
  the value and the next key holds it back to the new cue's start. **Before its first key**: the
  cue keeps a key holding that first value, which the runtime applies from the cue start, and the
  new cue needs no copy. A key already at the split that only holds the value of the key before it
  is left out of the cut cue, which holds that value anyway; the new cue's copy carries its ease.
  A cut never removes a track from the cue it cuts, so layers and tracks keep their place in the
  source. Keys after the split move into the new cue at `t - b`; tracks with nothing after it
  stay. Anything without an exact split refuses the whole operation with the
  reason naming the layer and property: stepped or unknown eases, a split value outside the
  property's range or not storable at 3 decimals, a string track that would need a split, keys
  stored past the cue's end.
- **Eases.** The new cue takes the split cue's default ease, so moved keys keep their own eases
  unchanged. Where a key moves between cues whose default eases differ (Delete and flag
  drags below), it takes an explicit ease, its own or its old cue's default, as in R1.2a.1.
- **Bars keep their absolute times.** A layer with bars on the split cue gets them clipped at the
  split, the rest moved into the new cue, and an explicit list there (possibly empty). **On a bar
  edge**: a bar ending at the split stays visible on the arriving side and is hidden in the new
  cue; a bar starting at the split starts the new cue, so that layer appears when Next is pressed
  there (and G02 below edits it at the new cue's start).
- **Legacy visibility** (older source; no catalog design uses `hides`): a cue's `reveals` stay with
  its first part, where the layer still appears; its `hides` move to the new cue, whose end is
  where the layer still leaves.
- The new Step is named `Step N` by its position; default names after it renumber, renamed steps
  keep their names. The playhead parks on the new flag. `settings.steps` and the SPX definition
  follow (`spxSteps`).

### Delete a Step

- Deleting a Step flag joins its cue into the cue before: keys and bars at `t + b`, touching bars
  one bar. The join removes exactly what a split writes at the flag, so **Add Step then Delete is
  byte-identical to the original**: the Step cue's copy of the value the cue before ends on, a key
  the cue before held at the flag that a split wrote (recognized by its own ease: two slices of one
  curve that rejoin, a collinear straight pair, or a Hold or jump half), and a key only holding a
  first value from the cue start. A key without its own ease stays, and so does any key that
  arrives as the Step cue's first key (a key the author wrote there, a Hold included, moved whole).
  Two normalizations remain, both playing the same: a rejoined ease equal to the joined cue's
  default is written as the default (the split cannot tell an explicit default from an implicit
  one), and an authored key exactly at the flag that is itself a collinear straight or
  complementary slice pair with explicit eases rejoins.
- **Eases.** When the two cues' default eases differ, each moved key takes an explicit ease (its
  own, else the deleted cue's default), as in R1.2a.1.
- **Refusals** (source and history unchanged, reason beside the control): a track whose Step-cue
  value jumps at the flag (its first value differs from the value it holds at the end of the cue
  before), since a joined cue has no instant jump to keep it; a track that begins with the Step
  while the layer is on screen before it showing another value (the joined cue would apply the
  Step's first value from its start; a layer its bars hide shows nothing, while an unkeyed opacity
  or other CSS value is unknown to the data and a legacy hide's opacity 0 is not in its values, so
  both count as different); keys stored past either cue's end.
- **Bars.** A layer with bars in only one of the two cues keeps its visibility over the other
  part: through the deleted cue when a bar reaches the flag, through the cue before when the layer
  is visible entering it.
- **Legacy visibility.** The deleted cue's `hides` move to the joined cue (same end). A legacy
  hide on the cue before refuses: it would leave later. So does a legacy hide on the deleted cue
  for a layer with bars in the cue before (the joined cue's bars would make the hide inert), and a
  legacy reveal of a layer that also leaves through a legacy hide (its timing has no explicit form). A layer that appears with the deleted
  Step through a legacy reveal first gets explicit bars in every cue before Out, the conversion a
  bar move makes (`moveLayerSpan`), so it still appears at its absolute time and Out keeps what it
  had. Its reveal marker moves to the joined cue, where Out's reveal checks and the fade of a
  revealed layer outside the root keep working. Joined into In, which has no reveal, the marker
  goes: that is exact only for a layer inside the root, whose hide clears it at the end of Out, so
  a layer the document cannot place inside the root refuses. A reveal without keys of its own in
  its cue refuses (the runtime pre-hides such a layer by opacity and never shows it; bars would).

### Flag drags and nudges

- A Step flag drag is Delete at the old flag then Add Step at the new frame, as one operation, the
  new cue keeping the dragged cue's name and default ease; keys and bars keep their absolute
  times, so playback on the ruler is unchanged, and so does a drag and its reverse. The reverse
  can leave the earlier cue a key holding a layer's first value at the old flag, where a layer
  started with the dragged Step, since a cut never removes a track; where two cues' default eases
  differ, moved keys keep the explicit eases the join gave them.
  The Out flag drag is Set Out at the dropped frame (R1.2a.1, including the R1.2a.2 guard and the
  reverse/manual prompt when the exit has no keys).
- Flags snap to frames, and within a few pixels to the playhead, keys and bar edges that sit on a
  frame; Alt bypasses those magnets but never the frame. Stored at 3 decimals, a flag can sit a
  fraction of a millisecond off its frame at 30 or 60 fps: a gap within one stored unit of a frame
  counts as a frame, and a seek to a frame within half a stored unit of a flag lands on the flag
  itself, on its arriving side, as Add Step's playhead does. A drag or nudge **past or onto a
  neighbour** refuses: a Step stays at least one frame after the flag before it and before the
  flag after it, In never moves, and Out stays after the last Step.
- **While a drag is refused** the flag follows the pointer at its snapped frame drawn as refused,
  with the reason beside it; releasing leaves the source and history unchanged and keeps the
  reason until the next action. While legal the flag shows its new time. Escape or a lost pointer
  cancels. Arrow keys nudge a focused flag one frame (Shift ten), each nudge one undo.
- A click on a Step flag inspects its departing segment (below); a double-click, F2 or Enter
  renames it inline; Delete removes it; the context menu (right-click, Menu key or Shift+F10)
  offers both.

### Rename

- Step cues only: In and Out keep their fixed names in this editor. The name is trimmed,
  nonempty and at most 40 characters, persists in the cue's `name` and survives save and reopen.
  Enter or blur commits, Escape cancels, an unchanged name adds no history.

### G02: editing on a flag

- Parked on a Step flag (the arriving side), an edit writes the arriving cue at its end, except for
  a selected layer whose bar starts on that flag (a bar of the departing cue starting at its zero
  with no bar of the arriving cue ending there; a legacy reveal's derived bar counts): that layer
  writes the departing cue at local zero, starting from the departing cue's own pose there (the
  shared sampler), not from the arriving preview, which keeps it hidden. A seek to a flag's frame
  lands on the flag's own time, so the preview and edits read it there at 30 and 60 fps too.
- A mixed selection resolves per layer and commits as one undo. The inspector names each target:
  the segment and whether the edit lands at its start or its end.
- A click on a Step flag inspects its departing segment explicitly, as Edit Out does for Out: the
  preview shows that cue at local zero and every edit writes it there.

### One-key Out hold (owner decision 2026-09-30)

- Out pressed from an earlier step (a machine-less graphic with a cue played and a Next cue
  unplayed, R1.2a.3) holds a one-key or zero-time Out track at its live value until the exit ends,
  and then takes that track's last key with the rest of the end-of-Out pose. At the last step it
  is unchanged: an explicit cut at Out's start. Out during In or a Next cue in a graphic with a
  later Next cue is an earlier step and holds too; the interruption of the last cue cuts as before.
- The rule changes the emitted interpreter. The R1.2a.3 body is frozen by content hash in
  `animRuntimeLegacy.ts`, its text kept as `e2e/fixtures/interpreter-step-out-v1.js`, and upgrades
  once on preview, save and export like the bodies before it.

### Scope

- Machine graphics, loops, calls and dynamics refuse step authoring as all animation authoring in
  this editor does (`sequenceAuthoringReason`); a custom interpreter refuses as Set Out does.
- A legacy one-step graphic materializes its empty Out before its first Step (D01).

## Acceptance

| Portion | Observable result | Refusal (source and history byte-identical, reason beside the control) |
|---|---|---|
| Add Step | On a key, on a bar edge, inside a held segment and inside eased segments of the fixture, In, Next pressed at each flag and Out equal the original on the concatenated ruler within 1e-3 in editor sampling, the simulator, SPX, CasparCG, OGraf and single-file exports. Parked at the new flag, Out leaves from the live pose (R1.2a.3's model). | On a flag, after Out, within a frame of a flag, a crossed segment without an exact split, keys past a cue's end, a machine graphic. |
| Delete | Deleting restores the joined playback in all five targets; Add Step then Delete returns the byte-identical source; a join next to a cue with another default ease writes explicit eases and plays the same. | A value jump at the flag, a legacy hide on the cue before. |
| Drags | Step flag drags and nudges keep playback identical, and so does a drag and its reverse; the Out flag drag is Set Out. Flags stay ordered, at least one frame apart and never stacked under every drag, nudge and drag past a neighbour. | Past or onto a neighbour, shown live as refused; a crossing without an exact split. |
| Transactions | Add, rename, delete and every drag are one undo each; redo, Escape, save/reopen and a second save agree. | Every refusal adds no history and shows its reason. |
| G02 | At a flag, an existing layer keys the arriving cue's end and a layer whose bar starts there keys the departing cue at zero from its own pose; a mixed selection is one atomic undo; the inspector names each target; the arriving preview neither hides the held layer nor reveals the new one. | |
| Step count | `settings.steps` and the SPX definition follow every change; OGraf and SPX walk the new count. | |
| One-key Out | From an earlier step a one-key Out track holds its live value until the exit ends in the simulator, SPX, CasparCG, OGraf, single-file and the editor; from the last step it cuts as before. The R1.2a.3 body upgrades once by hash in preview, save and export. | A custom interpreter body still refuses. |
| Legacy reveals | card26-style reveals: Add Step keeps them; Delete and drags convert the revealed layer to bars and keep it appearing at its absolute time. | A keyless reveal. |
| Preserved | The editor regressions (out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation, alpha-entry), anim-engine and inspector pass unchanged; the one changed assertion is `scripts/out-step.test.mjs`'s one-key cut from an earlier step, which the owner's 2026-09-30 decision replaces. | |

## Verification plan

`scripts/step-authoring.test.mjs` (build gate, beside `out-boundary` and `out-step`) runs the pure
operations and the emitted interpreter over the stub DOM: dense ruler equality for every Add Step
position, Delete and drags, byte identity of add-then-delete and drag-and-back, every refusal
atomic, legacy reveals and hides, `settings.steps`, the one-key hold, and the upgrade. Each new
guard is mutation-tested. `e2e/editor-steps.spec.ts` is written first and queued on the unmodified
code: the five-target parity, the editor's UI (add, rename, delete, drag, nudge, refusals, undo,
redo, Escape, save/reopen, G02) and the one-key hold in the editor. Then the editor regressions, the
full affected run, catalog JS fingerprints, the catalog battery against this worktree's own dev
server, taste frames (card26, qz02, lt01), build, `/check`, `/queue-merge` and the deployed
`/version.json`.

## Implementation

- [animEdit.ts](../../../src/blocks/animEdit.ts): the shared cut (`holdAt`, `cutTracks`, `cutBars`,
  `joinBars`, `requireCuttable`, `withOut`) next to `splitKeyframeSegment`, and `splitCue`, `joinCues` (with
  `unsplitAt`, the inverse of a split at the flag) and `moveStepFlag`. `moveLayerSpan` and
  `trimLayerSpan` share `explicitBars` for the legacy-to-bars conversion a join also makes.
  [editorOut.ts](../../../src/blocks/editorOut.ts): `moveOutBoundary` cuts its cue with the same
  pieces, its output unchanged (the 14 Set Out tests pass as before).
- [editorSteps.ts](../../../src/blocks/editorSteps.ts): `applyStep` for `step.add`, `step.rename`,
  `step.delete` and `step.move` in the operation registry
  ([operations.ts](../../../src/components/editorFoundation/operations.ts)): frame snapping, flag and
  after-Out refusals, a legacy one-step Out, `settings.steps` and the SPX definition, and the same
  interpreter upgrade Set Out writes.
- [StepFlag.tsx](../../../src/components/editorFoundation/StepFlag.tsx): the Step and Out flags on the
  ruler (drag with magnets, refused state, nudges, inline rename through `FieldControl`, the Step
  menu) and Add Step at playhead; [Timeline.tsx](../../../src/components/editorFoundation/Timeline.tsx)
  renders them, [OutControls.tsx](../../../src/components/editorFoundation/OutControls.tsx) takes the
  Out flag's drop through its Set Out path. G02 is `editSegment`, `editTarget` and `editingPose` in
  [animationAuthoring.ts](../../../src/components/editorFoundation/animationAuthoring.ts), used by the
  numeric fields, diamonds, the Opacity field and canvas drags; the inspector lists each selected
  layer's target. Every seek goes through `onFlag` (timelineView.ts): a frame within the view's
  `near`, half a stored unit on the ruler, of a flag lands on the flag, as Add Step's playhead does.
  The flags ask the operation registry whether a drag or nudge could land, so order, frames and
  exactness refuse there with the same reasons as the operations.
- [animRuntime.ts](../../../src/templates/shared/animRuntime.ts): `noacgExitTimeline` passes `early`
  to `noacgBuildExit`, which holds a one-key or zero-time track's live value and sets its last key
  at the exit's end. The R1.2a.3 body is `ANIM_INTERPRETER_BEFORE_ONE_KEY_HOLD_HASH` in
  [animRuntimeLegacy.ts](../../../src/templates/shared/animRuntimeLegacy.ts), its text in
  `e2e/fixtures/interpreter-step-out-v1.js`.
- Tests: [step-authoring.test.mjs](../../../scripts/step-authoring.test.mjs) (build gate) and
  [editor-steps.spec.ts](../../../e2e/editor-steps.spec.ts), both on `e2e/fixtures/steps-authoring.json`;
  `scripts/out-step.test.mjs`'s one-key assertion follows the owner decision.

## Review and simplification

Review ran as one workflow of four read-only reviewers (repartition and exactness; flags, drags
and UI; runtime and exports; tests, docs and scope), each followed by one refuter. It raised 19
findings, 18 confirmed and one partly. All are fixed except three recorded above as decisions: the
two Delete normalizations that play the same, and the key a drag's reverse can leave. The fixes:

- A cut never removes a track from the cue it cuts, so Add Step then Delete keeps layers and
  tracks in source order; the join rejoins only a key the earlier cue held at the flag, so an
  authored Hold arriving as the Step's first key survives.
- A legacy hide's opacity 0 counts when a join decides whether a layer starts where it stood, so
  it refuses instead of showing the layer early.
- At 30 and 60 fps a one-frame gap stored at 3 decimals counts as a frame, and the playhead parks
  on a new flag's arriving side.
- A Step inspection ends when the playhead moves past Out; leaving the name field keeps focus where
  it went; the Opacity field starts from the departing cue's value under G02; keys in the Step menu
  stay in the menu; Delete returns focus to the ruler; the transport wraps between 700 and 880 px.
- The Node playback model compares every track and layer of both graphics, with cases for Hold
  keys, source order, 30 and 60 fps, a float-off flag, legacy hides, calls and dynamics.

Simplification (four cleanup passes) then made the flags ask the operation registry whether a
drag or nudge could land instead of repeating its ordering rule, so an Out flag gets its reason
from Set Out; gave the timeline view one tolerance for "on a flag" (`near`, half a stored unit on
the ruler) at the seek, so a frame walked onto a flag at 30 or 60 fps lands on it as Add Step's
playhead does, and edits there go to the arriving side (G02) instead of a hair into the Step (a
first attempt read the tolerance in `segmentAt` instead, which moved the preview's reported pose
off the playhead and refused edits beside a flag; the editor regressions caught it);
and folded Set Out's and the steps' shared checks into `requireCuttable` and `withOut`; Set Out
now names the last Step when Out would land within a frame of it. Skipped as outside this change or not worth a layer:
sharing the key-ease menu's popover and reason hooks, extracting shared e2e helpers (which would
widen the affected run to the whole suite), sharing the identity transform with the importer, and
bundling the tests.

## Verification receipt

- Reproduction: `e2e/editor-steps.spec.ts` queued on the unmodified code (j-2553) failed where
  expected: no Add Step control, no step operation, and the one-key Out track cutting from an
  earlier step.
- Node: `scripts/step-authoring.test.mjs` (20 tests, build gate) with `out-step` and
  `out-boundary`, 42 tests, pass. Each guard was mutation-tested: 36 of 36 source mutations
  failed a test.
- Browser: `e2e/editor-steps.spec.ts` (14 tests) and the editor regressions (out-step, key-ease,
  ease, out, keys, fidelity-trim, base-edits, usability, foundation, alpha-entry), anim-engine and
  inspector at the tip (j-2605): 185 passed, 20 skipped, one failure in editor-keys' scale-handle
  test under load, which passed 6 of 6 repeated alone (j-2609). Seven UI mutations each failed
  the spec (j-2599, j-2610): the Step menu letting its press reach the ruler, G02 edits starting
  from the arriving preview, a Step inspection surviving a seek past Out, the one-key hold in the
  editor and in the simulator walk, the parking of Add Step, and the flag tolerance at the seek.
- Catalog: JS fingerprints re-recorded once for the interpreter change (528 JS rows, nothing
  else), and `check-catalog-emit` passes at the tip. The catalog battery against this worktree's
  dev server (j-2576): type floor 526, overflow 528 with no regression, field coverage 526,
  numerals 349, catalog specs 35 and baseline 4, factory 317 of 317. Taste frames for card26,
  qz02 and lt01 are byte-identical to R1.2a.3's.
- Real UI (j-2616, j-2619): a headless walk at 1920 and 1366 with no page errors (Add Step,
  rename, a refused drag held, a legal drag, the Step menu, G02 labels on a mixed selection,
  card26's Delete), then the owner's route: the wizard's default lower third through Open editor
  Alpha (Add Step in its settled air, rename, nudge, Delete back to the original, Undo), and
  Clean Steps through the wizard, a nudged and renamed Step, saved, then Play, four Nexts and Stop
  on its control page, each row appearing at its Step and Stop taking it out.
- Full affected run at the tip (j-2629): 79 spec files, 655 passed and 364 skipped, and the
  catalog gate 35 of 35. Earlier affected and editor runs made while the machine was short of
  memory each failed one editor-keys canvas drag (a scale handle or a mixed selection) that
  passes alone. The same file run 15 times at 4 workers passed 210 of 210 on both the base
  commit and the tip, so it is a load flake the branch does not cause.
- Build (j-2617): gates, 2178 Node tests, typecheck, lint and the bundle pass.
- Not checked: the receiving CasparCG and OGraf hosts themselves (their exports run executed in
  Node and the simulator), a physical desktop at 125% scaling, and a phone.
