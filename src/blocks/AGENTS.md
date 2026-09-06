# src/blocks - deterministic template transforms

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.

Everything here is a pure `(template) => template` transform that emits clean, commented code
(root non-negotiables 1, 2 and 5). The panels, canvas, and timeline are thin UIs over these
patchers.

## registry.ts - building blocks

BuildingBlock[] - there is no Blocks tab anymore; this is the offline AI stub's vocabulary. Pure
transforms grouped by a hierarchical `path` (e.g. `['Lower third']`, `['Animation','GSAP']`) with
a `primaryTab` (the tab to reveal after applying). Inserted elements are positioned in the
lower-left action-safe area via `positionForNewElement`, tagged `data-gfx`, and styled with
`textCssRule` (rich commented CSS). Animation is two tracks: **CSS** (`@keyframes` + class
applied to the element) and **GSAP** (tween injected into `play()/stop()`).

**A block nothing can reach is deleted, not repaired.** The stub applies `fullscreen` and nothing
else, so an entry here is only as alive as its callers. The `countdown` block went on 2026-08-29:
unreachable, and wrong in three ways at once - it decremented a counter per `setInterval` tick
instead of anchoring a deadline (so it drifted late under load and lost minutes in a background
tab), read its duration field once and ignored every later Update, and hid that field with an
inline `display:none` the editor's entrance reset clears. `templates/shared/clock.ts` is the
countdown that works, and a countdown wanted here again is that runtime rather than a second copy
of the idea. Adding a block back is cheap; a second divergent implementation of playout logic is
what is not.

## edit.ts

Field/definition editing helpers: nextFieldId, addFieldToDefinition, setFieldDefault, … plus
`addCatalogLine` - the Data panel's add-field on a STANDARD-CONTRACT catalog template.
Code-derived gate (never category): the `{p}-mask` + `{p}-name|-title|-extra` line idiom; the
new line is CLONED from the last one's exact markup (id/class/text swapped) - the last of the
HOST's lines, since an inserted graphic's lines carry their own namespaced prefix and are not
this design's - classed by the
assembler's lineClassFor ladder with a fallback to the last line's class when the design
ships no rule for the canonical one. Fixed contracts (scoreboard cells, quiz rows) and
data-driven categories (hidden textarea sources) fail the gate and keep the definition-only
add - a field no element answers, which on a catalog line template was the silent on-air
no-op this exists to end.

## assetOps.ts - the Assets panel's transforms

`moveAsset(template, from, to)` - move/rename an asset path with an exact-string rewrite of
every reference across html/css/js (the verbatim-path convention inlineAssetRefs relies on),
plus `insertImageElement` - the drag-to-canvas drop: a commented, absolutely positioned
`<img id="img-*" data-gfx>` + CSS rule at the drop point - and `insertVideoElement`, its
video twin: a muted, looping, `playsinline` `<video id="vid-*" data-gfx>` (autoplay needs
muted in every playout browser; .webm keeps alpha). Video assets are size-capped at import
(assetUtils MAX_VIDEO_ASSET_BYTES - they ride the saved template as data URLs). Callers
apply through ONE applyTemplate so a move (or a drop) is one undo step.

## templateInsert.ts - "Add template graphic" (insert, never replace)

`insertTemplateGraphic(current, variant, { placement })` - the pure merge behind
components/InsertTemplateDialog.tsx: lift `variant.create()`'s visual subtree into the
current project. Everything a naive splice would collide on is NAMESPACED: the donor class
prefix gains a unique suffix (`lower-third-2`), donor fields renumber onto the host's next
free `fN` (titles marked with the variant name), the donor `:root` block is RE-SCOPED onto
the inserted root (`#gfx-*` - custom-property inheritance keeps its palette/typeface
without retinting the host), the reset/canvas CSS and donor runtime scaffold are dropped,
and the donor MACHINE is dropped - one document, one runtime, one timeline/state system.
The inserted root is tagged `data-gfx` (a normal registry part, step-assignable like any
element); donor In/Out keyframes merge into the host's entrance/exit ('start') or into a
new named default-path step revealing the root ('new-step'), speed-normalized. The donor's
MIDDLE steps are kept, not flattened: each becomes its own host default-path step
(machine-aware `addStep(data, at)`), inserted CONTIGUOUSLY after wherever the run starts,
with `reveals`/`hides` carried through the same namespace rewrite as every other selector.
Contiguity is the point - a donor's second beat usually finishes a move its first began, so
host presses are never interleaved into the middle of it. `buildDonor(variant, steps)` is the
one donor build (`opts.steps` = the design's line-by-line reveal, the dialog's "Its lines"
choice); a design with no stepped build simply has no middle steps to carry. `insertBlocker`
is the honest gate: donor step `calls`/`dynamics`, or functions beyond the standard scaffold
in the donor JS, refuse the insert with the reason - code-derived, never a category list.

