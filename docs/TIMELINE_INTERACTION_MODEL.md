# The timeline interaction model

**Status: adopted 2026-07-11 as the binding interaction contract for the editing
surfaces.** This document extends docs/TIMELINE_V2_PLAN.md (the data model and its
ratification stand) and AMENDS three of its ratified scope cuts — see "Amendments".
Behavioral references: CapCut, After Effects, Premiere, Resolve, Figma. NoaCG is not a
video editor — it edits graphic layers, animations, steps, Next actions, and persistent
visual states — but a user fluent in those tools must recognize the interaction model on
sight: selection, dragging, trimming, keyframes, snapping, playhead, multi-selection.

## 1. The inspection (what exists, what gaps)

The audit below is against the ten principles of the interaction brief.

1. **Canonical layer identity — EXISTS.** `model/structure.ts` (TemplatePart, single-token
   selectors) is the one identity every surface names elements through: canvas hit-testing,
   timeline rows, Inspector, step reveals, animation-data layer keys, export. No change
   needed; every new feature keeps naming through it.
2. **Standard selection — GAP.** The store holds ONE `selectedPart`. No shift-click, no
   lasso, no multi-selection anywhere; keyframe selection is single and local to the
   timeline; the ribbon uses a crosshair cursor.
3. **Per-property rows — GAP (deliberate v1 cut, now reversed).** Layer rows show
   aggregate diamonds only; a diamond may stand for several properties.
4. **Canvas manipulation → keyframes — PARTIAL.** Position drag keys x/y at the playhead,
   but only when BOTH Position X and Y were pre-armed in the Inspector (the arming gate
   was a deliberate first-round guard). Scale/rotate on canvas exist only as the root's
   --scale handle (a design patch, not a keyframe).
5. **Playhead/keyframe sync — LARGELY EXISTS.** One canonical parked playhead
   `(stepIndex, localT)` lives in the store; scrubbing seeks the REAL preview (the
   interpreter's own timeline, paused); ‹ › jump the playhead to exact keyframe times.
   During PLAYBACK the timeline mirrors the running GSAP timeline via rAF without writing
   the store 60×/s — parked position is store truth, playing position is playback truth.
   That split is intentional and stays.
6. **Layer timeline blocks — GAP.** Rows carry diamonds and a reveal marker but no
   clip-like existence block; when a layer participates is not visible at a glance.
7. **Steps as persistent states — MODEL EXISTS, LEGIBILITY GAP.** Value persistence by
   evaluation (decision 2 of the plan) already means "visible layers continue into a new
   step by default", and `reveals` is explicit activation data. What is missing is the
   READING: what enters / exits / holds in each step.
8. **In/out independence — EXISTS.** In and Out are disjoint step data by construction;
   presets replace only their declared properties in their target scope.
9. **Layer independence — STRUCTURAL REALITY, needs honesty not magic.** Layers are DOM
   elements; a container's opacity affects its children because that is what HTML is. The
   registry makes containment explicit (root → panel → lines). The rule we adopt: the
   EDITOR must always show the relationship (the Inspector names the kind; a container
   edit that rides children along should say so), and independent siblings must never
   affect each other — which the per-layer keyframe model already guarantees.
10. **Familiar timeline behavior — PARTIAL.** Zoom, ruler, undo/redo, 0.05s grid snap
    exist; missing: snap to playhead/step edges/sibling keyframes, multi-drag, copy/paste,
    pointer-cursor defaults, hover affordances on blocks.

## 2. The canonical model

- **Identity:** TemplatePart selectors, unchanged, everywhere.
- **Selection:** the store holds `selectedParts: string[]` (ordered; the FIRST is the
  primary that the Inspector shows). `selectedPart` remains as the derived primary so
  every existing consumer keeps working; plain click replaces the selection, shift-click
  toggles membership, empty-canvas click clears, empty-canvas DRAG lassos (a drag starting
  ON the graphic stays the root zone-move — no mode, same threshold). Keyframe selection
  is a SET local to the timeline surface (keyframes exist only there); it follows the same
  conventions (click, shift-click, drag-together, Delete).
- **Time:** the parked playhead `(stepIndex, localT effective-seconds)` in the store is
  the one moment that canvas preview, Inspector values, and keyframe stamping agree on;
  seeking it always seeks the real preview. Playback runs on the interpreter's own
  timeline and the ribbon follows it read-only. Steps remain cue-segmented local clocks —
  a "global time" fiction is never introduced (broadcast truth from the ratified plan).
- **State:** a layer's lifecycle is hidden → entering (its activation step's keyframes) →
  visible (persistence by evaluation) → exiting (its Out-step keyframes, else the root
  hide). The timeline renders this as the layer's BLOCK; `reveals` stays the only
  activation data for ENTRY. An explicit early exit is real: `hides` names the step a layer
  leaves in, written by the state block's right-edge drag through `animEdit setLayerHide`,
  and dragging it back to Out clears it.

## 3. Amendments to the ratified plan

1. **Per-property sub-rows are IN** (supersedes ratification point 10's v1 cut): a layer
   row expands to one sub-row per animated property; diamonds on sub-rows are single
   property keyframes; the collapsed row keeps the aggregate view.
2. **Multi-selection is IN** (supersedes "no multi-selection" in §8 of the plan): layers
   and keyframes; lasso on empty canvas; drag-together and Delete on keyframe sets.
3. **The canvas keyframe drag loses its arming gate** (supersedes the first-round
   both-armed rule): with a parked playhead, dragging a SELECTED non-root layer always
   writes/updates its x/y keyframes at that moment — the drag itself arms. The root keeps
   the zone drag (a graphic's home position is a design decision, not motion; root motion
   remains the preset's job until a root row exists).

## 4. What NoaCG deliberately does NOT copy from NLEs

- No free repositioning of steps on a global clock — steps wait for cues; the ribbon is
  concatenated local clocks with cue markers (▶ » ● ■), exactly as ratified.
- Layer blocks derive FROM the state model (activation → exit); they are not arbitrary
  in/out points. Block-edge drags snap to step boundaries because that is what they mean:
  the left edge IS "which press reveals this layer". Frame-precise in/out trimming inside
  a step is keyframe work, shown as keyframes.
- No graph editor, expressions, motion paths, nested comps (unchanged from the plan).

## 5. Implementation order (each phase lands green: build + full e2e + specs)

1. Selection foundations: `selectedParts` in the store, shift-click on canvas + timeline
   labels, lasso on empty canvas, synced highlights everywhere.
2. Canvas auto-key: drop the arming gate (amendment 3); multi-selected layers drag
   together and each keys its own x/y.
3. Per-property rows: expandable layers, per-property diamonds with drag/Delete/ease,
   a per-property move mutator in animEdit.
4. Keyframe sets: shift-click, group drag, Delete, copy/paste at the playhead; snapping
   to grid + playhead + step edges + sibling keyframes (Alt bypasses).
5. Layer blocks: the existence block per row with entering/exiting emphasis and the
   reveal marker folded in; left-edge drag = activation move (snaps to step boundaries).
6. Cursor/hover pass: pointer by default, contextual cursors on handles, block/diamond
   hover states.

Deferred with their designs: step calls (plan §3b, drafted), quiz wrapper-steps, loop
categories. (The early-exit `hides` list and the canvas scale/rotate keyframe handles were
on this list and have both SHIPPED — see §2 and src/components/timeline/AGENTS.md.)
