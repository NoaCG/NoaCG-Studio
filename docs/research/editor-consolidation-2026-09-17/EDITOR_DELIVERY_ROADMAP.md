> Historical evidence, superseded 2026-09-17. Follow [EDITOR_PLAN.md](../../EDITOR_PLAN.md).
> Original claims and status below are dated history, not current instructions.

# One editor: delivery roadmap and completion register

Owner direction, 2026-09-17. **Planning and baseline assessment only. Product implementation
is on hold until the combined scope, baseline and phase exits are clear and the owner resumes
implementation.** This supersedes the earlier handoff's instruction to start editor brand
application next. The Home brand creator already landed in PR #323; it is not the editor rebuild.

## 1. The finished product

One NoaCG editor must match or beat Zero Density OGraf Studio on the essential graphic-editing
and animation tasks below, and deliver a better complete route from artwork or a Starter
Collection to a branded, editable, rehearsed production. Brands and Starter Collections are
part of that outcome. Neither a good timeline alone nor a good brand picker completes it.

Three journeys must work in the same workspace:

- **Customize and run:** choose a Starter Collection, choose/create a brand, select graphics,
  change content/logo/font/colours/layout, install into a production rundown, rehearse and run.
- **Design and animate:** open a catalog graphic or supported imported SVG, edit its artwork,
  animate independent properties, adjust timing, undo, save/reopen, export and play it.
- **Revise safely:** reopen a saved production graphic, make a local override, explicitly
  reapply a brand without losing that override, preview the changes and update production
  without silently changing an on-air graphic or overwriting later work.

Readable `SpxTemplate` code remains canonical. No second scene format, brand store, collection
catalog or runtime is introduced. The canvas is always visible, including beside AI/data
and any code panel. Monaco is optional and may be deferred; no Code-only view is proposed.
Readable source, shared transactions and CLI/MCP round-trips remain required. Development effort is not a reason to accept an
unpleasant basic tool.

## 2. Read order and authority

This file owns **overall scope, delivery order and completion status**. The linked plans own
their detailed mechanisms. It is not a third implementation design alongside them.

1. This roadmap and its status register.
2. [Baseline and task matrix](../editor-baseline-2026-09-17.md): evidence, exact tasks,
   missing measurements and the implementation-entry gate.
3. [Professional direction, motion, data and AI](EDITOR_PROFESSIONAL_DIRECTION.md): the
   latest owner correction, permanent canvas, direct playhead, loops/effects, structured live
   data and embedded/external AI contracts. It supersedes the earlier mockup and Monaco gate.
4. [Editor interaction plan](EDITOR_REBUILD_PLAN.md): source patches, preview protocol,
   animation semantics, detailed performance and competitive acceptance.
5. [Starter Collections plan](../../STARTER_COLLECTIONS_PLAN.md): brand provenance, shared controls,
   installation identity, durable changes and guarded revert.
6. [Pinned Studio research](OGRAF_STUDIO_RESEARCH.md) and
   [previous failure analysis](WYSIWYG_PLAN.md), followed by code relevant to the next slice.

If scope or order disagrees, this dated roadmap governs. If technical rules disagree, resolve
the conflict in the owning plan before implementation and link the decision here. Do not
duplicate every technical rule into this file. Historical receipts remain historical evidence.

The [combined design/reuse review](../editor-design-review-2026-09-17.md) records the
keep/refactor/replace decisions and exact Studio utility candidates. Its first mockup and
mandatory Monaco direction were rejected/superseded by the professional-direction update. Its
[mockups and baseline supplement](../editor-design-review-2026-09-17/baseline-supplement.md)
remain unapproved design evidence. Review them before committing this planning update.

## 3. Coverage: what must actually be usable

All rows marked Required are completion obligations. "Supported" means a documented source
capability with an observable result, not an excuse to make core Starter Collection artwork
uneditable. Catalog fixtures, the curated collection and the nominated SVG fixtures must
support every operation applicable to them. Arbitrary handwritten code may remain read-only
for an operation, with its source preserved and a clear reason.

