# R1.2b.1: canvas transform tools

Base: R1.2a.6 (full transforms) landed through PR #592 as `89bdfd86`; this worktree branch
`claude/canvas-transform-tools-r1-2b-1-320d04` started from fetched `origin/main` `4abaa4a5`, which
contains it, and `/version.json` reported `4abaa4a5` live. The owner-queue items for R1.2a.4,
R1.2a.5 and R1.2a.6 (`docs/acceptance/owner-queue/2026-09-30-editor-step-authoring.md`,
`2026-09-30-editor-cross-cue.md`, `2026-10-01-editor-full-transforms.md`) have no answer yet, and
nothing reorders R1.2b, so the split below follows the plan's order.

## Owner answer, 2026-10-01: the anchor moves only the pivot

Asked in [the owner-queue item](../../acceptance/owner-queue/2026-10-01-editor-canvas-transforms.md)
whether typing an anchor should move only the pivot, and whether the Anchor tool should keep the
layer where it is, the owner answered that typing an anchor and moving only the pivot is right, and
that the Anchor tool must not move Position either: the anchor is only the point rotation, scale
and the rest of the transform turn about. Center anchor follows the same rule, a decision recorded
under Decisions that he can revert. The sections below describe the corrected behaviour; the
changed assertions are named under Acceptance.

What changed (branch `claude/editor-r1-2b-anchor-typography-bf62be`, from `ded0eb16`):

- `anchorOperations` writes `--base-anchor-x/y` and `transform-origin` alone. The Position
  compensation (`anchorShift`, the compensated branch, `authoredAnchor`), the departing-side refusal
  only it needed, `turnsOrScales` and the `own` matrix the preview reported are gone; `ownLinear`
  stays for the base-scale handles' frame.
- The Anchor tool maps the drag through the inverse of the parent's matrix, not the layer's own
  frame: with Position unchanged the pivot moves in the parent's axes, so the crosshair stays under
  the pointer. Escape still cancels.
- The Anchor tool's tooltip and caption and the Anchor point note say the anchor is the point the
  layer turns and scales about, instead of promising to keep the pose.

ANCHOR-VERIFICATION

## The R1.2b split

[EDITOR_PLAN.md](../../EDITOR_PLAN.md)'s R1.2b row now lists its bounded phases, in order:

1. **R1.2b.1, canvas transform tools** (this spec): the rotation handle, edge scale handles and the
   anchor point, so all five familiar 2D groups have their controls: Position, Scale, Rotation and
   the anchor on the canvas and in the inspector, Opacity in the inspector (B03/E04).
2. R1.2b.2, typography and fit (E05/B04).
3. R1.2b.3, images, assets and file/drop import into the open graphic (E06/B04).
4. R1.2b.4, the bounded Pen (E06).
5. R1.2b.5, align and distribute, with keyboard nudge and resize (E07/E17).
6. R1.2b.6, groups: group movement and transform, parent bar and local ruler (E07/B02).
7. R1.2b.7, folders and bins (B02).

## Why

The new editor has numeric Rotation and Scale and four corner handles, but no rotation handle, no
edge handles and no anchor point at all. The plan's "Familiar 2D transforms" table puts all five
groups in R1, with After Effects as the interaction reference, and B03 needs rotation, the anchor
and its compensated drag on supported artwork.

Goal: on any supported layer, rotate by a canvas handle (Shift snaps to 15 degrees), scale one axis
by an edge handle, and set the anchor numerically, by a Center anchor command, or by dragging it
with the Anchor tool, each moving only the pivot (the owner's answer, below; R1.2b.1 first shipped
the last two compensating Position so the visible pose did not move). Each change is
one undo; numeric and canvas results agree. On animated layers the gestures key the right channels
at the playhead through the R1.2a.6 adapter, and rotation keeps unwrapped degrees (720 stays 720).

Non-goals: typography and fit, import, assets, Pen, align and distribute, grouping and bins (later
R1.2b phases), loops (R1.2c), anything from the backlog, the Rotation field's revolutions-plus-
degrees display, an animated anchor (see below), snapping the anchor to the box, and new keyboard
shortcuts.

## Reproduction (before any change)

A probe queued on the unmodified code (j-2772, `e2e/zz-probe-r1-2b-1.spec.ts`, not kept) selected
each layer in the editor and recorded what is there:

