# Editor plan

Owner direction through 2026-10-06; implementation evidence updated 2026-10-08.
R1 is underway; the earlier planning hold is
superseded. See the outcome checkpoints below for what is usable. This is the single authority for
scope, order and completion; it replaces the earlier delivery/professional-direction documents.
Review entry point: [review brief](research/editor-review-brief-2026-09-18.md) and the
[whole workspace](research/editor-whole-workspace-2026-09-19/README.md) plus [workflow decisions](research/editor-workflow-review-2026-09-19/README.md).
Review of d5e8c1db: ready with named corrections, recorded below. Mockups are not product evidence.

Owner review 2026-10-06: [feedback and phase mapping](research/editor-owner-feedback-2026-10-06.md).
The group journey mostly made sense; R1.2b.7 has since landed folders/bins and clearer
root/Composition navigation ([receipt](work-specs/editor-folders-bins/evidence/landing-and-handoff.md)).
Persistent drawing is addressed by the [bounded R1.2b slice](work-specs/editor-persistent-drawing/README.md).
Transform/layer/property usability and save-state corrections remain named follow-ups
in their existing scopes. Lottie and alpha image sequences remain R2.1; native
visual authoring remains required. This feedback does not expand folders/bins into a general
editor rewrite or close whole-row acceptance.

Evidence checkpoint 2026-10-07: [Crafting Apps research](research/crafting-apps-editor-2026-10-07/README.md)
compares pinned source and released artifacts with current NoaCG main. Keep the source-backed
editor, fields, cue model and output adapters. The persistent-drawing R1.2b follow-up
retains chosen tools across completion and cancellation, with whole-path undo and the
existing creation scope. Next, at the start of R1.3b, qualify shared command
discovery/runtime schemas and a deterministic human/agent task
before model-driven edits, over the existing operation/session handlers. Paired live MCP stays
R3.2. Reproduce the remaining transform/layer/property feedback as bounded tasks before R1.5;
save/sync stays with its current ownership. The research does not authorize an engine/UI
replacement or advanced vector scope. A focused Rust/WASM path kernel remains a later option
only with an accepted task, source/output compatibility and measured benefit.

## Destination

### Visual authoring
An Illustrator SVG goes through the existing import wizard into an immediately usable editor.
Its artwork, groups, text, fields, fonts and assets remain intact; users select, move, resize,
restyle and animate supported parts without rebuilding the design. The canvas stays visible.
Text, shapes, images and a bounded Pen tool are authored here. Import fidelity precedes new tools.

### Animation and effects
A professional layer/property timeline authors In, named reveals, Out and seamless local loops.
The playhead directly scrubs the graphic, with independent keys, predictable easing and undo.
Later slices add Lottie/image-sequence clips and paint/effects; video authoring waits. Existing graphics keep their
source and playback. The node editor is deferred and absent from the proposed workspace.

### Reusable designs and brands
The visible template gallery offers existing graphic categories and coordinated Starter
Collections. Choose graphics, apply a Home brand, replace content/logo/font, adjust individual
items and install the selected set into a rundown. The first curated set covers lower third,
headline, logo bug, holding and end screen. Projects hold several graphics with their own timelines; Home retains each saved graphic for bulk reuse.

### Live data
Preserve current operator fields immediately. Extend visual binding to text/images/colours,
nested GDD objects, arrays and runtime collections, with validated live JSON updates and replay.
The controller owns effective live data; preview and output see the same revision. Production
decides when a reveal runs. The editor authors its appearance and motion, not a node-based show.

### AI with operator control
Embedded help and bounded edits use the same revision-checked operations as visual controls.
Offer a budgeted free basic helper and existing BYO-key routes; ground models in current docs,
tools and selected artwork. Keep independent CLI/MCP authoring and editable round-trips; add
paired live-document MCP later. No AI draft edit silently changes on-air output. Monaco is optional.

### Portable production
A saved graphic reopens exactly as it was and can reach every supported target from one saved
graphic; the internal format is an engineering decision, not a product principle. Save/reopen and
local asset bundling feed OGraf, SPX, CasparCG and NoaCG production through the existing adapters. Match pinned
Zero Density Studio on the required tasks and beat its complete artwork-to-branded-production
workflow. This is the destination; only measured evidence can establish that comparison.

## Three journeys