## lottieInsert.ts - Lottie placement

`insertLottieElement` - the drag-to-canvas drop for a `lottie/<file>.json` asset: a
positioned `<div id="lottie-*" data-gfx data-lottie="<path>">` container, a commented CSS
rule, ONE shared idempotent bootstrap in the JS (decodes an inlined data: URL with atob -
no fetch, so file:// playout works - or hands a real path to the player), and the bundled
player's `<head>` script tag (mirrors the GSAP tag; preview/exports strip-inline-or-keep it
identically, and only when used - see assets/lottieSupport.ts). Autoplay + loop in v1; the
timeline animates the container like any block part.

## cssVars.ts / cssLength.ts

`:root` variable read/write helpers (the style surfaces' patch layer), plus the two value
models the controls above them need.

**Colour, WITH its alpha.** `parseCssColor`/`formatCssColor` are anchored (a shadow list is
not a colour) and round-trip a value in the form it arrived in: an opaque hex stays hex, a
translucent one stays `rgba()`. The older `toHex` remains, because `<input type="color">` has
no concept of alpha - but it must never be the write path. It regex-SEARCHES for `rgba?(...)`
anywhere in a value, which is how `--panel-shadow: 0 8px 24px rgba(0,0,0,.4)` came to render
as a colour row whose swatch replaced the entire shadow, and how editing `--panel-bg` through
a swatch silently turned a translucent panel opaque. `contrastRatio` composites a translucent
colour over what is behind it first, and is ADVISORY by construction - see
src/components/AGENTS.md for why the UI must not turn it into a verdict.

**Length, INSIDE its expression.** `cssLength.ts` reads the first number out of a token value
and writes a new one back between the same prefix and suffix, so `calc(16px * var(--scale))`
keeps its multiplier and `blur(18px)` keeps its function. Overwriting the whole value would
give a control that appears to adjust a radius and quietly stops it scaling with the graphic.
A value with no number (`none`) returns null and is left alone - that is a real state, not a
zero.

**Whether a role is WIRED TO ANYTHING** (`cssPaintsWith`, 2026-09-02). This one decides which
style controls exist at all, not how a value is written, so treat it as a contract rather than a
helper. The `:root` block declares all four palette roles whether or not a design paints with
them, so their presence proves nothing: measured over the catalog, 11 designs never read
`--accent`, 97 never `--panel-bg`, 126 never `--text-dim`. It answers "does anything outside
`:root` read this role", following the `:root` chain (the theme tokens alias roles -
`--label-color: var(--accent)` - and a design that paints its kicker reads only the alias) and
stripping comments first, because the house style writes about variables it deliberately did NOT
use. It is CONSERVATIVE on purpose: a rule that reads the role but matches no element in this
draft still counts, because the element arrives the moment the field is added. Loosen it and the
wizard's Style step goes back to offering packages that cannot change the graphic (the owner's
2026-08-28 bug); tighten it and it hides controls that work. Pinned by
e2e/wizard-setup-fields.spec.ts, which the affected-spec map reaches from this file.

## designLayout.ts - placed-line design decisions (the imported-design surface)

The read/write pairs for text lines whose look is a DESIGN decision written in the CSS: the
imported-design assembler puts each line's `left`/`top` on its wrapper's rule
(`#fwN { left: calc(Npx * var(--scale)) }`) and its type on the span's `#fN` rule.
`placedLines(html, css)` derives the map on every call (never stored, like getTemplateParts);
`placeLine` patches one wrapper's rule via setCssDeclaration; `lineFontSize`/`setLineFontSize`
are the same pair for the span's font-size (the canvas corner handle on a placed line). The
gate is code-derived, never category-derived: a line is "placed" when its parent carries an id
whose rule holds readable left+top px values - so a hand-written template with that shape opts
in, and catalog templates (mask divs without ids) never match. The canvas drag for a placed
line goes through THIS (placement), and the line is excluded from the position-KEYFRAME drag
and the keyframe scale/rotate handles - moving a field independently of artwork drawn around
it is what whole-unit motion exists to prevent (docs/IMPORT_MVP.md).

