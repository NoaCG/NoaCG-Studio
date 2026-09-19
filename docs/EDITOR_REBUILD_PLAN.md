# Editor animation and preview contract

Updated 2026-09-19. [EDITOR_PLAN.md](EDITOR_PLAN.md) owns scope, order and acceptance. This document
owns the source, interaction and preview mechanisms. The owner authorized R1.0 on 2026-09-19;
the earlier implementation hold is superseded for that bounded slice.
Independent review of d5e8c1db is accepted with the corrections below.
The old rebuild plan is archived with the consolidation evidence; its mode and phase order
are superseded. Existing application behavior remains the source of truth until replaced.

## Workflow additions, 2026-09-19

[Workflow decisions](research/editor-workflow-review-2026-09-19/README.md) specify timeline-owned
layers and optional Outline, file/drop import, bounded Pen, multi-key easing and multi-document
ownership. They supersede the fixed right Layers dock, five-ease cap and blanket Pen deferral.
R1.0 records document-scoped session/history/preview boundaries; R1.4a ships durable graphic
tabs/project manifests over GraphicDoc, not duplicate embedded templates or retired Packets.
R1.2b adds minimal readable SVG Pen paths and reused file/drop import. R1.3a chat is help-only;
R1.3b adds reviewed mutations. R2.1a/b cover Lottie/image sequences; new video authoring waits.
Closing tests extend B02/B04/B06/B08-B10/B14/B17-B18 and add B19; the study is not product proof.

## Decisions before R1.0 and delivery order

D01 permanent Out, D02 interrupted exit, D03 Position/runtime values and D04 additive spans
are decided in the sections below. D05 is the ordered route: R1.0 foundation; R1.1a base
edits/tools; R1.1b keys/bar bodies; R1.1c Set Out/hold/interrupt/export; R1.1d nested fixtures,
trim and two first-time users. Closing tests and slice owners are in the acceptance register.
These are planning decisions before R1.0, not claims that future tests have already passed.

R1.0 uses a flagged route available on preview deployments, with permanent canvas/shell,
selection, read-only bars, scrub, shared operation registry, history, revision protocol and
input-to-pixel latency harness. The default editor does not switch. Test flag off/on, fixture
load/selection/scrub, registry undo/conflict through a harness, stale replies and both viewports.
No product implementation or deployment is authorized by recording this plan.

## First complete editing journey: simple In, hold and Out

Reuse the existing SVG import wizard, field mapping and `designLayout`/`designFields` seams.
Finish must offer Edit this graphic without requiring an Advanced-mode detour or a second
import. Preserve the generated document, assets, sample fields and stable target identities.
Selection in canvas, Layers, inspector and timeline refers to the same code-derived target.
Direct Add to production remains the primary Finish route; Open in editor is optional and
secondary. Reuse `applyDraftProject` and its post-format document, including behavior, fields,
fonts, assets, layout/followers and sample data. Opening the editor installs nothing into a
production. Do not later regenerate over editor edits from a stale wizard draft. Test both
Finish routes on a quiz, timer and stretch-layout graphic, not only a simple lower third.

First prove a simple text-and-box graphic from the wizard: drag it off canvas, key Position
and Opacity, move the playhead one second, drag it into place, Set Out at playhead,
reverse In and rehearse the hold/exit. Repeat with manually authored Out. This is the first
complete editing acceptance task in R1.1c, including bar-body moves (trim follows in R1.1d), before
adding Next, loops or precompositions.

In R1.1d, widen the fixture to Illustrator-style SVG with live text, named nested groups, a translated/
rotated/scaled parent, image/logo, gradient and clipping. Record source bytes and rasterized
appearance before editing. Test the wizard result, not a different hand-built editable scene.
Select individual supported elements and groups, move/scale/rotate, style live text, animate
X and opacity independently, scrub both directions, undo/cancel, save/reopen and export.
Required nominated targets cannot be marked unsupported merely because their adapter is absent.

Preserve viewBox, aspect ratio, stacking, masks/clips, definitions/references and sibling
transforms. Group transforms compose with child animation. Outlined text remains paths; it
cannot become editable text without an explicit conversion. Missing fonts/linked assets and
unsupported Illustrator features get a fidelity report before finishing, with source retained.
Do not flatten imported SVG to a raster or claim arbitrary foreign JS is visually editable.
Existing fills/masks/gradients must render faithfully before R2 adds their authoring controls.