| ID | Capability and minimum behavior | Scope / milestone | Proof |
|---|---|---|---|
| E01 | Entry from new, imported and saved graphics; return to the same graphic/production; no code detour | Required / M2 | B01, B08 |
| E02 | Layer hierarchy, meaningful names, expand/search, shared selection, multi-selection, overlap selection and editor lock | Required / M2 | B02 |
| E03 | Fit, zoom, pan, stable bounds, resize panels, usable inspector/timeline at both target sizes | Required / M2 | B01, B02, B11 |
| E04 | Base position, size/scale, rotation and pivot; drag and numeric controls agree; parent transforms and anchor semantics preserved | Required / M1-M2 | B03 |
| E05 | Edit text content, font, size, weight, colour, alignment and supported wrapping/fit; long content remains legible | Required / M2 | B04 |
| E06 | Add/edit basic text, rectangle, ellipse and image/logo; replace images with aspect-preserving fit; edit fill, stroke and supported corner radius | Required / M2 | B04 |
| E07 | Rename, duplicate, delete and reorder supported layers; align/distribute a supported selection; safe group movement | Required / M2 | B02, B04 |
| E08 | Explicit Layout/Animate; independent property keys, property diamonds, numeric values, deterministic scrub and transport | Required / M1-M3 | B05 |
| E09 | Multi-key selection, retime, copy/paste, snapping, pointer-anchored zoom, frame nudge, collision refusal | Required / M3 | B06 |
| E10 | Linear, Ease in/out/in-out and Hold; values and pixels agree; existing custom eases preserved | Required / M2-M3 | B05, B06 |
| E11 | In/Next/Out, cue boundary edits, scale timing, updates during motion, existing loops and behaviors retained | Required / M4 | B07 |
| E12 | One undo per gesture, Escape rollback, redo, durable save/reopen, source preservation, stale revision rejection | Required / every slice | B03-B10 |
| E13 | Shared Home/editor brand creation/application; preview applied/skipped/unsupported roles; portable logo/fonts and local overrides | Required / M5 | B08, B09 |
| E14 | Curated lower third, headline, logo bug, holding and end screen; select a subset, preview together and customize individually | Required / M6 | B08 |
| E15 | Install selected set into new/existing production with layers and starter cues; safe retry, reload recovery and guarded revert | Required / M7 | B08-B10 |
| E16 | Operator-editable fields remain editable; preview/rehearsal, exported OGraf and existing SPX/CasparCG routes agree | Required / M4, M7-M8 | B07, B10 |
| E17 | Responsive direct manipulation, keyboard focus, visible selection, readable values and no clipping or blank stage | Required / every slice | B01-B11 |
| E18 | Optional Monaco dock beside the permanently visible canvas; one source revision and chronological undo if included | Optional / after shared transaction; not a release gate | B12 conditional |
| E19 | Lottie import/trim/speed/segments and authored seamless local loops; deterministic seek and finite exit | Required / M4-Motion | B13, B14 |
| E20 | Linear/radial gradients, shape/path and alpha masks, ordered blur/shadow/colour effects and supported animated parameters | Required / M4-Motion | B15 |
| E21 | Bind text/images/colours to fields, nested GDD objects/arrays and runtime collections; live JSON source, stale handling and replay | Required / M4-Data | B16 |
| E22 | Embedded AI help and editing, free hosted basic allowance, BYOK, selected context, validated undoable operations and useful failure states | Required / M2-AI, M4-AI | B18 |
| E23 | Shared UI/CLI/MCP operations, CLI-generated editable graphics, external live-document bridge and portable source round-trip | Required / M1, M2-AI, M4-AI | B17 |
| E24 | Professional layer/property rows; direct playhead scrub; explicit Out boundary versus manual/automatic live trigger, including loop interruption | Required / M2-M4 | B13 |

### Ordinary editing rules that were previously too vague

M0 must inventory each operation's target capability and work through representative source
patches; M2 implements and tests those contracts before adding their controls:

- Text content must distinguish saved design defaults from operator sample data. Reopening
  and exporting preserve the intended default; testing a cue must not rewrite the design.
  Unsupported fonts/weights are explained. Required Starter graphics bundle their fonts.