`lineTextStyle`/`setLineTextStyle` are the same read/write idea for a text line's whole LOOK
(the Inspector's Style tab): font-family (a bundled font id, the design font, or 'custom' when
hand-written — picking a bundled face also ships its @font-face, deduped by the emitted rule),
font-size, weight, color, line-height, letter-spacing on the span's `#fN` rule, and the anchor
(the wrapper's translateX shift) on `#fwN`. Every write is a setCssDeclaration patch in the
rule's own idiom, so the canvas gestures and these controls stay one language.

`lineFit`/`setLineFit` are the FIT pair: the wrapper's `max-width` is the line's slot, and the
mode is how a too-long operator value answers it - `overflow` (no cap; what a pre-fit saved
template reads as, so nothing changes under it), `wrap` (CSS), or `shrink` (one row, condensed
by templates/shared/textFit.ts's `fitPlacedText()`, marked `data-fit="shrink"` on the element).
`ensureTextFitRuntime` injects that design-owned runtime - and the shared update()'s optional
hook when the template predates it - ONCE, idempotently (the lottieInsert bootstrap pattern),
and NOT AT ALL into an imported SVG: that design runs ONE fit, its own ladder, which measures
placed lines too (`SVG_TEXT_FIT_MARKER`, docs/SVG_IMPORT_PLAN.md §6b - only the ladder can
report a value as too long, so a second runtime there would silence the operator's warning).
New lines from `addPlacedLine` default to `shrink` with the room to the artwork's right edge.

`designStretchInfo(html, css)` derives a design's SCALING MODE + 9-slice guides from the
emitted declarations (`.{prefix}-art` carrying border-image-slice + readable cap widths =
stretch; anything else - including every saved template - reads as fixed, null). The slot of a
stretch-driving line carries the growing idiom `calc((Npx + var(--stretch-x, 0px)) *
var(--scale))`: `readPx` reads it back with a `stretch` flag and `placementCss`'s third
argument writes it - `setLineFit` MUST mirror it (LineFit.stretch) or an edited slot stops
growing. On a stretch design `addPlacedLine` marks lines left of the right cap as drivers
(`data-stretch` wrapper attribute, slot to the cap start); it also takes optional
fontSize/maxWidth/color overrides (the Prepare step's erased-region seed field).

`addPlacedLine(template, {title, ftype})` is the Data panel's add-field on an imported design:
ONE pure transform emitting the mask wrapper + span (a registry `line` part), the placement +
type rules in the assembler's exact idiom, and the SPX DataField (update() binds by id - no JS
change). The element lands after the unit's last mask or the artwork's END - after `</svg>` for
an inlined SVG, never inside it. New lines stack under the lowest existing line and inherit its look. Optional `align`
writes the anchor (the wrapper's translateX shift, the assembler's idiom that lineTextStyle
reads back) and sizes the default slot from that anchor outwards; optional `lineHeight` pins
the span's line-height. Both exist for the Prepare step's seeded field, which is built from
the erased text's MEASURED ink (assets/eraseRegion `RegionInk`) so it lands where that text
was - bounds, one line's height, its top, and which edge it was set from.
`addPlacedImageSlot(template, {title})` is its image twin: `<img id="fN">` in the mask (a
registry `image` part), a sized slot box with a dashed empty-slot mark (`.has-image` keyed -
setFieldValue already toggles it), and a filelist DataField; `slotSize`/`setSlotSize` are the
box's resize pair (the corner handle on a slot). Both gated by `designBoxInfo` (a box whose
unit carries `<prefix>-art`); they return null off-shape so the caller falls back to the
definition-only add.

## The Timeline v2 animation-data engine

Data-block templates carry `var NOACG_ANIM = { ... };` (strict JSON inside the braces) plus a
fixed interpreter in the marked ANIMATION region (emitted by
src/templates/shared/animRuntime.ts). These modules are the editor's side of that contract;
editor <-> runtime parity is pinned by e2e/anim-engine.spec.ts.

- **animData.ts** - the schema + the literal's read/write. AnimData = version/root/speed/steps
  **/machine?** (the STATE MACHINE, format version 2 - docs/STATE_MACHINE_SCHEMA.md);
  `machine.controls` (MachineControl[]) is the ADDITIVE OPTIONAL control-surface metadata -
  label/section/order/payload-field-ids/adjust-deltas/set-figures/add-and-remove-lists/destructive per
  operator event (one road per field; `add`/`remove` map a lines field to the field whose value is
  the line), travelling INSIDE the template so exported control pages keep their labels
  (docs/CONTROL_LAYER.md);
  a step = name/duration/ease/reveals?/hides?/calls?/dynamics?/loops?/layers (durations and keyframe times
  are speed-relative: playback divides by `speed`; `reveals` names the layers that FIRST become
  visible in that step, `hides` the layers that LEAVE in it - the early-exit twin, its existence
  span ends there instead of at the final Out; both are explicit data, never inferred from
  keyframes). `loops` is `loops[selector][prop] = { repeat, yoyo?, repeatDelay? }` - a per-track
  loop (GSAP values: repeat -1 = forever, yoyo = breathe back and forth): the interpreter plays
  that track in its own repeating sub-timeline, so an ambient breath lives in the same data as
  every other track (the `layers` arrays are untouched - loops sit beside them). `calls` are
  lifecycle hooks - `{ time, call }` where `call` is a bare identifier
  naming a global template function (a clock engine's `startClock`/`stopClock`); the interpreter
  fires them via `window[name]` at their moment on the step's clock (no eval, ever), and settle
  suppresses them like any GSAP callback (docs/TIMELINE_V2_PLAN.md §3b). `dynamics` is the MOTION
  twin of `calls` - `{ time, build, target? }`, where `build` names a global BUILDER function that
  measures the DOM and RETURNS a GSAP tween/timeline the interpreter adds to the step
  (docs/DYNAMIC_MOTION_SCOPE.md). This is the ONLY way motion whose magnitude comes from the
  operator's content can live in the data at all - a marquee's track-width travel, a credits roll's
  content-height, one flip segment per item: no static keyframe number can hold a value that changes
  the moment the text does. The data holds a NAME and a TARGET, never code; the measured logic stays
  readable JS OUTSIDE the marked region (the category motion runtimes - see src/templates/AGENTS.md),
  which is also why it survives export untouched. The timeline renders these READ-ONLY: you cannot
  meaningfully keyframe "travel by measured width", so the visual editor steps aside and names the
  builder instead of implying an affordance it doesn't have. A keyframe is
  `{ time, value, ease? }` - value is a number or a string (filter/clipPath interpolate as
  strings); `ease` is the ease INTO the keyframe, defaulting to the step's. `locateAnimData`
  brace-matches respecting JSON strings (a hand-edited block need not match the canonical
  layout); parsing is strict JSON + structural validation - anything off-shape degrades to
  "hand-crafted" honestly, never a crash. `serializeAnimData` is CANONICAL: fixed key order,
  fixed 2-space indentation, keyframes one per line, 3-decimal rounding - a fixed point
  (serialize(parse(serialize(x))) === serialize(x)) so a small visual edit only touches the
  lines it changed. `spliceAnimData` replaces ONLY the object literal; every other character
  of the file (interpreter, user code) is untouched.
  **FORMAT VERSION (the doctrine, docs/STATE_MACHINE_SCHEMA.md §5):** `parseAnimData` is a
  NORMALIZING parse - a valid version-1 block migrates on read (`migrateAnimData`), so
  everything downstream sees only the current shape - and serialization ALWAYS writes the
  current version (one canonical shape, one fixed-point proof; a saved v1 document flips on
  its first edit, a one-line diff). Additive optional fields never bump the version; a
  BREAKING shape change bumps it and ships its migration here the same commit; an unknown
  version degrades to hand-crafted, never a crash.
- **machineEdit.ts** - the NODE EDITOR's pure mutators (Phase 4; the UI is
  components/timeline/MachineGraph.tsx). Same contract as animEdit: `(data) => data | null`, caller
  applies via `writeAnimData` + ONE applyTemplate. Every mutator starts from
  `withExplicitMachine` - a machine-less template's first graph edit MATERIALIZES the derived
  machine into the literal (behaviourally a no-op at that moment). Legality is delegated to
  the ONE shape gate (`isAnimData`) so the editor can never write a machine the parser would
  refuse - which is how event uniqueness, reserved names and the single-timer rule are
  enforced without a second rulebook - plus `validateMachine` where shape can't see the
  problem: `removeTransition` refuses an edit that ADDS validation errors (deleting the only
  arrow behind a default-path edge disconnects the walk; deleting one of two parallel arrows
  stays legal). Transitions: trigger switch (minting a unique event / defaulting the delay),
  event, timer delay, STYLE + duration + ease (TRANSITION_STYLES). A LIFECYCLE edge (the
  materialised play/stop) takes style edits only - trigger switch and delete return null on
  it (play and stop always exist; clearing the style is the "remove" that means something).
  Structure: addTransition
  (port-drag), addState/deleteState (OFF-PATH only - waypoints belong to the timeline, and
  the initial state never goes), addGroup/removeGroup (main never goes), setStatePosition
  (the additive `at` field), and **setStateTimeline** - give an off-path state its own inline
  timeline or take it away. That one is what lets a branch LOOK different from the state
  before it: a pose's look is composed by replaying the route to it, so before this every
  authorable branch was by construction a copy of its predecessor. `addState` deliberately
  still creates a POSE (Off and a hold are legitimate states); attaching content is an
  explicit act, from the state card.
- **timelineLens.ts** - WHICH timeline the step surface is editing. Motion lives in two places:
  the default path's `steps`, and a branch state's own `state.timeline`. Every animEdit mutator
  takes a step INDEX and both the timeline and the Inspector read `data.steps[i]`, so rather
  than teaching each of them a second address we PROJECT: `lensRead(data, target)` returns the
  document itself for the path, or a ONE-STEP AnimData carrying that state's timeline (with
  `machine` dropped, so the walk's cue markers and `spxSteps` cannot describe a branch as if it
  sat on the path); `lensWrite` folds the edited step back, taking every TOP-LEVEL field from
  the edit (a speed change made while a branch was open is still a change) and `steps` from the
  original. It STRIPS `reveals`/`hides` on the way in - they are the ordered walk's mechanics
  and `isAnimStepShape(_, false)` refuses them on an inline timeline. The target lives in
  templateStore, never here: the Inspector resolves values against the same projection, and a
  component-local target would have it editing the entrance while the timeline showed a branch.
  **`scrubPhase(target, pathPhase)`** is the same idea for the PREVIEW: the scrub protocol
  addresses the walk's phases ('in' / 'out' / 'step-N') and a branch is on none of them, so a
  branch answers `state:<groupId>:<stateId>` (read back by `parseStatePhase`, resolved by
  PlayoutSimulator through the runtime's own `noacgEnterTimeline`). One rule for every caller -
  the timeline, the Inspector and the canvas - because each of them computes a phase from a
  step INDEX, and on a one-step projection every one of them would otherwise have called the
  branch's only step 'in' and jumped the preview to the graphic's entrance.
  **Every surface that keyframes at the playhead must read AND write through the lens.** The
  canvas is the easy one to forget: it took its data straight from `parseAnimData`, so with a
  branch on screen a canvas drag wrote x/y into the default path's step while the strip showed
  the branch.
- **animMachine.ts** - the machine's editor-side seam (animData owns the literal, this owns the
  GRAPH questions). `deriveMachine` builds the implicit ONE-GROUP linear machine for data with
  no `machine` key - states named after the steps, a synthesized pose-only `off`, a `next` arrow
  along the path, and the walk's entrance/exit MATERIALISED as `lifecycle` transitions (play
  into the first waypoint, stop between the last two - the stylable arrows; `parseAnimData`
  injects the same pair into explicit machines where the seat is vacant). V1 parity holds
  because next() fires OPERATOR arrows only - the stop edge never makes a press legal.
  `lifecyclePair`/`rehomeLifecycleEdges` are the canonical-seat rule + the re-seater the step
  mutators call so a styled stop edge survives path edits. It is derived on read and NEVER
  persisted, which is why the whole catalog gained dispatch / snap / introspection without one
  template file changing. `spxSteps(data)` is THE
  `settings.steps` rule (default-path length - 1; numerically identical to the historical
  `steps.length - 1` by the positional-binding invariant) - every re-sync site calls it, so the
  rule lives once. Plus `canonicalPath` (the snap route: default-path prefix for a main-group
  waypoint, else BFS from the group's initial, ties by declaration order - MIRRORED by the
  interpreter's `noacgCanonicalPath`, the animEval precedent), `operatorEvents` (the spec's
  "Action" - what an operator may do right now, which IS the structural guard),
  `allOperatorEvents`, `machineControls` (THE one button-list merge every control surface
  renders - declared `machine.controls` entries dressed over the authored events; an
  undeclared `next` is skipped because the lifecycle button already fires it),
  `timerTransition`, `validateMachine` (semantic errors/warnings for validateTemplate;
  the SHAPE gate stays in animData's `isAnimData`), and **`stateProblems`** - the subset of
  those findings that belong to ONE state (unreachable; a timer on a timeline that never
  ends), returned STRUCTURALLY `{groupId, stateId, severity, message}` so the node editor can
  mark the box it is about. validateMachine folds them back into its own lists, so the rule is
  written once: a finding cannot appear on the graph and not in the export report, or vice
  versa. Split out because a branch state can carry a whole hand-built timeline and still
  never be entered, and leaving that to the Export panel meant the surface that let you build
  it said nothing.
  THE POSITIONAL BINDING, the one thing to hold onto: `defaultPath[i]`'s timeline IS `steps[i]`.
  No stored indices to go stale - and it is why every timeline surface keeps working under a
  machine. Its consequence: step-structural edits (`addStep`, `deleteStep`, `duplicateStep`,
  `setLayerActivation`, `renameStep`) are MACHINE-AWARE - they move the bound waypoint with the
  step and CARRY the walk's arrows across the change (an insert re-points the split arrow at
  the new waypoint, a delete re-points the arrival at the successor - trigger, event, delay
  and style intact, so a timer auto-advance survives; the one exception is an arrival that
  would land on the FINAL waypoint, dropped rather than silently granting next-drives-out or
  an auto-stop; `reconnectPath` then only mints plain `next` for genuinely new pairs; names
  sync one way via `syncWaypointNames`) - and they are the ONLY way waypoints are added or
  removed: the node editor deliberately edits off-path structure and arrows, never the walk
  itself.
