# R1.2b.1: canvas transform tools

Base: R1.2a.6 (full transforms) landed through PR #592 as `89bdfd86`; this worktree branch
`claude/canvas-transform-tools-r1-2b-1-320d04` started from fetched `origin/main` `4abaa4a5`, which
contains it, and `/version.json` reported `4abaa4a5` live. The owner-queue items for R1.2a.4,
R1.2a.5 and R1.2a.6 (`docs/acceptance/owner-queue/2026-09-30-editor-step-authoring.md`,
`2026-09-30-editor-cross-cue.md`, `2026-10-01-editor-full-transforms.md`) have no answer yet, and
nothing reorders R1.2b, so the split below follows the plan's order.

## The R1.2b split

[EDITOR_PLAN.md](../../EDITOR_PLAN.md)'s R1.2b row now lists its bounded phases, in order:

1. **R1.2b.1, canvas transform tools** (this spec): the rotation handle, edge scale handles and the
   anchor point, so the five familiar 2D groups are complete on the canvas (B03/E04).
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
with the Anchor tool, which compensates Position so the visible pose does not move. Each change is
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
- **On an animated layer** a numeric anchor edit moves the pivot for the whole path, which is what
  changing a pivot means. The compensated edits (Center anchor and the Anchor tool) keep the pose
  at the playhead, exactly: they change Position by (M - I) x (the anchor's change), where M is
  the layer's own rotation and scale as rendered there. Where Position is animated that change is a
  key at the playhead (the R1.2a.6 adapter); elsewhere it moves the base. Where Rotation or Scale
  is animated, other times keep their keys and so change pose; the editor says so beside the
  control and does not claim to preserve the path.

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
- **Rotated layers**: corner and edge handles measure the pointer in the layer's own axes (the
  rendered matrix of the layer), so a rotated layer still scales along its own sides and keeps its
  opposite side or corner in place. Unrotated layers get the same numbers as before.
- **Anchor**: a marker at the pivot of the single selected layer. The Anchor tool (toolbar) drags
  it: the marker follows the pointer and Position compensates, one undo, Escape cancels. The
  inspector's Anchor point section has Anchor X, Anchor Y and Center anchor (compensated, as
  After Effects' Center Anchor Point in Layer Content).
- Every gesture goes through the same operations as the numeric fields (`base.set`,
  `animation.key`), as one transaction per drag; Escape and a lost pointer restore the source.

### Refusals

Source and history stay byte-identical and the reason shows beside the control (the canvas or the
Anchor point section):

- **Anchor on an SVG element**: GSAP turns an SVG element about an origin it places itself, and
  folds a CSS rotation as if about the user-space origin (above), so a CSS anchor cannot hold
  exactly. The marker still shows where the pivot is. Rotation and edge handles work on SVG.
- **Anchor owned elsewhere**: another rule, a later duplicate rule, a rule inside `@media`, or the
  inline style sets `transform-origin` or `transform-box`; the animation data has a
  `transformOrigin` track on the layer; or the graphic's script outside the animation data sets
  `transformOrigin`.
- **Placed text whose text animates Rotation or Scale**: its keys turn the text inside its box
  about the text's own centre, which no anchor on the box can follow (their offset changes with the
  number of lines). Both directions refuse: an anchor on such a layer, and a Rotation or Scale key
  on placed text with an anchor of its own.
- **Kept**: a raw `transform` track refuses Rotation keys and the rotation handle (as R1.2a.6); a
  `scale` track refuses a one-axis edge drag ("Keep them linked"); base scale beside an animated
  scale refuses (R1.1a), so the Clean Steps accent's top and bottom edges refuse while its side
  edges key `scaleX`; a singular parent or own matrix, a zero scale axis, the graphic root,
  machines, loops, calls and dynamics as before.

## Acceptance

| Portion | Observable result | Refusal (source and history byte-identical, reason beside the control) |
|---|---|---|
| Rotation handle | On a created rectangle, a quarter turn of the handle about its anchor writes base Rotation 90 (within 0.5) in one undo; the Rotation field shows it and typing that value gives the same source; Shift lands on a multiple of 15; two full turns write 720, which saves and reopens as 720; Escape cancels. On a layer whose Rotation is animated, the handle keys `rotation` at the playhead and leaves the other keys byte-identical. | A raw `transform` track. |
| Edge handles | On a created rectangle, the right handle scales X only with the left side in place, the bottom handle Y only with the top in place, Shift both by one ratio, Alt about the anchor with the same source as typing that Scale; each one undo; Escape cancels. Rotated 30 degrees, its right handle still scales its own X with its left side in place. On Clean Steps at 0.3 s the accent's side handle keys `scaleX`; on Frosted Panel at 0.28 s a Shift edge drag keys `scale` (and `y`). | The accent's top handle (R1.1a), a plain edge drag on Frosted Panel ("Keep them linked"). |
| Anchor point | Anchor X/Y show the rendered pivot (the box centre by default). Typing writes `--base-anchor-x/y` and `transform-origin` in the layer's base rule, CSS only, one undo: an unrotated layer does not move, a rotated one turns about the new point, and the canvas marker sits at it. Center anchor puts it at the box centre with every corner within 0.5 px. With the Anchor tool, dragging the marker of a rotated, scaled rectangle moves the marker with the pointer, keeps every corner within 0.5 px, and writes the anchor and base Position in one undo; Escape cancels. On Frosted Panel's box at 0.28 s the drag keys `y` at the playhead and moves the base Layout offset X, with the pose there within 0.5 px. On created text it writes the wrapper's anchor and rotates about it. | Nested SVG text; another rule owning `transform-origin`; placed text animating Rotation; a Rotation key on placed text with its own anchor. |
| Nested SVG | On fixture-svg's text inside translate(100,80) rotate(30) scale(2), the rotation handle and an edge handle give the same source as typing those values. | Its anchor. |
| Catalog | A sweep over every catalog layer with base placement: a numeric anchor edit applies (only CSS changes) or refuses with one of the reasons above, and a Rotation change of 15 degrees applies or refuses with a kept reason. | Kept reasons only. |
| Preserved | Untouched keys, tracks and flags stay byte-identical; saved graphics reopen exactly; a rectangle with an anchor and a rotation renders the same box in the simulator as in the editor; the editor regressions pass except the assertions named below. | |

