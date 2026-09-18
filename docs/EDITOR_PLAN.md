# Editor plan

Owner direction, updated 2026-09-19. Planning and mockups only. Product implementation remains on
hold until the owner explicitly resumes it. This is the single authority for editor scope,
order and completion. It replaces the delivery roadmap and professional-direction documents.
Review entry point: [review brief](research/editor-review-brief-2026-09-18.md), including the
latest interaction study and retained full-workspace design. Review of d5e8c1db: ready with
named corrections, now recorded below. Earlier mockups are evidence, not the corrected contract.

## Destination

### Visual authoring
An Illustrator SVG goes through the existing import wizard into an immediately usable editor.
Its artwork, groups, text, fields, fonts and assets remain intact; users select, move, resize,
restyle and animate supported parts without rebuilding the design. The canvas stays visible.
Basic text, shapes and images can also be authored here. Import fidelity comes before new tools.

### Animation and effects
A professional layer/property timeline authors In, named reveals, Out and seamless local loops.
The playhead directly scrubs the graphic, with independent keys, predictable easing and undo.
Later releases add Lottie clips and paint/effect authoring. Existing complex graphics keep their
source and playback. The node editor is deferred and absent from the proposed workspace.

### Reusable designs and brands
The visible template gallery offers existing graphic categories and coordinated Starter
Collections. Choose graphics, apply a Home brand, replace content/logo/font, adjust individual
items and install the selected set into a rundown. The first curated set covers lower third,
headline, logo bug, holding and end screen; browsing is not limited to those five graphic types.

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
Readable `SpxTemplate`/`NOACG_ANIM` remains the only source of truth. Save/reopen and local asset
bundling feed OGraf, SPX, CasparCG and NoaCG production through existing adapters. Match pinned
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

- Compact professional chrome. Chat/Project at left, permanent canvas with tools/rulers/Fit in
  the centre, Layers above Properties at right, timeline below. At 1366x768 collapse the left
  dock first, retain a roughly 280 px inspector and at least 240 px timeline. Resizing never
  hides the whole canvas. The right tree and timeline share identities and selection.
- The Project dock exposes Assets, Brands, Fields and Collection; the app bar exposes Import
  SVG and Templates. A template gallery must show real graphic previews/categories, not only
  a project-file list. Choosing a graphic opens the same editor as imported artwork.
- Canvas toolbar: Select, Text, Rectangle, Ellipse and Image. Draw shapes/text boxes on the
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
  Save/reopen preserves this; one-step In never becomes Out. Before R1.2a's shared Bezier gate,
  refuse Set Out before the last In key. Interrupted Out tweens from live values to final exit
  keys with no initial set/jump; simulator and exports use the same upgraded interpreter.
  Holds remain indefinite. No new auto-Out timer; existing timed behavior survives.

- One completed gesture or operation batch is one undo; Escape cancels exactly. Source/asset
  revision checks reject stale edits and preview replies. Scrubbing causes no operator side effects.
- Playhead -> Add Step places a flag there. Play parks at it; Next runs to the next flag.
  Additive reveals are authored by snapping layer bars to flags; drag flags/keys to set timing.
  No compulsory layer chooser. At a flag edits use the arriving side, except a selected layer
  whose bar starts there: edit its departing side. Keep quiz/custom actions intact.
- Folders/bins and a transformable group with parent bar/local ruler are distinct from reusable
  instanced precompositions. Owner approved 2026-09-19: groups ship in R1.2b; named P-COMP
  delivers reusable instances after R1.5. Both remain required for full completion.
- New Text is editable in playout by default; honor wizard exclusions and driven fields.
  Stable schema keys survive label changes. OGraf/YLE acceptance includes a named runtime host.
- Keep Linear, Easy Ease In, Easy Ease Out, Easy Ease and Hold (five choices total). Inspector,
  sampler and output agree; existing custom curves remain intact. New Bezier tools are deferred.
- UI, chat and external tools use one operation registry over deterministic readable patches.
  Show supported targets and concrete errors. Arbitrary unknown source is preserved, never
  flattened or regenerated to make an unavailable control appear editable.

## Release trains

Only R1 replaces the default editor after owner acceptance; R2/R3 extend it. No second permanent editor or separate template-customization product.