- **animEdit.ts** - pure keyframe mutators; every editing surface routes through these, then
  spliceAnimData + one applyTemplate makes the edit real, undoable code. setKeyframe /
  deleteKeyframe (per property), moveLayerKeyframes / deleteLayerKeyframes (the aggregate
  diamond's drag/Delete), setKeyframeEase / setStepEase, and setLayerActivation - the data
  twin of the legacy press chain: moving between presses carries the layer's tuned reveal
  keyframes, entering/leaving the press world writes the channel's default motion; emptied
  presses disappear and default step names renumber. Steps as clips: resizeStep ('preserve'
  keeps keyframe timing - extending leaves settled air, shrinking clamps at the last keyframe
  so motion never silently truncates; 'stretch' = Alt scales times proportionally),
  setLayerHide - the early-exit twin: writes/clears a step's `hides` for a layer (clamped after
  its activation; hiding at Out clears it), driven by the timeline block's RIGHT edge.
  duplicateStep (copies keyframes, NOT reveals or hides; never lands after Out), renameStep,
  deleteStep (layers it revealed return to "appears with ▶ Play" with the channel's default
  motion), addStep (an empty content step just before Out - or at an explicit index, clamped
  between the entrance and Out, which is how an inserted graphic's step run lands contiguously).
- **filterTrack.ts** - the composed FILTER lens (docs/PRESET_MODEL_REVIEW.md gap 8). `filter` is
  ONE CSS property holding a LIST of functions, so the data keeps ONE `filter` track of composed
  strings (`blur(8px) brightness(1.6)`) - plain CSS can't keyframe its parts apart either. This
  module parses/composes that string so each function (blur, brightness, saturate, hueRotate,
  glow = a colourless centred drop-shadow) can be its own Inspector row. THE INVARIANT: every
  keyframe in a step's filter track must list the SAME functions in the SAME order - that is what
  lets the runtime tween `filter` as a plain string with NO interpreter special-case (GSAP matches
  the numbers positionally; a track whose keyframes disagree on shape jumps instead of
  interpolating). `normalizeFilterTrack` enforces it, filling a keyframe's missing functions with
  their identity (what they were contributing anyway). Write through animEdit's
  `setFilterComponent`, never `setKeyframe('filter', …)` directly - it resolves the OTHER functions
  at that moment first, so editing brightness never silently resets a blur that was mid-tween.
  CONSEQUENCE, by design: filter functions SHARE a keyframe (the diamond stamps them all at once).
- **animEval.ts** - the editor-side playhead resolver, deliberately the ONLY logic duplicated
  from the runtime interpreter (the preview runs the real one): within a step the first
  keyframe holds backward to the step start; between keyframes numbers interpolate LINEARLY
  (the eased in-between is the preview's job - at keyframe times the two agree exactly);
  STRINGS interpolate too when both keyframes have the same shape (the numbers inside them lerp
  in place - `blur(0px) brightness(1)` -> `blur(8px) brightness(1.4)`), which is what GSAP does at
  runtime, so the Inspector tracks the preview instead of stepping; written generically, so
  clipPath (mask-wipe) benefits identically. Differently-shaped strings have no meaningful
  in-between and hold the previous keyframe; a step without the track inherits the last keyframe
  value from an earlier step; null = the layer's design (CSS) state. A LOOPING track folds the
  query time back into one pass (loopedTime: GSAP repeat/yoyo/repeatDelay math), so the
  Inspector number tracks the repeating preview. Plus
  stepSeconds/stepOffsets/activationStep/hideStep helpers (hideStep = the step a layer leaves,
  its `hides` step else the final Out).
- **animImport.ts** - the one-time legacy converter: parses a legacy marked region via
  timelineModel's parseTimeline and converts the choreography into AnimData (a `to()`'s from
  values come from the settled DESIGN_STATE table). `parseTimeline` also reads `tl.call(fn)`
  hooks with their resolved positions (parsePhase walks tweens + calls in one document-ordered
  pass; a call never shifts a tween's INDEX, so the legacy patchers are untouched), and the
  importer attaches them to the enter/out step as speed-relative `calls` - this is what lets
  game timers flip to data blocks. It also reads a repeating tween's loop (repeat/yoyo/
  repeatDelay) and writes a step `loop` when the tween's values are finite LITERALS (a breathing
  pulse - this is what lets STARTING SOON flip); a DOM-measured loop (a marquee's `x:-scrollWidth`)
  or a nested-timeline loop written INLINE fails the phase's `loopsConvertible` gate and the whole
  template stays legacy. It also reads `tl.add(builderName(target))` as a `dynamics` segment
  (parseTimeline's `TimelineDynamic`) - which is what unblocked TICKERS and CREDITS: their presets
  no longer inline the measured math, they call a named builder that lives outside the region, so
  the region parses and the measured motion rides across as data. A `tl.add(...)` in any OTHER
  shape (a bare local timeline variable) fails `dynamicsConvertible` and the template stays legacy -
  the importer can carry a NAME, it cannot lift arbitrary measured JS out of a hand-written
  buildInTimeline, and it never guesses (docs/DYNAMIC_MOTION_SCOPE.md §8.1 - the ratified reason
  Phase 8 keeps a read-only legacy renderer rather than deleting the classic strip outright).
  Neither calls nor dynamics shift a tween's INDEX, so the legacy patchers are untouched.
  Used for read-only rendering of legacy templates on the new timeline AND the explicit, undoable
  convert-on-first-motion-edit; templates the old parser cannot read stay hand-crafted.
- **presetApply.ts** - presets as keyframe generators DERIVED from their legacy emitters
  through the parity-proven importer (emit the preset's region against a scratch copy of this
  template, convert it, lift out the tracks - one choreography source, zero taste drift).
  Applying a preset is a CLEAN SWAP (ratified): the targeted layer's tracks in that direction's
  step are cleared first, then the donor's are written - switching presets never leaves the
  previous preset's (or a hand-keyed) track behind. The Inspector passes an easing (resolved to
  a GSAP pair, stamped onto the written keyframes so it never disturbs a shared step), an
  optional per-direction duration (sets the target step's length and scales the donor keyframes
  to fit), and an optional per-direction DELAY - a hold before the motion: the written keyframes
  shift later within the step (the interpreter applies a track's first keyframe at the step
  start, so the layer holds its starting pose through the wait), the step grows by the hold,
  and step-level calls/dynamics shift with it. 'in' is layer-relative (it targets the step where THAT layer becomes active), 'out'
  always targets the final step, 'both' writes both - independently editable after. Scope 'all'
  = the whole graphic adopting the donor's full choreography and the chosen/donor step duration
  and ease - skipping press-revealed layers, whose entrance belongs to their » press; it also
  swaps the target phase's step `calls` for the donor's (a clock preset carries its
  startClock/stopClock) and its `dynamics` for the donor's (a ticker preset carries its measured
  builder), both scaled to the settled duration. Per-layer applies never touch calls or dynamics -
  they are step-level, not layer motion. Because every builder of a category ships in every template
  of it (a ticker carries BOTH tickerMarquee and tickerFlipCycle), swapping the motion preset of a
  measured category is a PURE DATA EDIT - one `build` name - and nothing outside the marked region
  is rewritten, which is what the marker contract requires (docs/DYNAMIC_MOTION_SCOPE.md §8.2).