Repeat ordinary-editing tests on catalog templates before R1 adoption. Imported placement
support does not excuse a catalog title that cannot move. New simple shapes/text/images emit
readable source and stable IDs; duplicate mints IDs and repairs references. Delete inspects
fields, behaviors and tracks; reorder stays within a supported parent/stacking context.
Alignment uses rendered bounds in a common coordinate system; distribution needs three targets.
Unsupported source outside the changed region remains byte-preserved.

## Canvas authoring and selection handles

Keep Select, Text, Rectangle, Ellipse, Pen and Image tools beside the canvas, not only in the
inspector. Text click creates point text; dragging creates a text box. Rectangle/Ellipse
drag defines initial geometry; Shift constrains square/circle. Image opens the existing
asset picker. Creation emits a real source element and timeline bar at the playhead;
text defaults to an operator field. Pointer cancellation/Escape creates no orphan element,
field or asset. Click-only shapes get a small default size instead of a zero-area element.

Selected artwork has corner/edge scale handles, a rotation handle and a separate anchor
tool. Keep handle hit targets usable at all canvas zoom levels and selection bounds visible
even when artwork opacity is zero; show the off-canvas pasteboard. Corner scaling follows
linked X/Y by default, unlink enables independent axes, Shift temporarily inverts constraint.
Alt/Option scales about the anchor; ordinary opposite-handle scaling compensates placement.
Use parent/local transforms so nested SVGs, text and images match numeric values exactly.
Geometry Width/Height editing is explicit and preserves layout/text fitting. Resizing a text
box reflows/fits text; scaling a layer changes its whole appearance. No ambiguous shared knob.

Animated Scale/Position/Rotation gestures key affected properties at the playhead through
the same transaction as numeric edits. One drag commits one undo; Escape/pointer cancellation
restores original code and pose. Keyboard selection/nudge/resize and numeric alternatives
provide complete access. R1.1 proves creation/basic scaling; R1.2 completes the full toolset.

## Familiar 2D transforms

After Effects is the interaction reference; [comparison and code evidence](research/editor-adobe-svg-contract-2026-09-18.md)
explain the differences from the current inspector. All five transform groups belong in R1:

| Property | Control and source contract |
|---|---|
| Anchor point | Layer-local X/Y in pixels, canvas anchor tool and center command. Rotation and scale use this point. Numeric edits change the anchor directly; dragging the anchor tool compensates Position to preserve the visible pose |
| Position | Store the values consumed by the runtime. Display parent-coordinate X/Y for placed/absolute/SVG targets; display explicitly labelled Layout offset X/Y for flow-laid catalog lines. Group new axes by default; preserve existing independent tracks unless explicitly converted losslessly |
| Scale | X/Y percentages with linked proportions by default. Unlink permits independent axes. Preserve the ratio when relinking unequal values; handle a zero axis explicitly instead of division by zero. Negative values mirror |
| Rotation | Signed whole revolutions plus degrees, backed by one unwrapped degree value. Never normalize 720 degrees to zero or force shortest-path interpolation |
| Opacity | 0-100 percent; source/runtime normalization stays explicit and round-trips without drift |

All five groups have animation controls, including anchor. R1.1 proves transform order and
source ownership on nested SVG/HTML fixtures; R1.2 completes controls and animation parity.
Model authored placement, anchor, scale/rotation and animation without flattening parent
matrices or changing siblings. A compensated anchor gesture adjusts the affected Position
values as one transaction. On animated layers it preserves the parked pose; it must not
claim to preserve an entire path without a validated all-keys compensation operation.
Singular/unsupported parent transforms get a specific capability explanation and retain source.

### Position source adapter (D03)

Persist runtime-native track values, never substitute screen/world coordinates into motion
tracks. For placed/absolute/SVG artwork, the inspector derives the supported parent-coordinate
position from base placement and current motion; its inverse adapter writes the corresponding
runtime value. Include parent matrices, viewBox, iframe/pasteboard, Fit and browser zoom in
pointer conversion. Distinguish a static base move from an armed runtime-property edit.

For flow-laid catalog lines, the base control is labelled Layout offset, not an invented
absolute Position. Move a supported inline-block title without changing sibling flow using a
dedicated commented rule (document scale is applied exactly once):
```css
/* Base layout offset; animation keeps ownership of transform. */
#f0 {
  --layout-x: 40px;
  --layout-y: 0px;
  position: relative;
  left: calc(var(--layout-x) * var(--scale));
  top: calc(var(--layout-y) * var(--scale));
}
```
Existing GSAP transform/clipPath/opacity tracks stay byte-identical for this unarmed base edit.
Armed motion X/Y remains a separately identified runtime channel; do not claim the relative
left/top base rule is an animated GSAP x/y track. Already positioned imported wrappers retain
their left/top placement idiom. Prove supported positioning/display first; competing insets,
constraints and unknown CSS get a concrete refusal, never an automatic relative-position rewrite.
Required catalog fixtures must receive a real adapter rather than being rejected wholesale.

