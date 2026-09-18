# Editor rebuild: combined scope, reuse and design review

> Historical receipt. Current decisions/order: [EDITOR_PLAN.md](../EDITOR_PLAN.md).
> M0 inventory is closed; outstanding evidence lives in the [acceptance register](editor-acceptance-register-2026-09-17.md).
> Old phase gates and superseded UI proposals below are preserved as history only.

**Superseded design:** the owner rejected the first mockup. Read
[professional direction](../EDITOR_PROFESSIONAL_DIRECTION.md) and the unified roadmap.
Reuse/disposition evidence below remains valid; mandatory Monaco, Code-only mode and the
old combined order do not. Implementation and commits remain paused.

2026-09-17. Planning evidence and proposed decisions, not an implementation release.
No product source is changed by this review. Mockups must be reviewed before this work is committed.

## Decision

Build NoaCG's own editor experience on its retained source/runtime foundation. Replace the
authoring shell and interaction controllers substantially. Do not fork Studio into a second
application and do not preserve the old interaction model merely because tests pass.

Zero Density OGraf Studio is the primary source and interaction reference. Reuse its bounded,
compatible editor-only utilities when that improves correctness. Implement NoaCG's source
transactions, Monaco integration, animation patching and production workflow ourselves.
There is no defensible percentage of reusable lines: the useful boundary is the component
and its dependency/output closure. Six isolated upstream utility files, 229 lines including comments, have been identified;
zero upstream source files have been copied into NoaCG in this planning round.

The whole outcome remains: a pleasant ordinary graphics editor, dependable animation,
broadcast rehearsal, shared Home/editor brands, curated Starter Collections and safe delivery
of a selected set into a production rundown. Brands do not substitute for fixing authoring.

## What we can use from Studio

Inspected source: `zerodensity/ograf-studio` commit
`3142fc7d02934494931eb14e7dc255393e4110d0`, root package 0.17.0.
Root, editor and inspected internal packages declare AGPL-3.0-only. NoaCG's main application
also declares AGPL-3.0-only. The separate `cli/` declares Apache-2.0.

This corrects the earlier research's blanket "No source reuse recommended" position.
AGPL itself is not a reason to prohibit editor-only reuse in this AGPL application. Actual
adoption still requires the exact selected revision/files, original copyright and licence
notices, change notices, dependency licences and a working corresponding-source offer for
the distributed/hosted covered application. A repository licence field alone does not prove
that the deployed application meets those obligations.

| Upstream file, relative to `apps/editor/src/` | Closure and recommendation |
|---|---|
| `components/numericScrub.ts` | No imports. Strong candidate for adapted numeric scrubbing: threshold, modifiers, precision and clamping. Bind it to our one-transaction gesture and Escape contract. |
| `canvas/stageZoom.ts` | No imports. Strong candidate for pointer-anchored zoom arithmetic. Adapt iframe/pasteboard coordinates and test zoom limits. |
| `canvas/canvasRuler.ts` | No imports. Candidate for ticks, scale and guide-coordinate calculations. Review units and origin against our canvas. |
| `canvas/axisConstrainedDrag.ts` | No imports. Tiny axis-choice/translation helper; an independent implementation may be clearer than vendoring it. |
| `panels/timelineFormatting.ts` | No imports. Candidate for frame/millisecond formatting, subject to our speed and clock semantics. Not a replacement for stored/effective-time conversion. |
| `panels/timelineGutterResize.ts` | No imports. Tiny clamp helper; implement locally unless adopting a cohesive upstream utility set. |

Each file has an adjacent upstream test. Tests were inspected, not run as part of the
licensing review. Their test dependency is Vitest; that is not a production dependency of
the six helpers. None of these files imports Studio's scene model or runtime. Before copying,
record hashes and provenance, include required notices and port meaningful behavioral tests.
Do not imply that this inventory already approves every future upstream version.

Use these larger parts as implementation references, not transplanted components:

- `canvas/Stage.tsx`: useful selection, handles, snapping and zoom behavior, but tied to
  scene layers, Studio stores, `react-moveable` and compiled compositions.
- `panels/TimelinePanel.tsx`: useful independent rows, key selection, collision behavior and
  ruler mechanics; tied to Studio's frame clock, key objects, loops and scene history.
- `panels/InspectorPanel.tsx`: property organization, text fitting and numeric editing;
  writes typed scene properties rather than deterministic source patches.
- `state/projectStore.ts`, scene-model, codegen and runtime: do not import as a new canonical
  model. Doing so would introduce two competing truths and undermine Monaco.

Third-party libraries used by Studio are separate adoption decisions. Inspect their original
packages, locked versions and licences rather than copying Studio's integration and assuming
the application's AGPL covers every dependency.

### Output and CLI boundary

Do not put Studio AGPL source into the Apache-licensed CLI or describe it as Apache code.
Do not copy Studio's embedded runtime or generator output into customer packages in this
rebuild. Continue using NoaCG's existing export/runtime architecture and review any later
runtime adoption as a separate decision. Using an AGPL editor does not by itself license all
user-created artwork under AGPL; including covered runtime/source in the output is a different
case. No general promise of "no licensing problems" is justified without checking the actual
shipping boundary. Editor-only reuse under the existing application licence is the recommended,
bounded route; changing NoaCG to proprietary distribution would require a fresh assessment.

