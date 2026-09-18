# Editor animation and preview contract

Updated 2026-09-18. [EDITOR_PLAN.md](EDITOR_PLAN.md) owns scope, order and acceptance. This document
owns the proposed source, interaction and preview mechanisms. Implementation remains paused.
The old rebuild plan is archived with the consolidation evidence; its mode and phase order
are superseded. Existing application behavior remains the source of truth until replaced.

## First vertical slice: simple In, hold and Out

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
and Opacity, move the playhead one second, drag it into place, add Out at the playhead,
reverse In and rehearse the hold/exit. Repeat with manually authored Out. This is the first
user-visible acceptance task, including visible layer bars with move/trim handles, before
adding Next, loops or precompositions.

Then widen the fixture to Illustrator-style SVG with live text, named nested groups, a translated/
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

Keep Select, Text, Rectangle, Ellipse and Image tools beside the canvas, not only in the
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
| Position | Parent-coordinate X/Y pixels, grouped by default for new layers. Separate dimensions exposes independent tracks; existing independent tracks stay separate unless an explicit lossless conversion is possible |
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
the prior Add step dialog, duration dropdown and pre-existing Out workflow. The timeline
is the authoritative visual editing surface; readable source remains the persisted truth.
Every flag, bar and key edit is a deterministic source transaction used by preview/export.

### Flags and transport

At the playhead, Add Step places a named Step flag; Add Out places the single Out flag.
Use a sensible default step name, rename inline, and drag flags with frame/edge/key snapping.
No duration or insertion-position form. In starts at zero. A new graphic has no user-authored
Out until Add Out; importing existing authored steps/Out preserves their identities/timing.
Duplicate flags at the same boundary and Step after Out are refused with a concrete reason.
An existing Out can be selected/moved; another Add Out never creates a second exit.

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

Add Step may offer a small optional chooser of unscheduled/hidden layers; no selection is
required and it is never an empty blocking dialog. Create a shape/text at any time and snap
its bar's start to the Step line. Default is additive: earlier layers stay visible. To make
room, animate/trim selected earlier layers out explicitly. No automatic replacement question
in the first implementation. Preserve wizard quizzes/custom actions through their existing
paths; do not flatten them into linear Next commands or add node authoring UI.

### Visible layer durations

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
Minimum one-frame segments, ordered flags and collision checks keep source/runtime valid.

Retain step-local `NOACG_ANIM` clocks behind this continuous visual surface. Compile visual
boundaries to step-local times and reveal/hide ownership atomically. If the current source
format cannot express a required span, extend it with an on-read migration in that slice.
Never build an independent timeline scene store. Required simple/Illustrator fixtures cannot
be declared unsupported merely because the old editor lacks the needed adapter.

Effective seconds = stored seconds / speed; stored = effective * speed. A frame nudge is
1/fps effective seconds. Display units/zoom never rewrite keys. Test 0.5x/1x/2x and multiple
FPS. Shift assists snapping as in the chosen Adobe gesture mapping; a visible snap toggle
and a documented bypass work consistently across bars, keys and flags. Text-input shortcuts
retain normal editing behavior. Zoom/Fit never change artwork or reset deliberate user zoom.

### Groups, bins and precompositions

Collapsible timeline folders organize layers without changing rendering, timing or transforms.
Asset bins organize reusable source. A precomposition is distinct: selected layers become a
real nested editable composition represented by one parent bar; double-click opens its local
timeline with a breadcrumb back and the canvas still visible. Child offsets/keys, group
transforms, masks, field IDs and exported rendering survive create/open/undo/save/reopen.
Expose nested operator fields through stable bindings; prohibit cyclic nesting. In this
scope, broadcast Step/Out flags live only on the root timeline, not conflicting child cue clocks.
Move/trim the parent bar predictably; do not label a folder as a completed precomp feature.
Deliver organization and then precompositions after the basic In/Out and Next/bar slices,
within R1.2. Their source representation and export-parity fixtures precede the corresponding UI.

## Out, loops and easing

### Add Out and reverse entrances

Add Out places its flag at the playhead and asks once: Reverse the entrance animation?
For a multi-step graphic, wording says Reverse entrances for all visible layers.
This is a compact popover anchored to the Add Out button, near the pointer for mouse use
and anchored to that same control for keyboard use. Prefer above the timeline toolbar;
flip/clamp to viewport edges at narrow widths and 125% zoom. It must not displace the canvas
or appear as a distant banner. Focus its choice, support Tab/Escape, and restore focus to
an enabled relevant control. Escape dismisses without keys, retaining the new Out flag.
No outside click may silently choose reversal; an explicit answer generates keys. Yes writes
ordinary editable exit keys; No writes NO animation keys and leaves Out ready for manual
authoring. Neither route opens a duration form. The user sets timing with keys/bar ends.
An empty exit is a valid instant cut, clearly shown until the user authors exit motion.

For simple In over [a,b], mirror each key to outStart + (b - keyTime), preserve stagger and
values, and reverse easing as E_rev(u) = 1 - E(1-u). Reverse Hold discontinuities exactly;
do not merely reverse an array or relabel Ease In/Out. Preserve turns, parent coordinates,
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

Offer Linear, Easy Ease In, Easy Ease Out, Easy Ease and Hold. Apply In to the approach
to selected keys, Out to their departure, and Easy Ease to both sides. Hold is outgoing:
retain the selected key's value until the next key. Declare multi-key scope and leave
unselected neighboring key-side settings intact. This is a behavior change from the old
draft's destination-only menu, not a cosmetic rename of GSAP preset names.

The current format stores incoming-segment ease. A source-backed adapter must preserve old
tracks and encode key-side presets without lossy rewriting, with any breaking migration
shipped on read. Use one evaluator for inspector sampling, preview and exports; prove values
and boundary velocities against the bundled runtime. Preserve unsupported custom curves.
Do not claim Adobe's full velocity/spatial graph equivalence. New graph editing is deferred.

## Source patches and preview protocol

Keep `SpxTemplate`, `animData`, `animEdit`, `timelineLens`, interpreter/export adapters and sound
asset code. Substantially replace workspace composition, gesture coordination, inspector and
timeline feedback where needed. Do not import Studio's scene store or generated runtime.
No new mandatory node graph, source conversion format or second mutation library.

Imported design placement uses existing wrapper/layout patches. Catalog elements need commented
base X/Y offsets that preserve assembler flex flow and compose with animation transforms.
Define property ownership, units, parent/world transforms, pivot and wrapper boundaries before
the first canvas change. Use the existing worked source examples as fixtures, not proof of code.

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

## Verification ownership

R1.1 owns transform and preview-order fixtures, sampled easing parity and trusted feedback
instrumentation (input, source/preview revision, rendered pose, rAF and long tasks). F4 is
30 layers/300 keys. Distinguish driver timings from browser input-to-pixel latency and include
reverse seeks, stale acks, asset-byte changes, 125% zoom and the owner-machine blank-stage attempt.
R1.2 owns paired key/reveal/loop workflows and legacy machine/call regression. R1.4 owns
brands/assets/recovery. R1.5 owns unaided user tasks, default switch and named output acceptance.
R2/R3 own their added fixtures. [Acceptance register](research/editor-acceptance-register-2026-09-17.md)
retains all B identities and evidence. Build results or attractive screenshots cannot substitute
for observed correctness, comparative usability or actual output-host checks.