1. Illustrator -> SVG -> existing import wizard -> optional Open in editor -> select real layers -> animate ->
   scrub/undo/save/reopen -> export/rehearse. First complete editing journey after R1.0; direct wizard-to-production remains primary.
2. Gallery -> Starter Collection or individual graphic -> brand -> choose subset -> customize ->
   install into a new/existing rundown -> rehearse and run. Visible in the revised mockup.
3. Reopen an imported or templated graphic -> local override or AI edit -> preview -> explicitly
   update saved production. Preserve later edits, brand overrides and the on-air revision.

## Interaction contracts

- Project/Chat at left, permanent canvas/tools in the centre, Properties at right, timeline below.
  Timeline owns the layer list, + Layer, groups/folders and property access. Optional Outline
  replaces Properties for nested SVG inspection; no permanent duplicate Layers list/store.
  At 1366x768 collapse the left dock first; retain canvas, ~280 px inspector and >=240 px timeline.
- Project exposes Graphics, Assets, Brands, Fields and Collection; tabs switch graphics in one editor.
  Assets supports Import files and OS file drop; placing an asset creates a layer/bar. Reuse existing import.
  Import SVG keeps the wizard; Templates opens real previews. Home/editor share selected-set production handoff.
- Canvas toolbar: Select, Text, Rectangle, Ellipse, Pen and Image. Draw shapes/text boxes on the
  canvas; Shift constrains square/circle. Selection handles scale artwork; box/layout resizing
  is a distinct operation. Numeric and pointer edits share animation, history and source.
- Full 2D Anchor X/Y, Position X/Y, linked/unlinked Scale X/Y, turns+degrees Rotation and
  0-100% Opacity. Scrubbable numbers, anchor handle and familiar keyboard controls. Box
  Width/Height is separate from Scale. Position shows parent coordinates for placed/absolute/SVG
  targets and labelled Layout offset for flow-laid catalog lines; source stores runtime values.
- Per-property stopwatch enables animation; armed edits write keys at the playhead, unarmed
  edits change the base value. Diamond adds/removes the current key. No global Layout/Animate
  mode. An explicit Edit base value action preserves keys on an already animated property.
  First enable creates one key at the playhead; disable retains the current value and is undoable.
  Full key-side semantics, first/last keys and mixed selections follow the detailed contract.
- One composition playhead and displayed clock. Markers are In, Step N and Out. Display the
  concatenated effective durations of step-local tracks; live holds are indefinite cue breaks.
  Optional per-step spans define visibility sets. Read-only bars arrive in R1.0, body moves
  with keys in R1.1b, trim without retiming in R1.1d; cross-cue moves follow in R1.2a.
- Stored time remains speed-relative; effective time = stored time / speed. Frame nudges use
  document-FPS effective frames. Ruler/readout always identify seconds or frames; 1 s = FPS frames. Units/zoom never rewrite keys.
- Authoring transport seeks/plays finite segments. Rehearsal Take/Next/Out exercises the authored
  sequence locally; production sends those commands live. No States tab, node graph or visual
  logic programming. Existing state-machine playback/source must survive unchanged.
- Out always marks the end of the last pre-Out segment, including an empty exit. Set Out at
  playhead moves it; whenever the exit has no keys, offer reverse/manual beside that button.
  Save/reopen preserves this; one-step In never becomes Out. Owner decision 2026-09-28: Set Out
  may cross the last In key. Each crossed segment splits exactly at the boundary and the rest of
  the entrance moves into Out at its absolute times, as one undo; if any crossed segment cannot
  split exactly, the whole move refuses with source and history unchanged. Interrupted Out
  tweens from live values to final exit keys with no initial set/jump; simulator and exports
  use the same upgraded interpreter. Holds remain indefinite. No new auto-Out timer; existing
  timed behavior survives. Owner decision 2026-09-29, the contract for Step/Next editing: Out
  always animates the graphic out from its current state, whichever step is active, and never
  plays or reveals an unreached Next step. At the last step Out plays its authored animation
  from the held pose; at an earlier step each visible layer animates from its live pose to its
  end-of-Out pose (the interrupted-Out policy) and layers from unreached steps stay hidden.
  Until that phase, Set Out refuses to move keys or bar edges out of a Next cue.

- One completed gesture or operation batch is one undo; Escape cancels exactly. Source/asset
  revision checks reject stale edits and preview replies. Scrubbing causes no operator side effects.