Primary sources: [pinned Studio licence](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/LICENSE),
[GNU AGPL sections 4-6 and 13](https://www.gnu.org/licenses/agpl-3.0.en.html),
[GNU output explanation](https://www.gnu.org/licenses/gpl-faq.en.html#WhatCaseIsOutputGPL).

## Keep, refactor or replace in NoaCG

"Keep" means preserve a proven domain responsibility and retest it under the new interaction
contract. It does not exempt that code from fixing a demonstrated defect.

| Area | Disposition | Reason and required seam |
|---|---|---|
| `model/types.ts`, canonical `SpxTemplate` | Keep | Readable HTML/CSS/JS remains the only authored document. Derived selection and bounds are disposable. |
| `monacoSetup.ts`, formatting/teaching helpers | Keep | Offline workers, language editing and readable code are valuable. |
| `CodeEditor.tsx` | Substantial refactor | Per-document models, minimal edits, revision-aware source reveal and coherent mixed visual/code undo. Keep cursor, selection, folds and scroll; do not steal focus. |
| `AppShell.tsx`, `WorkspaceDock.tsx` composition | Replace shell composition | Professional Layout/Animate workspace, permanent canvas and optional docked source. Reuse valid docking persistence with migration. |
| `store/templateStore.ts` document/history boundary | Replace transaction/history contract | Current code setters and visual history do not provide one chronological source/sample/provenance undo contract. Keep unrelated store responsibilities. |
| `timeline/StepTimeline.tsx` | Replace UI/controller | New gesture lifecycle, explicit property rows and predictable key operations. Retain valid domain transforms and lifecycle semantics. |
| `timeline/Inspector.tsx` | Replace surface/controller | Ordinary base values first; relevant controls and deliberate animation keys. Remove fixed-delay reseek assumptions. |
| `canvas/CanvasInteraction.tsx` | Replace gesture orchestration | One interaction context; one transaction per gesture; exact cancel; parent-aware geometry. Reuse proven hit testing, locks, snapping and coordinate helpers. |
| `CanvasSelection`, `CanvasGuides`, locks | Keep/refactor | Useful rendering/geometry primitives, subject to measured selection and overlay quality. |
| `PreviewFrame.tsx` scheduling and control protocol | Replace scheduling/protocol | Revision + document + frame generation + request identity, supported hot updates, explicit rebuild fallback and asset-byte identity. Keep sandbox boundaries. |
| `designLayout.ts`, source edit helpers | Keep and extend | Existing placed-text patches are useful; catalog text and nested SVG need explicit supported adapters. |
| `animData`, `animMachine`, `animationRegion`, timeline lens | Keep/narrow refactor | Source schema, preservation, deterministic serialization and lifecycle compatibility. Move shared domain helpers out of UI components. |
| `animEdit` | Keep/tighten | Atomic collision rules, selection and time precision must match the new contract. |
| `animEval` interpolation | Replace sampler behavior | Current linear interpolation cannot represent eased midpoint truth. Use the same evaluator contract as preview/export. |
| `composeDocument`, simulator and production runtime | Keep/extend | Preserve playout behavior; add editor hot-update hooks without a second runtime interpretation. |
| Imports, exporters, validation and asset handling | Keep | Retest self-contained output, fonts/logo bytes, unknown source preservation and foreign OGraf limitations. |
| SavedLook, Home brand creator, TemplatePack | Keep | One brand and collection system. Extend application outcomes, provenance and transactions. |
| Brand application and collection-to-rundown orchestration | Build missing behavior | Existing helpers do not provide override preservation, atomic multi-graphic installation/recovery and guarded revert. |

The intended makeover is substantial. Keeping the engines does not mean keeping the current
layout, interaction compromises, timing delays or keyframe-first inspector.

## Monaco is optional; the canvas is permanent

The owner has made Monaco optional and deferrable. If included, it docks alongside the
canvas with per-document models, minimal source patches, preserved focus and shared undo.
There is no Code-only view. B12 applies only if we ship this integration. Readable source,
invalid-code preservation, external revision conflicts and CLI/MCP round-trip remain required
under E23/B17, independently of Monaco. The old mockup did not meet the requested workspace
quality. Its screenshots are retained only as evidence of the rejected proposal.

## Combined delivery order and scope check

The [unified roadmap](../EDITOR_DELIVERY_ROADMAP.md) is authoritative: M0, M1, M2,
M2-AI, M3, M4, M4-Motion, M4-Data, M4-AI, M5, M6, M7, M8. New loops, Lottie,
gradients/masks/effects, structured live data and embedded AI are required. Detailed
contracts and B13-B18 are in [professional direction](../EDITOR_PROFESSIONAL_DIRECTION.md).
The editor is not complete merely because the original essential tasks and brands work.

## Historical first mockup (rejected)

The proposal shows Layout/Animate, independent source views, layers, relevant ordinary
properties, separate X/opacity tracks, brand selection and a selected-set production preview.
It is an interactive design proposal, not a screenshot of implemented product behavior.
The displayed code pane sketches Monaco placement; it is not a working Monaco integration.

Tested mockup interactions include title-to-source/preview update and Undo. Timeline and
brand controls illustrate the workflow. Static controls are placement proposals, not a
claim that each operation is already implemented. Mockup selection does not validate the
real editor's data or geometry contracts. Rendered screenshots and inspection results are
listed in the accompanying baseline supplement.

Owner review must settle the workspace direction, code visibility and ordinary-control
priority before committing this planning change. Product implementation remains on hold.

Evidence and screenshots: [baseline supplement](editor-design-review-2026-09-17/baseline-supplement.md),
[worked source/preview contract](editor-design-review-2026-09-17/source-preview-contract.md),
[verification summary](editor-design-review-2026-09-17/verification-summary.json).