## The legacy layer, after PHASE 8 (SHIPPED)

**Phase 8 is DONE.** Every category creates as a data block, so nothing writes a legacy region any
more, and the ~2,000-line literal-patch layer that used to rewrite one in place is DELETED:
`animPatch.ts` (the phase splicers, knob setters, step-chain re-emits) and timelineModel's patchers
(`splitTween`, `patchTweenTiming/Ease/Vars`, `patchStep*`, `insertPart*`, `setObj*`), along with
`TimelineView.tsx`, the classic strip that drove them.

What survives, and why it is NOT dead code: a legacy region still exists in SAVED templates - a
project made before the migration, an import, hand-written GSAP. **The dock picks the editing
surface from the CODE, never from the category** (components/timeline/StepTimeline.tsx `TimelineDock`),
which is exactly what keeps those working:

- a region the importer CAN read -> the step timeline, READ-ONLY, with "◆ use keyframes" one click
  away (one undoable apply). It shows the real choreography, converted - not a lesser second editor.
- a region it CANNOT read (measured motion written inline) -> `components/timeline/LegacyTimeline.tsx`:
  charted read-only, honest about why, offering no affordance it lacks. RATIFIED
  (docs/DYNAMIC_MOTION_SCOPE.md §8.1): such a template can never be auto-converted (the importer
  refuses rather than guessing) and silently regenerating it would discard the owner's tuning -
  which "code is the single source of truth" forbids. So it must still render truthfully.