| Layer | Base placement | Rotation | One axis of Scale | Anchor |
|---|---|---|---|---|
| Created rectangle | absolute | Numeric only: typing writes `--base-rotation` and `rotate` (one undo); 720 shows 720 | Numeric only (unlinked Scale X writes base scale); four corner handles, no edge handles | No control. The CSS default (the box centre, `150px 60px`) is the pivot |
| Created text | placed (`#fw2` wraps `#f2`) | Numeric only, on the wrapper | Numeric only | None. The text sits 6 px below its wrapper's top (an inline-block on the wrapper's line), so the wrapper and the text have different centres |
| Clean Steps rows (`#f0`, yPercent) and panel | flow | Numeric only, base | Numeric only | None |
| Clean Steps accent (`scaleX` animated) | absolute | Numeric only, base | Unlinked Scale X keys `scaleX` | None; its CSS says `transform-origin` |
| Frosted Panel box (`scale` animated) | flow | Numeric only, base | Unlinked Scale X refuses: "share one scale track" | None |
| Nested SVG text (parent translate, rotate, scale) | svg | Numeric only: CSS `rotate` about the SVG user-space origin | Numeric only | None. Computed origin `0px 0px` (`transform-box: view-box`) |

No canvas rotation handle exists anywhere; no edge handle exists; nothing shows or edits an anchor.
Across the 528 catalog designs no animation data has a `transformOrigin` track, only two
machine-owned layers (tr12) animate `rotation`, and 128 designs declare `transform-origin` in CSS.

The same probe checked GSAP 3.15 (the bundled library) against a CSS anchor: on an HTML element
with `transform-origin: 20px 30px` and CSS `rotate: 30deg`, GSAP's first read folds the rotation
into its own transform with the pose unchanged, and later rotation pivots about the same point. On
an SVG element with `transform-box: fill-box; transform-origin: 10px 5px` and `rotate: 20deg`, the
same first read moved the element by 7.1 px and 3.1 px: GSAP folds a CSS rotation as if it turned
about the SVG user-space origin, then applies its own origin. That is why the anchor refuses on SVG
elements below.

## Decisions

### The anchor is a static base value (owner decision, 2026-10-01)

Asked whether the anchor animates in this phase, the owner chose a static base value now, with its
stopwatch and keys in a later R1.2 phase. So:

- **Stored as CSS in the layer's base rule**, beside its other base values, readable and exact in
  every export:

  ```css
  #rectangle-1 {
    --base-anchor-x: 40px;
    --base-anchor-y: 12px;
    transform-origin: var(--base-anchor-x) var(--base-anchor-y);
  }
  ```

  A flow line, or a layer whose placement scales with the design, multiplies by `--scale` exactly
  as its Layout offset does: `calc(var(--base-anchor-x) * var(--scale, 1))`. The rule is the
  layer's base target (the wrapper of a placed text, as for its Position and base Rotation and
  Scale); an existing `transform-origin` there is replaced in place, so one declaration says where
  the pivot is.
- **One pivot for base and animated motion.** CSS `rotate` and `scale` and GSAP's transform all
  turn and scale about `transform-origin`, so the anchor is the pivot of base Rotation and Scale and
  of keyed rotation and scale alike. No interpreter changes.
- **Layer-local pixels.** Anchor X/Y are measured from the top-left of the layer's own box (the
  border box of its base target), in the same units as its Position. Without a declared anchor the
  fields show the rendered default (the box centre for HTML).
- **Every anchor edit moves only the pivot** (owner answer, 2026-10-01, below). Typing, Center
  anchor and the Anchor tool write `--base-anchor-x/y` and `transform-origin` alone, as one undo,
  never a Position base edit or key. The anchor is the point rotation, scale and the rest of the
  transform turn about, so on a turned or scaled layer the artwork then turns and scales about the
  new point and can shift on screen; that is the owner's choice. Position, every key and every
  track stay byte-identical, and an animated layer's whole path turns about the new point.
