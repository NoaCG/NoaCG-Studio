# src/components/timeline - the motion-authoring surfaces

The parent keeps a pointer and the MotionPresetPicker paragraph, which belongs to a file that is
still loose in components/.

## The surfaces

- **PlayoutSimulator** - owns the running preview timeline `__activeTl`; settles the design view
  after every rebuild (`settleToFiniteEnd` + a second update() - **never `progress(1)`**: one
  `repeat: -1` child makes GSAP report the timeline's duration as its ~1e10s "forever" sentinel,
  so `progress(1)` parks on a loop phase and the two `credits-loop` designs settled to an EMPTY
  canvas; docs/DYNAMIC_MOTION_SCOPE.md §11, and preview/settleGraphic.ts is the same recipe for
  every other preview surface); auto-replays on replayNonce;
  resolves the SCRUB phases, including `state:<group>:<state>` for a BRANCH timeline
  (blocks/timelineLens.ts `scrubPhase`): snap the group to the state's canonical predecessor
  (`branchRoute`, off animMachine's `canonicalPath`, which the interpreter's own
  `noacgCanonicalPath` mirrors) so the segment animates FROM the right look, then hold the
  runtime's `noacgEnterTimeline` paused. A branch used to send no scrub at all, so its timeline
  was authored blind - the playhead moved and the picture did not;
  handles the store's `event`/`snap` commands against the template's STATE MACHINE
  (docs/STATE_MACHINE_SCHEMA.md) - snapping with `{ timers: false }`, because a parked design
  view must never auto-advance - and, ONLY for a template carrying an EXPLICIT machine, renders
  the **event strip**: one button per authored operator event plus a current-state chip, each
  button DISABLED where the machine would drop the press (controlModel `isEventLegal`). It owns
  the iframe, so it runs the ONE 500ms poll of `noacgMachineState()` and publishes the pointers
  to store.machineGroups - the Control panel greys its own copy of the same buttons from there,
  and the rule lives once for the editor, the hosted page and the exported panel. An ordinary
  template shows nothing new. The four cue buttons stay THE lifecycle surface for both kinds of template;
  playNext owns each Continue's reveal tween as `__activeTl` step-N. resetGraphic clears GSAP
  inline props on the root subtree before every entrance so a prior exit never leaks its end
  state (e.g. a Blur exit's filter into a Slide entrance that never resets it). Honors the SPX
  `out` = N ms setting by scheduling the exit after the entrance settles + the hold - cancelled
  by any manual play/stop/next/scrub.
- **MachineGraph** - the NODE EDITOR (Phase 4, docs/STATE_MACHINE_SCHEMA.md §6a): the machine
  graph surface toggling with the step timeline in the bottom dock (the SEGMENTED
  `≡ Timeline | ◇ States` switch - both surfaces always visible, active highlighted;
  data-block templates only). Boxes carry the ▤ layer / ◇ graphic timeline badge
  (animMachine `timelineKind`, derived never stored - a timeline that only fires a lifecycle
  `call` counts as ◇, since its effect has no one layer to attribute it to; a POSE is a state
  that does nothing at all on entry). The card's description composes TWO facts through
  `stateContent` - what entering does, and where the timeline lives - and names a transition's
  ends the way the BOXES do, with the ids (which never follow a rename) one hover away. The main lane's "+ state" is a
  three-way menu (pose / step on the path / ▤ timeline from layer via
  blocks/layerTimeline.ts, shared with the Inspector's Animations-tab button); Delete
  removes the selection (arrow / branch state / middle waypoint through the step mutators +
  the SPX `steps` sync) and a press on empty canvas (incl. the wires SVG) clears it;
  transition styles now include **Cut — instant** (duration/ease hidden for it). The play and
  final-stop edges are MATERIALISED lifecycle transitions (deriveMachine emits them,
  parseAnimData injects them into older explicit machines), so even a default two-step lower
  third has selectable entrance/exit arrows; their card shows the style rows only (trigger,
  event and Delete stand down — machineEdit refuses those edits), and an authored operator
  arrow into the final waypoint keeps the spine while the stop edge bows beside it, dashed.
  States as boxes (default path = the amber spine, badges match
  the timeline's cue markers, ▶ » ■ · ○ rest), transitions as labelled arrows, parallel groups
  as lanes, the preview's live state highlighted via the simulator chip's poll. Click a state
  = snap the preview there, parked; cards edit names (a path state renames through
  `renameStep` so the bound step label can never fork), trigger/event/timer, and TRANSITION
  STYLES (fade/push/wipe + duration/ease); port-drag draws arrows (same group only, minted
  unique event, selected for renaming — the persisted index is found via a serialize→parse
  round trip because the canonical serializer SORTS transitions); boxes drag to positions
  persisted as the additive `at` field. A machine-less template shows its DERIVED machine
  ("derived from the steps" chip) and the first edit materializes it in the same undoable
  apply. Waypoints stay the timeline's to add/delete (positional binding); the card links
  there ("Open its timeline" parks the playhead at the step) - and a BRANCH state's card
  offers "+ Add a timeline" (machineEdit `setStateTimeline`) or opens the one it has, swinging
  the dock onto it through store `timelineTarget` (blocks/timelineLens.ts). The step timeline
  then shows that ONE clip under a bar naming the state, with the path-only affordances
  (add/duplicate a step, the hold, the Play/Next/Stop cue) stood down. Every write is a
  blocks/machineEdit.ts mutator → `writeAnimData` → ONE applyTemplate; illegal edits (reserved
  or duplicate event, deleting the walk's only edge) return null and the control reverts.
  STRUCTURE: `.machine-graph` is a FRAME that fills the dock (`.timeline-dock` grows into the
  splitter's room via `flex: 1 0 auto`, so the surface is sized by the DOCK, never by the
  diagram); `.mg-viewport` inside it scrolls the `.mg-canvas`, and the OVERLAYS — the detail
  card, the foot chips, and the "+ state" menu (placed in frame coordinates by `framePoint`)
  — are siblings of the viewport, so they size against the dock and panning can't drag them
  away from what they describe. That is not cosmetic (the measured failure is at the frame in
  MachineGraph.tsx).
  PROBLEM MARKS: a box whose state `validateMachine` has something to say about (animMachine
  `stateProblems` — unreachable, or a timer on a timeline that never ends) wears a coloured
  dot, and its card carries the finding phrased as the NEXT MOVE rather than the export
  report's verdict (`problemAdvice`) — the finding otherwise reaches only the Export panel,
  a long way from where the machine was authored. `boxWidth` takes an allowance for the dot,
  or a two-word state ellipsizes exactly when its name matters most. An off-path POSE wears ○
  like the rest state.
  Gotchas: the box button must NOT have `overflow: hidden` — it would clip the connect port
  half off the right edge and eat its pointerdown (the name span does its own ellipsis); and
  `toBeVisible()` is blind to overflow clipping, so anything about reaching a control is
  pinned by comparing rects (`boxInside` in e2e/machine-graph.spec.ts), never by visibility.
  Pinned by e2e/machine-graph.spec.ts.
- **TimelineDock / StepTimeline** (Timeline v2, both in StepTimeline.tsx) - the dock picks the
  timeline surface from the CODE, never from the category (which is what lets a template saved
  years ago still open correctly): a NOACG_ANIM data region gets the clip-style STEP TIMELINE,
  editable - every category creates this way, so it is the normal case; a LEGACY region the
  importer can read gets the SAME step timeline, READ-ONLY, with an undoable '◆ use keyframes'
  conversion one click away (blocks/animImport.ts + the animRuntime writer) - it shows the real
  choreography, converted, rather than a lesser second editor; a legacy region it CANNOT read gets
  **LegacyTimeline** (below).
  The step timeline's vocabulary: a time ruler with the operator's cue markers (▶ » ● ■) at
  every boundary; step CLIPS - right-edge resize (default PRESERVES keyframe timing; Alt-drag
  STRETCHES times proportionally), context menu Duplicate/Rename/Delete + the step's default
  ease, »+ adds a step, a hold popover edits the SPX `out` setting, a speed select; LAYER
  ROWS - every registry part gets a row - with aggregate keyframe diamonds, a ▸ caret that
  EXPANDS the layer into per-property sub-rows (drag/Delete/ease scoped to that property via
  moveKeyframe/deleteKeyframe/setKeyframeEase's prop arg), and a LAYER STATE BLOCK: the
  existence span (activation step -> the step it LEAVES: its `hides` step, else the end of Out)
  with the keyframed entering/exiting phases emphasized - its LEFT edge drags between step
  boundaries as the same activation move the gutter/chip make, and its RIGHT edge drags to set
  an EARLY EXIT (blocks/animEdit setLayerHide writes the step's `hides`; dragging to Out clears
  it). Setting a hide on a template whose interpreter predates the feature re-emits the whole
  region so the exit actually plays.
  THE THREE READ-ONLY SURFACES. Three things in the data are NOT keyframes you can grab, and each
  is SURFACED (so the timeline never silently hides motion) but never draggable (so it never
  implies an affordance it lacks). All three are code-owned; the tooltips say so.
  MEASURED MOTION (`dynamics`, docs/DYNAMIC_MOTION_SCOPE.md) draws its own rows below the layer
  rows as hatched OPEN-ENDED bars naming the builder - its real length is measured from the
  operator's content at play time, so any fixed width would be a lie, and its target is
  deliberately not a registry part. LOOPS (`loops[selector][prop]`) draw a repeat TAIL from the
  looping track's LAST keyframe - the keyframes ARE the pass and stay editable; a finite repeat
  ends where the data says and caps, an endless one clamps to the canvas without a cap.
  LIFECYCLE CALLS (`calls`, TIMELINE_V2_PLAN §3b) get a `lifecycle` row of PINS naming the
  function: a side effect has no duration, so it is drawn unlike a diamond.
  KEYFRAME SETS (the gestures are docs/TIMELINE_INTERACTION_MODEL.md's): click and shift-click
  build a set, a drag moves the whole set with magnetic snap, and Delete / ←→ / Ctrl+C,V,D act
  on it. A drag on the empty rows area draws the SAME amber marquee the canvas lasso uses
  (.tlv2-lasso) and boxes every diamond it touches; the ruler/clips band keeps its scrub. A
  draggable playhead with a grab cap + auto-follow scroll and deep zoom (up to 1000 px/s);
  Space plays (never while typing).
  Every edit is a pure data mutation (blocks/animEdit.ts) spliced back by
  blocks/animData.ts - ONE undoable apply each (a group drag/delete/paste chains mutations
  into one apply); playhead/scrub/selection never write history.
  Parity between editor and runtime is pinned by e2e/anim-engine.spec.ts; the interaction
  contract lives in docs/TIMELINE_INTERACTION_MODEL.md.
- **Inspector** (Timeline v2) - the persistent panel RIGHT of the preview and the shared
  selection's third consumer (canvas <-> timeline <-> Inspector): identity + resolved property
  values at the settled state (parseAnimData -> importAnimData -> animEval resolveValue). On a
  data-block template the Properties tab EDITS: each property carries a ◇/◆ diamond - arm it
  to stamp a keyframe at the store playhead, edit an armed value to auto-key there, click a
  diamond sitting ON a keyframe to remove it; ‹ › navigate the layer's keyframes, labels
  drag-scrub the value, and arming BOTH Position X and Y also unlocks the canvas position-keyframe
  drag (see CanvasInteraction). The vocabulary (PROP_ROWS) is x/y/yPercent/scale/opacity/
  rotation, a **Filter** group - blur/brightness/saturate/hueRotate/glow, which are NOT separate
  tracks: they share the ONE composed `filter` track (blocks/filterTrack.ts), so a row edits one
  function of the string and a keyframe there carries them ALL (the row hint says so). A filter
  row carries `filter: <key>` in PROP_ROWS and writes through animEdit's `setFilterComponent` -
  plus a **3D transform** group - `rotationX`/`rotationY`/`z` and `perspective`
  (`transformPerspective`), ordinary numeric tracks the interpreter tweens with no special-casing
  (perspective enables the 3D look; they pivot around the Pivot's transform-origin). Adding a
  numeric prop needs only a PROP_ROWS entry - no runtime/resolver/validation change; a new FILTER
  function needs only a FILTER_FUNCS entry in blocks/filterTrack.ts plus its PROP_ROWS row.
  A selected PLACED FIELD (an imported design's line or slot - blocks/designLayout.ts
  placedLines, code-derived) additionally offers a **Style tab**: CONTENT rows (the operator
  label via blocks/edit.ts setFieldTitle, and for text lines the shown text through
  setFieldDefault + the live sample value), numeric X/Y placement, the full typography set for
  a text line plus a FIT group (Shrink / Wrap / Free + the slot width - what a long operator
  value does to the line), and an image slot's box. Every control is a deterministic patch of
  the field's OWN rules via designLayout (setLineFit, setLineTextStyle, placeLine,
  setSlotSize), one undoable apply per edit. The tab exists only while a placed field is
  selected (a non-placed selection falls back to Properties without clobbering the stored
  choice). A placed field's look is DESIGN, never keyframes - the same doctrine as its drag.
  The Animations tab leads with the layer's LIFECYCLE rows - **Appears** (▶ Play / an existing
  step by name / "in a new step »" via createStepFromLayer) and **Disappears** (■ Out / an
  early exit via animEdit setLayerHide) - the same transforms the canvas chip and the timeline
  block edges write, shown for the default path only. Below them it names which steps move the
  layer and holds the preset picker (preset + In/Out/Both + easing + per-direction duration and
  DELAY - a hold before the motion, written as shifted keyframes so no keyframe knowledge is
  needed - blocks/presetApply.ts). Apply is a CLEAN SWAP of the targeted direction's motion (it
  never blends with the previous preset), re-parks the preview at the playhead, and a target
  line under it names WHICH step each direction will actually edit. On an imported
  design (the placed-design shape, code-derived) Animations is the DEFAULT tab - the artwork
  brought its look, so per-layer motion is what the Inspector is for there; a manual tab
  choice afterwards sticks. Legacy templates get a
  read-only shell (the timeline's convert chip arms editing). It is a dockable panel (default:
  the active tab of the RIGHT dock); any NEW selection reveals it, and an explicit close holds
  while the selection is unchanged (see AppShell).
- **LegacyTimeline** (Phase 8) - the READ-ONLY chart of a legacy region the importer REFUSES:
  measured motion written inline (`x: -track.scrollWidth`), or a loop it would have to guess at.
  Such a template can never be auto-converted, and regenerating it would discard its owner's
  tuning - so it must still RENDER truthfully (DYNAMIC_MOTION_SCOPE §8.1). It draws the
  CUE-SEGMENTED OVERVIEW (blocks/timelineModel.ts buildOverview): ONE strip, all sections side by
  side (▶ In · » presses · ● hold · ■ Out), each on its own real local clock, the hold a hatched
  break, registry-part rows spanning every section. A live playhead follows the simulator; clicking
  a section or dragging the scrub parks the preview there - reading the code, never writing it. Row
  LABELS are shared-selection handles, as everywhere.
  It offers NO editing affordance (Phase 8 deleted the patchers) - the note says why and the JS
  tab is where you edit it. Its ONE write is **"start over with a preset"**, which emits that
  preset as DATA (presetRegistry.emitPresetRegion -> importer -> data block): the way out of
  unconvertible code leads FORWARD, never to another legacy region, and undo restores the
  hand-written version. An unparsable region gets an honest one-liner plus that same select;
  blank/imported templates get no strip at all.