- Playhead -> Add Step places a flag there. Play parks at it; Next runs to the next flag.
  Additive reveals are authored by snapping layer bars to flags; drag flags/keys to set timing.
  No compulsory layer chooser. At a flag edits use the arriving side, except a selected layer
  whose bar starts there: edit its departing side. Keep quiz/custom actions intact. Owner
  decision 2026-09-29: a graphic may have any number of Step/Next states and Next advances
  through them in order. The editor is strict about arrangements: In, Step, Next and Out
  markers stay ordered and never stack, and a drag into a combination the runtime cannot
  interpret safely refuses. Goal: simple, predictable show control, where Out cleanly removes
  the graphic at any point.
- Folders/bins and a transformable group with parent bar/local ruler are distinct from reusable
  instanced precompositions. Owner approved 2026-09-19: groups ship in R1.2b; named P-COMP
  delivers reusable instances after R1.5. Both remain required for full completion.
- New Text is editable in playout by default; honor wizard exclusions and driven fields.
  Stable schema keys survive label changes. OGraf acceptance includes a named receiving host.
- Linear, Easy Ease In/Out, Easy Ease, Bounce, Overshoot and Hold Keyframe share one batch action:
  marquee/Ctrl/Cmd/Shift selection, toolbar or right-click. Shared evaluator/export parity; new curve graph UI deferred.
  R1.2a.2 delivers it: point presets keep the other side exactly or refuse, Bounce/Overshoot/Hold
  set a whole segment, Hold is its own exact form, and layer rows open into property rows.
- UI, chat and external tools use one operation registry over deterministic readable patches.
  Show supported targets and concrete errors. Arbitrary unknown source is preserved, never
  flattened or regenerated to make an unavailable control appear editable.

## Release trains

Only R1 replaces the default editor after owner acceptance; R2/R3 extend it. No second permanent editor or separate template-customization product.