- **Center anchor follows the same rule** (decided here, 2026-10-01, revertible). The owner's answer
  named typing and the Anchor tool; Center is the third way to set the same value, so it agrees
  with them rather than with After Effects' Center Anchor Point in Layer Content, which keeps the
  pose. To revert Center alone, give `AnchorPoint.tsx`'s Center a Position change of
  (M - I) x (the anchor's change), M the layer's own linear transform, as `anchorOperations` did at
  `ded0eb16`.
- **No playhead or cue enters an anchor edit**: the anchor is the same on every cue, so a flag's
  departing side (G02) writes it like any other time.

### Gestures

- **Rotation handle**: a knob outside the top edge of a single selected layer, joined to it by a
  line. Dragging turns the layer about its anchor by the pointer's angle around the anchor (read in
  the parent's coordinates, so a mirrored or rotated parent turns the right way), accumulated
  frame to frame without wrapping: two full turns write 720. Shift snaps the resulting value to a
  multiple of 15 degrees. It writes what typing that Rotation writes: a `rotation` key at the
  playhead when Rotation is animated, else the base.
- **Edge handles**: one at the middle of each side. A side handle scales the layer's own X, a top
  or bottom handle its Y, keeping the opposite side in place; Shift scales both axes by the same
  ratio (After Effects' Shift); Alt scales about the anchor, which is what typing the Scale value
  does. The Link proportions setting governs corners only.
- **Rotated layers**: corner and edge handles measure the pointer in the axes the scale acts in,
  so a turned layer still scales along its own sides and keeps its opposite side or corner in
  place. A keyed scale is GSAP's, the innermost part of what renders: its axes are the rendered
  sides. A base scale is CSS `scale`, which turns with the layer's rotation but sits outside the
  layer's own CSS `transform` (and an SVG element's transform attribute): its axes are the
  parent's turned by the layer's rotation. An unrotated layer's are its parent's, which is what
  R1.1a used, so its numbers are unchanged. On a layer turned or skewed by its own CSS, a base
  scale along those axes shears it, as typing that Scale does, and the opposite side's midpoint is
  what stays in place.
- **The pivot on screen** is the computed `transform-origin`: an HTML layer's from its box, an SVG
  element's in its parent's user space (outside its own transform attribute).
- **Anchor**: a marker at the pivot of the single selected layer. The Anchor tool (toolbar) drags
  it: with Position unchanged the pivot moves in the parent's axes, so the pointer maps through the
  parent's matrix, as a Position drag does, and the marker stays under it; only the anchor changes,
  one undo, Escape cancels. The inspector's Anchor point section has Anchor X, Anchor Y and Center
  anchor (the box centre, the pivot only).
- Every gesture goes through the same operations as the numeric fields (`base.set`,
  `animation.key`), as one transaction per drag; Escape and a lost pointer restore the source.

### Refusals

Source and history stay byte-identical and the reason shows beside the control (the canvas or the
Anchor point section):

- **Anchor on an SVG element**: GSAP turns an SVG element about an origin it places itself, and
  folds a CSS rotation as if about the user-space origin (above), so a CSS anchor cannot hold
  exactly. The marker still shows where the pivot is. Rotation and edge handles work on SVG.
- **Anchor owned elsewhere**: another rule (a later rule of the same selector, a rule inside
  `@media`, a descendant rule) sets `transform-origin`; the layer's own rule declares it twice (or
  adds the `-webkit-` alias); the inline style sets it; a `transform-box` other than the border box
  measures it; the animation data has a `transformOrigin` track under a selector naming this
  element; or a script outside the generated interpreter sets `transformOrigin` and names this
  element by its id or a class. A script naming neither leaves the anchor alone: every imported
  design's text-fit script squeezes a placed line's text, never its box or a drawn layer.
- **Placed text whose text animates Rotation or Scale**: its keys turn the text inside its box
  about the text's own centre, which no anchor on the box can follow (their offset changes with the
  number of lines). Both directions refuse: an anchor on such a layer, and a Rotation or Scale key
  on placed text with an anchor of its own.
- **Kept**: a raw `transform` track refuses Rotation keys and the rotation handle (as R1.2a.6; the
  base-rotation refusal now says so, and looks at the base target, so a placed text whose text
  animates a raw transform can turn its box); a
  `scale` track refuses a one-axis edge drag ("Keep them linked"); base scale beside an animated
  scale refuses (R1.1a), so the Clean Steps accent's top and bottom edges refuse while its side
  edges key `scaleX`; a singular parent or own matrix, a zero scale axis, the graphic root,
  machines, loops, calls and dynamics as before.

## Acceptance