### Existing assertions this decision changes

None expected. New handles are drawn before the corner handles, so `.ef-selection circle` last is
still a corner and `[data-handle]` still names corners, and none of them is a `rect`, so
`.ef-selection rect` still counts selected layers.

## Implementation

- [transformGestures.ts](../../../src/components/editorFoundation/transformGestures.ts) is the pure
  geometry: `sweep` (the angle swept round the anchor, in the parent's coordinates, never wrapped),
  `snapRotation`, `handleRatios` (scale ratios in the layer's own axes from its rendered corners,
  `localFrame`), `pivotShift` (the Position change that keeps the opposite side, corner or the anchor
  in place), `edgePoints`, `rotationKnob`, `ownLinear` and `anchorShift` ((M - I) x the anchor's
  change).
- [baseEdits.ts](../../../src/blocks/baseEdits.ts): `BaseValues` reads a declared anchor
  (`--base-anchor-x/y` named by `transform-origin` in the base rule) and the reason none can be
  written (`anchorReason`: SVG, a script or data setting transformOrigin, another rule or the inline
  style setting `transform-origin` or `transform-box`, placed text animating Rotation or Scale).
  `editBase` writes the pair and the `transform-origin` declaration, with `--scale` where the layer's
  placement scales; a base rotation on a raw `transform` track now says so.
- [editorAnimation.ts](../../../src/blocks/editorAnimation.ts): a Rotation or Scale key on placed
  text whose box has an anchor of its own refuses (`requireTextPivot`).
- [animationAuthoring.ts](../../../src/components/editorFoundation/animationAuthoring.ts):
  `shownAnchor`, `anchorOperations` (numeric: the pair only; compensated: Position through
  `transformOperations`, so a key where Position is animated and the base elsewhere, merged with the
  anchor into one base write) and `authoredAnchor` at the playhead.
- [useArtworkGesture.ts](../../../src/components/editorFoundation/useArtworkGesture.ts): typed
  handles (corner, edge, rotate, anchor); corners and sides scale in the layer's own axes (an SVG
  element's are its parent's turned by its rotation); the rotation handle accumulates the swept angle
  and tries one degree at the press so a refusal shows there; Escape during an anchor drag keeps the
  Anchor tool.
- [Canvas.tsx](../../../src/components/editorFoundation/Canvas.tsx): the Anchor tool, side handles,
  the rotation knob and the anchor marker (drawn before the corners), a turned layer's own outline,
  and the hit order corner, side, knob.
  [AnchorPoint.tsx](../../../src/components/editorFoundation/AnchorPoint.tsx) is the inspector's
  Anchor point section.
- [runtime.ts](../../../src/components/editorFoundation/runtime.ts) measures a layer's CSS `rotate`
  in its matrix (a placed text's wrapper is never folded by GSAP, so its turned corners were drawn
  unturned), measures corners on the unrounded box, and reports each layer's box and pivot.

## Verification plan

Pure parts first, in Node, beside `full-transforms`, `cross-cue` and `step-authoring`:
`scripts/canvas-transforms.test.mjs` checks the gesture math (unwrapped rotation, the 15 degree
snap, edge and corner ratios in a rotated layer's own axes, the opposite-side and anchor pivots, the
anchor's compensation and its round trip) and the operations a gesture writes (keys where animated,
base elsewhere, the shared `scale` refusal, the placed-text key refusal). Each guard is
mutation-tested. `e2e/editor-canvas-transforms.spec.ts` is written first and queued on the
unmodified code from a snapshot worktree, then the editor regressions (transforms, cross-cue, steps,
out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation,
alpha-entry), anim-engine and inspector as one job, the full affected run, build, `/check`,
`/queue-merge` and the deployed `/version.json`. The interpreter does not change, so catalog JS
fingerprints, the battery and taste frames are not re-run unless it does.