| Train / slice | Deliverable and exit demonstration |
|---|---|
| R1.0 Foundation | Merged/live via PR #331; foundation engineering checks passed, owner acceptance open. Flagged route: professional shell, selection, read-only bars, scrub, operation registry/history, preview protocol and latency harness. Record D01-D05 decisions before starting; tests close in their assigned slices. B01/B02/B11/B13 foundation only. |
| R1.1a Base edits and tools | Usable static graphic: Finish -> Edit; create text/shapes, edit wording/basic font/size/colours/opacity, position/scale, undo and save/reopen. Base placement, creation and scaling are engineering-verified ([original receipt](research/editor-r1-1a/README.md)); the [basic-artwork follow-up](research/editor-artwork-basics/README.md) verifies the bounded customization journey. Preserve wizard fields; owner acceptance remains open. |
| R1.1a follow-up: usable artwork | Owner authorized 2026-09-26: pull text editing, basic font/size/solid colour, same-parent reorder/duplicate/delete, marquee and multi-object movement forward from R1.2b. Match current NoaCG branding. Complete the catalog/import customization journey before keys; [brief and evidence](research/editor-artwork-basics/README.md). |
| R1.1a follow-up: usability corrections | Implemented and locally verified September 27: continuous Play/Pause and Space, Quiz marquee/movement, discoverable timeline Layers and Project, and immediate appearance with coherent undo. [Reproduction, verification and limits](research/editor-artwork-basics/usability-corrections.md). The original blue-screen symptom was not reproduced. Owner clarity review is asynchronous; R1.1b is next. No keyframe, Out or project-system expansion. |
| R1.1b Keys and bar moves | Text + box: off-canvas first key, move playhead 1 s, canvas drag creates second key; visible spans and bar-body moves carry keys. B05/B13 key/bar portions; no trim UI yet. |
| R1.1c Out and parity | Set Out, reverse/manual/empty exit, indefinite hold, early interrupt from live pose; save/reopen, simulator and exported/production parity. B13 core. |
| R1.1d Fidelity and trim | Nested Illustrator/catalog fixtures, stable IDs on first SVG edit, span trimming, two first-time users on the basic journey; B01-B05/B11/B13 applicable portions. |
| R1.2a Animation | Shared Bezier/named-ease evaluator gate; exact splits, full transforms, marquee/modifier multi-key selection and dropdown/context easing including Bounce/Overshoot/Hold; Step/Next/cross-cue editing. B03/B05-B07/B13. The evaluator, exact split and exact reversal gate (G01) is engineering-verified ([receipt](research/editor-g01/README.md)). R1.2a.1, Set Out across the last In key, is engineering-verified ([receipt](research/editor-r1-2a-1/README.md)). R1.2a.2, the key-side ease menu, Hold and multi-key selection, is engineering-verified ([receipt](research/editor-r1-2a-2/README.md)). Owner decision 2026-09-29: Step/Next and cross-cue editing under the 2026-09-29 Out contract is split into R1.2a.3, Out from any step (the runtime and the editor's Out preview); R1.2a.4, step authoring (Add Step at the playhead, strict flag drags, rename and delete, and G02 editing the departing side at a flag); and R1.2a.5, cross-cue key moves and Set Out crossing from a Next cue. R1.2a.3, Out from any step, is engineering-verified ([receipt](research/editor-r1-2a-3/README.md)). R1.2a.4, step authoring (Add Step at the playhead, inline rename, delete, strict Step and Out flag drags, G02, and the owner's 2026-09-30 one-key Out hold), is engineering-verified ([receipt](research/editor-r1-2a-4/README.md)) and filed for an owner look; R1.2a.5, cross-cue key and bar moves and Set Out crossing from a Next cue under the owner's 2026-09-30 decision that the exit belongs to the Out flag, is engineering-verified ([receipt](research/editor-r1-2a-5/README.md)) and filed for an owner look. R1.2a.6, full transforms (the catalog's yPercent rows, scale panels and layers animated under another selector naming them now key, move and trim; the D03 adapter also keys xPercent and autoAlpha, bars move and trim on every channel but autoAlpha's, and only what cannot be written exactly refuses), is engineering-verified ([receipt](research/editor-r1-2a-6/README.md)). |
| R1.2b Everyday tools and grouping | E05-E07/B04: typography/fit, file/drop import, images/assets, bounded Pen, full canvas tools, duplicate/delete/reorder/align/distribute/group movement; folders/bins, group transform/parent bar/local ruler. Reusable instances follow in P-COMP after R1.5. Split 2026-10-01 into bounded phases, in this order: R1.2b.1, canvas transform tools (the rotation handle, edge scale handles and the anchor point: numeric X/Y, Center anchor and the canvas anchor tool; B03/E04; [spec](research/editor-r1-2b-1/README.md)); R1.2b.2, typography and fit (E05/B04; [spec](research/editor-r1-2b-2/README.md); owner decisions 2026-10-02: weight, alignment, line and letter spacing and Long text on created and imported text, and on a text box the side handles resize while the corners scale); R1.2b.3, images, assets and file/drop import (E06/B04; [spec and receipt](research/editor-r1-2b-3/README.md)); R1.2b.4, the bounded Pen (E06/B04; [spec and receipt](research/editor-r1-2b-4/README.md)); R1.2b.5, align and distribute with keyboard nudge and resize (E07/E17; [spec and receipt](research/editor-r1-2b-5/README.md)); R1.2b.6, groups: group movement and transform, parent bar and local ruler (E07/B02; [spec and receipt](research/editor-r1-2b-6/README.md)); R1.2b.7, folders and bins (B02; [spec and receipt](research/editor-r1-2b-7/README.md)). Owner decision 2026-10-01: the anchor is a static base value in R1.2b.1; its stopwatch and keys follow in a later R1.2 phase. Owner answer 2026-10-01: typing, Center anchor and the Anchor tool move only the pivot, never Position. R1.2b.1, canvas transform tools, is engineering-verified ([receipt](research/editor-r1-2b-1/README.md)). |
| R1.2c Loops | Local loops, interruption/replay, legacy behavior and output parity. B07/B13/B14 local-loop portion. |
| R1.3a/b AI and source round-trip | a: grounded help/context; b: reviewed edits through shared semantic commands, CLI round-trip, free tier/BYOK and model/concurrency tests. B17/B18. Optional P-WEBMCP adapter follows b; [inspection, scope and B21](research/editor-webmcp-commands-2026-09-19.md). |
| R1.4a-d Projects, brands and rundown | a: durable multi-graphic projects/drafts; b: gallery/starters/brands; c: shared Home/editor bulk save/install and playout availability; d: recovery/rehearsal. B08-B10/B19. Parallel from R1.1c registry, independent of R1.2/R1.3. |
| R1.5 Acceptance and default switch | Comparative/user/performance and real-host checks, GSAP licence clarification, owner acceptance; then replace default editing interactions while preserving runtime/source behavior. |
| P-COMP (after R1.5) | Named task for instanced reusable precompositions: definition/instance ownership, editable local timelines, field IDs/overrides, cycles, history/save/export parity. Schedule approved 2026-09-19; remains required for full completion. |
| R2.1a/b Animated assets | a: Lottie profile/import; b: numbered image sequences. Source FPS/speed, trims, In/loop/Out, reverse seek, interruption, memory budgets and bundled exports. B14. Video authoring later. |
| R2.2 Paint and effects | Gradients, masks, ordered effects, supported animation, AI operations and target parity. B15. |
| R3.1 Structured live graphics | Recursive GDD fields/bindings, arrays/collections, validated feeds, staleness/replay and target mappings. B16. |
| R3.2 Complete co-authoring | Paired live-document MCP, concurrent edits, all shipped tools and broader model evaluations. B17/B18 full. Subscription-agent adapters remain separate spikes. |
| P-GPU (optional, after R1 acceptance/R2.2/R3.1) | Qualify vgpu for source-backed effect presets; then shared preview/export runtime and explicit fallbacks only if B20 host/performance checks pass. [Research and boundaries](research/editor-webgpu-vgpu-2026-09-19.md). |