| Portion | Observable result | Refusal (source and history byte-identical, reason beside the control) |
|---|---|---|
| Rotation handle | On a created rectangle, a quarter turn of the handle about its anchor writes base Rotation 90 (within 0.5) in one undo; the Rotation field shows it and typing that value gives the same source; Shift lands on a multiple of 15; two full turns write 720, which saves and reopens as 720; Escape cancels. On a layer whose Rotation is animated, the handle keys `rotation` at the playhead and leaves the other keys byte-identical. | A raw `transform` track. |
| Edge handles | On a created rectangle, the right handle scales X only with the left side in place, the bottom handle Y only with the top in place, Shift both by one ratio, Alt about the anchor with the same source as typing that Scale; each one undo; Escape cancels. Rotated 30 degrees, its right handle still scales its own X with its left side in place. On Clean Steps at 0.3 s the accent's side handle keys `scaleX`; on Frosted Panel at 0.28 s a Shift edge drag keys `scale`. A thin turned layer moves from its centre. On a rectangle turned 30 degrees by its own CSS, a side drag scales along the parent's X about the opposite side's midpoint. | The accent's top handle (R1.1a), a plain edge drag on Frosted Panel ("Keep them linked"). |
| Anchor point | Anchor X/Y show the rendered pivot (the box centre by default). Typing writes `--base-anchor-x/y` and `transform-origin` in the layer's base rule, CSS only, one undo: an unrotated layer does not move, a rotated one turns about the new point, and the canvas marker sits at it. Center anchor and the Anchor tool write the same and nothing else (owner, 2026-10-01): the script, the markup, the rest of the stylesheet and every Position, Rotation and Scale value stay byte-identical, in one undo. Center anchor puts the marker at the box centre; on a rotated, scaled rectangle the artwork moves, and a typed turn afterwards keeps the marker and every corner's distance from it. The Anchor tool's marker stays under the pointer (within 0.6 px) on that rectangle, on one turned by its own CSS (which then shifts by (I - R) x the move, within 0.5 px) and on Frosted Panel's box at 0.28 s (scale and y animated; no key is added); Escape cancels. On a Clean Steps row turned 10 degrees on its base, the whole yPercent reveal shifts by one vector, (I - R) x the move, at 0.8 s and at 1.6 s, and on the Step 2 flag Center anchor writes the anchor of the row starting there. On created text it writes the wrapper's anchor and rotates about it. Saved and reopened, the anchor is the same. | Nested SVG text; another rule, a second declaration, the inline style or a `transform-box` owning the origin; this layer's data track or a script naming it; placed text animating Rotation; a Rotation key on placed text with its own anchor. |
| Nested SVG | On fixture-svg's text, with a transform attribute of its own, inside translate(100,80) rotate(30) scale(2): a 25 degree turn writes Rotation 25, an Alt side drag gives the same source as typing that Scale, and a side drag without Alt keeps the opposite side in place. | Its anchor. |
| Catalog | A sweep over every catalog layer with base placement: a numeric anchor edit applies (only CSS changes, in `--scale` units where the placement scales) or refuses with an anchor reason, and a Rotation change of 15 degrees applies on every one. | Anchor reasons only. |
| Preserved | Untouched keys, tracks and flags stay byte-identical; saved graphics reopen exactly; a rectangle with an anchor and a rotation renders the same box in the simulator as in the editor; the editor regressions pass except the assertions named below. | |

### Existing assertions this decision changes

None expected. New handles are drawn before the corner handles, so `.ef-selection circle` last is
still a corner and `[data-handle]` still names corners, and none of them is a `rect`, so
`.ef-selection rect` still counts selected layers.

The owner's answer (below) changed these R1.2b.1 assertions, and only these:

- `e2e/editor-canvas-transforms.spec.ts`, "anchor point: numeric X/Y, Center anchor and the Anchor
  tool on a rotated, scaled rectangle": Center anchor kept every corner within 0.5 px, and the
  Anchor tool kept them and moved base Position by more than 1 px. Now both write the anchor alone
  (`onlyAnchor`), the artwork moves, and a typed turn afterwards is about the new point
  (`turnsAbout`); the marker still follows the pointer.
- The same spec, "anchor on animated and placed layers": Frosted Panel's drag at 0.28 s keyed `y`
  at the playhead, wrote `--layout-x` and kept the pose. Now no key is added, the data and every
  Position value are byte-identical, and the marker follows the pointer.