| Train / slice | Deliverable and exit demonstration |
|---|---|
| R1.0 Foundation | Flagged route on preview deployments: professional shell, selection, read-only bars, scrub, operation registry/history, preview protocol and latency harness. Record D01-D05 decisions before starting; tests close in their assigned slices. B01/B02/B11/B13 foundation only. |
| R1.1a Base edits and tools | Wizard Finish -> optional Edit; source-backed Position/Layout offset, text/rectangle/ellipse creation and basic scaling. B01/B03/B04 core; keep wizard behavior/fields. |
| R1.1b Keys and bar moves | Text + box: off-canvas first key, move playhead 1 s, canvas drag creates second key; visible spans and bar-body moves carry keys. B05/B13 key/bar portions; no trim UI yet. |
| R1.1c Out and parity | Set Out, reverse/manual/empty exit, indefinite hold, early interrupt from live pose; save/reopen, simulator and exported/production parity. B13 core. |
| R1.1d Fidelity and trim | Nested Illustrator/catalog fixtures, stable IDs on first SVG edit, span trimming, two first-time users on the basic journey; B01-B05/B11/B13 applicable portions. |
| R1.2a Animation | Shared Bezier string/evaluator gate, exact curve splits, full transform animation/easing, key gestures, Step/Next, cue-side editing and cross-cue bars/keys. B03/B05-B07/B13. |
| R1.2b Everyday tools and grouping | E05-E07/B04: typography/fit, images/assets, full canvas tools, duplicate/delete/reorder/align/distribute/group movement; folders/bins, group transform/parent bar/local ruler. Reusable instances follow in P-COMP after R1.5. |
| R1.2c Loops | Local loops, interruption/replay, legacy behavior and output parity. B07/B13/B14 local-loop portion. |
| R1.3 Shared AI and source round-trip | Grounded helper, bounded edits, budgeted free tier/BYOK and CLI round-trip through shared operations; real-model evaluation, conflict/cancel/undo. B17/B18 core. |
| R1.4 Templates, brands and rundown | Gallery/curated set, Home brands/overrides, subset customization and durable installation/retry/revert/rehearsal. B08-B10. May run in parallel from R1.1c on the stable registry; does not require R1.2/R1.3. |
| R1.5 Acceptance and default switch | Comparative/user/performance and real-host checks, GSAP licence clarification, owner acceptance; then replace default editing interactions while preserving runtime/source behavior. |
| P-COMP (after R1.5) | Named task for instanced reusable precompositions: definition/instance ownership, editable local timelines, field IDs/overrides, cycles, history/save/export parity. Schedule approved 2026-09-19; remains required for full completion. |
| R2.1 Lottie | Profile/import, native FPS/speed, trims, In/loop/Out ranges, reverse seek, interruption, bundled exports. B14 Lottie portion. |
| R2.2 Paint and effects | Gradients, masks, ordered effects, supported animation, AI operations and target parity. B15. |
| R3.1 Structured live graphics | Recursive GDD fields/bindings, arrays/collections, validated feeds, staleness/replay and target mappings. B16. |
| R3.2 Complete co-authoring | Paired live-document MCP, concurrent edits, all shipped tools and broader model evaluations. B17/B18 full. Subscription-agent adapters remain separate spikes. |

Node-graph authoring is outside R1-R3. Preserve code, schema, tests and lessons under the
[deferred node-editor record](research/editor-node-editor-deferred-2026-09-17.md). A future
proposal needs a clear user task and owner scope decision. This hold does not remove existing
runtime behaviors or rewrite the separate P2 research programme.

Native Lottie path editing, full vector/path drawing, motion paths, expressions, arbitrary reparenting, automatic brand propagation and general-purpose package authoring remain deferred. Existing imported gradients/masks must retain fidelity in R1 even
though creating/editing those effects arrives in R2. New loops are required in R1.

## Coverage register

Existing E/B identities are retained; split rows close only when all portions pass. Optional E18/B12 never blocks release if Monaco is omitted.

| Requirement | Release / evidence |
|---|---|
| E01 entry and return | R1.0 route; R1.1a handoff; R1.4 gallery / B01, B08 |
| E02 layers, hierarchy, selection and lock | R1.0 selection; R1.1d fidelity; R1.2b tools / B02 |
| E03 fit/zoom/pan/panels | R1.0-R1.2 / B01, B02, B11 |
| E04 base transforms, pivot and parent coordinates | R1.1-R1.2 / B03 |
| E05 typography/content/fit | R1.2b / B04 |
| E06 text/shapes/images and asset replacement | R1.1a core; R1.2b full / B04 |
| E07 duplicate/delete/reorder/align/distribute/group movement | R1.2b / B02, B04 |
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
| E19 local loops and Lottie clips | R1.2 loops; R2.1 Lottie / B13, B14 |
| E20 gradient/mask/effect authoring | R2.2 / B15; preserve imported appearance in R1 |
| E21 structured/live data and runtime collections | R3.1 / B16; preserve current fields in R1 |
| E22 embedded free basic AI/BYOK editing | R1.3 core, R1.4 brands, R2-R3 extensions / B18 |
| E23 shared UI/CLI/MCP and editable round-trip | R1.0 registry, R1.3 CLI, R3.2 paired bridge / B17 |
| E24 professional timeline, direct playhead and Out triggers | R1.0 scrub; R1.1b-d core; R1.2a/c Next/loops / B13 |

