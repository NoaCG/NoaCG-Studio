# R1.0 implementation brief and replacement inventory

2026-09-19. Owner request authorizes R1.0 over historical planning holds. Baseline
39adb2ed; branch codex/editor-r1-foundation. D01-D05 decisions remain as recorded
in EDITOR_REBUILD_PLAN.md. Their later closing tests retain their assigned slices.

## User task

Open actual catalog and wizard-imported SVG graphics in a permanent canvas,
select source-derived layers through canvas/timeline/Outline and scrub the rendered
motion forward/backward. Prove transactions, history and preview ordering before
R1.1a adds gestures. Read-only bars expose no mutation UI. Monaco is deferred.

## File-level inventory

| Actual files | Decision | Removal/migration slice |
|---|---|---|
| src/App.tsx; src/app/router.ts | Refactor explicit flagged route, preserve boot/query paths | R1.5 removes rollout flag |
| src/components/AppShell.tsx; WorkspaceDock.tsx | Replace composition | Old shell/docks retire R1.5 |
| src/components/PreviewFrame.tsx | Replace editor debounce/framing | Old editor consumer retires R1.5 |
| src/components/canvas/CanvasInteraction.tsx; CanvasSelection.tsx | Replace gesture coordination, shared selection first | R1.1a-d/R1.2b tools; old coordinator retires R1.5 |
| src/components/canvas/CanvasGuides.tsx; pasteboard.ts; partLocks.ts | Keep reusable view helpers | Reassess last consumers R1.5 |
| src/components/timeline/StepTimeline.tsx; Inspector.tsx | Replace surfaces | R1.1-R1.2 tools; old UI retires R1.5 |
| src/components/timeline/LegacyTimeline.tsx; MachineGraph.tsx | Retire from new workspace, preserve readers/runtime | Old UI retires R1.5; no node authoring |
| src/components/timeline/PlayoutSimulator.tsx | Keep fallback/rehearsal pending correlated replacement | R1.1c adapter; old consumer retires R1.5 |
| src/store/templateStore.ts | Keep canonical source, active history, selection, autosave; add session adapter | R1.4a per-GraphicDoc ports; old UI state retires R1.5 |
| src/store/saveActions.ts; src/model/project.ts; library.ts; durableStore.ts | Keep confirmed saves/library IDs/draft storage | R1.4a migrates singleton draft on read |
| src/model/types.ts; structure.ts; spxDefinition.ts | Keep canonical source/identity readers | No retirement |
| src/blocks/animData.ts; animEdit.ts; timelineLens.ts; animMachine.ts; timelineModel.ts; animImport.ts | Keep readers and deterministic patches | No second mutation library |
| src/blocks/designLayout.ts; designFields.ts; edit.ts | Keep source adapters | R1.1a extends base-position adapter |
| src/preview/composeDocument.ts; previewProtocol.ts; simulatorRuntime.ts; canvasControlProtocol.ts; settleGraphic.ts; frameGraphic.ts | Keep sandbox and current callers; add correlated authoring protocol | R1.5 removes only unused editor channels |
| src/templates/shared/animRuntime.ts | Keep bundled evaluator; suppress scrub callbacks | R1.1c interruption, R1.2a/c easing/loops |
| src/components/wizard/CreationWizard.tsx; src/model/wizard.ts; src/templates/importedDesign/svg.ts; src/templates/catalog.ts | Keep wizard generation, fields, assets and format | R1.1a optional Finish handoff |
| src/components/AssetsPanel.tsx; src/assets/assetUtils.ts; imageImport.ts; src/blocks/assetOps.ts | Keep asset/import seams | R1.2b integrates; old panel retires R1.5 |
| src/components/brand/BrandEditor.tsx; src/model/brand.ts; src/templates/packs.ts | Keep brand and TemplatePack identity | R1.4 integration |
| src/components/home/HomePage.tsx; ProductionPage.tsx; GraphicControlPage.tsx; src/model/shows.ts; src/export/registry.ts; src/control/controlModel.ts | Keep library, production copies, output adapters | R1.4 shared handoff; no live writes here |
| src/components/CodeEditor.tsx; src/editor/commentVisibility.ts; CommentVisibilityControl.tsx; Monaco dependencies | Defer from flagged route; preserve old callers | R1.5 removes dependencies only after last consumer |
| src/components/AIPromptPanel.tsx; src/ai | Keep gateway foundations, absent from new UI | R1.3 help then operations; old panel retires R1.5 |

## Ownership and source contracts

SpxTemplate is canonical in the document port. The existing store owns source
snapshots, autosave/save link and selectedParts. A document-scoped session adapter
owns revision counters, transaction IDs, gesture captures and view restoration
receipts over that history. R1.4a supplies one port per GraphicDoc; manifests
reference IDs/resources, never duplicate templates. R1.0 adds no persisted scene.