- Size means artwork dimensions where supported; scale means transform scale. Label them
  separately. Replacing a logo preserves its slot and placement; choose fit or crop explicitly.
- New objects emit commented source with stable identities. Duplicate regenerates identities
  and references. Delete/reorder must account for fields, animation targets and behavior
  bindings. Never leave orphaned references or silently delete an operator capability.
- Reorder changes paint order within a supported parent. Do not pretend an arbitrary CSS
  stacking context is freely reorderable. Multi-selection alignment uses rendered bounds in
  a common coordinate system; distribution requires at least three eligible elements.
- Group movement preserves internal offsets. Creating/reparenting structural groups must
  preserve world pose and animation/binding references, or refuse the operation clearly.
  Full arbitrary hierarchy restructuring is outside this release; selecting and manipulating
  existing imported groups is required. No flattening imported SVG to unlock a control.
- Unknown markup, custom code, filters and animation are preserved outside the changed region.
  Capability refusals must be exercised on negative fixtures, not merely documented.

### Deliberate exclusions, visible before implementation

This release targets essential editor quality, not every feature of Studio. Custom Bezier
authoring, vector-point/path drawing, motion paths, expressions, nested compositions,
arbitrary reparenting, native Lottie path editing, a full illustration suite, automatic brand
propagation and general-purpose Starter Collection authoring remain later scope. Existing
custom eases and handwritten templates must survive unchanged. New local-loop authoring,
Lottie clips, gradients, masks, composable effects, runtime data collections and embedded AI
are REQUIRED by the latest owner direction, not exclusions. Subscription-agent connections
inside the editor are optional integration spikes; external MCP/CLI support is required.

These exclusions cannot silently grow. If the reference walk shows an excluded feature is
necessary for a required task, resolve that scope conflict before starting the affected phase.
OGraf interoperability does not imply recovery of editable layers from arbitrary foreign JS.

## 4. Ordered milestones and bounded slices

Default order is M0 -> M1 -> M2 -> M2-AI -> M3 -> M4 -> M4-Motion -> M4-Data ->
M4-AI -> M5 -> M6 -> M7 -> M8. Descriptive phase IDs preserve earlier M0-M8 references. Each slice is a reviewable change, not necessarily one PR.
Do not start M5 just because brand work is easier to finish. Independent technical work is
possible only after this planning hold is lifted and its prerequisites are accepted.