Closing test in R1.1a, widened in R1.1d: move base X 40 px, verify unchanged siblings and motion
tracks, then animate X and round-trip save/export. For parent translate(100,80), rotate(30),
scale(2), local delta(20,-10) gives world delta(44.6410161514,2.6794919243); inverse pointer
conversion must recover the local delta. Numeric and canvas results agree, with undo exact.
This section replaces the historical source-preview example's Layout/Animate terminology.

Geometry Width/Height belongs to Size/Layout, separate from transform Scale. Use existing
design-layout patches and preserve text fitting, growth/followers and behavior-owned targets.
Resize a panel without stretching its letters; scale a group when its whole appearance should
grow. New Z/3D, cameras, skew controls and spatial-path/velocity graph authoring are deferred.
Existing source using these features remains intact. No inert controls imply support.

## Per-property animation

The stopwatch enables animation; previous key, diamond and next key are separate controls.
The inspector and timeline rows operate on the same selection, displayed values and history.
This replaces the previous draft's extra zero-time key and base-restoring disable behavior.

- Stopwatch off: value edits change the base. Turning it on captures ONE key at the current
  step/time. Before the first key, hold that key's value within the active segment. No hidden
  time-zero key is manufactured. Turning it on alone does not move the graphic.
- Stopwatch on: typing, scrubbing a number or a canvas gesture creates/updates the key at
  the playhead for affected properties. Diamond captures the displayed value without a
  value change; at an existing key it removes that key. Removing the last key retains the
  displayed value as the base. Undo restores both keys and previous base values.
- Turning the stopwatch off explicitly removes that property's authored animation and
  bakes its displayed value as static. Preview affected steps/loops before removal. Scope
  is the selected property's supported linear sequence, never unrelated branches/dynamics.
  If runtime ownership prevents this, explain it and leave the source intact. A separately
  named Remove keys in this step preserves other steps; it is not the stopwatch operation.
- Armed state derives from source tracks, never a second persisted scene. Later steps
  inherit the preceding effective pose when no local track exists. An explicit Edit base
  offset action shifts an animated design without deleting its motion.
- Horizontal number scrubbing is one transaction: normal sensitivity, Shift 10x, Ctrl on
  Windows/Cmd on macOS 0.1x. Click/type accepts precise values, Enter commits, Escape cancels;
  the browser's editing shortcuts work inside inputs. Pointer cancellation restores state.
- A/P/S/R/T reveal Anchor/Position/Scale/Rotation/Opacity; U reveals animated properties.
  Shortcuts only act with editor focus outside text inputs. Prev/next buttons seek to keys,
  the diamond is filled at a key and hollow between them, and keyboard access is complete.
- A canvas drag changes only affected channels. Grouped Position keys its vector; separated
  axes follow their own armed state. Mixed selections never silently arm every property.
  Display mixed/base/key state and use one atomic operation for combined base/key changes.
- Motion between different values needs at least two keys. Enabling the clock creates the
  first; moving the playhead and changing a value or dragging the canvas creates the second.
  One key is a valid constant pose, not completed motion. No hidden second key is invented.
- R1.1 fixtures cover first key at nonzero time, before-first sampling, last-key deletion,
  disable/undo at an interpolated time, separated axes and per-step inheritance. R1.2 adds
  all transform channels, precision modifiers, shortcuts and multi-key gestures.

## Timeline flags, layer bars and live holds

Owner correction, 2026-09-18: timing is authored directly on one timeline. This replaces
the prior Add step dialog and duration dropdown. Independent review restores permanent Out. The timeline
is the authoritative visual editing surface; readable source remains the persisted truth.
Every flag, bar and key edit is a deterministic source transaction used by preview/export.

### Flags and transport

At the playhead, Add Step places a named Step flag. Out ALWAYS exists at the end of the last
pre-Out segment. The action is Set Out at playhead; it changes that boundary, never creates
or removes an exit identity. Empty exit is valid. Preserve imported step identities/timing.
For legacy one-step source, that step is In and an empty Out is derived; never execute In
again as the exit. Read-only open preserves bytes and derives the empty exit. On the first
supported save/export, materialize a distinct empty exit and upgrade the owned interpreter;
preserve all unrelated source. Subsequent save/reopen is idempotent in source, cue structure
and playback. Simulator and emitted interpreters must distinguish the one-step fallback.