Every operation names document ID, expected source/asset revisions and transaction
ID. Validate the entire batch before one applyTemplate. Undo/redo use the existing
history and matching preview readiness; external writes invalidate gestures.
Transient previews never write source. Escape restores selection/playhead. R1.1a
owns D03 parent/runtime coordinate conversion, base placement and property ownership;
R1.0 writes no view-space geometry. Unknown source remains byte-preserved.

PreviewController owns iframe generation, monotonic requests, readiness and seeks.
Replies name document/revisions/generation/request and must come from the current
window. Assets include paths AND bytes. Supported key-only updates replace runtime
data; structural/source/assets rebuild. Matching readiness precedes seek, including
undo/redo. No fixed drag timeout. The source-backed timeline is a disposable view.

## Closing tests and review boundary

B01/B02/B11/B13 foundation; B19 ownership; E01/E02/E03/E12/E17/E23/E24.
Flag off/on; actual catalog/SVG wizard fixtures; selection; readonly bars; reverse
seek; seconds/frames at 25/30 fps and speed 0.5/1/2; atomic batch/undo/redo/cancel/
conflict; stale frame/window/revision/request; same-path asset-byte replacement;
source preservation/save/reopen. F4 is 30 layers/300 keys. Measure input/render
acknowledgements, pose, rAF intervals and long tasks at laptop/desktop/125% zoom.
Attempt blank-stage reproduction and state limits. Mapped browser tests go through
npm run queue; run npm run build and inspect actual screenshots. Owner review stays
separate. Route: /app?editor=foundation#/editor-foundation. Stop before R1.1a.

## Supporting editor files and their boundaries

These complete the existing shell's dependency inventory; keeping a helper does not
carry its old panel layout into the replacement.

| Files | Decision | Integration/retirement |
|---|---|---|
| src/components/SidePanel.tsx; SampleDataPanel.tsx; StylePanel.tsx | Replace panel composition; retain source/data helpers | New controls R1.1-R1.2; old panels retire with old shell R1.5 |
| src/components/ControlPanel.tsx; ExportPanel.tsx | Keep production/export paths outside foundation | Integrate through existing app-level windows R1.4; retire unused panel wrappers R1.5 |
| src/components/InsertTemplateDialog.tsx; src/blocks/templateInsert.ts | Keep source transform and guarded insertion | Later library/project reuse; no duplicate insertion engine |
| src/components/NewGraphicButton.tsx; save/SaveControls.tsx; save/SaveDialogs.tsx | Keep and reuse | Already mounted through shared app/save orchestration |
| src/components/ProjectFormatMeta.tsx; src/model/projectFormat.ts | Keep format rules | Later format controls reuse validation |
| src/components/useSplitter.ts; useIsMobile.ts; spaceKey.ts; src/model/layout.ts | Keep helpers; replace old dock-state binding | New responsive shell now; workspace preferences follow E03, old dock persistence retired/migrated R1.5 |
| src/components/CommunityGallery.tsx; ModerationQueue.tsx; auth/AuthStatus.tsx; auth/SignInDialog.tsx; auth/useAuthState.ts; auth/authUi.ts; SyncStatus.tsx; SystemNoticeBar.tsx; feedback/BetaFeedback.tsx; BrandLogo.tsx | Keep application/account/community services | No new foundation dependencies; app-level behavior preserved |
| src/blocks/layerTimeline.ts; animEval.ts; animationRegion.ts; presetApply.ts; presetRegistry.ts; motionPresets.ts | Keep source/runtime helpers; audit semantics at each consuming slice | Easing parity R1.2a; no alternate approximate sampler in R1.0 |
| scripts/e2e-affected.mjs; e2e/editor-foundation.spec.ts; scripts/editor-foundation-bench.mjs | Refactor mapping; add independent evidence harnesses | Retain across slices and widen assertions with each tool |

All AI provider/gateway files under src/ai are retained without changes. R1.3 consumes
their existing entry points; none is an editor-only retirement candidate in R1.0.
All export targets/control engines are retained; the foundation does not change emitted
packages, hosted control, brand identity or saved-production copy semantics.

## New module ownership

| File under src/components/editorFoundation | Owns |
|---|---|
| EditorFoundation.tsx; foundation.css | Flagged workspace composition, current clock, shared selection wiring |
| Canvas.tsx | View-only fit/zoom/pan, hit bounds and selected outlines |
| Inspector.tsx | Properties/Outline view of the same source identities |
| Timeline.tsx; timelineView.ts | Read-only layer bars, effective clock and frame/second ruler |
| operations.ts | Deterministic validated source operation registry |
| session.ts | Document-scoped revisions, gesture capture and history view receipts; disposal refusal |
| documentAdapter.ts | Existing active-store port and lifetime; no second persisted document |
| protocol.ts | Explicit frame/document/revision/generation/request envelope |
| PreviewController.ts | Frame lifecycle, asset-byte fingerprint, readiness, coalesced seeks and measurements |
| runtime.ts | Transient sandbox evaluation through the bundled interpreter; callback-free scrub |

No file is physically retired before its remaining consumers migrate. The inventory
makes those removals explicit instead of maintaining two editors indefinitely.