Node-graph authoring is outside R1-R3. Preserve code, schema, tests and lessons under the [deferred node-editor record](research/editor-node-editor-deferred-2026-09-17.md). A future
proposal needs a clear user task and owner scope decision. This hold does not remove existing
runtime behaviors or rewrite the separate P2 research programme.

Native Lottie path editing, advanced vector/Boolean/path morphing, motion paths, expressions, arbitrary reparenting and automatic brand propagation remain deferred. The bounded Pen is R1.2b; authoring projects are R1.4a. Existing imported gradients/masks must retain fidelity in R1 even
though creating/editing those effects arrives in R2. New loops are required in R1.

## Coverage register

Existing E/B identities are retained; split rows close only when all portions pass. Optional E18/B12 never blocks release if Monaco is omitted.

| Requirement | Release / evidence |
|---|---|
| E01 entry and return | R1.0 route; R1.1a handoff; R1.4 gallery / B01, B08 |
| E02 layers, hierarchy, selection and lock | R1.0 selection; R1.1d fidelity; R1.2b tools / B02 |
| E03 fit/zoom/pan/panels | R1.0-R1.2 / B01, B02, B11 |
| E04 base transforms, pivot and parent coordinates | R1.1-R1.2; R1.2b.1 rotation handle, edge handles and static anchor ([receipt](research/editor-r1-2b-1/README.md)) / B03 |
| E05 typography/content/fit | R1.1a usable content/basic type/colour; R1.2b.2 weight, alignment, line and letter spacing, long-text fit and the text box's canvas resize ([receipt](research/editor-r1-2b-2/README.md)); italic, case, shadow, outline and canvas typing later / B04 |
| E06 text/shapes/images and asset replacement | R1.1a core; R1.2b full / B04 |
| E07 duplicate/delete/reorder/align/distribute/group movement | R1.1a follow-up: duplicate/delete/reorder and selection movement; R1.2b.5: rendered-bounds align/distribute and canvas keyboard nudge/resize ([receipt](research/editor-r1-2b-5/README.md)); R1.2b.6: source groups, group transform/movement, member editing, exact ungroup, parent bar/local ruler and breadcrumbs ([receipt](research/editor-r1-2b-6/README.md)); full B02/B04 remain open |
| E08 per-property animation, diamonds and deterministic seek | R1.1-R1.2 / B05 |
| E09 multi-key retime/copy/snap/zoom/nudge | R1.2 / B06 |
| E10 easing and Hold parity | R1.1-R1.2 / B05, B06 |
| E11 In/Next/Out, timing, updates and loops | R1.1 In/Out; R1.2 Next/loops / B07, B13 |
| E12 history, save, preservation and stale revisions | Every slice / B03-B10, B17-B18 |
| E13 Home/editor brands and overrides | R1.4 / B08, B09 |
| E14 gallery and curated Starter set | R1.4 / B08 |
| E15 safe selected-set installation/recovery | R1.4 / B08-B10 |
| E16 operator fields and output parity | R1.2, R1.4, R2-R3 extensions / B07, B10, B14-B16 |
| E17 responsive, legible, reliable interaction | Every slice / B01-B11 |
| E18 optional docked Monaco | Optional after shared transaction / B12 conditional |
| E19 local loops and animation clips | R1.2 loops; R2.1a Lottie / b image sequences / B13, B14 |
| E20 gradient/mask/effect authoring | R2.2 / B15; preserve imported appearance in R1 |
| E21 structured/live data and runtime collections | R3.1 / B16; preserve current fields in R1 |
| E22 embedded free basic AI/BYOK editing | R1.3 core, R1.4 brands, R2-R3 extensions / B18 |
| E23 shared UI/AI/CLI/MCP and editable round-trip | R1.0 registry, R1.3 semantic commands/CLI, optional P-WEBMCP, R3.2 paired bridge / B17; optional B21 |
| E24 professional timeline, direct playhead and Out triggers | R1.0 scrub; R1.1b-d core; R1.2a/c Next/loops / B13 |
| E25 multiple graphics per project and Home reuse | R1.0 ownership contract; R1.4a/c durable workspace/library/production / B19 |