Rename Step inline and drag flags with snapping; no duration/insertion forms. In begins at
zero. Nonempty segments have at least one frame; an entirely empty graphic may have Out at
zero. Refuse duplicate Step flags and Step after Out. Set Out on an empty exit always offers
reverse/manual, including a repeat invocation at the same boundary after No or Escape.
Before R1.2a's shared Bezier gate, refuse Set Out earlier than the last In key atomically with
a clear reason. Existing source is preserved; other unsupported cross-curve changes also
refuse until exact repartition is supported. Later Next sequences apply the same last-pre-Out
key safety check until the supported curve can be split exactly.

A flag marks BOTH the end of the preceding segment and the start of the segment waiting
for its command. Play/Take runs In and parks at the first flag. At a Step flag, Next plays
from that boundary to the next flag and parks again. At Out, only Out plays the exit to its
end. Holding consumes no composition time and lasts indefinitely. The boundary is one
line, not a fake hold-duration clip. Ordinary preview playback respects these holds.
Direct authoring scrub can cross flags freely and never sends operator actions.

Boundary sampling carries the active cue/side as well as time: on arrival, evaluate the
completed segment's endpoint; layers starting at that flag remain hidden until its trigger.
After Next, sample the new segment at local zero. Selecting/scrubbing the upcoming segment
can inspect its entry pose without causing a runtime reveal. Do not flash new layers early.
No separate invisible stop marker, and no off-by-one-frame pause before the completed key.
Editing exactly on a flag defaults to the arriving segment. Exception: a selected layer whose
bar starts on that flag edits the departing segment at local zero. Resolve this per layer in
mixed selections and commit atomically; inspector/diamond names the target segment. An explicit
upcoming-segment inspection remains available. Test existing layer versus new reveal at the
same frame: edit neither hides the held layer nor reveals the new layer during arrival.

Add Step may offer a small optional chooser of unscheduled/hidden layers; no selection is
required and it is never an empty blocking dialog. Create a shape/text at any time and snap
its bar's start to the Step line. Default is additive: earlier layers stay visible. To make
room, animate/trim selected earlier layers out explicitly. No automatic replacement question
in the first implementation. Preserve wizard quizzes/custom actions through their existing
paths; do not flatten them into linear Next commands or add node authoring UI.

### Visible layer durations

D04 representation: an additive optional step field
`spans?: Record<selector, Array<{ start: number; end: number }>>` stores visibility intervals
in that step's stored seconds. Resolve selectors to stable source IDs. For a listed selector,
the union of intervals is its visibility set; an empty list means hidden. Missing selector/
field retains legacy reveals/hides behavior. Never infer existence from keyframe presence.
An edited target spanning cues writes explicit intervals in every affected step, including
empty lists where absent. Validate finite ordered nonnegative times and bounds atomically.

Normal intervals are start-inclusive/end-exclusive. At a hold, the arriving side retains the
preceding interval's endpoint visibility; new intervals starting at that cue become visible
only on the departing side/trigger. Sample property values at their actual endpoint. Final Out
completion clears the graphic. Visibility gating must preserve authored opacity, not replace
its keys with hide opacity. Forward/backward seek evaluates sets from time and cue side without
replaying reveals or side effects. Legacy sources lacking spans retain their existing behavior.
This additive field needs no schema-version bump; parser, serializer, sampler and interpreter
must preserve it, and writers re-emit an older interpreter that cannot consume it.

R1.0 displays inferred read-only bars. R1.1b writes spans and implements body-move with keys;
trim handles are introduced in the next span-editing slice, R1.1d, after R1.1c exit parity.
Closing test: disjoint spans, a static unkeyed layer and a cross-hold layer match in forward/
reverse seek, save/reopen and export; body moves preserve key offsets, trim changes only
visibility and retains clipped keys; absent-span legacy fixtures remain identical.

Each layer has a named, selectable bar, including layers with no keys. Expand its property
rows underneath to see keys. The bar body moves the layer with its keys; left/right handles
trim or extend visibility. Trimming does not rescale motion or delete hidden keys. An explicit
time-stretch operation is separate and not needed for the first In/Out slice. Ghost/clipped
keys remain discoverable. Static text/shapes may extend across several flags and live holds.

