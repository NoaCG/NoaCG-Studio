> Historical evidence, superseded 2026-09-17. Follow [EDITOR_PLAN.md](../../EDITOR_PLAN.md).
> Original claims and status below are dated history, not current instructions.

# Rebuild the basic graphic editor around a dependable animation workflow

**Current delivery authority, 2026-09-17:** [EDITOR_DELIVERY_ROADMAP.md](EDITOR_DELIVERY_ROADMAP.md)
unifies ordinary editing, animation, brands, Starter Collections and production. It owns
scope/order/status; this document owns detailed interaction semantics. The owner has paused
product implementation pending the unified roadmap and baseline review. Earlier authorization
and sequencing below are historical where they conflict with that planning hold.

**Implementation plan, 2026-09-14. Requested by the owner after the Studio research.**
Planning was delivered first. On 2026-09-17 the owner authorized implementation, starting with
the shared brand foundation in [STARTER_COLLECTIONS_PLAN.md](../../STARTER_COLLECTIONS_PLAN.md).
The owner rejects the current editor's practical quality despite its advertised capabilities.
That is the problem to solve. This is the next editor design direction within P7, not another
claim that the existing editor is complete or a commitment to rebuild the renderer.

## 1. Decision and outcome

**Owner clarification, 2026-09-15: Zero Density's OGraf Studio is the editor NoaCG must
match or beat, not merely an architectural reference.** Match or exceed its basic editing
quality: selection, canvas manipulation, property editing, keyframes, easing, timeline
navigation, responsiveness and visual polish. Beat it on NoaCG's core workflow: taking
imported artwork through editable fields, animation and behaviour into reliable production
with less friction. Being better than NoaCG's old editor is not sufficient. These are
completion requirements, not claims that either comparison has already been won.

Rebuild the editing experience around the proven visual conventions in Zero Density OGraf
Studio: a clear layer hierarchy, a stable canvas, a property inspector and a usable property
timeline. Keep NoaCG's readable source and runtime contracts underneath. Reuse existing engine
pieces only where they pass the new behavioural and visual tests; existing code is not an
acceptance criterion. Replacing interaction components is explicitly in scope.

The first deliverable is a complete, pleasant basic animation task: open a graphic, select a
layer, change its position, animate its entrance, adjust opacity independently, change timing
and easing, scrub it, undo, save, reopen and play the exported result. This must work equally
for a generated lower third and a supported imported SVG. A user must not need the state graph,
code editor or knowledge of the runtime to do it.

We are recreating Studio's useful behaviour and interaction structure, not importing its whole
application. The [pinned research](OGRAF_STUDIO_RESEARCH.md) records its AGPL-3.0-only packages,
embedded runtime and dependency caveats. The [2026-09-17 reuse review](../editor-design-review-2026-09-17.md) identifies six
small editor-only utility candidates and corrects the earlier blanket no-reuse recommendation.
No source has been copied. Adoption requires the exact licence/notices, dependency closure,
corresponding-source delivery and emitted-output review recorded there. The reference is Zero Density Studio;
Eyevinn remains the smaller secondary example.

### Use the open source implementation directly as evidence