- The same spec, "a layer's own CSS transform": the Anchor tool kept the turned rectangle's bounds.
  Now the marker follows the pointer and the bounds shift by (I - R) x the move.
- The same spec, "Clean Steps": the turned row's drag wrote `--layout-x` and kept the pose at 0.8 s
  and 1.6 s. Now only the anchor changes and both poses shift by the same (I - R) x the move. On
  the Step 2 flag, Center anchor refused ("next cue"); now it writes the anchor in one undo.
- `scripts/canvas-transforms.test.mjs`: the compensation test (`anchorShift` keeping every corner)
  and the compensated `anchorOperations` cases (a base move unanimated, a `y` key on Frosted Panel,
  the whole-path base move on a Clean Steps row, the raw-transform refusal, the rendered skew). Now
  `anchorOperations` writes the pair alone, and a model test pins that a drag mapped through the
  parent keeps the pivot under the pointer (the layer's own frame does not) and that the layer then
  turns about it.

## Limits

Recorded rather than changed here:

- **An anchor at a zero placement does not follow `--scale`.** A layer placed at `left: 0; top: 0`
  reads as unscaled, so its anchor is written in plain pixels while its box may grow with the
  design's `--scale` (a catalog accent); played at another scale, its pivot stays at the old
  pixel. Such a layer's Position never drifts, since it is 0.
- **A keyed rotation over a CSS rotation of the layer's own** (rare): the scale handles' axes for a
  base scale come from the shown rotation, which then misses the stylesheet's angle.
- **Placed text animates inside its box**: its keyed Position, Rotation and Scale move the text
  within the box, while base edits, the handles and the anchor act on the box (R1.1a's split). An
  anchor never pretends otherwise (the refusals above).
- **An SVG element's own pivot** is GSAP's once it moves; an SVG anchor needs its own adapter.
- **Moving the anchor of a turned or scaled layer moves its artwork** (owner, 2026-10-01): no command
  sets the anchor and keeps the pose at once. To keep the pose, move Position afterwards. On an
  animated layer every pose turns about the new point, so its whole path shifts with the anchor.

## Verification plan

Pure parts first, in Node, beside `full-transforms`, `cross-cue` and `step-authoring`:
`scripts/canvas-transforms.test.mjs` checks the gesture math (unwrapped rotation, the 15 degree
snap, edge and corner ratios in a rotated layer's own axes, the opposite-side and anchor pivots, the
anchor's compensation and its round trip) and the operations an anchor edit writes (the pair alone
when typed; the base where rotation and scale never change; a Position key where they are
animated; a rendered skew in M). The shared `scale` refusal stays in `full-transforms`; the anchor
refusals and the placed-text key refusal need a DOM and are in the browser spec. Each guard is
mutation-tested. `e2e/editor-canvas-transforms.spec.ts` is written first and queued on the
unmodified code from a snapshot worktree, then the editor regressions (transforms, cross-cue, steps,
out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation,
alpha-entry), anim-engine and inspector as one job, the full affected run, build, `/check`,
`/queue-merge` and the deployed `/version.json`. The interpreter does not change, so catalog JS
fingerprints, the battery and taste frames are not re-run unless it does.

## Implementation

- [transformGestures.ts](../../../src/components/editorFoundation/transformGestures.ts) is the pure
  geometry: `sweep` (the angle swept round the anchor, in the parent's coordinates, never wrapped),
  `snapRotation`, `handleRatios` (scale ratios in the layer's own axes from its rendered corners,
  `localFrame`), `pivotShift` (the Position change that keeps the opposite side, corner or the anchor
  in place), `edgePoints`, `rotationKnob` and `ownLinear`.
- [baseEdits.ts](../../../src/blocks/baseEdits.ts): `BaseValues` reads a declared anchor
  (`--base-anchor-x/y` named by `transform-origin` in the base rule) and the reason none can be
  written (`anchorReason`: SVG, a script or data setting transformOrigin, another rule or the inline
  style setting `transform-origin` or `transform-box`, placed text animating Rotation or Scale).
  `editBase` writes the pair and the `transform-origin` declaration, with `--scale` where the layer's
  placement scales; a base rotation on a raw `transform` track now says so.
- [editorAnimation.ts](../../../src/blocks/editorAnimation.ts): a Rotation or Scale key on placed
  text whose box has an anchor of its own refuses (`requireTextPivot`).
- [animationAuthoring.ts](../../../src/components/editorFoundation/animationAuthoring.ts):
  `shownAnchor` and `anchorOperations` (the pair alone, owner 2026-10-01).
- [useArtworkGesture.ts](../../../src/components/editorFoundation/useArtworkGesture.ts): typed
  handles (corner, edge, rotate, anchor); corners and sides scale in the layer's own axes (an SVG
  element's are its parent's turned by its rotation); the rotation handle accumulates the swept angle
  and tries one degree at the press so a refusal shows there; the Anchor tool maps the pointer
  through the parent; Escape during an anchor drag keeps the Anchor tool.
- [Canvas.tsx](../../../src/components/editorFoundation/Canvas.tsx): the Anchor tool, side handles,
  the rotation knob and the anchor marker (drawn before the corners), a turned layer's own outline,
  and the hit order corner, side, knob.
  [AnchorPoint.tsx](../../../src/components/editorFoundation/AnchorPoint.tsx) is the inspector's
  Anchor point section.
- [runtime.ts](../../../src/components/editorFoundation/runtime.ts) measures a layer's CSS `rotate`
  in its matrix (a placed text's wrapper is never folded by GSAP, so its turned corners were drawn
  unturned), measures corners on the unrounded box, and reports each layer's box and pivot.

## Review and simplification

Review ran as one workflow of four read-only reviewers (the gesture geometry and the preview's
measurements; the anchor's storage and refusals; the authoring and inspector wiring; tests and
docs), each followed by one refuter, eight agents in all. They raised 26 findings; the refuters
confirmed 19 and 6 in part, and refuted 1 (the declared anchor read from an `@media` rule cannot
make a placed text, since its placement is read the same way; reading from the written rule is
kept as consistency). Fixed:

- **M was only the shown Rotation and Scale**, so a layer with a CSS `transform` of its own (a
  turned accent, a skewed divider) jumped when its anchor moved. The preview now reports each
  layer's own linear transform and the compensation uses it. Two reviewers found this.
- **Scale handles regressed R1.1a on such layers**: they measured in the rendered sides, inside
  the layer's own transform, though CSS `scale` acts outside it. A base scale now measures in the
  parent's axes turned by the layer's rotation (R1.1a's frame when unrotated); a keyed scale, which
  is GSAP's and innermost, keeps the rendered sides.
- **The anchor's compensation keyed Position even where nothing turns or scales**, distorting a
  reveal and, on placed text, keying the text inside its box in the wrong frame. Where rotation
  and scale never change, the base now takes the compensation and the whole path is kept; keys
  remain only where Rotation or Scale is animated. A compensated edit on a flag's departing side,
  whose pose the preview does not show, refuses.
- **The script refusal was graphic-wide**: every imported design's text-fit script set it off on
  every layer. It now refuses only where the data or a script names this element. A second
  declaration in the layer's own rule now refuses; a `transform-box` of the border box no longer
  does, and the message names the box; the base-rotation refusal looks at a placed text's box.
- **The preview stayed on a snapped pose** when a Shift turn came back to its start; a thin turned
  layer's centre grabbed a side handle (the reach now comes from its own sides); an SVG element's
  pivot was mapped through its own transform attribute; the Anchor point section wrote without
  checking the preview's revision and cue; its note missed a raw transform track.
- **Tests and docs**: the SVG checks could not fail for a wrong frame (the text now has a transform
  attribute of its own, and a side drag must keep its opposite side); the untested refusals,
  per-gesture undo, neighbouring keys, the anchor's save and reopen and a skewed layer are now
  asserted; the sweep pins its reasons per kind; the covers header names `designLayout` and
  `artworkEdits`; the receipt's claims (five groups, Frosted Panel's `y`, the Node test's reach,
  the mutation count) are corrected.

Recorded as limits, not changed: a zero placement's anchor units and a keyed rotation over a CSS
rotation (see Limits).

Simplification (four cleanup passes: reuse, simplification, efficiency, altitude) kept behaviour
and removed work: the stylesheet is parsed once for the matching rules and the anchor's rival rule;
one helper reads an element's data tracks (with `allTimelines`); a base rotation's refusal is
decided at inspection (`rotationReason`) instead of reparsing the document on every write; the
preview runtime reads each target's computed style once and its origin once, and `DOMMatrix` reads
a CSS rotate's unit; the gestures share one 2x2 inverse, one box centre and, with the writer, one
test for a keyed control (`keysControl`); the anchor merges through `transformOperations`' base
write; a drag back to its start sends the source to the preview once, not on every move. Skipped as
larger than this phase or outside the diff, and recorded here:

- The departing side of a flag shows the arriving pose's geometry to every handle, not only the
  anchor: a scale handle there measures sides the edit does not land on (as since R1.2a.4). A
  deeper fix marks such a pose as unrendered for every geometric handle.
- `setCssDeclaration` replaces the first of repeated declarations while the cascade uses the last;
  the anchor refuses that case, other properties do not. One declaration reader and writer in
  `edit.ts` would serve them all.
- A measured backstop for the anchor (a declared anchor whose rendered origin differs means
  something else owns it), and `session.preview([])` returning the source rather than refusing an
  empty batch.

## Verification receipt

- Reproduction: a probe on the unmodified code (j-2772) recorded the table above, and
  `e2e/editor-canvas-transforms.spec.ts`, written first and queued on the unmodified code from a
  snapshot worktree (j-2773), failed 8 of 8 where expected: no rotation knob, side handle, anchor
  marker, Anchor tool or Anchor fields, and the catalog sweep found 1878 layers with base placement
  and no anchor written.
- Node: `scripts/canvas-transforms.test.mjs` (6 tests) with `full-transforms` pass. Mutation
  testing on the final code: 62 of 62 guard mutations fail a test, 30 of the pure geometry and
  operations in Node and 32 of the DOM guards in the browser spec (j-2800, j-2801). Along the way
  three survivors exposed weak tests and one equivalent branch: the nested SVG text never had the
  transform attribute its test meant to give it (the replace hit a comment), a keyed scale under a
  layer's own CSS rotation was untested, a drag snapping back to its start was restored twice, and
  `centreOf` was unpinned; each now has a test or was removed.
- Browser, at the tip: `e2e/editor-canvas-transforms.spec.ts` 10 of 10. The catalog sweep writes an
  anchor on 1872 of 1878 layers with base placement, only CSS changing; 5 refuse because their
  design's script turns that very element (the game timers' clock and accent) and 1 is SVG; a
  15 degree Rotation applies on all 1878. The editor regressions (transforms, cross-cue, steps,
  out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation,
  alpha-entry), anim-engine and inspector as one job (j-2802): 209 passed, 20 skipped, none failed.
  No existing assertion changed. Full affected run (j-2803): 29 spec files, 262 passed and 134
  skipped, none failed; catalog gate 35 of 35.
- Build at the tip (j-2804): gates, 2319 Node tests (2317 pass, 2 skipped), typecheck, lint,
  dependency rules, the bundle and the after-build line-endings check pass.
- Real UI (j-2805, at the tip), headless at 1920 on this worktree's dev server in one page, as the
  owner route runs, with no page errors: Hairline from the template search, a rectangle drawn with
  the Rectangle tool, a Shift turn of its handle to 45, its right side to Scale X 126 with Y 100,
  Anchor 0, 0 and a turn about that corner (the corner moved 0.00 px), Center anchor (bounds within
  0.01 px), the Anchor tool onto its bottom-right corner (bounds within 0.01 px, one undo), a turn
  about it, undo and redo, then saved and reopened with Rotation 55.003 and the anchor 326.391,
  129.594 intact. Frosted Panel from the template search: at 0.32 s the Anchor tool kept the panel
  within 0.01 px and keyed Position Y at the playhead in one undo; at 0.88 s a turn wrote Rotation
  8 and a Shift side drag keyed Scale 108.5; saved and played from its control page (Play, then
  Stop), where the panel enters turned and scaled about its new anchor. The built-in browser pane
  was not used; the walk ran as a queued headless job.
- The interpreter is unchanged, so catalog JS fingerprints, the battery and taste frames were not
  re-run.
- Not checked: a physical desktop at 125% scaling, a phone, and the receiving CasparCG and OGraf
  hosts (an anchor is CSS, which every export carries; the simulator renders the edited rectangle
  within 0.5 px of the editor).