Moving a layer to another step deliberately changes its cue ownership and carries relative
key timing. Snap its leading edge to flags; dragging handles sets the visible start/end.
Crossing a flag is supported, not categorically prohibited by a step-local implementation.
Dragging a key across a flag likewise changes segment ownership intentionally, with visible
feedback and collision validation. Multi-layer/key moves preserve offsets; one drag is one
undo and Escape/pointer cancellation restores the exact source and displayed pose.

Moving a flag preserves absolute layer/key positions by default: it changes the trigger
boundary, not the speed of animation. Repartition supported tracks across source-local steps;
split a crossing curve using exact boundary sampling and preserved tangent/easing data.
Do not approximate an unsupported curve or shift unrelated keys silently. Dependencies in
custom code/calls/dynamics require a capability explanation before a move, with no partial edit.
Minimum one-frame nonempty segments, ordered flags and collision checks keep source/runtime valid.

Retain step-local `NOACG_ANIM` clocks behind this continuous visual surface. Compile visual
boundaries to step-local times and reveal/hide ownership atomically. If the current source
changes beyond additive spans are breaking, ship their on-read migration in that slice.
Never build an independent timeline scene store. Required simple/Illustrator fixtures cannot
be declared unsupported merely because the old editor lacks the needed adapter.

Effective seconds = stored seconds / speed; stored = effective * speed. A frame nudge is
1/fps effective seconds. Display units/zoom never rewrite keys. Test 0.5x/1x/2x and multiple
FPS. The ruler and playhead readout explicitly label their units: Seconds shows 1.0 s at
one second; Frames shows frame 25 there at 25 fps (30 at 30 fps). Tick positions, cursor,
markers and input conversion use the same unit transform. Never put frame numbers on a
seconds-labelled ruler; switching units must not change a key's stored time. Shift assists snapping as in the chosen Adobe gesture mapping; a visible snap toggle
and a documented bypass work consistently across bars, keys and flags. Text-input shortcuts
retain normal editing behavior. Zoom/Fit never change artwork or reset deliberate user zoom.

### Groups, bins and precompositions

Collapsible folders organize layers without changing rendering/timing/transforms; asset bins
organize assets. A group layer adds its own transform, parent bar and local child ruler with a
breadcrumb back while keeping the canvas visible. Preserve child offsets, masks, field IDs,
history and exported rendering. Root Step/Out flags alone control broadcast holds.

Owner scope ruling, 2026-09-19: R1.2b ships this group layer with its own transform, parent
bar and local ruler. Instanced reusable precompositions are named task P-COMP after R1.5.
This replaces the previous R1.2 reusable-precomposition obligation, not the full-scope requirement.
A group is not labelled reusable precomp. P-COMP must define shared definition versus instance
ownership, instance overrides, field-ID namespacing, nested local timelines, cycles, detach,
undo/save/reopen and all output targets. It remains part of full-scope completion.

## Out, loops and easing

### Set Out and reverse entrances (D01)

Set Out at playhead moves the permanent flag and, whenever the exit has no keys, asks: Reverse the entrance animation?
For a multi-step graphic, wording says Reverse entrances for all visible layers.
This is a compact popover anchored to the Set Out at playhead button, near the pointer for mouse use
and anchored to that same control for keyboard use. Prefer above the timeline toolbar;
flip/clamp to viewport edges at narrow widths and 125% zoom. It must not displace the canvas
or appear as a distant banner. Focus its choice, support Tab/Escape, and restore focus to
an enabled relevant control. Escape dismisses without keys, retaining the Out flag at its chosen position.
No outside click may silently choose reversal; an explicit answer generates keys. Yes writes
ordinary editable exit keys; No writes NO animation keys and leaves Out ready for manual
authoring. Neither route opens a duration form. The user sets timing with keys/bar ends.
An empty exit is a valid instant cut, clearly shown until the user authors exit motion.

For simple In over [a,b], mirror each key to outStart + (b - keyTime), preserve stagger and
values, and reverse easing as E_rev(u) = 1 - E(1-u). Reverse Hold discontinuities exactly;
for supported named eases, swapping .in/.out IS the exact mirror (.inOut is self-mirroring).
Because ease is stored on the destination key, move the mirrored ease to the other key of
the reversed segment. Reversing only the key array is insufficient. Preserve turns, parent coordinates,
property ownership and defaults. Unsupported curves/side effects are never reverse-executed.
Generated keys are independent copies: later entrance edits do not silently rewrite Out.
Regeneration is an explicit reviewed replacement of the existing exit keys.