[Zero Density OGraf Studio](https://github.com/zerodensity/ograf-studio) is open source.
Implementers must inspect how the relevant feature actually works before designing its
NoaCG counterpart. Do not guess from screenshots or recreate solved interaction mechanics
without reading the implementation. The pinned source inventory in the research report is
the starting point; record the exact upstream revision used for each implementation phase.

For selection, canvas handles, inspector/key creation, timeline gestures, easing, playback
and save/reopen, trace the UI event through the source mutation and preview/runtime update.
Read the associated tests and try the interaction in the reference editor. Each phase's
receipt must name the source files inspected, the behaviour to reproduce, what NoaCG reuses
or adapts, and any deliberate difference with its user-facing reason. Source availability
is a practical implementation resource throughout the rebuild, not just background research.
Inspecting and learning from it needs no further owner approval. Actual code reuse follows
the exact-file licence/dependency review above; that review does not block source inspection.

## 2. What the evidence says, and what it does not

Owner evidence, 2026-09-14: changing animations and using the keyframe timeline does not feel
good enough. This is a usability rejection, not a reproduced defect with a known cause.
The source was inspected at the research branch after `82614360`; no new browser observation
or performance measurement is claimed here. Phase 0 reproduces the actual editing tasks
before attributing failures or changing implementation.

| Area | Current source evidence | Rebuild implication |
|---|---|---|
| Property tracks | `src/blocks/animData.ts` already stores property-specific keys, incoming ease, per-track loops and step-local clocks | Do not invent independent tracks as a missing primitive; prove the existing representation can carry the chosen interactions |
| Timeline | `src/components/timeline/StepTimeline.tsx` already expands property rows and implements selection, zoom and scrubbing | Inspect discoverability, target size and feedback; replace interaction code where necessary |
| Inspector | `src/components/timeline/Inspector.tsx` distinguishes property/style/animation editing and derives armed properties | Make it obvious whether a change edits layout or animation; eliminate inconsistent gesture rules |
| Canvas | Existing interaction contracts distinguish root placement, placed artwork and animated layer manipulation | Users should understand the operation before dragging; do not make them infer it from element type |
| Source edits | `animEdit.ts`, `animEval.ts`, `timelineLens.ts` already provide useful transformation/evaluation seams | Consolidate on these seams and fix mismatches; do not create another authoritative scene |
| Preview | `PlayoutSimulator.tsx` owns real runtime scrubbing, lifecycle and settling | Diagnose rebuild/seek races and stale overlays before declaring an interaction reliable |
| Older completion claims | Timeline v2 is marked complete; WYSIWYG attempt one has a documented failure analysis | Preserve implementation history but stop treating it as proof of a satisfactory product |

The [previous failure analysis](WYSIWYG_PLAN.md) remains useful, but its statement that no owner
complained about how the editor felt is superseded by this feedback. Its old exclusion of a
gesture that is merely easier than the panel is also too restrictive for this task: making
ordinary editing feel good is now an explicit goal. Source authority, source preservation,
production safety and the requirement for real-user acceptance remain.

## 3. The workspace we will build

The separate [Starter Collections plan](../../STARTER_COLLECTIONS_PLAN.md) owns template-first
creation, the shared brand library and production installation. This plan owns animation
editing quality in that same editor. The unified roadmap sequences both workstreams and
adds explicit ordinary-editing obligations; neither is a separate product or completion claim.

One persistent editing workspace, reachable by Edit from the graphic the user just created,
imported or opened. Exact route wiring is part of Phase 0; this is not a claim of a new route.

- Left: AI chat with selected-layer context, plus project/assets/brand tabs. Keep chat beside
  the canvas; it does not replace properties. See the owner-supplied Studio reference in the
  professional-direction document for the accepted reference arrangement.
- Upper right: named layers with actual containment, selection, expand/collapse, search and
  canvas locking. Selection is shared with the canvas and timeline. Editor-only lock is
  visibly different from runtime visibility; no output change from editor conveniences.
- Centre: the graphic on a stable canvas, fit/zoom/pan, clear selected bounds and position,
  scale and rotation handles. Selection must survive edits and rebuilds without jumping.
- Lower right: the selected layer's relevant properties. Position, scale, rotation and opacity lead;
  text/fill controls appear only when supported. Show values at the displayed time, units,
  mixed values for multiple selections and clear unavailable explanations.
- Bottom: resizable timeline with ruler, playhead, layer/property rows, keyframes, snapping,
  zoom-to-fit and clear In / numbered steps / Out sections. The selected animated layer
  reveals its animated properties without a hunt. Collapsed diamonds are summaries; editing
  a summary must never silently alter unrelated property keys.

The canvas is permanent. Optional Monaco docks beside it and may be deferred (roadmap
E18/B12 is conditional); no Code-only mode. If included, use per-document models and one
chronological source/visual history without stealing focus. Readable code and source-safe
CLI/MCP edits remain required whether or not Monaco ships. Preserve change indicators and
readable diffs. The required expansion in [professional direction](EDITOR_PROFESSIONAL_DIRECTION.md)
adds direct playhead scrubbing, Out triggers, loops/Lottie/effects, live data and embedded AI. Keep
machine/behaviour tools available through their existing workflow, outside the default
animation task. This is not a removal of scoreboard or quiz behaviour.

Design and verify at 1366x768 and 1920x1080, including browser scaling. At the smaller size,
timeline expansion must keep canvas and inspector usable; panels scroll independently and
must not push essential controls off screen. Narrower layouts may use drawers. Do not promise
a full phone animation workspace in this milestone.

## 4. Explicit interaction decisions

These are proposed replacements for conflicting parts of the current interaction contract.
They are specified now so implementation does not accumulate competing gesture rules. Update
the binding interaction documentation and applicable rule sources in the same phase that
ships each change; a plan alone does not change current runtime behaviour.

### Layout and animation are deliberate operations

Provide a clear **Layout / Animate** context beside the editor transport. Layout is the
default when opening a graphic; choosing a keyframe, moving the timeline playhead or selecting
Animate enters animation editing. Retain the last animation position when returning to it.
This intentionally replaces implicit differences between canvas auto-key and inspector arming.

In Layout, drag and property changes affect supported base artwork/layout values, without
creating keyframes. Existing animation offsets remain unchanged. In Animate, canvas handles
and numeric changes write keys for the affected property at the parked time. There is no
additional hidden arming requirement. The diamond indicates a key at this time and explicitly
adds/removes that key; previous/next buttons navigate the same property.

On first animation of a property at time greater than zero, insert a start key containing the
pre-edit evaluated value and the requested key at the playhead. At zero, replace/add that
key only. Editing an existing track between keys inserts a key. Removing its last key
reveals the inherited/base value rather than baking an arbitrary current pose into layout.
First-animation behaviour and inheritance across steps need exact fixtures before UI coding.

For a target whose static layout cannot be safely patched, identify that limitation and retain
its animation/code route; never silently turn Layout into Animate. Root positioning retains
the existing anchor/zone policy. Its animation handles use the same explicit Animate context
where the transform contract supports them. Unsupported transforms remain honest limitations.

### Keyframes and timing

Click selects, Shift adds/toggles, marquee selects keys, empty click clears. Dragging a set
preserves relative times and values; Escape cancels. One completed gesture is one undo item.
Delete affects the focused selection, and text inputs retain ordinary text-editing shortcuts.
Copy/paste preserves property identity and relative timing within the selected segment.

Do not silently overwrite keys when dragging or pasting into occupied times. Reject the whole
operation with a short explanation and unchanged source; explicit replace can be added later.
Reject incompatible paste targets the same way. Dragging across cue boundaries is not an
implicit reassignment of behaviour. A later explicit move-to-step command can handle it.

Snap uses visual proximity to playhead, keys and segment edges; a pixel tolerance is converted
through zoom. Alt temporarily bypasses snapping. The ruler shows effective seconds; stored times remain speed-relative. Convert effective
seconds to stored time by multiplying by speed, and back by dividing. A frame nudge is
1/document-fps effective seconds (speed/document-fps stored seconds). Use the verified
document/output rate; changing display units never rewrites keys.
Zoom anchors to the pointer or playhead, with Fit always available. No automatic re-fit after
the user deliberately zooms or pans.

Numeric time/value fields accompany dragging. Arrow keys nudge selected keys by one displayed
frame (or the documented seconds increment when no frame rate exists); Shift uses ten.
Properties retain their own key counts. Changing opacity must not create X/Y/scale keys.

### Easing, cue boundaries and loops

First ship a short easing menu with curve thumbnails and an immediate segment preview:
Linear, Ease in, Ease out, Ease in-out and Hold. Each choice edits the incoming segment to
the selected key; multi-key editing has an explicit scope. Hold must be implemented and
tested as a discontinuity, not approximated by a steep curve. Keep an existing custom ease
intact even when the basic menu cannot edit it.

A cubic-Bezier editor is later scope, outside this completion gate. Preserve existing custom
eases without rewriting them; expressions and motion-path editing remain outside this plan.

Keep the truthful broadcast clock: on-air waits have no fixed duration. A contiguous editing
ruler may concatenate segments, but Hold is a boundary, not a timed clip. Moving a boundary
changes the preceding segment duration without scaling keys by default; refuse a trim that
would discard keys/calls/dynamics. **Scale timing** is a separate explicit operation. Studio's
freely positioned stops inform the UI, but we do not replace the existing state machine with
a global playback clock just to imitate it.

Provide Play segment for animation work and Preview cues for In / Next / Out rehearsal.
Stop preview pauses editing playback; Out runs the graphic's exit. Distinct labels prevent
transport stop from being mistaken for on-air exit. Scrubbing never increments scores,
fires external effects or starts timers. Repeated seeks yield the same visual result.

Ambient-loop authoring is later scope, outside this completion gate: selected property, repeat/yoyo,
period and activation explained visually. Prove finite-end/hold/exit/reset semantics using
the existing loop primitive before extending it. A paused editing pose and a moving live
hold must not fight for the same clock.

## 5. Architecture and replacement boundaries

| Boundary | Keep or change | Required proof |
|---|---|---|
| Canonical source | Keep `SpxTemplate` and readable `NOACG_ANIM` | Visual edit -> source diff -> save -> reopen -> identical editable values |
| Track schema | Start with current v2; independent tracks already exist | Unequal property keys, Hold support and existing custom-ease preservation, base inheritance, steps, loops and unknown values tested before proposing a schema extension |
| Transform layer | Reuse/refactor `animEdit`, layout transforms and `timelineLens` | Pure transaction commands for add/move/delete/paste/ease/resize; validation before atomic commit |
| Editor session | One selected target set, context, parked time, playback state and gesture transaction | No duplicate local authority that can disagree across panels; ephemeral gesture state is allowed |
| Runtime and sampler | Reuse `animRuntime`, `animEval` and real preview; consolidate ease semantics | Inspector values and preview/export pixels agree at sampled times; no unsupported interpolation presented as exact |
| Interaction components | Replace/refactor timeline, inspector and canvas coordination as necessary | Pointer capture, cancellation, focus, selection and live feedback work together |
| Preview bridge | Revision-tagged readiness and seek requests | A late reply from an older source revision cannot overwrite current time or selection |
| CLI/MCP | Keep shared deterministic source transforms | No separate editor-only file format; agent edits invalidate stale gestures safely |
| Existing saved graphics | Migrate only when a breaking schema change is demonstrated | Migration on read, current writes, unknown version read-only, preserve code/assets outside the supported region |

Document property ownership, units, pivot/transform composition and base-value evaluation
before the first canvas rewrite. CSS/SVG layout and animated transforms must compose rather
than overwrite one another. Unknown handwritten code is preserved and identified, never
regenerated just to make a visual control available.

Do not attempt a whole-editor replacement in one branch. Introduce the new interaction path
behind a temporary development switch using the same source document. Existing saved graphics
must open in both paths without format forks. Remove the old interaction path after acceptance;
do not leave two permanent competing editors or maintain two mutation libraries.

## Decisions, 2026-09-17

These decisions incorporate the independent review of `97601da7` and the owner's approval
of the follow-up. They specify work still to build, not capabilities already delivered.

### Base layout for catalog elements

Phase 1 builds commented per-element X/Y offset variables in the catalog style contract,
with stable code-derived target identity. Canvas and Inspector use the same deterministic
patch. Preserve assembler flex flow: offsets move rendered artwork without changing sibling
layout; base translation composes separately with animated transforms. Define wrapper/pivot
ownership in fixtures before changing the assembler. Keep imported `designLayout` placement
support. Reject substituting an imported-only primary fixture: the catalog lower-third title
must be movable in Layout without code. Unsupported handwritten layouts remain explicit.

### Preview updates and revision ownership

Before Phase 1 implementation, Phase 0 defines and fixtures a replace-animation-data command
for supported keyframe-only edits in the running interpreter. It is derived from committed
canonical source, never a second authoritative scene. Reject a full debounced iframe rebuild
and a fixed 650 ms timer as the feedback mechanism for these edits. Other edits rebuild with
a revision covering HTML, CSS, JS and asset paths AND contents, plus a monotonically ordered
request id. Apply, readiness, seek and acknowledgement messages carry that identity; stale
messages are dropped. Undo/redo use the same update path and re-seek the current parked time
after readiness. Unsupported hot updates take the explicit rebuild path. Gesture previews
are cancellable; pointer-up commits one source transaction. No old acknowledgement can
restore stale selection or time. The Phase 1 slice must prove this protocol end to end.

### Shared easing and Hold semantics

Use one pure editor sampler module as the evaluation authority for supported named eases,
with fixture parity against GSAP for every entry in `src/model/easings.ts`, including in/out
variants and boundaries. Reject the current linear approximation for Inspector values on
eased segments. Hold is an explicit serialized incoming-ease value: keep the previous value
until the destination key time, then set instantly. The runtime interprets that discontinuity
explicitly, never as a steep curve. Unsupported custom eases stay byte-preserved and are
labelled unsupported by the sampler rather than falsely evaluated. Breaking schema changes
require a version bump and read migration together; define fixtures before choosing one.

### One displayed clock

Use effective seconds on the ruler and document-fps frames for nudges, while storage remains
speed-relative as specified in section 4. Reject mixing raw source seconds with displayed
frame increments. Test speed 0.5, 1 and 2 at multiple fps, round trips, step-local boundaries,
repeated nudges and speed changes. Changing speed changes playback duration, not stored keys.

### Cancellation and the mode concept budget

Escape restores the exact pre-drag source, selection and parked pose for timeline and canvas
gestures; Phase 1 cannot exit without both. Layout/Animate deliberately reverses the
2026-07-08 no-mode finding in `WYSIWYG_PLAN.md`: predictable base edits versus key insertion
now outweigh the extra mode concept. Budget one context control, shared by both surfaces,
not separate canvas auto-key and Inspector arming. The first-time-user walk must show users
can predict where an edit goes. Reject an invisible distinction and do not treat this design
choice as accepted usability until that walk passes.

### Fixed benchmark and measurement

Studio `3142fc7d02934494931eb14e7dc255393e4110d0` is the fixed comparison target.
Phase 0 delivers a queued Playwright performance harness recording input-to-render latency,
preview request/ack revisions, rAF intervals and long tasks inside the preview for the
30-layer/300-key fixture. Count changed rendered poses as well as frames: a running rAF
counter alone cannot prove useful feedback. Report distributions and worst stalls separately
from rebuild duration, with machine/browser and production debounce settings recorded.
Reject AI bench scripts or screenshots alone as latency evidence. Custom Bezier editing
remains outside scope. New local-loop authoring is REQUIRED in M4-Motion under the expanded
roadmap; the earlier exclusion is superseded. Preserve existing behavior as regression.

### Phase 0 defect inventory and owner walk

Walk current `origin/main` with the owner and record the exact revision, then repeat the task
on the fixed Studio reference. An automated walk can prepare it but cannot replace the owner
observation of the blank stage. The six entries in `EDITOR_RESEARCH.md` section 1b are historical;
this source audit is not a new claim of a browser reproduction:

| Historical defect | Current code status and next proof |
|---|---|
| Space over stage swallowed | Code fix exists in `spaceKey.ts` and the stage key path; verify tap-to-play versus held pan in the owner walk. |
| Finished run never reported | Closed in code by run-identity-guarded completion in `src/preview/simulatorRuntime.ts`; regression-check finished playback. |
| Blank stage on owner's machine | Open, still needs reproduction in the owner's environment; do not invent a cause from headless success. |
| Align and distribute absent | Open; now explicitly required for eligible targets in unified roadmap E07/M2. Baseline must identify target reach; no implementation is claimed. |
| Branch phase cannot scrub | Closed in code through `src/blocks/timelineLens.ts` and simulator branch targeting; repeat branch seeks in baseline. |
| Catalog per-element typography reach | Still limited to the emitted style contract; Phase 0 records supported fields, and Phase 2 exposes supported catalog typography through the Inspector with readable patches. |

## 6. Ordered implementation phases

Each phase owns a bounded change and includes build/lint, appropriate mapped Playwright flows,
critical visual inspection and its own owner-queue route. Browser work uses `npm run queue`.
Do not declare a phase usable solely because automated checks pass.

| Phase | Deliverable and starting code | Exit criteria / dependency |
|---|---|---|
| 0. Reproduce and establish the reference | Walk current editor and pinned Studio using the same lower third and SVG scoreboard. Record exact actions, video, failures, clicks and timings. Review existing canvas/timeline specs and `EDITOR_RESEARCH.md` defect receipts. | Owner walk on current main, performance harness, settled preview protocol, reference screenshots at both viewport sizes, agreed expected task outcomes. An unreproduced defect stays labelled unreproduced; do not invent its cause. No feature rewrite before this receipt. |
| 1. Interaction and transaction foundation | Shared context/selection/time/gesture contract; layout-vs-animation transforms; catalog per-element base offsets and readiness/revision handling per the dated decisions above. Work through existing store, canvas, `animEdit` and simulator seams. | Select a layer, move it in Layout, add two X keys in Animate, scrub, Escape-cancel a timeline key drag and a canvas drag, and undo/redo back to the parked pose, with no unrelated edits. This is a working vertical slice, not a standalone design-system refactor. |
| 2. Basic editor replacement | Stable workspace, inspector values/diamonds, expanded property rows, independent opacity keys, numeric editing, basic Ease out selection using the shared sampler, reliable handles and transport. | Complete the primary task below from both supported source types. Save/reopen and exported playback agree. No graph editor or ambient-loop expansion before this passes. |
| 3. Timing and easing quality | Multi-key selection, copy/paste, snap/zoom/nudge, collision rules, easing thumbnails and Hold; no custom curve editor. | Retiming X leaves opacity untouched; all easing samples agree with runtime; keyboard/mouse/touchpad and undo behave consistently. Phase 2 first. |
| 4. Broadcast animation basics | Cue boundary editing, explicit scale timing, direct Out, existing-loop lifecycle regression and update/behaviour coexistence. | A two-step reveal and looping scoreboard survive Next, data updates, exit during motion and replay. Preserve quiz/timer/dynamic-motion behaviour. Phase 3 first. |
| 5. Adoption and removal | Make accepted workspace the default, remove replaced interaction code and stale instructions, update capability claims. | Real-user tasks pass; legacy/handwritten templates preserve source; exported packages pass target checks. Retain rollback through version control, not a permanent second UI. |

After the unified roadmap's implementation-entry gate is cleared, implementation can proceed
through these phases without another research programme.
Within each phase, fix reproduced basics first. Existing green functionality should be kept
where it already meets the task; do not rewrite it for visual resemblance alone. Do not
parallelize changes to canonical tracks, source serialization and gesture transactions until
their shared contracts are settled.

## 7. Acceptance: what 'good enough' means

### Competitive completion gate: match the basics, beat the core workflow

NoaCG must meet both the absolute thresholds below and a direct comparison with Studio.
Phase 0 establishes the reference version and baseline; the adoption phase reruns the same
tasks in both editors on the same machine, browser and viewport with equivalent artwork
and output requirements. Record setup/import work as part of the end-to-end workflow rather
than hiding it outside the timed task. Freeze Studio at
`3142fc7d02934494931eb14e7dc255393e4110d0` for the whole gate. Later upstream changes
belong in a separate backlog item and never move this acceptance target mid-implementation.

Maintain a comparison row for each basic interaction listed in section 1 and for the full
import-to-production task. Record completion, time, errors, assistance, responsiveness,
visual defects and observed user preference. Counterbalance which editor participants use
first to reduce learning effects. The small user walk is practical acceptance evidence,
not a statistically representative market study.

The basic editor is not accepted while a material disadvantage to Studio remains in those
interactions. Resolve it and retest; do not offset poor timeline editing with an unrelated
NoaCG feature. The full workflow must show a concrete advantage in completion, fewer errors
or less effort without sacrificing output quality or reliability. Where Studio cannot
complete a workflow, record the missing step and any external/manual work honestly, rather
than assigning an invented timing. Unmeasured comparisons remain unverified.

Feature counts, a better internal architecture, automated passes and improvement over the
old NoaCG editor do not satisfy this gate. Incremental phases can land before the overall
gate passes, but the rebuild cannot be declared complete or adopted as accepted on that basis.

### Absolute task and quality thresholds

The following thresholds are proposed acceptance targets, not measurements of either editor.
Phase 0 records the machine/browser and dataset so later comparisons are meaningful.

**Primary task:** starting from the graphic's Edit action, select the title, move its base
position, animate X from -80 to 0 over one second, animate opacity from 0 to 1 over 0.3 seconds,
change X to Ease out, move its end key to 0.8 seconds, scrub forwards/backwards, undo/redo,
save and reopen. The result must match in preview and a clean exported-package host.

- A new user can move, resize, change text and retime one animation, each within one minute
  without instruction. Test with 2-3 first-time users using the existing student-walk format.
- After a short introduction to keyframes, each can complete the primary task within five
  minutes without code or assistance. Record each person's result; a repeated failure
  requires an interaction change, not a longer tooltip or another 'complete' label.
- Selection feedback target: within 100 ms. Continuous drag/scrub feedback target: at least
  30 visible updates/second on the recorded laptop for a 30-layer/300-key fixture, with no
  visible freeze over 100 ms. Pointer-up target: final pose within 150 ms. Measure separately
  from expensive source rebuilds; do not hide lag in averaged timings.
- No unexplained jumps, blank canvas, stale values, lost selection, accidental key insertion,
  unrelated property edits or multi-step undo for one drag. Escape restores exact pre-gesture
  source. Save/reopen preserves values, not necessarily temporary panel layout.
- Visual review covers alignment, typography, panel resizing, key hit areas, clipping,
  selection contrast, tooltip obstruction and focus at both target viewports. Diamond hit
  areas must be larger than the painted diamond; adjacent keys still need disambiguation.
- Regression fixtures include legacy source, unknown animation version, imported nested SVG,
  long text, parent transforms, root anchoring, loops, calls, measured motion and branch states.
  Scrubbing suppresses side effects while real cue playback retains them.
- Export comparison samples start, intermediate keys, midpoint easing, holds and exit. Then
  check the representative scoreboard/lower third through the existing CasparCG route.
  Browser-only success is not hardware acceptance; retain the actual environment receipt.

Keep a single task matrix of observed pass/fail/untested outcomes. Existing automated specs
remain regression evidence; rewrite tests that only pin the old interaction when the new
contract deliberately replaces it. Keep their underlying source/runtime safety assertions.

## 8. Scope and priority

The owner has explicitly asked for this editor plan despite prior parked research labels.
This plan completes that planning request and records the intended implementation sequence.
Implementation was initially authorized on 2026-09-17, starting with the shared Home brand
library. The owner's later instruction that day pauses further product implementation until
the unified roadmap and editor baseline are clear. The animation baseline and remaining
phases are still outstanding. This pause concerns this rebuild, not unrelated programmes.
CasparCG production reliability, working creation and SVG workflows remain immediate needs;
this rebuild directly serves them. No native renderer or Server API build is a prerequisite.

Basic text/shape/image editing and the imported SVG hierarchy belong in this editor. Full
illustration tools, nested compositions, expressions, AE conversion, advanced motion paths
and general-purpose collection authoring are later scope; the curated Starter Collections route
is separately authorized in its linked plan. Their absence must not postpone a good
keyframe editor. Conversely, reaching a large feature count must not excuse failing the
primary task.

References: [Studio case study](OGRAF_STUDIO_RESEARCH.md),
[full-stack plan](../../OGRAF_FULL_STACK_PLAN.md), [current interaction contract](TIMELINE_INTERACTION_MODEL.md),
[timeline implementation history](TIMELINE_V2_PLAN.md), [previous editor failure analysis](WYSIWYG_PLAN.md),
[SVG ambient direction](../../SVG_ANIMATION_DIRECTION.md), [state-machine schema](../../STATE_MACHINE_SCHEMA.md).

## Design review supplement, 2026-09-17

The [combined review](../editor-design-review-2026-09-17.md) owns the current
keep/refactor/replace inventory and mockup proposal. The [worked source/preview examples](../editor-design-review-2026-09-17/source-preview-contract.md) refine the M1
contract without claiming it is implemented. The implementation hold remains in force.
