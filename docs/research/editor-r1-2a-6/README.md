# R1.2a.6: full transforms

Base: R1.2a.5 (cross-cue moves and the Out flag) landed through PR #582 as `84811aa5` and is live
(`/version.json` reports it); the close-flag-labels backlog item landed as PR #583 (`05ddeacb`).
This worktree branch `claude/editor-r1-2a-6-transforms-dca229` started from fetched `origin/main`
`05ddeacb`. The owner-queue items for R1.2a.4 and R1.2a.5
(`docs/acceptance/owner-queue/2026-09-30-editor-step-authoring.md`, `2026-09-30-editor-cross-cue.md`)
have no answer yet, so nothing is folded in from them.

Why: the new editor refuses every layer that animates a transform or visibility channel it does
not author ("Another source channel owns this transform or visibility"). Catalog designs animate
exactly those channels, so on a catalog graphic a row's bar cannot move or trim and its Position
or Scale cannot be keyed: R1.2a.4 and R1.2a.5 stop at the catalog's own rows.

Goal: a template's own motion can be edited in the new editor. Key set (the stopwatch, the diamond,
the numeric fields and canvas gestures), key move, key ease, bar move, bar trim, Set Out and step
authoring work on the channels catalog designs animate, exactly and as one undo each. Each control
reads the runtime's own track values and writes them back in the runtime's own units (D03).

Non-goals: the close flag labels overlap (backlog item), anything from R1.2b, loops (R1.2c),
machines, calls and dynamics (they keep refusing, `sequenceAuthoringReason`), converting one
channel into another (`scale` into `scaleX` and `scaleY`, `yPercent` into `y`), percent channels
on SVG elements (base placement already refuses them), base scale beside an animated scale (the
R1.1a rule stays), skew, filter and clip-path controls, and new inspector rows. Steps stay cues
with stable names.

## Reproduction (before any change)

A Node probe at `05ddeacb` created all 528 catalog designs in Chromium (the `catalog-emit` page)
and asked `animationTarget` about every timeline layer (`getTemplateParts`, 2813 layers):

- **354 layers in 129 designs refuse with the channel refusal**: 330 animate `yPercent` (the text
  rows' mask reveals, among them 8 whose track lives under a class naming the same element, such
  as House Question's `.audience-question` for `#f1`), and 24 panels animate `scale` (with `y`
  and `opacity`: Frosted Panel, Frosted Card, Slab Bug and 21 more). The 129 designs by category:
  lower thirds 51, info cards 51, frames 9, audience 8, corner bugs 7, public info 2, alert 1. Clean Steps (card26)
  refuses all five rows, and card27 to card29, the other multi-step designs, refuse theirs.
- The rest: 528 roots (owned by playback, unchanged), 1035 layers in the 270 designs with
  machines, calls, measured motion or loops (unchanged, R1.2c and later), and 896 layers that
  already edit. No catalog layer animates `autoAlpha`, a raw `transform` string or `xPercent`
  outside a machine design; the three `xPercent` layers (tr01) are machine-owned.
- What refuses on those layers: bar move and trim, and keying (`animation.key`: the stopwatch,
  the diamond, the numeric fields and canvas gestures on Position and Scale). Key move, key ease,
  Add Step, flag drags and Set Out do not ask `animationTarget` and already work, and the Scale
  handles on a `scale` panel refuse through it (`useArtworkGesture`).
- The editor does not show the motion of an aliased layer: House Question's `#f1` row has no keys,
  since `layerKeys` reads only tracks stored under `#f1`.
- The inspector's Position Y on a `yPercent` row reads the base and `y` only. During a reveal it
  shows the resting Layout offset while the canvas draws the row 110% of its height lower.

The browser spec `e2e/editor-transforms.spec.ts` was written first and queued on the unmodified
code (j-2706, from a snapshot worktree): 7 of 7 tests failed where expected (see the receipt).

## Decisions

### Whose tracks a layer's operations use

The editor names a layer by its selector (`#f1`). Its motion lives under that selector or under
one other selector the data uses for the same element (`.audience-question`). **The layer's
owner** is the one data selector that selects this element: every animation operation on the
layer (key set, stopwatch, diamond, bar move and trim) reads and writes under it, and the
timeline shows its keys and bars in the layer's row. Key move and key ease already address keys
by their data selector. Refused, source and history unchanged, the reason beside the control:

- a data selector that selects this element and others too ("a selector that owns several
  layers": moving or keying it would move them all);
- two data selectors naming this element (tracks, bars, reveals or hides), since an edit could
  not tell which one owns what it changes.

### What each control reads and writes (D03)

| Control | Channels it reads | The key it writes |
|---|---|---|
| Position X / Y | `x` / `y` in pixels plus `xPercent` / `yPercent` in percent of the layer's own width / height | `x` / `y` when the layer animates it, else `xPercent` / `yPercent` when it animates that, else `x` / `y` |
| Scale X / Y | `scaleX` / `scaleY`, or `scale` for both axes | `scale` when the layer animates it, else `scaleX` / `scaleY` |
| Rotation | `rotation` | `rotation` |
| Opacity | `opacity` or `autoAlpha` | `autoAlpha` when the layer animates it, else `opacity` |

- A control is animated (its stopwatch on) when any of its channels has keys on the owner.
- **Displayed values** are derived, never stored: Position = base + (`y` - its value before
  motion) / document scale + (`yPercent` - its value before motion) x the layer's height / 100 /
  document scale, where the height is the layer's border box as the runtime resolves a percent
  (the preview reports it with the pose). Scale and Opacity are what the runtime reports (a
  `scale` tween reports as `scaleX` and `scaleY`, `autoAlpha` as `opacity`).
- **The inverse** writes the native value at the playhead: a Position change of d pixels adds
  d x document scale to `y`, or d x document scale x 100 / height to `yPercent`; a Scale change
  multiplies the key's value. The numeric fields and canvas gestures go through the same adapter,
  so both give the same key. A control that is not animated moves the base by the change, so
  motion the editor does not key (a raw transform, another selector's track) stays motion.
- A key on `scale` changes both axes, so it is written only by a change that keeps their ratio
  (linked proportions, a corner handle without Shift). A change to one axis refuses: "Scale X and
  Y share one `scale` track on this layer. Keep them linked to key it."
- The stopwatch off, and removing a control's last key, remove every channel of that control
  (Position Y: `y` and `yPercent`; Scale on a `scale` layer: the `scale` track, both axes) and keep
  the displayed value as the base, as before. A percent channel is kept only where its value at
  the playhead is 0: elsewhere the offset is a share of the layer's height, which changes with its
  text, so no pixel base keeps it, and the edit refuses with that reason (a percent that is not a
  number refuses too). Ending an Opacity that `autoAlpha` animates refuses, since `autoAlpha` also
  sets visibility, which a fixed opacity cannot keep. The diamond at a key removes that control's
  keys at the playhead in each of its channels, in that cue only.

### Time edits

Bar move, bar trim, key move, key ease, Add Step, flag drags and Set Out move or cut keys by time
and never read a value's unit, so they work on every channel. The blanket refusal goes; bar edits
act on the owner. One refusal stays for bars: **a layer that animates `autoAlpha`** refuses bar
moves and trims, since `autoAlpha` also sets the layer's visibility on the same timeline, so a
moved or trimmed bar would not decide where the layer shows. Its keys move as any keys do.

### Refusals kept

Source and history stay byte-identical and the reason shows beside the control:

- a raw `transform` string track on the layer refuses Position, Scale and Rotation keys and the
  Scale handles (a matrix cannot be keyed one property at a time); its bars and keys still move;
- `scale` beside `scaleX` or `scaleY`, and `opacity` beside `autoAlpha`, on one layer refuse keys
  on that control (two tracks own it);
- a change to one axis of a `scale` track; a percent key on a layer with no height or width;
- a percent channel that would be baked away where it is not 0 or not a number;
- the owner refusals above, `autoAlpha` bars, and ending an `autoAlpha` Opacity;
- unchanged: the graphic root, machines, loops, calls and dynamics, legacy hides, and every
  R1.2a.1 to R1.2a.5 timing refusal.

**Refusals removed:** "Another source channel owns this transform or visibility" for `yPercent`,
`xPercent`, `scale`, `autoAlpha` and `transform` layers and for an aliased layer.

### What the editor shows

- The timeline's property rows name the new channels: `X %` and `Y %` (with the channel's name as
  their tooltip), `Scale` and `Opacity (autoAlpha)`.
- The inspector's Transform fields and Opacity read through the adapter; their `key` / `animated`
  / `base` state counts every channel of the control.
- A flag edit on the departing side (G02) starts from that cue's own values in every channel.

### Limits

Recorded rather than changed here:

- **A percent follows its layer's box.** A `yPercent` key written from a canvas drag is the
  distance dragged at the text shown; with longer or shorter text the same key is a different
  number of pixels. That is what the source says, and it is why a percent is never baked into a
  pixel base except where it is 0.
- **Inline catalog lines have no base placement.** House Question's `#f1` is an inline span, which
  base placement does not support, so it shows no Transform fields and no canvas drag, as before.
  Its bar, keys and Opacity edit through its owner.
- **A panel whose exit ends with Out cannot move its bar.** The 24 `scale` panels keep keys at
  the start of In and the end of Out, so a bar move either way refuses by R1.2a.5's rule that a move
  never lengthens Out or starts before In. Their keys, trims and Scale edit.
- **One animated scale axis.** A layer that animates only `scaleX` (an accent line) still refuses
  base scale on its other axis (R1.1a), so a linked corner drag there refuses as before.

## Acceptance

| Portion | Observable result | Refusal (source and history byte-identical, reason beside the control) |
|---|---|---|
| Catalog | The probe finds no layer refused with the channel refusal (354 in 129 designs before). On every one of the 354, a bar move by a frame, a trim by a frame and a Position Y key at its cue's end each either apply as one change or refuse with one of the kept reasons, and none names another channel. | Kept refusals only. |
| Position | On a Clean Steps row during its reveal, Position Y shows the rendered position (base plus `yPercent` of its height). Typing a value and dragging the row by the same distance write the same `yPercent` key at the playhead; the row lands where the field says; one undo; Escape cancels a drag. | Stopwatch off where `yPercent` is not 0. |
| Scale | On Frosted Panel's box, a corner handle drag at the playhead keys `scale` (and `y`) in one undo, and linked numeric Scale gives the same key. | A Shift handle drag or an unlinked Scale field. |
| Alias | House Question's `#f1` row shows its `yPercent` keys; its bar moves them, stored under `.audience-question`. | A selector naming several layers; two selectors naming one. |
| Opacity | On a layer animating `autoAlpha`, Opacity keys `autoAlpha`. | Its bar move and trim. |
| Time edits | On Clean Steps: bar move across a Step flag, bar trim, key move, key ease, Add Step and Set Out each apply as one undo, and redo, save and reopen agree. | As R1.2a.4 and R1.2a.5. |
| Preserved | Untouched keys, tracks and flags stay byte-identical; saved graphics reopen exactly; the edited Clean Steps plays in the simulator and SPX as the editor sampled it; machines, loops, calls and dynamics refuse; the editor regressions pass except the assertions named below. | |

### Existing assertions this decision changes

None. The editor regressions, anim-engine and inspector pass unchanged.

## Verification plan

`scripts/full-transforms.test.mjs` (build gate, beside `cross-cue`, `step-authoring` and
`out-boundary`) runs the pure adapter and owner rules on data: the channel each control reads and
writes, the displayed value and its inverse (a round trip lands on the typed value), the
operations a field or gesture writes (`transformOperations`: keyed channels, base changes, linked
and unlinked `scale`), the stopwatch and diamond over two channels, percent baking at 0 and its
refusal, every refusal atomic, bar move and trim on `yPercent`, `scale`, `transform` and aliased
layers with untouched tracks byte-identical, and the alias and several-layer rules. Each new guard
is mutation-tested. `e2e/editor-transforms.spec.ts` is written first and queued on the unmodified
code: the catalog sweep, Clean Steps' Position through the field and the canvas, Frosted Panel's
Scale handles, House Question's alias, the `autoAlpha` and `transform` fixtures, the time edits on
Clean Steps with save and reopen, and playback in the simulator and SPX. Then the editor
regressions (cross-cue, steps, out-step, key-ease, ease, out, keys, fidelity-trim, base-edits,
usability, foundation, alpha-entry), anim-engine and inspector, the full affected run, build,
`/check`, `/queue-merge` and the deployed `/version.json`. The interpreter does not change, so the
catalog JS fingerprints, battery and taste frames are not re-run unless it does.

## Implementation

- [editorAnimation.ts](../../../src/blocks/editorAnimation.ts): `CONTROL_CHANNELS` names each
  control's channels; `armedChannels`, `isArmed` and `writeChannel` read them on the layer's owner
  (the pixel or per-axis channel first) and refuse a raw transform or two tracks on one control;
  `channelValue` reads a pose as the runtime reports it. `layerOwner` (pure, over a `names`
  function) and `trackOwner` (over the template's document) find the owner. `animateLayer` is the
  pure data half of `animation.key`, `layer.move` and `layer.trim`: `set` writes only the channel
  its control writes, `remove` and `disable` act on every channel of a control and return the
  controls whose motion they ended, a percent is kept only where it is 0, and `autoAlpha` bars
  refuse. `applyAnimation` resolves the owner, runs it, and keeps the ended controls' displayed
  pose as the base, as before. The blanket channel refusal in `animationTarget` is gone.
- [animationAuthoring.ts](../../../src/components/editorFoundation/animationAuthoring.ts):
  `displayedBase` adds the percent channel as a distance (`percentOffset`), `nativeValue` is its
  inverse per channel, and `transformOperations` (the pure half of `authoredTransform`) keys each
  armed control's own channel, moves the base of the rest by the change, and refuses a change to
  one axis of a shared `scale` track. A flag edit on the departing side reads every
  channel (`channelValue`).
- [runtime.ts](../../../src/components/editorFoundation/runtime.ts) reports `xPercent`, `yPercent`
  and the layer's border box (`percentBox`) with each pose;
  [timelineView.ts](../../../src/components/editorFoundation/timelineView.ts) records each layer's
  owner, whose bars and keys the timeline draws;
  [Timeline.tsx](../../../src/components/editorFoundation/Timeline.tsx) names the new property rows;
  [AnimationProperties.tsx](../../../src/components/editorFoundation/AnimationProperties.tsx),
  [ArtworkAppearance.tsx](../../../src/components/editorFoundation/ArtworkAppearance.tsx) and
  [useArtworkGesture.ts](../../../src/components/editorFoundation/useArtworkGesture.ts) key through
  the adapter.
- Tests: [full-transforms.test.mjs](../../../scripts/full-transforms.test.mjs) (build gate, 9 tests)
  and [editor-transforms.spec.ts](../../../e2e/editor-transforms.spec.ts) (7 tests).

## Verification receipt

- Reproduction: `e2e/editor-transforms.spec.ts` queued on the unmodified code from a snapshot
  worktree (j-2706) failed 7 of 7 where expected: the catalog sweep found the 354 channel refusals
  in 129 designs, Position Y read no `yPercent`, the Frosted Panel handle refused, House Question's
  `#f1` row showed no keys, and bar moves and keys on Clean Steps refused with the channel refusal.
  The Node probe of the same catalog is under "Reproduction"; after the change it finds no layer
  refused as another channel (1250 layers edit, up from 896).
- Node: `scripts/full-transforms.test.mjs` (9 tests) with `cross-cue`, `out-boundary`, `out-step`,
  `step-authoring`, `key-ease` and `ease-runtime` pass. Mutation testing: 38 of 38 guard mutations
  fail a test, including the fixes review asked for; one earlier mutant was equivalent, and the
  code it touched was removed as redundant.
- Browser: `e2e/editor-transforms.spec.ts` 7 of 7 (j-2713). The catalog sweep keys Position Y on
  all 354 formerly refused layers and trims all 354 bars; 330 bars move by a frame, and the other
  24 (the `scale` panels) refuse only because their exit ends with Out. The editor regressions
  (cross-cue, steps, out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability,
  foundation, alpha-entry), anim-engine and inspector (j-2709) passed 205 with 20 skipped; the
  one regression failure there, an editor-ease page that did not open within 7 s under load, passed
  on its rerun with the whole editor-ease spec (j-2711). No existing assertion changed.
- Full affected run (j-2720): 28 spec files, 238 passed and 134 skipped, none failed, and the
  catalog gate 35 of 35.
- The interpreter is unchanged, so catalog JS fingerprints, the battery and taste frames were not
  re-run.
- Real UI (j-2718), headless at 1920 on this worktree's dev server in one page, as the owner route
  runs, with no page errors: Clean Steps from the template search, the Step 2 row's bar dragged five
  frames across the Step 4 flag (one undo, split exactly at the flag), the playhead at 0.8 s during
  the Heading's reveal where Layout offset Y read 1.216 (yPercent 4.864 of a 25 px line), a canvas
  drag of 10 px keying `yPercent` 44.864 at the playhead with the field at 11.216 and the line
  10.00 px lower, two undos restoring the source and two redos the edit, the accent's linked
  corner drag refusing as recorded under Limits, then saved and played from its control page
  (Play, four Nexts, Stop). Frosted Panel from the template search: a corner drag at 0.28 s keyed
  `scale` 1.284 and `y` in one undo, and a Shift corner drag refused with the reason on the canvas.
  The built-in browser pane was hidden, so its preview did not draw; the walk ran as a queued
  headless job instead.