With Next steps, every still-visible layer's entrance is included by default, including
layers first revealed later. Each cue's entrance group reverses with its relative stagger
preserved; those groups start together at Out, rather than unwinding the whole show through
its cue holds. The longest group determines the initial exit span. Already-hidden layers
stay hidden. Current pose seeds the exit: later position/style changes cannot jump back to
an old entry endpoint. A changed trajectory needs a reviewed rebased path, not an unannounced
claim of exact reversal. A visible layer with no entrance motion gets an explicit static
exit case in the reverse preview (cut at exit end by default); users can author its own keys.

### Interrupted exit (D02)

Current code evidence: template stop() paths (for example src/templates/gameTimers/shared.ts)
kill active tweens, while buildStepTimeline() in src/templates/shared/animRuntime.ts
instantly sets each track's first value; noacgExitTimeline() builds the last step. Killing a
tween alone therefore does not prevent an early-Out jump. The replacement must explicitly
capture live runtime property values before any reset/first-key application, cancel running
motion/loops and build an interrupted exit without the authored starting .set().

When Out interrupts In/Next/loop, tween EACH supported exit track from that live value to its
final exit key. Use its authored finite exit timing (hold the live value through any leading
delay, then tween to the final-key time), speed and final-segment ease; intermediate exit
waypoints are bypassed for this interruption policy. A settled normal Out retains authored
exit keys. This is an explicit interruption policy, not a claim to exactly reverse an
unfinished entrance. One-key/zero-time exits are explicit cuts, not continuous-motion claims.
Never reveal unseen layers; static visible layers without exit tracks clear at exit completion.
Repeat Out coalesces per take; replay resets transient state without altering authored keys.

The simulator and emitted packages must use this policy. A capability marker in the emitted
interpreter makes the writer re-emit the owned animation region when upgrading older source,
as with hides support; changing only the NOACG_ANIM object is insufficient. Preserve handwritten
source outside the owned region and existing machine/call/timer semantics; unknown foreign
runtimes require a preservation/refusal path rather than a false no-jump promise.

Closing test R1.1c: trigger Out at 40% of In; capture pose immediately before/after dispatch
and require a discontinuity under 1 px per position channel and under 1 percentage point of
opacity in simulator AND an exported package. Normal motion during the following frame is
not itself a discontinuity. Verify target/final visibility, repeat/replay and a saved old
interpreter upgraded on write. R1.2c repeats for loops; B07 covers Next interruption.

No automatic Out timer in the first editing workflow. Existing timed behavior is retained;
advanced auto-Out controls are deferred until the core workflow passes. The controller sends
Out from the current displayed pose, even during In/Next/loop. Loops stop when exit starts;
the exit is finite and eventually clears every still-visible layer. Repeated commands coalesce
per take revision. Test early Out, replay, updates during hold and repeated Next/Out. Scrubbing
does not start timers, update a score or invoke external calls. End visibility at the final
exit endpoint; parking at the Out flag must not remove the held graphic prematurely.

Local loops are required in R1, including supported HTML/SVG properties. Define activation,
local duration/range, repeat/yoyo and phase without adding lifecycle steps. Open the clip's
local ruler by double-click or a keyboard-accessible Edit loop action; canvas stays visible.
Compare endpoints and velocity where applicable; inspect boundary frames for visible seams.
No arbitrary asset can be made seamless by a checkbox. Backward seek must sample absolute time,
not incrementally replay whichever wall-clock state happened previously.

Offer Linear, Easy Ease In, Easy Ease Out, Easy Ease, Bounce, Overshoot and Hold Keyframe. Apply In to the approach
to selected keys, Out to their departure, and Easy Ease to both sides. Hold is outgoing:
retain the selected key's value until the next key. Declare multi-key scope and leave
unselected neighboring key-side settings intact. This is a behavior change from the old
draft's destination-only menu, not a cosmetic rename of GSAP preset names.

Bounce and fixed Overshoot settle into selected keys by default. Marquee and Ctrl/Cmd/Shift
toggle build one multi-key selection; toolbar and right-click call the same atomic operation.
Right-click preserves an existing selection. Count/mixed-state display and keyboard context
access are required; unsupported batches refuse without partial edits. See B06's expanded test.
Named bounce/back evaluators must be shared with the emitted interpreter. Bounce is piecewise,
not one cubic bezier: exact split/mirror support or an explicit refusal is required. Test peaks,
equal-endpoint slices, clamping of bounded properties and unchanged neighboring key sides.

The current format stores incoming-segment ease. A source-backed adapter must preserve old
tracks and encode key-side presets without lossy rewriting, with any breaking migration
shipped on read. Use one evaluator for inspector sampling, preview and exports; prove values
and boundary velocities against the bundled runtime. Preserve unsupported custom curves.
Do not claim Adobe's full velocity/spatial graph equivalence. New graph editing is deferred.