| Milestone | Slices, in order | Dependency and observable exit | Existing plan mapping |
|---|---|---|---|
| M0 - Baseline and implementation readiness | 0a pin evidence/fixtures and current entry routes; 0b walk NoaCG and Studio task matrix; 0c measure production-configured feedback; 0d settle target capabilities and preview/transform fixtures; 0e record unresolved issues and review scope | No product rewrite. Required baseline records complete, blockers resolved, owner confirms scope and resumes implementation | Editor Phase 0 |
| M1 - Dependable edit transaction | 1a define shared selection/context/time; 1b catalog and SVG base-position patches; 1c revision/request identity and preview update protocol; 1d first-key, cancellation and undo vertical slice; 1e shared UI/CLI/MCP operation registry and external-source conflict contract | After M0. Move title in Layout, key X in Animate, scrub, cancel canvas/key drags, undo/redo without jumps or unrelated keys | Editor Phase 1 |
| M2 - Useful everyday editor | 2a professional canvas-first workspace and aligned layer/property rows; 2b text/style/assets; 2c basic objects and safe layer operations; 2d transforms/align/distribute; 2e property inspector, independent opacity and basic Ease out; 2f save/reopen/export | After M1. B01-B05 work on catalog and nominated SVG; edit a whole lower third without code; demonstrate it to the owner before expanding timing tools | Editor Phase 2, with ordinary editing made explicit |
| M2-AI - Useful assistant early | A1 selected-document chat and grounded help; A2 text/style/basic-key operations through M1 registry; A3 hosted free allowance and BYOK, timeout/cancel/undo; A4 CLI source round-trip | After M2. B17 basic round-trip and B18 basic tasks pass with deterministic fixtures; actual model quality and costs measured separately. No paid calls without budget authorization | Professional direction: AI |
| M3 - Timeline quality | 3a direct playhead/ruler scrub and selection/nudge/zoom/snap; 3b retime/copy/paste/collision; 3c easing menu/Hold and sampler parity; 3d keyboard, pointer and touchpad polish | After M2. B06 passes, X retiming does not touch opacity, no material unexplained feedback lag | Editor Phase 3 |
| M4 - Broadcast and operator loop | 4a cue boundaries, Out start and explicit scale timing; 4b Next/update/Out/replay, manual/automatic Out and interruption policy; 4c existing field/control/behavior coexistence; 4d export parity | After M3. Two-step reveal and scoreboard rehearsal work through data changes and exit during motion; representative packages play correctly | Editor Phase 4 |
| M4-Motion - Animated artwork | L1 Lottie compatibility/profile and timed clips; L2 local-loop authoring/activation/seam checks; L3 Out interruption and deterministic seek; L4 gradients/masks/effect stack; L5 export parity | After M4. B13-B15 pass on Lottie and HTML/SVG fixtures, including reverse seeks and clean-host output. Existing insertion/runtime alone is insufficient | Professional direction: motion and paint |
| M4-Data - Live, structured graphics | D1 recursive GDD field and binding UI; D2 runtime collection prototype/layout/identity; D3 JSON live source and recorded replay; D4 target mappings/compatibility | After M4-Motion. B16 passes through missing/stale/reordered updates, undo/reopen and supported OGraf/SPX/CasparCG routes | Professional direction: data |
| M4-AI - Complete co-authoring | A5 expose motion/data/paint operations; A6 paired live-document MCP bridge and offline CLI; A7 source/pixel evidence, stale revisions and concurrent changes; A8 model evaluation and optional local subscription connector spike | After M4-Data and M2-AI. B17-B18 complete; UI, chat and external agents use identical transactions. Subscription connector is not a completion blocker | Professional direction: AI |
| M5 - Brands inside the editor | 5a reuse Home form/records; 5b report actual supported application; 5c atomic source/sample-data/provenance undo; 5d preserve overrides on explicit reapply | After M2 and M1 transaction contract; default after M4-AI. B09 passes. Home creator alone does not pass this milestone | Collections stage 1 remainder |
| M6 - Starter Collection customization | 6a curated TemplatePack items with editable roles; 6b entry/picker/subset; 6c brand and set preview; 6d per-graphic overrides, durable drafts and return navigation | After M5. Switching items, Back, brand editing and reload retain edits; discard is explicit. Whole set is editable in the accepted workspace; no parallel template editor | Collections stage 2 |
| M7 - Production installation | 7a installation preview/identity/layers/cues; 7b durable recovery and retry; 7c guarded revert and collisions; 7d rehearsal/export | After M4 and M6. B08-B10 complete including interruption, reload and later edits | Collections stage 3 |
| M8 - Prove and adopt the whole editor | 8a repeat Studio comparison and performance suite; 8b first-time-user tasks; 8c real output acceptance; 8d default switch, old interaction removal and accurate claims | All required coverage rows pass with evidence; human acceptance and competitive gate pass; no unresolved release blockers | Editor Phase 5 + Collections stage 4 |

Each slice must name: source seams, supported targets, readable patch, one failure/refusal
case, undo/save behavior, browser proof and the user-visible outcome. Start from existing code
when sound; a list of components rebuilt is never the exit criterion. Each milestone reviews
the three complete journeys again, even when only one changed.

## 5. Current completion register

Keep dimensions separate: **implementation** = not started/partial/implemented;
**automation** = untested/pass/fail with revision and job;
**human** = not observed/accepted/rejected with dated receipt;
**comparison** = unmeasured/meets/falls short with reference evidence.
An implementation pass cannot fill the other columns. No percentage from task counts.