Its coverage is e2e/legacy-timeline.spec.ts (fixtures in e2e/_legacy.ts). The 33-test classic-strip
suite it replaced drove the patchers; every capability it covered has an equivalent on the step
timeline, pinned by e2e/timeline-v2.spec.ts.

## motionPresets.ts - the UNIVERSAL in/out bank (the no-code picker's engine)

Ten entrance/exit motions (fade, slide L/R, rise, drop, pop, zoom, blur, wipe L/R) for ANY
data-block graphic - catalog, wizard import, agent-door scaffold, hand-made - authored directly as
DATA (two keyframes per property, no emitter, no importer) and applied by `applyMotionPreset(template,
data, {in?, out?}, eases?)`, a pure `(data) => data`. It is NOT a category bank: presetRegistry's
banks are the catalog's tuned choreographies and need the structure contract they were written
for; a universal motion moves THE GRAPHIC AS ONE UNIT, so it can promise to work everywhere.
**What moves** = `motionTargets`: the root's direct element children that are DRAWN (hidden
`.noacg-data-source` holders, script/style/form sources and inline-hidden elements are skipped),
read off the HTML every time, each addressed by the most readable UNIQUE selector (id, else a
class no other element carries, else `root > :nth-child(n)`); the root itself never takes a
track (the interpreter owns its opacity). **The rewrite is a clean swap of the inside-the-root
entrance/exit** - and KEEPS `calls`, `dynamics`, `loops` (an ambient breath is behaviour, not the
entrance), `reveals`/`hides`, and every layer whose element lives OUTSIDE the root (an inserted
graphic); the step is paced to the motion or to the kept content's reach, never shorter. A styled
lifecycle arrow (play/stop with fade/push/wipe) would play INSTEAD of the keyframes, so the
rewrite clears it. `currentMotionPreset(template, data, phase)` READS the lit card back from the
data (times + values per target, ease ignored - an easing is a modifier, not another motion;
nothing is stamped into the block, so a timeline edit honestly lights nothing). Two hosts, one
component (`components/MotionPresetPicker.tsx`): the saved graphic's control page (home/) and
EVERY wizard Animation step whose built design has a unit to move (wizard/draft.ts
`usesUniversalMotion` asks the built template, never the category; `universalPick` is applied at
build through this same function, so the wizard preview, the created graphic and the page that
reads it back agree by construction). Pinned by e2e/motion-presets.spec.ts.