Before R1.2a, define and consume the SAME serialized cubic-bezier ease string in interpreter
and sampler (for example cubic-bezier(x1,y1,x2,y2), with monotonic x and finite coordinates).
Use shared parsing/evaluation and exact split/mirror mapping; exports bundle the implementation
locally. A new string that GSAP silently defaults while the sampler recognizes it is a failure.
This is representation support, not a new Bezier graph UI. Until this gate passes, Set Out
cannot cross the last In key. Closing test: split an eased segment at 40%, compare dense
samples/endpoints/tangents before/after in inspector, simulator and export; reverse named
.in/.out presets and verify ease ownership moves to the correct destination key.

## Replacement and retirement before R1.0

The [complete workspace study](research/editor-whole-workspace-2026-09-19/README.md) maps panels
and each phase to user outcomes. Before code changes, inventory actual files as keep/refactor/
replace/retire, naming the removal slice for every replaced route, store, adapter and dependency.
Bound workspace composition, code-derived selection, registry/history, canvas gestures,
timeline gestures and preview protocol separately; never persist the mockup's local scene data.
Every implementation brief states user problem, useful outcome, preserved behavior, module/
operation boundaries, closing test and owner review route, with existing E/B acceptance IDs.
The old editor is a temporary rollout fallback. Remove replaced paths after their consumers
migrate and checks pass; R1.5 closes default-switch and retirement evidence, leaving one editor.
Keep working import/runtime/export behavior until its explicit replacement is proven.

## Source patches and preview protocol

Keep `SpxTemplate`, `animData`, `animEdit`, `timelineLens`, interpreter/export adapters and sound
asset code. Substantially replace workspace composition, gesture coordination, inspector and
timeline feedback where needed. Do not import Studio's scene store or generated runtime.
No new mandatory node graph, source conversion format or second mutation library.

Imported design placement uses existing wrapper/layout patches. Catalog elements need commented
base X/Y offsets through the position:relative adapter above, preserving flow and motion.
Define property ownership, units, parent/world transforms, pivot and wrapper boundaries before
the first canvas change. Use the existing worked source examples as fixtures, not proof of code.

Before R1.1d, unnamed SVG nodes get stable, collision-free IDs on their FIRST committed edit,
in the same transaction as that edit. Read-only inspection creates only transient locators.
Preserve existing IDs and repair only references affected by minting; redo reuses the committed
IDs. Test unnamed siblings/nested nodes, duplicate IDs in an input, cancel-before-commit, undo/
redo and save/reopen with field/track/selection identity and unrelated source intact.

One shared operation registry accepts document ID, expected source/asset revision, operation
batch and transaction identity. Validate capability/types/references, apply atomically, return
changed targets/readable diff/new revision, then report matching preview readiness. Stale input
is refused and re-inspected. Unknown source is preserved. One gesture/batch is one undo; Escape
restores source, selection and pose. External edits cancel stale active gestures rather than
silently overwriting them. Save preserves even invalid source, while export blocks validation errors.

For supported key-only edits, replace animation data in the running interpreter from canonical
source. Do not use a whole debounced iframe rebuild or a fixed 650 ms timeout as drag feedback.
Other changes rebuild with a revision covering HTML/CSS/JS and asset paths AND bytes. Include
document revision, frame generation and monotonic request ID on apply/ready/seek/ack messages.
Reject stale frame/window acknowledgements. Undo/redo use the same route and seek after readiness.
Cancellable gesture previews are transient; pointer-up commits the single source transaction.

Version every breaking persisted change and migrate on read in the same implementation slice.
Optional additive fields do not require version bumps. Unknown versions degrade to read-only.
Monaco, if included, uses per-document models, this history and revision protocol; code remains
beside the canvas. Its optional UI does not weaken required CLI/source preservation.

## Operator text and output contracts

New Text defaults to Editable in playout and atomically emits a bound element, stable field
ID, schema metadata and default. Decorative text is an explicit opt-out. Preserve imported
wizard choices, static artwork and behavior-owned/calculated fields; outlined paths are not
text. Renaming a label does not rename the schema key. Reference-check deletes and public-key
changes. Reuse current field/layout builders; unsupported source is not silently converted.

OGraf manifests expose public fields through `schema`; author prefixes and private element
names are not standardized. Validate schema, runtime lifecycle/custom actions, declared
capabilities and locally packaged resources on a clean host. Editor seeking alone does not
justify non-realtime capability flags. Record a named renderer/version and YLE workflow
acceptance before claiming deployment compatibility. See the comparison for official sources.