The [acceptance register](research/editor-acceptance-register-2026-09-17.md) is the live B01-B19 and optional B20-B21 task/evidence ledger, including D01-D05 closing tests and later gates. Historical receipts do not govern order.

## Baseline closure and acceptance

M0 is closed as a planning inventory, not a passing product gate. Recorded evidence includes
default catalog/SVG routes, paired screenshots, drag/undo source trials, the reproduced easing
sampler mismatch, F4 stress inputs and F5 source-preservation inputs. The 120 selections and
40 scrub observations are diagnostic; they do not establish input-to-pixel latency.

Assign remaining paired B02-B07 walks, transform fixtures, performance instrumentation and
owner blank-stage reproduction to R1.0-R1.2. Two first-time users test R1.1d; fuller adoption
walks repeat at R1.5, with owner feedback at usable workflow checkpoints. Lottie/data/agent fixtures belong to R2/R3. Nothing unmeasured becomes
a pass. The historical planning hold is superseded; a technical slice does not establish usability.

For every slice, demonstrate the end-to-end user task and refusal case, source/pixel agreement,
undo/cancel, save/reopen and relevant exports. Use mapped browser checks through the queue,
build/lint, and critical 1366x768/1920x1080 review. Keep the canvas visible at 125% browser zoom.
Target selection feedback <=100 ms, visible feedback >=30 Hz on F4, no freeze >100 ms, final pointer-up pose <=150 ms; record machine and distributions.

R1 adoption requires the imported-SVG primary task and template-to-rundown task, including
2-3 first-time users: ordinary edits within one minute each; keyframe task and collection
workflow within five minutes after a short introduction. Report each result and assistance.
Failures cause interaction changes. No blank stages, lost edits or unsafe live replacements.

Compare relevant tasks against Studio `3142fc7d02934494931eb14e7dc255393e4110d0` on the same
machine. R1 is not full-scope Studio parity. Overall completion requires all required E/B
portions through R3, comparable quality and a demonstrated creation-to-production advantage.
Retain a real CasparCG/output receipt; browser playback alone is not hardware acceptance.

## Step-by-step delivery and owner feedback

Use the [ordered slices](research/editor-review-brief-2026-09-18.md) and [usable outcomes / ready criteria](research/editor-outcomes-and-review-readiness-2026-09-20.md).
Before each slice, record its prerequisites, exact user task, affected code seams, E/B coverage,
non-goals, failure/rollback cases and mapped verification. Split it again if one review cannot
demonstrate a coherent outcome; later trains also need this breakdown before work starts.
Do not postpone foundational correctness until a later evidence slice: R1.1a/b must already
prove the transforms, timing and source transactions they use; R1.1d broadens that proof.

At each slice exit, provide a runnable route/fixture, a short numbered walkthrough with expected
results, screenshots or a recording, exact branch/commit, automated evidence and known limits.
Ask for the owner's look at product-visible work in its pull request comment. Invite review of team-proven usable tasks; record
"engineering verified", "ready for workflow review" and "owner accepted" separately. Feedback is welcome whenever
the owner is available, but the team must catch ordinary defects without relying on the owner.
Independent work may continue after implementation authorization; dependent work cannot rely on
a failed contract. Resolve feedback that changes a dependency before building on that assumption.
Verified slices queue and deploy live without waiting for owner review; preserve phone access. Default-switch/full-scope acceptance stay separate.