**The picker draws SIX cards, not ten** (`MOTION_FAMILIES`): Slide's four members and Wipe's two
are one motion with a DIRECTION and render as arrows in the cell. The bank keeps all ten ids -
every arrow picks a real one and a saved graphic names one.

**`easingsForMotions(ids)` is the easing offer**, and it is a RULE over the motion's own tracks,
never a table: `UNCLAMPED_PROPS` names the transform channels the renderer lets a value overshoot
into, so an easing whose character IS overshoot or oscillation (`needs: 'displacement'` -
back / bounce / elastic, model/easings.ts) is offered only on a motion that animates one of them.
Fade, Blur and the Wipes therefore do not offer them: measured, they render as a faster fade, a
flicker, and nothing. It takes EVERY phase the one easing setting will land on. `simple` on the
easing is the second, motion-independent filter (the near-duplicates and wrong-direction curves);
the Inspector's Advanced picker still lists all twelve.

**Both hosts SET the curve, and both read it back from the code.** `easesForChoice(easingId)` is
the `{easeIn, easeOut}` override handed to `applyMotionPreset` ('auto' overrides nothing, so each
motion keeps its tuned pair), and `currentMotionEasing(template, data, {in, out})` is its inverse:
the ease stamped on the landing keyframes of every phase holding a universal motion, mapped back
to an `EasingId` - all phases must agree, a phase sitting on its motion's tuned curve reads 'auto',
and anything the list cannot name (a hand-tuned timeline curve) reads 'auto' too. Nothing is
stamped into the block for it, exactly as with the lit card. This is what lets the control page
offer the wizard's Easing control rather than freezing the curve at creation; on both surfaces a
motion that cannot SHOW the held curve drops it to Auto (`easingLegalForMotions`), and on the
control page the phase that was not picked is rewritten with it, so the data never keeps a curve
the control stopped offering.