## Later capability contracts

R2 Lottie uses the existing bundled player/insertion foundation, packaged JSON/resources and
an explicit supported profile. Report missing assets/fonts, expressions and unsupported render
features. Expose trim, native FPS, speed, offset, fit and manual/marker In/loop/Out ranges.
Test mixed frame rates, backwards seek, loop boundaries, interruption and clean-host exports.
Lottie is a timed asset layer, not an editable After Effects composition.

R2 paint authors linear/radial gradients and stops, path/alpha masks with explicit sources,
and ordered blur/shadow/colour adjustment. Prevent cyclic/dangling masks. Preserve unknown
effects; animate only documented numeric parameters. Preview and target exports must agree.

R3 data binds typed text/image/colour targets to scalar/nested/object-array fields. Runtime
collections use one prototype, stable item keys, layout/count/empty/overflow policy. They are
different from Starter Collections of templates. Separate schema/defaults, sample data and
live effective values. Define ownership so animation and bindings cannot race over a property.
Controller-fed JSON updates are validated, revision-ordered and replayable; stale feeds retain
the last good value with visible status. Credentials stay outside exports. Map complex values
explicitly for SPX/CasparCG; never silently drop an unsupported OGraf structure.

R1 AI reuses the server gateway, credentials, routing and ledger. Ground help in versioned
docs/tools and selected source. Bounded operations use the registry; cancellation and quota
failures preserve manual/offline editing. The free service needs approved spend limits before
launch. Optional local Codex/Claude subscription connections use supported provider-owned
authentication; do not extract tokens or route subscriptions through the hosted gateway.
R3 live MCP pairing binds origin/document and revision, while independent CLI use needs no
open browser. Expose new capabilities as their slices land, with source/pixel evidence.

## Licensing and reuse boundaries

Record the reason for reference-only Studio use: adding third-party AGPL-covered code would
remove the sole copyright holder's freedom to dual-license the combined work without obtaining
additional rights from those holders. Matching NoaCG Studio's current AGPL label is not enough.
This does not assert that all existing dependencies or contributions are already dual-licensable.
Project policy: third-party AGPL source/helpers/runtime must never enter the Apache-2.0 CLI,
its shared dependency closure, or emitted graphic packages. Reference fixtures remain isolated,
labelled research evidence; they are not distributable runtime/template assets.
Write original helpers informed by behavior rather than copying/porting AGPL expressions.
Review exact-file provenance and dependency/output inventories before any proposed code reuse.

Basis: [GNU copyright-holder FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#ReleaseUnderGPL)
and [AGPL terms](https://www.gnu.org/licenses/agpl-3.0.en.html). The project boundary above is
a deliberate licensing policy, not a claim that AGPL software cannot be commercially used.

Before R1.5, clarify GSAP separately: record exact bundled version/plugins, applicable licence
text/date, editor/builder use and redistribution into self-contained exports/CLI, required
notices and any unresolved restriction. Do not assume free pricing means permissive licensing,
or borrow a licence determination from Studio. Close with a reviewed rights/provenance receipt
and inspection of clean exported packages and CLI dependency contents; unresolved rights block
R1.5 release. No licence assertion is settled by this planning-only correction.

## Verification ownership

R1.0 owns preview-order/history fixtures and trusted feedback instrumentation (input,
source/preview revision, rendered pose, rAF and long tasks). F4 is 30 layers/300 keys.
R1.1a proves base adapters/tools; b keys and span/body moves; c permanent/empty Out, interrupted
exit and simulator/export parity; d nested Illustrator/catalog, IDs, trim and two first-time
users. Earlier slices must prove the foundations they use, not postpone correctness to d.
Include stale acks, same-path asset-byte changes, reverse seek, 125% zoom and an owner-machine
blank-stage reproduction attempt. R1.2a owns Bezier/cue/Next contracts, b E05-E07/B04/tools and
grouping (scope approved; reusable instances in P-COMP), c loops and legacy machine/call regression. R1.4 may proceed
in parallel from R1.1c using the stable registry without waiting for R1.2/R1.3; integration
acceptance still verifies the actual shared editor/runtime revision.
R1.5 owns fuller unaided user tasks, licence clarification, default switch and named outputs.
R2/R3 and P-COMP own their added fixtures. The
[acceptance register](research/editor-acceptance-register-2026-09-17.md) retains every B identity.
Builds or screenshots cannot substitute for correctness, usability or real-host evidence.