| Milestone | Implementation | Automation | Human | Studio comparison |
|---|---|---|---|---|
| M0 | Planning baseline recorded; behavioral/performance baseline incomplete | See baseline receipt; historical suites are not M0 acceptance | Owner rejects legacy editor AND first mockup; professional v2 review pending | Source research exists; direct task comparison unmeasured |
| M1 | Not started | Untested for new contract | Not observed | Unmeasured |
| M2 | Not started; legacy controls exist | Existing-contract tests only | Not accepted | Unmeasured |
| M2-AI | Not started; gateway/CLI foundations exist | Untested for editor operations | Not observed | Unmeasured |
| M3 | Not started; legacy timeline exists | Existing-contract tests only | Not accepted | Unmeasured |
| M4 | Not started; existing runtime must be preserved | Existing-contract tests only | Not accepted for rebuild | Unmeasured |
| M4-Motion | Not started; Lottie insertion/player exist | New loop/effect contract untested | Not observed | Unmeasured |
| M4-Data | Not started; existing operator/runtime foundations retained | New authoring contract untested | Not observed | Unmeasured |
| M4-AI | Not started; existing external CLI/MCP retained | Live-document bridge untested | Not observed | Unmeasured |
| M5 | Partial: Home creator landed, editor transaction/provenance not built | Brand tests passed in PR #323 | Creator walk pending | Unmeasured |
| M6 | Not started | Untested | Not observed | Unmeasured |
| M7 | Not started | Untested | Not observed | Unmeasured |
| M8 | Not started | Untested | Not observed | Unmeasured |

## 6. Gates that prevent a technically finished but useless editor

**Implementation-entry gate:** M0 records the real entry path, baseline input fixtures, both
editor walks, current performance, coverage decisions, source/runtime contracts and owner review of the mockups.
The new evidence supplement is additive; preliminary sampling does not close the B11 gate.
An unavailable future capability is a legitimate baseline result with a reason, not a demand
to build it during M0. Future installation/recovery fixtures are specified now and implemented
with their owning milestone. Baseline failures need a classified cause or investigation plan;
they need not be fixed before implementation can be authorized.
The owner specifically paused implementation on 2026-09-17. Do not infer permission from
elapsed time, a merged planning PR, old implementation authorization or a green test run.

**Milestone gate:** demonstrate its exit task, save/reopen and undo; record source and pixel
evidence; pass appropriate build/browser checks; critically inspect both viewports. User
rejection reopens the interaction work, not a tooltip-only workaround. Repository landings
may be incremental, but they do not declare the milestone human-accepted.

**Whole-product gate:** required E01-E17 and E19-E24 obligations and B01-B11/B13-B18 tasks
have recorded outcomes; optional E18/B12 applies only if Monaco is shipped;
no required interaction materially worse than pinned Studio; a concrete advantage in the
complete creation-to-production workflow; no blank stage, lost edits, accidental keys,
wrong exported assets or unsafe production replacement. Required performance targets and
first-time-user targets are defined in the interaction plan and baseline. All must pass.
Unmeasured means unverified, including hardware. Never compensate for a poor timeline with
an unrelated feature or replace the comparison with screenshots and feature counts.

## 7. How sessions keep the end goal

- Use a fresh implementation task/branch per substantial milestone after authorization.
  Begin by reading sections 1, 3, 5 and 6 plus the baseline and owning detailed plan.
- The task brief states milestone/slice IDs, dependencies, entry revision, exact exit demo,
  non-goals and evidence to produce. Do not work from a chat summary alone.
- At each verified slice, commit evidence and update this register and the owning backlog
  receipt. Use the existing review/merge queue; keep queued branches frozen until terminal.
- A handoff records implemented behavior, tests actually run, human/comparison state,
  unresolved failures, changed decisions and the next slice. Link files instead of copying
  the plan into another chat. The next task verifies the previous landing before branching.
- Revisit scope only with a written decision: problem, evidence, consequence for all three
  journeys, affected IDs and owner scope ruling if needed. Never delete a failed requirement
  to improve the completion count.
- Keep implementation sequential across shared source/preview/gesture contracts. Later
  independent reviews, fixture work and tests can run in parallel with explicit ownership.

Next action remains **finish M0 evidence and review this roadmap with the owner**. No new
editor, brand-application, collection or production implementation begins from this document.
The first mockup is rejected, the revised professional mockup awaits review, and the expanded
B13-B18 evidence must be classified before M0 can close.