## presetRegistry.ts - the preset library (what is left of animPatch)

`presetsForType` / `anyPresetById` - every category's presets in one lookup - plus
`emitPresetRegion(template, presetId, opts?)`, the ONE way to emit a preset's region for a
template (structure facts read off its HTML). Two callers, one shape: **presetApply** derives a
preset's keyframes by emitting a region and converting it through the importer (emit here, convert
there - no preset's taste is written down twice), and **LegacyTimeline's "start over"** writes it,
converted, over an unconvertible region - so the way OUT of legacy code leads to data, never to
another legacy region.

## stepAssign.ts - "appears on press"

`changePartPress` is the ONE appears-on-press transition, shared by the timeline's layer-block drag,
its gutter menu, and the canvas chip. It used to carry three code paths (two legacy re-emits and a
literal array patch); a press is now just data - a step's `reveals` - so there is ONE path, routed
through animEdit's `setLayerActivation` plus the SPX steps re-sync. A legacy region has no editable
press chain at all (it is read-only), and the function says so by returning null.

## timelineModel.ts - the legacy-region READER

`parseTimeline` (the reader) + `buildOverview` (the cue-segmented overview). Two callers only:
animImport.ts converts legacy regions through the reader, and LegacyTimeline.tsx charts the
overview for a region the importer refuses. The patchers that used to live here went with Phase 8.