Update the E/B ledger and slice handoff at each checkpoint: completed evidence, remaining gaps,
feedback, decisions and exact next task. Do not mark a whole release complete from one demo.
New sessions resume these records and the actual branch state.

## Completion and continuation

| Work | State |
|---|---|
| Planning inventory | Closed by classification; evidence gaps assigned, not passed |
| Consolidated scope and revised mockups | Whole-workspace direction accepted; 2026-09-19 workflow refinements recorded for review |
| R1.0 | Merged and deployed as cfb28e74 (PR #331); local, CI and live checks passed. Owner usability/first-time-user acceptance remains open |
| R1.1a | Base placement, creation and scaling implemented and locally verified from handoff merge `15b8f3fc`; [walkthrough, screenshots and measurements](research/editor-r1-1a/README.md). Engineering progress only; usable static authoring and owner acceptance remain open. Verified slices land without waiting for owner review. |
| R1.1b-R1.1d | Key/bar, Out and fidelity/trim engineering portions are implemented on current main; broader user/fidelity acceptance remains open. Use the ordered receipts and acceptance register, not the former R1.1a-only checkpoint. |
| R1.2a | Animation phases through R1.2a.6 are engineering-verified in the receipts above; whole-row owner/workflow acceptance remains open. |
| R1.2b | Everyday-tool phases .1-.7 are implemented and engineering-verified; folders/bins are merged/live. Persistent drawing has its [bounded implementation receipt](work-specs/editor-persistent-drawing/README.md). Remaining October 6 transform/layer/property feedback and whole-row owner acceptance stay open. |
| R1.3b shared command qualification | The [bounded task and receipts](work-specs/editor-command-qualification/README.md) qualify schemas, capability/refusal discovery and deterministic UI/shared-handler source/history/pose parity. Model, CLI, transport and broader release acceptance remain open. |
| Further R1.2c-R1.5 / P-COMP | Remain separate planned work; this checkpoint does not close them or the default switch. P-COMP follows R1.5. |
| R2.1-R2.2 | Not started |
| R3.1-R3.2 | Not started |
| Node editor | Deferred outside these releases; existing work preserved |

The bounded shared-command qualification at the start of R1.3b now has [direct and cumulative browser task evidence](work-specs/editor-command-qualification/README.md), over the existing operation/session handlers. This closes only that qualification task. Next R1.3b work must retain these schemas, capabilities, refusals and source/history/preview receipts while qualifying the planned model-driven editing and source round-trip separately. Paired live MCP remains R3.2; broader R1.3b acceptance stays open. The [persistent-drawing receipt](work-specs/editor-persistent-drawing/README.md) preserves the cumulative authoring task. Remaining October 6 usability corrections stay in their existing R1.2b follow-ups before R1.5; retain the ordered trains above. Keep engineering slices bounded; demonstrate cumulative import/create, ordinary editing, editable text, animation, save/reopen and output tasks before requesting workflow review. Each slice retains its branch, evidence, review and merge-queue handoff.

Mechanisms: [animation/preview](EDITOR_REBUILD_PLAN.md) and [collections/brands](STARTER_COLLECTIONS_PLAN.md), not duplicate roadmaps.
Read [consolidation evidence](research/editor-consolidation-2026-09-17/README.md) for archived
plans, references and decisions. Write our own helpers: third-party AGPL code would remove
sole-holder freedom to dual-license the combined work without additional rights. Project policy
prohibits that code in the Apache CLI or emitted packages; see the mechanism's licence gates.

[Workspace/gallery](research/editor-consolidated-proposal-2026-09-17/README.md),
[Adobe/SVG audit](research/editor-adobe-svg-contract-2026-09-18.md),
[transform study](research/editor-transform-proposal-2026-09-18/README.md) and
[timeline study](research/editor-timeline-first-2026-09-18.md) remain design evidence.
The latest workflow study adds graphic tabs, optional Outline, Pen, import and multi-key easing.
Earlier prototypes stay historical; mechanism/acceptance contracts override simplified mockup behavior.