The [acceptance register](research/editor-acceptance-register-2026-09-17.md) is the live B01-B18 task/evidence ledger, including D01-D05 closing tests and later gates. Historical receipts do not govern order.

## Baseline closure and acceptance

M0 is closed as a planning inventory, not a passing product gate. Recorded evidence includes
default catalog/SVG routes, paired screenshots, drag/undo source trials, the reproduced easing
sampler mismatch, F4 stress inputs and F5 source-preservation inputs. The 120 selections and
40 scrub observations are diagnostic; they do not establish input-to-pixel latency.

Assign remaining paired B02-B07 walks, transform fixtures, performance instrumentation and
owner blank-stage reproduction to R1.0-R1.2. Two first-time users test R1.1d; fuller adoption
walks repeat at R1.5, with owner feedback at every slice exit. Lottie/data/agent fixtures belong to R2/R3. Nothing unmeasured becomes
a pass. Closing the planning inventory does not release the owner's implementation hold.

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

Use the ordered sub-slices in the [review brief](research/editor-review-brief-2026-09-18.md).
Before each slice, record its prerequisites, exact user task, affected code seams, E/B coverage,
non-goals, failure/rollback cases and mapped verification. Split it again if one review cannot
demonstrate a coherent outcome; later trains also need this breakdown before work starts.
Do not postpone foundational correctness until a later evidence slice: R1.1a/b must already
prove the transforms, timing and source transactions they use; R1.1d broadens that proof.

At each slice exit, provide a runnable route/fixture, a short numbered walkthrough with expected
results, screenshots or a recording, exact branch/commit, automated evidence and known limits.
Put product-visible work in its own owner-queue file. Invite owner testing at every step; record
"awaiting owner review" separately from engineering verification. Feedback is welcome whenever
the owner is available, but the team must catch ordinary defects without relying on the owner.
Independent work may continue after implementation authorization; dependent work cannot rely on
a failed contract. Resolve feedback that changes a dependency before building on that assumption.
The default-editor switch and full-scope acceptance remain explicit owner decisions.

Update the E/B ledger and slice handoff at each checkpoint: completed evidence, remaining gaps,
feedback, decisions and exact next task. Do not mark a whole release complete from one demo.
New sessions resume these records and the actual branch state.

## Completion and continuation

| Work | State |
|---|---|
| Planning inventory | Closed by classification; evidence gaps assigned, not passed |
| Consolidated scope and revised mockups | Review corrections recorded; group/precomp scope approved 2026-09-19; mockups remain historical |
| R1.0-R1.5 / P-COMP | Not started; existing foundations retained; P-COMP follows R1.5 |
| R2.1-R2.2 | Not started |
| R3.1-R3.2 | Not started |
| Node editor | Deferred outside these releases; existing work preserved |
| Product implementation permission | On hold |

The scope ruling is recorded; the next action is explicit implementation authorization. A planning commit/merge/build does not start product work. Each authorized slice gets a bounded branch, evidence and handoff; CI/review precedes the merge queue.

Mechanisms: [animation/preview](EDITOR_REBUILD_PLAN.md) and [collections/brands](STARTER_COLLECTIONS_PLAN.md), not duplicate roadmaps.
Read [consolidation evidence](research/editor-consolidation-2026-09-17/README.md) for archived
plans, references and decisions. Write our own helpers: third-party AGPL code would remove
sole-holder freedom to dual-license the combined work without additional rights. Project policy
prohibits that code in the Apache CLI or emitted packages; see the mechanism's licence gates.

[Workspace/gallery](research/editor-consolidated-proposal-2026-09-17/README.md),
[Adobe/SVG audit](research/editor-adobe-svg-contract-2026-09-18.md),
[transform study](research/editor-transform-proposal-2026-09-18/README.md) and
[timeline study](research/editor-timeline-first-2026-09-18.md) remain design evidence.
The corrected permanent Out, Set Out, phase ordering and ruler contract above supersede
conflicting mockup labels/behavior; updating those prototypes is not part of this docs-only change.
